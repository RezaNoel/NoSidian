import type { Note } from './types';
import { getBacklinks } from './knowledge';
import { extractTags, extractWikilinks } from './markdown';
import { buildSearchIndex, searchVaultIndex } from './searchIndex';

export type McpAccessMode = 'off' | 'read-only' | 'read-write';

export interface McpConfig {
  enabled: boolean;
  mode: McpAccessMode;
  autoApplyChanges: boolean;
  token: string;
}

export interface McpChangeProposal {
  id: string;
  action: 'create' | 'update' | 'delete';
  path: string;
  summary: string;
  newContent?: string;
  previousContent?: string;
  clientName?: string;
  createdAt: number;
  status: 'pending' | 'approved' | 'rejected';
}

export interface McpActivityLog {
  id: string;
  method: string;
  tool?: string;
  path?: string;
  timestamp: number;
  ok: boolean;
  detail: string;
}

export const MCP_PROTOCOL_VERSION = '2024-11-05';

export function generateMcpToken(): string {
  const chars = 'abcdefghijkmnopqrstuvwxyz23456789';
  let out = 'nos_mcp_';
  for (let i = 0; i < 20; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export const DEFAULT_MCP_CONFIG: McpConfig = {
  enabled: true,
  mode: 'read-write',
  autoApplyChanges: true,
  token: 'nos_mcp_local_bridge_2026'
};

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'list_notes',
    description: 'List all Markdown notes and folders in the user Vault with word counts and tags.',
    inputSchema: {
      type: 'object',
      properties: {
        folder: { type: 'string', description: 'Optional folder prefix filter' }
      }
    }
  },
  {
    name: 'read_note',
    description: 'Read the full Markdown content and YAML frontmatter of a specific note path.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative note path (e.g. "Daily Notes/2026-11-15.md")' }
      },
      required: ['path']
    }
  },
  {
    name: 'search_vault',
    description: 'Run full-text search across all vault notes including titles, content lines, and #tags.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query, #tag, or title:name' },
        limit: { type: 'number', description: 'Max number of matching notes (default 10)' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_backlinks',
    description: 'Inspect incoming backlinks and outgoing [[wikilinks]] for a given note.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative note path' }
      },
      required: ['path']
    }
  },
  {
    name: 'list_tags',
    description: 'List every #tag and frontmatter tag across the entire vault with counts.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'create_note',
    description: 'Create a new Markdown note or suggest creating one in the user Vault.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Target .md note path' },
        content: { type: 'string', description: 'Full Markdown content' },
        summary: { type: 'string', description: 'Brief explanation of why this note is proposed' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'update_note',
    description: 'Update or append Markdown content to an existing note in the user Vault.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Existing .md note path' },
        content: { type: 'string', description: 'Updated full Markdown content (or text to append when mode="append")' },
        mode: { type: 'string', enum: ['replace', 'append'], description: 'Replace full content or append at end' },
        summary: { type: 'string', description: 'Brief explanation of suggested edits' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'delete_note',
    description: 'Propose or perform deletion of a note in the Vault.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path of note to remove' },
        summary: { type: 'string', description: 'Reason for deletion' }
      },
      required: ['path']
    }
  }
];

export interface McpVaultContext {
  vaultName: string;
  notes: Note[];
  folders: string[];
  mode: McpAccessMode;
  autoApplyChanges: boolean;
  onApplyWrite?: (proposal: McpChangeProposal, appliedImmediately: boolean) => void;
}

