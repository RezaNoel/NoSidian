//! Google Calendar: desktop sign-in (loopback redirect with PKCE, as Google
//! recommends for installed apps) and an authorized request helper that only
//! reaches the Calendar API.
//!
//! The OAuth client id and secret are compiled in from the build environment
//! (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`); they never live in the source.
//! Without them the feature reports "not configured". Tokens are stored in the
//! app config folder (`google.json`) and removed on sign-out.

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};

use crate::commands::{internal, CmdResult, CommandError};

const CLIENT_ID: Option<&str> = option_env!("GOOGLE_CLIENT_ID");
const CLIENT_SECRET: Option<&str> = option_env!("GOOGLE_CLIENT_SECRET");
const SCOPE: &str = "https://www.googleapis.com/auth/calendar.events";
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
const API: &str = "https://www.googleapis.com/calendar/v3/";
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Serialize, Deserialize, Clone, Default)]
struct Tokens {
    refresh_token: String,
    access_token: String,
    /// Seconds since the epoch.
    expires_at: u64,
    account: Option<String>,
}

#[derive(Default)]
pub struct Google {
    tokens: Mutex<Option<Tokens>>,
    loaded: AtomicBool,
    signing_in: AtomicBool,
}

#[derive(Serialize)]
pub struct GoogleStatus {
    configured: bool,
    connected: bool,
    account: Option<String>,
}

fn err(code: &'static str, detail: impl ToString) -> CommandError {
    CommandError { code, detail: detail.to_string() }
}

fn credentials() -> CmdResult<(&'static str, &'static str)> {
    match (CLIENT_ID, CLIENT_SECRET) {
        (Some(id), Some(secret)) if !id.is_empty() && !secret.is_empty() => Ok((id, secret)),
        _ => Err(err("google-not-configured", "this build has no Google client")),
    }
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn token_file(app: &AppHandle) -> CmdResult<PathBuf> {
    Ok(app.path().app_config_dir().map_err(internal)?.join("google.json"))
}

fn load(app: &AppHandle, g: &Google) -> CmdResult<()> {
    if g.loaded.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let path = token_file(app)?;
    if let Ok(text) = std::fs::read_to_string(&path) {
        if let Ok(t) = serde_json::from_str::<Tokens>(&text) {
            *g.tokens.lock().map_err(internal)? = Some(t);
        }
    }
    Ok(())
}

fn save(app: &AppHandle, t: Option<&Tokens>) -> CmdResult<()> {
    let path = token_file(app)?;
    match t {
        Some(t) => {
            if let Some(dir) = path.parent() {
                std::fs::create_dir_all(dir).map_err(internal)?;
            }
            std::fs::write(&path, serde_json::to_vec(t).map_err(internal)?).map_err(internal)
        }
        None => {
            let _ = std::fs::remove_file(&path);
            Ok(())
        }
    }
}

fn enc(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn dec(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < bytes.len() => {
                match std::str::from_utf8(&bytes[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok()).ok_or(()) {
                    Ok(v) => {
                        out.push(v);
                        i += 2;
                    }
                    Err(()) => out.push(b'%'),
                }
            }
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn query_param(query: &str, key: &str) -> Option<String> {
    query.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=').unwrap_or((kv, ""));
        (k == key).then(|| dec(v))
    })
}

fn random_token() -> String {
    format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple())
}

fn open_browser(url: &str) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", url])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map(|_| ())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(url).spawn().map(|_| ())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(url).spawn().map(|_| ())
    }
}

fn token_request(form: &[(&str, &str)]) -> CmdResult<Value> {
    match ureq::post(TOKEN_URL).timeout(Duration::from_secs(30)).send_form(form) {
        Ok(r) => r.into_json::<Value>().map_err(internal),
        Err(ureq::Error::Status(_, r)) => {
            let body: Value = r.into_json().unwrap_or(Value::Null);
            let code = body.get("error").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
            if code == "invalid_grant" {
                Err(err("google-signed-out", code))
            } else {
                Err(err("google-failed", code))
            }
        }
        Err(e) => Err(err("google-offline", e)),
    }
}

