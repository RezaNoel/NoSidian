//! Advanced tools: the optional system shell and the local MCP bridge.
//!
//! The shell runs one command at a time in the vault folder and only when the
//! user turned "System shell" on (Settings > Advanced); it is off by default.
//!
//! The MCP bridge is a Streamable-HTTP endpoint on 127.0.0.1. Each JSON-RPC
//! request is checked (loopback Host, bearer token) and handed to the UI,
//! which answers from the open vault, so the same access rules and change
//! approvals apply as in the app.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{Emitter, State};

use crate::commands::{active_root, internal, CmdResult, CommandError};
use crate::AppState;

const SHELL_TIMEOUT: Duration = Duration::from_secs(120);
const MAX_OUTPUT: usize = 512 * 1024;
const MAX_BODY: usize = 4 * 1024 * 1024;

#[derive(Serialize)]
pub struct ShellOutput {
    stdout: String,
    stderr: String,
    code: i32,
}

fn shell_allowed(state: &State<'_, AppState>) -> CmdResult<bool> {
    let store = state.config.lock().map_err(internal)?;
    let cfg = store.load()?;
    Ok(cfg.prefs.get("systemShell").and_then(|v| v.as_bool()).unwrap_or(false))
}

fn clip(bytes: Vec<u8>) -> String {
    let s = String::from_utf8_lossy(&bytes[..bytes.len().min(MAX_OUTPUT)]).into_owned();
    if bytes.len() > MAX_OUTPUT {
        format!("{s}\n…")
    } else {
        s
    }
}

/// Run one shell command in `<vault>/<cwd>`. `shell` is "powershell", "cmd", "bash" or "sh".
#[tauri::command]
pub async fn terminal_exec(state: State<'_, AppState>, command: String, shell: String, cwd: String) -> CmdResult<ShellOutput> {
    if !shell_allowed(&state)? {
        return Err(CommandError { code: "shell-disabled", detail: "system shell is turned off".into() });
    }
    let root = active_root(&state)?;
    let rel = cwd.trim_matches('/');
    let dir = if rel.is_empty() || rel.split('/').any(|p| p == "..") { root.clone() } else { root.join(rel) };
    let dir = if dir.is_dir() { dir } else { root };
    tauri::async_runtime::spawn_blocking(move || run_shell(&command, &shell, &dir))
        .await
        .map_err(internal)?
}

fn run_shell(command: &str, shell: &str, dir: &std::path::Path) -> CmdResult<ShellOutput> {
    let mut cmd = match shell {
        "cmd" => {
            let mut c = Command::new("cmd");
            c.args(["/D", "/C", command]);
            c
        }
        "powershell" => {
            let mut c = Command::new(if cfg!(windows) { "powershell" } else { "pwsh" });
            c.args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command]);
            c
        }
        "bash" | "zsh" => {
            let mut c = Command::new(shell);
            c.args(["-c", command]);
            c
        }
        _ => {
            let mut c = Command::new("sh");
            c.args(["-c", command]);
            c
        }
    };
    cmd.current_dir(dir).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd.spawn().map_err(|e| CommandError { code: "shell-failed", detail: e.to_string() })?;
    let mut out = child.stdout.take();
    let mut err = child.stderr.take();
    let t_out = std::thread::spawn(move || {
        let mut b = Vec::new();
        if let Some(o) = out.as_mut() {
            let _ = o.read_to_end(&mut b);
        }
        b
    });
    let t_err = std::thread::spawn(move || {
        let mut b = Vec::new();
        if let Some(e) = err.as_mut() {
            let _ = e.read_to_end(&mut b);
        }
        b
    });
    let start = std::time::Instant::now();
    let code = loop {
        if let Some(status) = child.try_wait().map_err(internal)? {
            break status.code().unwrap_or(-1);
        }
        if start.elapsed() > SHELL_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            break 124;
        }
        std::thread::sleep(Duration::from_millis(25));
    };
    Ok(ShellOutput { stdout: clip(t_out.join().unwrap_or_default()), stderr: clip(t_err.join().unwrap_or_default()), code })
}

