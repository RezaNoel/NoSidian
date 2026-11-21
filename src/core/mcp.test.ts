import { describe, expect, it } from "vitest";
import { MCP_PROTOCOL_VERSION, buildClaudeDesktopConfigSnippet, cleanNotePath, runMcpJsonRpc, type McpChangeProposal, type McpVaultContext } from "./mcp";
import type { Note } from "./types";

const note = (path: string, content: string): Note => ({ path, content, starred: false, createdAt: 0, updatedAt: 1_700_000_000_000, snapshots: [] });
const NOTES = [
  note("Welcome.md", "# Welcome\nSee [[Ideas]] and #start"),
  note("Ideas.md", "# Ideas\nA list of #start ideas, linked from Welcome."),
  note("Projects/Plan.md", "---\ntags: [plan]\n---\n# Plan\n- [ ] ship"),
];

function ctx(over: Partial<McpVaultContext> = {}) {
  const writes: { p: McpChangeProposal; now: boolean }[] = [];
  const c: McpVaultContext = { vaultName: "Test", notes: NOTES, folders: ["Projects"], mode: "read-write", autoApplyChanges: false, onApplyWrite: (p, now) => writes.push({ p, now }), ...over };
  return { c, writes };
}
let seq = 0;
const call = (c: McpVaultContext, method: string, params: Record<string, unknown> = {}) => runMcpJsonRpc({ jsonrpc: "2.0", id: ++seq, method, params }, c).response;
const tool = (c: McpVaultContext, name: string, args: Record<string, unknown> = {}) => {
  const r = call(c, "tools/call", { name, arguments: args }).result as { content: { text: string }[]; isError: boolean };
  let data: unknown = r.content[0].text;
  try { data = JSON.parse(r.content[0].text); } catch { /* plain text */ }
  return { isError: r.isError, data: data as Record<string, unknown> };
};

