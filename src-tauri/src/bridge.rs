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
    running: Arc<AtomicBool>,
    port: Mutex<u16>,
    token: Arc<Mutex<String>>,
    pending: Arc<Mutex<HashMap<u64, Sender<String>>>>,
    seq: Arc<AtomicU64>,
}

#[derive(Serialize, Clone)]
struct McpRequest {
    id: u64,
    body: String,
    client: String,
}

/// Start (or retarget) the bridge on 127.0.0.1:`port`. Returns the bound port.
#[tauri::command]
pub fn mcp_start(app: tauri::AppHandle, bridge: State<'_, McpBridge>, port: u16, token: String) -> CmdResult<u16> {
    if token.len() < 16 {
        return Err(CommandError { code: "invalid-path", detail: "token too short".into() });
    }
    *bridge.token.lock().map_err(internal)? = token;
    if bridge.running.load(Ordering::SeqCst) {
        return Ok(*bridge.port.lock().map_err(internal)?);
    }
    let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|e| CommandError { code: "mcp-port", detail: e.to_string() })?;
    let bound = listener.local_addr().map_err(internal)?.port();
    listener.set_nonblocking(true).map_err(internal)?;
    *bridge.port.lock().map_err(internal)? = bound;
    bridge.running.store(true, Ordering::SeqCst);
    let running = bridge.running.clone();
    let token = bridge.token.clone();
    let pending = bridge.pending.clone();
    let seq = bridge.seq.clone();
    std::thread::spawn(move || {
        while running.load(Ordering::SeqCst) {
            match listener.accept() {
                Ok((stream, _)) => {
                    let (app, token, pending, seq) = (app.clone(), token.clone(), pending.clone(), seq.clone());
                    std::thread::spawn(move || {
                        let _ = handle(stream, &app, &token, &pending, &seq, bound);
                    });
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(50)),
                Err(_) => std::thread::sleep(Duration::from_millis(200)),
            }
        }
    });
    Ok(bound)
}

#[tauri::command]
pub fn mcp_stop(bridge: State<'_, McpBridge>) -> CmdResult<()> {
    bridge.running.store(false, Ordering::SeqCst);
    Ok(())
}

/// The UI's answer to a forwarded request (empty for notifications).
#[tauri::command]
pub fn mcp_respond(bridge: State<'_, McpBridge>, id: u64, body: String) -> CmdResult<()> {
    if let Some(tx) = bridge.pending.lock().map_err(internal)?.remove(&id) {
        let _ = tx.send(body);
    }
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
    app: &tauri::AppHandle,
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
    let _ = app.emit("mcp-request", McpRequest { id, body: String::from_utf8_lossy(&body).into_owned(), client });
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
