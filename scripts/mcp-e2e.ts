// End-to-end test of the MCP bridge: the real Rust HTTP server
// (src-tauri/examples/mcp_harness.rs) answers with the app's JSON-RPC core,
// and the official MCP TypeScript SDK talks to it like an AI client would.
//
//   npm run test:mcp                 (SDK client over HTTP)
//   npm run test:mcp -- --mcp-remote (also through `npx mcp-remote`, the Claude Desktop path)
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { runMcpJsonRpc, type McpAccessMode, type McpChangeProposal } from "../src/core/mcp";
import type { Note } from "../src/core/types";

const TOKEN = "nos_mcp_e2e_" + Math.random().toString(36).slice(2, 14);
const now = Date.now();
const note = (path: string, content: string): Note => ({ path, content, starred: false, createdAt: now, updatedAt: now, snapshots: [] });
const notes: Note[] = [
  note("Welcome.md", "# Welcome\nStart with [[Ideas]]. #start"),
  note("Ideas.md", "# Ideas\nPhotosynthesis :: how plants turn light into sugar\n#start #biology"),
  note("Projects/Launch.md", "---\ntags: [project]\n---\n# Launch\n- [ ] Write the press note"),
];
let mode: McpAccessMode = "read-write";
let autoApply = false;
const proposals: McpChangeProposal[] = [];

let failures = 0;
const check = (label: string, ok: unknown, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${!ok && detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

// 1. Build and start the real bridge.
const build = spawnSync("cargo", ["build", "-q", "--example", "mcp_harness", "-p", "nosidian"], { stdio: "inherit" });
if (build.status !== 0) process.exit(1);
const harness = spawn("target/debug/examples/mcp_harness", ["0", TOKEN], { stdio: ["pipe", "pipe", "inherit"] });
const port = await new Promise<number>((resolve, reject) => {
  const rl = createInterface({ input: harness.stdout! });
  rl.on("line", (line) => {
    const msg = JSON.parse(line) as { ready?: number; id?: number; body?: string; client?: string };
    if (msg.ready) return resolve(msg.ready);
    // Same handling as src/state/devtools.ts onRequest.
    const parsed = JSON.parse(msg.body ?? "null") as unknown;
    const batch = Array.isArray(parsed) ? parsed : [parsed];
    const out: unknown[] = [];
    for (const req of batch) {
      const { response } = runMcpJsonRpc(req, { vaultName: "E2E", notes, folders: ["Projects"], mode, autoApplyChanges: autoApply, onApplyWrite: (p) => proposals.push(p) });
      if (req && typeof req === "object" && "id" in req) out.push(response);
    }
    const body = out.length ? JSON.stringify(Array.isArray(parsed) ? out : out[0]) : "";
    harness.stdin!.write(JSON.stringify({ id: msg.id, body }) + "\n");
  });
  harness.on("exit", (c) => reject(new Error(`harness exited ${c}`)));
});
const url = `http://127.0.0.1:${port}/mcp`;
console.log(`bridge on ${url}\n`);

type ToolResult = { isError?: boolean; content: { type: string; text: string }[] };
const json = (r: unknown) => JSON.parse((r as ToolResult).content[0].text) as Record<string, unknown>;

async function exercise(client: Client, via: string) {
  const info = client.getServerVersion();
  check(`${via}: initialize (server ${info?.name} ${info?.version})`, info?.name === "nosidian");
  check(`${via}: instructions`, /list_notes/.test(client.getInstructions() ?? ""));
  await client.ping();
  check(`${via}: ping`, true);
  const tools = (await client.listTools()).tools.map((x) => x.name);
  check(`${via}: tools/list has 8 tools`, tools.length === 8, tools.join(","));
  const list = json(await client.callTool({ name: "list_notes", arguments: {} }));
  check(`${via}: list_notes`, list.count === 3);
  const read = json(await client.callTool({ name: "read_note", arguments: { path: "Ideas.md" } }));
  check(`${via}: read_note`, String(read.content).includes("Photosynthesis"));
  const search = json(await client.callTool({ name: "search_vault", arguments: { query: "photosynthesis" } }));
  check(`${via}: search_vault`, (search.results as { path: string }[])[0]?.path === "Ideas.md");
  const links = json(await client.callTool({ name: "get_backlinks", arguments: { path: "Ideas.md" } }));
  check(`${via}: get_backlinks`, (links.linkedBacklinks as string[]).includes("Welcome.md"));
  const tags = JSON.parse(((await client.callTool({ name: "list_tags", arguments: {} })) as ToolResult).content[0].text) as { tag: string }[];
  check(`${via}: list_tags`, tags.some((x) => x.tag === "biology"));
  const missing = (await client.callTool({ name: "read_note", arguments: { path: "Nope.md" } })) as ToolResult;
  check(`${via}: missing note is a tool error`, missing.isError === true);
  const before = proposals.length;
  const created = json(await client.callTool({ name: "create_note", arguments: { path: "Inbox/From AI", content: "# From AI" } }));
  check(`${via}: create_note waits for approval`, created.status === "queued_for_user_approval" && proposals.length === before + 1);
  const escape = (await client.callTool({ name: "create_note", arguments: { path: "../../outside", content: "x" } })) as ToolResult;
  check(`${via}: path outside the vault is refused`, escape.isError === true && proposals.length === before + 1);
  const clobber = (await client.callTool({ name: "create_note", arguments: { path: "Welcome.md", content: "x" } })) as ToolResult;
  check(`${via}: create_note never overwrites`, clobber.isError === true);
  const resources = (await client.listResources()).resources;
  check(`${via}: resources/list`, resources.length === 3);
  const res = await client.readResource({ uri: resources[0].uri });
  check(`${via}: resources/read`, String((res.contents[0] as { text?: string }).text).length > 0);
  const prompts = (await client.listPrompts()).prompts.map((p) => p.name);
  check(`${via}: prompts/list`, prompts.includes("generate_study_cards"));
  const prompt = await client.getPrompt({ name: "generate_study_cards", arguments: { path: "Ideas.md" } });
  check(`${via}: prompts/get`, JSON.stringify(prompt.messages).includes("question :: answer"));
  mode = "read-only";
  const roTools = (await client.listTools()).tools.length;
  const roWrite = (await client.callTool({ name: "update_note", arguments: { path: "Ideas.md", content: "x" } })) as ToolResult;
  check(`${via}: read-only hides and refuses writes`, roTools === 5 && roWrite.isError === true);
  mode = "read-write";
}

// 2. The SDK's Streamable HTTP client (Claude Code, Cursor, VS Code use this transport).
const client = new Client({ name: "nosidian-e2e", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }));
await exercise(client, "http");
await client.close();

// 3. A wrong token must not connect.
const intruder = new Client({ name: "intruder", version: "1.0.0" });
const denied = await intruder.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: "Bearer wrong" } } })).then(() => false, () => true);
check("http: wrong token is refused", denied);

// 4. Optional: through mcp-remote, exactly as the Claude Desktop config runs it.
if (process.argv.includes("--mcp-remote")) {
  const remote = new Client({ name: "claude-desktop-like", version: "1.0.0" });
  await remote.connect(new StdioClientTransport({
    command: "npx",
    args: ["-y", "mcp-remote", url, "--header", "Authorization:${NOSIDIAN_AUTH}"],
    env: { ...process.env as Record<string, string>, NOSIDIAN_AUTH: `Bearer ${TOKEN}` },
    stderr: "ignore",
  }));
  await exercise(remote, "mcp-remote");
  await remote.close();
}

harness.kill();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