export function runMcpToolCall(
  toolName: string,
  args: Record<string, unknown>,
  ctx: McpVaultContext
): {
  isError?: boolean;
  content: Array<{ type: 'text'; text: string }>;
  proposal?: McpChangeProposal;
} {
  const txt = (obj: unknown) => [{ type: 'text' as const, text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }];

  if (toolName === 'list_notes') {
    const folderFilter = typeof args.folder === 'string' ? args.folder.trim().toLowerCase() : '';
    const items = ctx.notes
      .filter(n => !folderFilter || n.path.toLowerCase().startsWith(folderFilter))
      .map(n => ({
        path: n.path,
        starred: n.starred,
        updatedAt: new Date(n.updatedAt).toISOString(),
        chars: n.content.length,
        tags: extractTags({ content: n.content })
      }));
    return { content: txt({ vaultName: ctx.vaultName, folders: ctx.folders, count: items.length, notes: items }) };
  }

  if (toolName === 'read_note') {
    const target = typeof args.path === 'string' ? args.path.trim() : '';
    const note = ctx.notes.find(n => n.path.toLowerCase() === target.toLowerCase());
    if (!note) {
      return { isError: true, content: txt(`Note not found: "${target}"`) };
    }
    return {
      content: txt({
        path: note.path,
        updatedAt: new Date(note.updatedAt).toISOString(),
        content: note.content
      })
    };
  }

  if (toolName === 'search_vault') {
    const query = typeof args.query === 'string' ? args.query : '';
    const limit = typeof args.limit === 'number' ? Math.max(1, Math.min(30, args.limit)) : 10;
    const index = buildSearchIndex(ctx.notes);
    const hits = searchVaultIndex(index, query, { sortBy: 'relevance' }).slice(0, limit);
    return {
      content: txt({
        query,
        totalHits: hits.length,
        results: hits.map(h => ({
          path: h.note.path,
          title: h.title,
          score: h.score,
          matches: h.lineMatches.slice(0, 5).map(m => ({ line: m.lineNumber, text: m.lineText }))
        }))
      })
    };
  }

  if (toolName === 'get_backlinks') {
    const target = typeof args.path === 'string' ? args.path.trim() : '';
    const note = ctx.notes.find(n => n.path.toLowerCase() === target.toLowerCase());
    if (!note) {
      return { isError: true, content: txt(`Note not found: "${target}"`) };
    }
    const bl = getBacklinks(ctx.notes, note);
    const outgoing = extractWikilinks(note.content);
    return {
      content: txt({
        path: note.path,
        linkedBacklinks: bl.linked.map(n => n.path),
        unlinkedMentions: bl.unlinked.map(n => n.path),
        outgoing
      })
    };
  }

  if (toolName === 'list_tags') {
    const counts = new Map<string, number>();
    for (const n of ctx.notes) {
      const seen = new Set<string>(extractTags({ content: n.content }));
      for (const tg of seen) counts.set(tg, (counts.get(tg) || 0) + 1);
    }
    return {
      content: txt(
        Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([tag, count]) => ({ tag, count }))
      )
    };
  }

  // Write operations
  if (ctx.mode !== 'read-write') {
    return {
      isError: true,
      content: txt(`Write tool "${toolName}" rejected: MCP Server is currently in "${ctx.mode}" mode.`)
    };
  }

  if (toolName === 'create_note') {
    const rawPath = typeof args.path === 'string' ? args.path.trim() : '';
    const content = typeof args.content === 'string' ? args.content : '';
    if (!rawPath) return { isError: true, content: txt('Missing note path') };
    const finalPath = rawPath.endsWith('.md') ? rawPath : `${rawPath}.md`;
    const proposal: McpChangeProposal = {
      id: `prop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      action: 'create',
      path: finalPath,
      summary: typeof args.summary === 'string' && args.summary.trim() ? args.summary : `Create note ${finalPath}`,
      newContent: content,
      createdAt: Date.now(),
      status: ctx.autoApplyChanges ? 'approved' : 'pending'
    };
    ctx.onApplyWrite?.(proposal, ctx.autoApplyChanges);
    return {
      content: txt({
        status: ctx.autoApplyChanges ? 'applied' : 'queued_for_user_approval',
        proposalId: proposal.id,
        path: finalPath
      }),
      proposal
    };
  }

  if (toolName === 'update_note') {
    const rawPath = typeof args.path === 'string' ? args.path.trim() : '';
    const content = typeof args.content === 'string' ? args.content : '';
    const mode = args.mode === 'append' ? 'append' : 'replace';
    const existing = ctx.notes.find(n => n.path.toLowerCase() === rawPath.toLowerCase());
    if (!existing) {
      return { isError: true, content: txt(`Note not found: "${rawPath}". Use create_note instead.`) };
    }
    const nextContent =
      mode === 'append' ? `${existing.content.trimEnd()}\n\n${content}\n` : content;
    const proposal: McpChangeProposal = {
      id: `prop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      action: 'update',
      path: existing.path,
      summary:
        typeof args.summary === 'string' && args.summary.trim()
          ? args.summary
          : `${mode === 'append' ? 'Append to' : 'Update'} ${existing.path}`,
      previousContent: existing.content,
      newContent: nextContent,
      createdAt: Date.now(),
      status: ctx.autoApplyChanges ? 'approved' : 'pending'
    };
    ctx.onApplyWrite?.(proposal, ctx.autoApplyChanges);
    return {
      content: txt({
        status: ctx.autoApplyChanges ? 'applied' : 'queued_for_user_approval',
        proposalId: proposal.id,
        path: existing.path
      }),
      proposal
    };
  }

  if (toolName === 'delete_note') {
    const rawPath = typeof args.path === 'string' ? args.path.trim() : '';
    const existing = ctx.notes.find(n => n.path.toLowerCase() === rawPath.toLowerCase());
    if (!existing) return { isError: true, content: txt(`Note not found: "${rawPath}"`) };
    const proposal: McpChangeProposal = {
      id: `prop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      action: 'delete',
      path: existing.path,
      summary:
        typeof args.summary === 'string' && args.summary.trim()
          ? args.summary
          : `Delete ${existing.path}`,
      previousContent: existing.content,
      createdAt: Date.now(),
      status: ctx.autoApplyChanges ? 'approved' : 'pending'
    };
    ctx.onApplyWrite?.(proposal, ctx.autoApplyChanges);
    return {
      content: txt({
        status: ctx.autoApplyChanges ? 'applied' : 'queued_for_user_approval',
        proposalId: proposal.id,
        path: existing.path
      }),
      proposal
    };
  }

  return { isError: true, content: txt(`Unknown MCP tool: ${toolName}`) };
}

export interface McpJsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

export function runMcpJsonRpc(
  reqBody: unknown,
  ctx: McpVaultContext
): {
  response: McpJsonRpcResponse;
  log?: Omit<McpActivityLog, 'id' | 'timestamp'>;
} {
  if (!reqBody || typeof reqBody !== 'object') {
    return {
      response: {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid JSON-RPC 2.0 request payload.' }
      }
    };
  }
  const { id = null, method = '', params = {} } = reqBody as {
    id?: string | number | null;
    method?: string;
    params?: Record<string, unknown>;
  };

  if (ctx.mode === 'off') {
    return {
      response: {
        jsonrpc: '2.0',
        id,
        error: { code: -32001, message: 'NoSidian MCP Server is disabled in Settings → MCP.' }
      },
      log: { method: method || 'unknown', ok: false, detail: 'MCP mode is off' }
    };
  }

  if (method === 'initialize') {
    return {
      response: {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
            prompts: { listChanged: false }
          },
          serverInfo: { name: 'nosidian-vault-mcp', version: '1.1.0' }
        }
      },
      log: { method, ok: true, detail: 'Client initialized MCP session' }
    };
  }

  if (method === 'notifications/initialized' || method === 'ping') {
    return { response: { jsonrpc: '2.0', id, result: {} } };
  }

  if (method === 'tools/list') {
    const visibleTools =
      ctx.mode === 'read-only'
        ? MCP_TOOLS.filter(t => !['create_note', 'update_note', 'delete_note'].includes(t.name))
        : MCP_TOOLS;
    return {
      response: { jsonrpc: '2.0', id, result: { tools: visibleTools } },
      log: { method, ok: true, detail: `Listed ${visibleTools.length} tools` }
    };
  }

  if (method === 'resources/list') {
    const resources = ctx.notes.map(n => ({
      uri: `nosidian://note/${encodeURIComponent(n.path)}`,
      name: n.path,
      mimeType: 'text/markdown'
    }));
    return { response: { jsonrpc: '2.0', id, result: { resources } } };
  }

  if (method === 'resources/read') {
    const uri = String(params?.uri || '');
    const decoded = decodeURIComponent(uri.replace(/^nosidian:\/\/note\//, ''));
    const found = ctx.notes.find(n => n.path.toLowerCase() === decoded.toLowerCase());
    if (!found) {
      return {
        response: {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: `Resource not found: ${uri}` }
        }
      };
    }
    return {
      response: {
        jsonrpc: '2.0',
        id,
        result: {
          contents: [{ uri, mimeType: 'text/markdown', text: found.content }]
        }
      }
    };
  }

  if (method === 'prompts/list') {
    return {
      response: {
        jsonrpc: '2.0',
        id,
        result: {
          prompts: [
            {
              name: 'review_vault_connections',
              description:
                'Analyze notes, find missing [[wikilinks]], and propose structural improvements.'
            },
            {
              name: 'generate_study_cards',
              description:
                'Suggest ?? / +++ multi-line flashcards or {{c1::...}} cloze cards for a note.'
            }
          ]
        }
      }
    };
  }

  if (method === 'tools/call') {
    const toolName = String(params?.name || '');
    const args = (params?.arguments && typeof params.arguments === 'object'
      ? params.arguments
      : {}) as Record<string, unknown>;
    const outcome = runMcpToolCall(toolName, args, ctx);
    return {
      response: {
        jsonrpc: '2.0',
        id,
        result: {
          content: outcome.content,
          isError: Boolean(outcome.isError)
        }
      },
      log: {
        method,
        tool: toolName,
        path: typeof args.path === 'string' ? args.path : undefined,
        ok: !outcome.isError,
        detail: outcome.isError ? 'Rejected' : `Executed ${toolName}`
      }
    };
  }

  return {
    response: {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` }
    }
  };
}

export function buildClaudeDesktopConfigSnippet(endpointUrl: string, token: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        nosidian: {
          command: 'npx',
          args: [
            '-y',
            'mcp-remote',
            endpointUrl,
            '--header',
            `Authorization: Bearer ${token}`
          ]
        }
      }
    },
    null,
    2
  );
}

export function buildDirectHttpMcpSnippet(endpointUrl: string, token: string): string {
  return JSON.stringify(
    {
      type: 'streamable-http',
      url: endpointUrl,
      headers: {
        Authorization: `Bearer ${token}`
      }
    },
    null,
    2
  );
}
