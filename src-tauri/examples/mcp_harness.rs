//! Runs the real MCP HTTP bridge without the app window, for end-to-end tests
//! (`scripts/mcp-e2e.ts`). Each request is printed to stdout as one JSON line;
//! answers are read from stdin as `{"id":N,"body":"..."}` lines.
//!
//! cargo run --example mcp_harness -- <port> <token>

use std::io::{BufRead, Write};
use std::sync::Arc;

use nosidian_lib::bridge::{Forward, McpBridge, McpRequest};

fn main() {
    let mut args = std::env::args().skip(1);
    let port: u16 = args.next().and_then(|p| p.parse().ok()).unwrap_or(0);
    let token = args.next().unwrap_or_else(|| "nos_mcp_harness_token_0000".into());
    let bridge = Arc::new(McpBridge::default());
    let forward: Forward = Arc::new(|req: McpRequest| {
        let line = serde_json::to_string(&req).expect("request json");
        let mut out = std::io::stdout().lock();
        let _ = writeln!(out, "{line}");
        let _ = out.flush();
    });
    let bound = bridge.start(port, token, forward).expect("bridge start");
    eprintln!("listening on http://127.0.0.1:{bound}/mcp");
    println!("{{\"ready\":{bound}}}");
    let _ = std::io::stdout().flush();
    for line in std::io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
        let id = v["id"].as_u64().unwrap_or(u64::MAX);
        bridge.respond(id, v["body"].as_str().unwrap_or("").to_string());
    }
    bridge.stop();
}