// ---------------------------------------------------------------- MCP bridge

#[derive(Default)]
pub struct McpBridge {
    running: AtomicBool,
    generation: Arc<AtomicU64>,
    port: Mutex<u16>,
    token: Arc<Mutex<String>>,
    pending: Arc<Mutex<HashMap<u64, Sender<String>>>>,
    seq: Arc<AtomicU64>,
}

/// One JSON-RPC body from a client, handed to whoever answers (the UI in the app).
#[derive(Serialize, Clone, Debug)]
pub struct McpRequest {
    pub id: u64,
    pub body: String,
    pub client: String,
}

/// Receives each request; the answer comes back through [`McpBridge::respond`].
pub type Forward = Arc<dyn Fn(McpRequest) + Send + Sync>;

impl McpBridge {
    /// Start (or retarget) the bridge on 127.0.0.1:`port` (0 picks a free port). Returns the bound port.
    pub fn start(&self, port: u16, token: String, forward: Forward) -> Result<u16, String> {
        if token.len() < 16 {
            return Err("token too short".into());
        }
        *self.token.lock().map_err(|e| e.to_string())? = token;
        if self.running.load(Ordering::SeqCst) {
            return Ok(*self.port.lock().map_err(|e| e.to_string())?);
        }
        let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|e| e.to_string())?;
        let bound = listener.local_addr().map_err(|e| e.to_string())?.port();
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        *self.port.lock().map_err(|e| e.to_string())? = bound;
        self.running.store(true, Ordering::SeqCst);
        let generation = self.generation.clone();
        let mine = generation.load(Ordering::SeqCst);
        let token = self.token.clone();
        let pending = self.pending.clone();
        let seq = self.seq.clone();
        std::thread::spawn(move || {
            while generation.load(Ordering::SeqCst) == mine {
                match listener.accept() {
                    Ok((stream, _)) => {
                        let (forward, token, pending, seq) = (forward.clone(), token.clone(), pending.clone(), seq.clone());
                        std::thread::spawn(move || {
                            let _ = handle(stream, &forward, &token, &pending, &seq, bound);
                        });
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(50)),
                    Err(_) => std::thread::sleep(Duration::from_millis(200)),
                }
            }
        });
        Ok(bound)
    }

    /// Stop listening; the listener thread notices within 50 ms and closes the port.
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        self.generation.fetch_add(1, Ordering::SeqCst);
    }

    /// The answer to a forwarded request (empty for notifications).
    pub fn respond(&self, id: u64, body: String) {
        if let Ok(mut p) = self.pending.lock() {
            if let Some(tx) = p.remove(&id) {
                let _ = tx.send(body);
            }
        }
    }
}

#[tauri::command]
pub fn mcp_start(app: tauri::AppHandle, bridge: State<'_, McpBridge>, port: u16, token: String) -> CmdResult<u16> {
    let forward: Forward = Arc::new(move |req| {
        let _ = app.emit("mcp-request", req);
    });
    bridge.start(port, token, forward).map_err(|detail| CommandError { code: "mcp-port", detail })
}

#[tauri::command]
pub fn mcp_stop(bridge: State<'_, McpBridge>) -> CmdResult<()> {
    bridge.stop();
    Ok(())
}

#[tauri::command]
pub fn mcp_respond(bridge: State<'_, McpBridge>, id: u64, body: String) -> CmdResult<()> {
    bridge.respond(id, body);
    Ok(())
}

fn reply(stream: &mut TcpStream, status: &str, body: &str, extra: &str) -> std::io::Result<()> {
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n{extra}\r\n",
        body.len()
    );
    stream.write_all(head.as_bytes())?;
    stream.write_all(body.as_bytes())?;
    stream.flush()
}