/// Wait for Google to redirect the browser back to the loopback listener and
/// return the query string of that request.
fn wait_for_redirect(listener: &TcpListener, done_html: &str) -> CmdResult<String> {
    listener.set_nonblocking(true).map_err(internal)?;
    let deadline = Instant::now() + SIGN_IN_TIMEOUT;
    loop {
        if Instant::now() > deadline {
            return Err(err("google-timeout", "sign-in took too long"));
        }
        let (mut stream, _) = match listener.accept() {
            Ok(s) => s,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(150));
                continue;
            }
            Err(e) => return Err(internal(e)),
        };
        let _ = stream.set_nonblocking(false);
        let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
        let mut line = String::new();
        if BufReader::new(&stream).read_line(&mut line).is_err() {
            continue;
        }
        let target = line.split_whitespace().nth(1).unwrap_or("/");
        let query = target.split_once('?').map(|(_, q)| q.to_string()).unwrap_or_default();
        if query_param(&query, "code").is_none() && query_param(&query, "error").is_none() {
            let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
            continue;
        }
        let page = format!(
            "<!doctype html><meta charset=utf-8><title>NoSidian</title><body style=\"font:16px system-ui;display:grid;place-items:center;height:90vh;background:#15171c;color:#eef0f4\"><p>{}</p></body>",
            done_html.replace('<', "&lt;")
        );
        let _ = stream.write_all(
            format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                page.len(),
                page
            )
            .as_bytes(),
        );
        return Ok(query);
    }
}

fn status_of(g: &Google) -> CmdResult<GoogleStatus> {
    let t = g.tokens.lock().map_err(internal)?;
    Ok(GoogleStatus {
        configured: credentials().is_ok(),
        connected: t.is_some(),
        account: t.as_ref().and_then(|t| t.account.clone()),
    })
}

#[tauri::command]
pub fn google_status(app: AppHandle, g: State<'_, Google>) -> CmdResult<GoogleStatus> {
    load(&app, &g)?;
    status_of(&g)
}

/// Sign in: open the browser at Google's consent page and wait for the
/// redirect to 127.0.0.1. `done_text` is shown in the browser afterwards.
#[tauri::command(async)]
pub fn google_connect(app: AppHandle, g: State<'_, Google>, done_text: String) -> CmdResult<GoogleStatus> {
    let (id, secret) = credentials()?;
    if g.signing_in.swap(true, Ordering::SeqCst) {
        return Err(err("google-busy", "sign-in already open"));
    }
    let result = (|| {
        let listener = TcpListener::bind("127.0.0.1:0").map_err(internal)?;
        let redirect = format!("http://127.0.0.1:{}", listener.local_addr().map_err(internal)?.port());
        let verifier = random_token();
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let state = random_token();
        let url = format!(
            "{AUTH_URL}?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={challenge}&code_challenge_method=S256&access_type=offline&prompt=consent&state={state}",
            enc(id),
            enc(&redirect),
            enc(SCOPE)
        );
        open_browser(&url).map_err(internal)?;
        let query = wait_for_redirect(&listener, &done_text)?;
        if let Some(e) = query_param(&query, "error") {
            return Err(err("google-denied", e));
        }
        if query_param(&query, "state").as_deref() != Some(state.as_str()) {
            return Err(err("google-failed", "state mismatch"));
        }
        let code = query_param(&query, "code").unwrap_or_default();
        let res = token_request(&[
            ("code", &code),
            ("client_id", id),
            ("client_secret", secret),
            ("redirect_uri", &redirect),
            ("grant_type", "authorization_code"),
            ("code_verifier", &verifier),
        ])?;
        let tokens = Tokens {
            refresh_token: res.get("refresh_token").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
            access_token: res.get("access_token").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
            expires_at: now() + res.get("expires_in").and_then(|v| v.as_u64()).unwrap_or(3600),
            account: None,
        };
        if tokens.refresh_token.is_empty() || tokens.access_token.is_empty() {
            return Err(err("google-failed", "no token"));
        }
        save(&app, Some(&tokens))?;
        g.loaded.store(true, Ordering::SeqCst);
        *g.tokens.lock().map_err(internal)? = Some(tokens);
        // The primary calendar's name is the account's address.
        if let Ok(v) = request(&app, &g, "GET", "calendars/primary/events", &[("maxResults".into(), "1".into())], None) {
            if let Some(acc) = v.get("summary").and_then(|s| s.as_str()) {
                let mut lock = g.tokens.lock().map_err(internal)?;
                if let Some(t) = lock.as_mut() {
                    t.account = Some(acc.to_string());
                    save(&app, Some(t))?;
                }
            }
        }
        status_of(&g)
    })();
    g.signing_in.store(false, Ordering::SeqCst);
    result
}

#[tauri::command(async)]
pub fn google_disconnect(app: AppHandle, g: State<'_, Google>) -> CmdResult<GoogleStatus> {
    load(&app, &g)?;
    let old = g.tokens.lock().map_err(internal)?.take();
    if let Some(t) = old {
        let _ = ureq::post(REVOKE_URL).timeout(Duration::from_secs(10)).send_form(&[("token", &t.refresh_token)]);
    }
    save(&app, None)?;
    status_of(&g)
}

