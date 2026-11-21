# Connecting AI apps to your vault (MCP)

NoSidian can let AI apps on your computer read your notes and, if you allow it, propose changes. It uses the [Model Context Protocol](https://modelcontextprotocol.io) over Streamable HTTP.

The bridge is off by default. It listens only on `127.0.0.1`, and it needs a long random access token. It never opens a port to your network or the internet.

## Turn it on

1. Open **Settings › Advanced › MCP** in the desktop app.
2. Turn on **Let local AI clients use this vault (MCP)**. The status line shows the address, which is `http://127.0.0.1:27124/mcp` by default.
3. Choose the access level:
   - **Read only**: apps can list, read and search notes.
   - **Read and propose changes**: apps can also create, update and delete notes. Each change waits under **Changes waiting for approval** until you apply or reject it. Turn on **Apply AI changes without asking** only if you trust the app completely.
4. Under **Connect an AI app**, pick your app and copy the config. The in-app copy already contains your token.

Keep NoSidian open while you use the AI app. The bridge answers from the open vault.

## Claude Desktop

Open **Settings › Developer › Edit config** and add the `nosidian` entry to `claude_desktop_config.json`. Claude Desktop starts MCP servers as commands, so the config runs [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) through `npx` to reach the HTTP bridge. Node.js must be installed for this to work.

```json
{
  "mcpServers": {
    "nosidian": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://127.0.0.1:27124/mcp", "--header", "Authorization:${NOSIDIAN_AUTH}"],
      "env": { "NOSIDIAN_AUTH": "Bearer YOUR_TOKEN" }
    }
  }
}
```

The token sits in `env` instead of `args` on purpose. On Windows, an argument that contains a space, such as `Authorization: Bearer …`, gets split into two arguments and the header breaks.

After you save the file, restart Claude Desktop.

## Claude Code

```sh
claude mcp add --transport http nosidian http://127.0.0.1:27124/mcp --header "Authorization: Bearer YOUR_TOKEN"
```

## Cursor

Add the entry to `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "nosidian": { "url": "http://127.0.0.1:27124/mcp", "headers": { "Authorization": "Bearer YOUR_TOKEN" } } } }
```

## VS Code

Add the entry to `.vscode/mcp.json`, or use **MCP: Open User Configuration**:

```json
{ "servers": { "nosidian": { "type": "http", "url": "http://127.0.0.1:27124/mcp", "headers": { "Authorization": "Bearer YOUR_TOKEN" } } } }
```

## What the app can use

| Tool | Access | What it does |
| --- | --- | --- |
| `list_notes` | read | Lists every note, optionally under one folder, with tags and size. |
| `read_note` | read | Returns a note's full Markdown, including its front matter. |
| `search_vault` | read | Runs a full-text search over titles, lines and `#tags`. |
| `get_backlinks` | read | Lists the notes that link to a note, unlinked mentions, and its outgoing `[[links]]`. |
| `list_tags` | read | Lists every tag with the number of notes that use it. |
| `create_note` | write | Creates a new note. It never overwrites an existing one, and it rejects paths outside the vault. |
| `update_note` | write | Replaces a note's text or appends to it. |
| `delete_note` | write | Moves a note to the trash. |

Every note is also available as a resource, `nosidian://note/<path>`.

There are two prompts:

- `review_vault_connections`, with an optional `path`, looks for missing links and structure problems.
- `generate_study_cards`, with a `path`, writes flashcards in NoSidian's card syntax.

A queued change is skipped if the note changed after the app proposed it. This means an approval can never undo your own edits.

## Things to ask

- "Search my NoSidian vault for notes about my thesis and summarise what I already have."
- "Which of my notes link to *Ideas*? Suggest three new [[links]] that are missing."
- "Make flashcards from *Biology/Photosynthesis.md* with the generate_study_cards prompt."
- "Read today's daily note and create *Inbox/Plan for tomorrow.md* with the open tasks."
- "List my tags and tell me which ones are used only once."

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| The app cannot connect | Check that NoSidian is open and the status says *Running*. Check that the port in the config matches the port in Settings. |
| `401 Unauthorized` | The token is wrong or was replaced with **New token**. Copy the config again. |
| `403 Forbidden` | The request came from a web page, or used a host name other than `127.0.0.1` or `localhost`. Browsers are blocked on purpose. |
| Writes do nothing | Set the access to **Read and propose changes**, then approve the change in Settings. |
| `504` after a minute | The app window was busy or closed, so the request got no answer. Try again. |

## Testing

```sh
cargo test -p nosidian bridge   # HTTP layer: auth, host and origin checks, limits, restart
npx vitest run src/core/mcp.test.ts   # JSON-RPC: tools, resources, prompts, modes, path safety
npm run test:mcp                 # end to end: the official MCP SDK client against the real Rust bridge
npm run test:mcp -- --mcp-remote # also through mcp-remote, the Claude Desktop path (downloads mcp-remote)
```