fn handle(
    mut stream: TcpStream,
    forward: &Forward,
    token: &Arc<Mutex<String>>,
    pending: &Arc<Mutex<HashMap<u64, Sender<String>>>>,
    seq: &Arc<AtomicU64>,
    port: u16,
) -> std::io::Result<()> {
    stream.set_nonblocking(false)?;
    stream.set_read_timeout(Some(Duration::from_secs(15)))?;
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut line = String::new();
    reader.read_line(&mut line)?;
    let mut parts = line.split_whitespace();
    let method = parts.next().unwrap_or("").to_string();
    let path = parts.next().unwrap_or("").to_string();
    let mut headers: HashMap<String, String> = HashMap::new();
    loop {
        let mut h = String::new();
        if reader.read_line(&mut h)? == 0 || h == "\r\n" || h == "\n" {
            break;
        }
        if let Some((k, v)) = h.split_once(':') {
            headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
        if headers.len() > 100 {
            return reply(&mut stream, "431 Request Header Fields Too Large", "{}", "");
        }
    }
    // DNS-rebinding guard: only loopback hosts, and no browser origins.
    let host = headers.get("host").cloned().unwrap_or_default();
    let host_ok = [format!("127.0.0.1:{port}"), format!("localhost:{port}"), "127.0.0.1".into(), "localhost".into()].contains(&host);
    if !host_ok || headers.get("origin").is_some_and(|o| !o.starts_with("http://127.0.0.1") && !o.starts_with("http://localhost")) {
        return reply(&mut stream, "403 Forbidden", r#"{"error":"forbidden"}"#, "");
    }
    if path.split('?').next() != Some("/mcp") {
        return reply(&mut stream, "404 Not Found", r#"{"error":"not found"}"#, "");
    }
    let expected = token.lock().map(|t| format!("Bearer {}", *t)).unwrap_or_default();
    if headers.get("authorization") != Some(&expected) {
        return reply(&mut stream, "401 Unauthorized", r#"{"error":"unauthorized"}"#, "WWW-Authenticate: Bearer\r\n");
    }
    match method.as_str() {
        "POST" => {}
        "DELETE" => return reply(&mut stream, "200 OK", "{}", ""),
        _ => return reply(&mut stream, "405 Method Not Allowed", "{}", "Allow: POST\r\n"),
    }
    let len: usize = headers.get("content-length").and_then(|v| v.parse().ok()).unwrap_or(0);
    if len > MAX_BODY {
        return reply(&mut stream, "413 Payload Too Large", "{}", "");
    }
    let mut body = vec![0u8; len];
    reader.read_exact(&mut body)?;
    let id = seq.fetch_add(1, Ordering::SeqCst);
    let (tx, rx) = channel();
    if let Ok(mut p) = pending.lock() {
        p.insert(id, tx);
    }
    let client = headers.get("user-agent").cloned().unwrap_or_default();
    forward(McpRequest { id, body: String::from_utf8_lossy(&body).into_owned(), client });
    match rx.recv_timeout(Duration::from_secs(60)) {
        Ok(resp) if resp.is_empty() => reply(&mut stream, "202 Accepted", "", ""),
        Ok(resp) => reply(&mut stream, "200 OK", &resp, "Mcp-Session-Id: nosidian\r\n"),
        Err(_) => {
            if let Ok(mut p) = pending.lock() {
                p.remove(&id);
            }
            reply(&mut stream, "504 Gateway Timeout", r#"{"error":"the app did not answer"}"#, "")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: &str = "nos_mcp_test_token_123456";

    fn server() -> (Arc<McpBridge>, u16) {
        let bridge = Arc::new(McpBridge::default());
        let weak = Arc::downgrade(&bridge);
        let forward: Forward = Arc::new(move |req: McpRequest| {
            if let Some(b) = weak.upgrade() {
                let answer = if req.body.contains("notifications/") { String::new() } else { format!("{{\"echo\":{}}}", req.body) };
                b.respond(req.id, answer);
            }
        });
        let port = bridge.start(0, TOKEN.into(), forward).expect("start");
        (bridge, port)
    }

    fn send(port: u16, raw: &str) -> (String, String) {
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.write_all(raw.as_bytes()).unwrap();
        let mut out = String::new();
        s.read_to_string(&mut out).unwrap();
        let (head, body) = out.split_once("\r\n\r\n").unwrap_or((&out, ""));
        (head.to_string(), body.to_string())
    }

    fn post(port: u16, host: &str, auth: &str, extra: &str, body: &str) -> (String, String) {
        send(port, &format!("POST /mcp HTTP/1.1\r\nHost: {host}\r\nAuthorization: {auth}\r\nContent-Type: application/json\r\n{extra}Content-Length: {}\r\n\r\n{body}", body.len()))
    }

    #[test]
    fn answers_authorised_loopback_requests() {
        let (_b, port) = server();
        let host = format!("127.0.0.1:{port}");
        let bearer = format!("Bearer {TOKEN}");
        let (head, body) = post(port, &host, &bearer, "", r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#);
        assert!(head.starts_with("HTTP/1.1 200"), "{head}");
        assert!(head.contains("Mcp-Session-Id: nosidian"));
        assert_eq!(body, r#"{"echo":{"jsonrpc":"2.0","id":1,"method":"ping"}}"#);
        let (head, body) = post(port, &format!("localhost:{port}"), &bearer, "", r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#);
        assert!(head.starts_with("HTTP/1.1 202"), "{head}");
        assert!(body.is_empty());
    }

    #[test]
    fn refuses_everything_else() {
        let (_b, port) = server();
        let host = format!("127.0.0.1:{port}");
        let bearer = format!("Bearer {TOKEN}");
        let ping = r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#;
        assert!(post(port, &host, "Bearer wrong", "", ping).0.starts_with("HTTP/1.1 401"));
        assert!(post(port, &host, "", "", ping).0.starts_with("HTTP/1.1 401"));
        assert!(post(port, &format!("evil.example:{port}"), &bearer, "", ping).0.starts_with("HTTP/1.1 403"));
        assert!(post(port, &host, &bearer, "Origin: https://evil.example\r\n", ping).0.starts_with("HTTP/1.1 403"));
        assert!(post(port, &host, &bearer, "Origin: http://localhost:5173\r\n", ping).0.starts_with("HTTP/1.1 200"));
        let get = send(port, &format!("GET /mcp HTTP/1.1\r\nHost: {host}\r\nAuthorization: {bearer}\r\n\r\n"));
        assert!(get.0.starts_with("HTTP/1.1 405"), "{}", get.0);
        let other = send(port, &format!("POST /other HTTP/1.1\r\nHost: {host}\r\nAuthorization: {bearer}\r\nContent-Length: 0\r\n\r\n"));
        assert!(other.0.starts_with("HTTP/1.1 404"));
        let big = send(port, &format!("POST /mcp HTTP/1.1\r\nHost: {host}\r\nAuthorization: {bearer}\r\nContent-Length: {}\r\n\r\n", MAX_BODY + 1));
        assert!(big.0.starts_with("HTTP/1.1 413"));
        let bye = send(port, &format!("DELETE /mcp HTTP/1.1\r\nHost: {host}\r\nAuthorization: {bearer}\r\n\r\n"));
        assert!(bye.0.starts_with("HTTP/1.1 200"));
    }

    #[test]
    fn needs_a_long_token_and_can_restart() {
        let b = McpBridge::default();
        assert!(b.start(0, "short".into(), Arc::new(|_| {})).is_err());
        let first = b.start(0, TOKEN.into(), Arc::new(|_| {})).unwrap();
        assert_eq!(b.start(0, TOKEN.into(), Arc::new(|_| {})).unwrap(), first, "a running bridge keeps its port");
        b.stop();
        std::thread::sleep(Duration::from_millis(120));
        let again = b.start(first, TOKEN.into(), Arc::new(|_| {})).unwrap();
        assert_eq!(again, first, "the port is free again after stop");
        b.stop();
    }
}