fn access_token(app: &AppHandle, g: &Google, force: bool) -> CmdResult<String> {
    let current = g.tokens.lock().map_err(internal)?.clone().ok_or_else(|| err("google-signed-out", "not connected"))?;
    if !force && current.expires_at > now() + 60 {
        return Ok(current.access_token);
    }
    let (id, secret) = credentials()?;
    let res = match token_request(&[
        ("client_id", id),
        ("client_secret", secret),
        ("refresh_token", &current.refresh_token),
        ("grant_type", "refresh_token"),
    ]) {
        Ok(v) => v,
        Err(e) => {
            if e.code == "google-signed-out" {
                *g.tokens.lock().map_err(internal)? = None;
                save(app, None)?;
            }
            return Err(e);
        }
    };
    let token = res.get("access_token").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let mut lock = g.tokens.lock().map_err(internal)?;
    if let Some(t) = lock.as_mut() {
        t.access_token = token.clone();
        t.expires_at = now() + res.get("expires_in").and_then(|v| v.as_u64()).unwrap_or(3600);
        save(app, Some(t))?;
    }
    Ok(token)
}

/// Only Calendar event and calendar paths, no traversal or absolute URLs.
fn path_allowed(path: &str) -> bool {
    path.starts_with("calendars/")
        && !path.contains("..")
        && path.chars().all(|c| c.is_ascii_alphanumeric() || "/-_.@%".contains(c))
}

fn request(app: &AppHandle, g: &Google, method: &str, path: &str, query: &[(String, String)], body: Option<&Value>) -> CmdResult<Value> {
    if !path_allowed(path) || !matches!(method, "GET" | "POST" | "PATCH" | "PUT" | "DELETE") {
        return Err(err("google-failed", "request not allowed"));
    }
    let mut retried = false;
    loop {
        let token = access_token(app, g, retried)?;
        let mut req = ureq::request(method, &format!("{API}{path}"))
            .timeout(Duration::from_secs(30))
            .set("Authorization", &format!("Bearer {token}"));
        for (k, v) in query {
            req = req.query(k, v);
        }
        let res = match body {
            Some(b) => req.send_json(b.clone()),
            None => req.call(),
        };
        return match res {
            Ok(r) if r.status() == 204 => Ok(Value::Null),
            Ok(r) => Ok(r.into_json::<Value>().unwrap_or(Value::Null)),
            Err(ureq::Error::Status(401, _)) if !retried => {
                retried = true;
                continue;
            }
            Err(ureq::Error::Status(code, r)) => {
                let body: Value = r.into_json().unwrap_or(Value::Null);
                let msg = body.pointer("/error/message").and_then(|v| v.as_str()).unwrap_or("").to_string();
                Err(err(if code == 404 || code == 410 { "google-gone" } else { "google-failed" }, format!("{code} {msg}")))
            }
            Err(e) => Err(err("google-offline", e)),
        };
    }
}

/// An authorized Calendar API call, e.g. `GET calendars/primary/events`.
#[tauri::command(async)]
pub fn google_request(
    app: AppHandle,
    g: State<'_, Google>,
    method: String,
    path: String,
    query: Option<Vec<(String, String)>>,
    body: Option<Value>,
) -> CmdResult<Value> {
    load(&app, &g)?;
    request(&app, &g, &method, &path, &query.unwrap_or_default(), body.as_ref())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_and_decodes() {
        assert_eq!(enc("http://127.0.0.1:80"), "http%3A%2F%2F127.0.0.1%3A80");
        assert_eq!(dec("4%2F0Ab-x_y"), "4/0Ab-x_y");
        assert_eq!(query_param("state=abc&code=4%2Fz", "code").as_deref(), Some("4/z"));
        assert_eq!(query_param("error=access_denied", "code"), None);
    }

    #[test]
    fn only_calendar_paths() {
        assert!(path_allowed("calendars/primary/events"));
        assert!(path_allowed("calendars/primary/events/abc123"));
        assert!(!path_allowed("../oauth2"));
        assert!(!path_allowed("calendars/../../x"));
        assert!(!path_allowed("https://evil/"));
    }

    #[test]
    fn pkce_challenge_is_url_safe() {
        let v = random_token();
        assert!(v.len() >= 43);
        let c = URL_SAFE_NO_PAD.encode(Sha256::digest(v.as_bytes()));
        assert_eq!(c.len(), 43);
        assert!(!c.contains('=') && !c.contains('+') && !c.contains('/'));
    }
}