describe("MCP server core", () => {
  it("negotiates the protocol version and describes itself", () => {
    const { c } = ctx();
    const r = call(c, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } }).result as Record<string, unknown>;
    expect(r.protocolVersion).toBe("2025-03-26");
    expect(r.instructions).toMatch(/list_notes/);
    expect((r.serverInfo as { name: string }).name).toBe("nosidian");
    const future = call(c, "initialize", { protocolVersion: "2099-01-01" }).result as Record<string, unknown>;
    expect(future.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    expect(call(c, "ping").result).toEqual({});
  });

  it("hides write tools in read-only mode and refuses them", () => {
    const ro = ctx({ mode: "read-only" });
    const names = (call(ro.c, "tools/list").result as { tools: { name: string }[] }).tools.map((x) => x.name);
    expect(names).toEqual(["list_notes", "read_note", "search_vault", "get_backlinks", "list_tags"]);
    expect(tool(ro.c, "create_note", { path: "X.md", content: "x" }).isError).toBe(true);
    expect(ro.writes).toHaveLength(0);
    const rw = (call(ctx().c, "tools/list").result as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] }).tools;
    expect(rw).toHaveLength(8);
    expect(rw.find((x) => x.name === "delete_note")?.annotations.readOnlyHint).toBe(false);
  });

  it("answers every read tool", () => {
    const { c } = ctx();
    expect(tool(c, "list_notes").data.count).toBe(3);
    expect(tool(c, "list_notes", { folder: "projects" }).data.count).toBe(1);
    expect(tool(c, "read_note", { path: "ideas.md" }).data.content).toMatch(/A list/);
    expect(tool(c, "read_note", { path: "Missing.md" }).isError).toBe(true);
    const search = tool(c, "search_vault", { query: "ideas" }).data as { totalHits: number; results: { path: string }[] };
    expect(search.totalHits).toBeGreaterThan(0);
    expect(search.results.map((r) => r.path)).toContain("Ideas.md");
    const links = tool(c, "get_backlinks", { path: "Ideas.md" }).data as { linkedBacklinks: string[] };
    expect(links.linkedBacklinks).toContain("Welcome.md");
    const tags = tool(c, "list_tags").data as unknown as { tag: string; count: number }[];
    expect(tags.find((x) => x.tag === "start")?.count).toBe(2);
    expect(tool(c, "nope").isError).toBe(true);
  });

  it("queues writes for approval, or applies them when allowed", () => {
    const q = ctx();
    const created = tool(q.c, "create_note", { path: "Inbox/New idea", content: "# New" });
    expect(created.data.status).toBe("queued_for_user_approval");
    expect(q.writes[0]).toMatchObject({ now: false, p: { action: "create", path: "Inbox/New idea.md", status: "pending" } });
    const auto = ctx({ autoApplyChanges: true });
    expect(tool(auto.c, "update_note", { path: "Ideas.md", content: "more", mode: "append" }).data.status).toBe("applied");
    expect(auto.writes[0].p.newContent).toBe("# Ideas\nA list of #start ideas, linked from Welcome.\n\nmore\n");
    expect(auto.writes[0].now).toBe(true);
    expect(tool(auto.c, "delete_note", { path: "Welcome.md" }).data.status).toBe("applied");
    expect(auto.writes[1].p.action).toBe("delete");
  });

  it("never overwrites with create_note and keeps paths inside the vault", () => {
    const { c, writes } = ctx({ autoApplyChanges: true });
    expect(tool(c, "create_note", { path: "welcome.md", content: "gone" }).isError).toBe(true);
    for (const bad of ["../outside.md", "/etc/passwd", "C:/Windows/x.md", "a/../../b.md", ".nosidian/config.md", "a//b.md", ""]) {
      expect(tool(c, "create_note", { path: bad, content: "x" }).isError, bad).toBe(true);
    }
    expect(writes).toHaveLength(0);
    expect(cleanNotePath("Folder\\Note")).toBe("Folder/Note.md");
    expect(cleanNotePath("./A.md")).toBe("A.md");
    expect(tool(c, "update_note", { path: "Nope.md", content: "x" }).isError).toBe(true);
  });

  it("serves notes as resources and offers prompts", () => {
    const { c } = ctx();
    const res = (call(c, "resources/list").result as { resources: { uri: string }[] }).resources;
    expect(res).toHaveLength(3);
    const read = call(c, "resources/read", { uri: res[2].uri }).result as { contents: { text: string }[] };
    expect(read.contents[0].text).toMatch(/# Plan/);
    expect(call(c, "resources/read", { uri: "nosidian://note/x.md" }).error?.code).toBe(-32602);
    expect(call(c, "resources/templates/list").result).toEqual({ resourceTemplates: [] });
    const prompts = (call(c, "prompts/list").result as { prompts: { name: string }[] }).prompts.map((p) => p.name);
    expect(prompts).toEqual(["review_vault_connections", "generate_study_cards"]);
    const cards = call(c, "prompts/get", { name: "generate_study_cards", arguments: { path: "Ideas.md" } }).result as { messages: { content: { text: string } }[] };
    expect(cards.messages[0].content.text).toMatch(/question :: answer[\s\S]*A list of #start ideas/);
    expect(call(c, "prompts/get", { name: "generate_study_cards", arguments: {} }).error?.code).toBe(-32602);
    expect(call(c, "prompts/get", { name: "review_vault_connections" }).result).toBeTruthy();
  });

  it("rejects bad requests and the off mode", () => {
    expect(runMcpJsonRpc("x", ctx().c).response.error?.code).toBe(-32600);
    expect(call(ctx().c, "nope/nope").error?.code).toBe(-32601);
    expect(call(ctx({ mode: "off" }).c, "tools/list").error?.code).toBe(-32001);
  });

  it("builds a Claude Desktop config that works on Windows", () => {
    const cfg = JSON.parse(buildClaudeDesktopConfigSnippet("http://127.0.0.1:27124/mcp", "nos_mcp_abc")) as { mcpServers: { nosidian: { args: string[]; env: Record<string, string> } } };
    expect(cfg.mcpServers.nosidian.args).not.toContain("Authorization: Bearer nos_mcp_abc");
    expect(cfg.mcpServers.nosidian.args.at(-1)).toBe("Authorization:${NOSIDIAN_AUTH}");
    expect(cfg.mcpServers.nosidian.env.NOSIDIAN_AUTH).toBe("Bearer nos_mcp_abc");
  });
});
