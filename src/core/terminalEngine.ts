import { collectAllFolderPaths } from './explorerPrefs';
import type { Note, TerminalShellType } from './types';

export interface TerminalShellProfile {
  id: TerminalShellType;
  label: string;
  promptSuffix: string;
  osHint: string;
}

export const TERMINAL_SHELL_PROFILES: TerminalShellProfile[] = [
  { id: 'bash', label: 'Bash', promptSuffix: '$', osHint: 'GNU/Linux & macOS' },
  { id: 'sh', label: 'POSIX sh', promptSuffix: '$', osHint: 'Minimal POSIX' },
  { id: 'zsh', label: 'Zsh', promptSuffix: '%', osHint: 'macOS / Oh-My-Zsh' },
  { id: 'powershell', label: 'PowerShell', promptSuffix: 'PS>', osHint: 'Cross-Platform / Win' },
  { id: 'cmd', label: 'Command Prompt', promptSuffix: '>', osHint: 'Windows CMD Profile' }
];

export function formatTerminalPrompt(
  shell: TerminalShellType,
  cwdLabel: string,
  mode: 'system' | 'vault'
): string {
  const cleanCwd = cwdLabel || (mode === 'vault' ? '/' : '~');
  if (shell === 'powershell') return `PS ${cleanCwd}>`;
  if (shell === 'cmd') return `${cleanCwd}>`;
  if (shell === 'zsh') return `${cleanCwd} %`;
  return `${cleanCwd} $`;
}

export interface VirtualVaultShellCallbacks {
  createNote?: (path: string, content?: string) => void;
  createFolder?: (folderPath: string) => void;
  openNote?: (path: string) => void;
}

export interface VirtualShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  nextCwd: string;
  clear?: boolean;
}

function normalizeVirtualPath(cwd: string, target: string): string {
  const raw = target.trim().replace(/\\/g, '/');
  const baseParts = raw.startsWith('/') ? [] : cwd.split('/').filter(Boolean);
  for (const seg of raw.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      baseParts.pop();
    } else {
      baseParts.push(seg);
    }
  }
  return baseParts.join('/');
}

export function runVirtualVaultCommand(
  rawCommand: string,
  currentCwd: string,
  notes: Note[],
  folders: string[],
  callbacks?: VirtualVaultShellCallbacks
): VirtualShellResult {
  const trimmed = rawCommand.trim();
  const cleanCwd = currentCwd.replace(/^\/+|\/+$/g, '');
  if (!trimmed) {
    return { stdout: '', stderr: '', exitCode: 0, nextCwd: cleanCwd };
  }

  // Support basic quoting
  const tokens: string[] = [];
  const rx = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(trimmed)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3]);
  }
  const cmd = (tokens[0] || '').toLowerCase();
  const args = tokens.slice(1);
  const allFolders = collectAllFolderPaths(folders, notes);

  if (cmd === 'clear' || cmd === 'cls') {
    return { stdout: '', stderr: '', exitCode: 0, nextCwd: cleanCwd, clear: true };
  }

  if (cmd === 'help') {
    return {
      stdout: [
        'NoSidian Vault Shell commands:',
        '  pwd                 Print active vault folder',
        '  ls | dir [folder]   List folders and Markdown notes',
        '  tree                Show full vault folder/note hierarchy',
        '  cd <folder|..|/>    Change active vault folder',
        '  cat | type <note>   Print contents of a note',
        '  grep <query>        Search across all notes in active folder/vault',
        '  wc <note>           Count lines and words in a note',
        '  touch <path.md>     Create a new note in the vault',
        '  mkdir <folder>      Create a folder in the vault',
        '  open <note>         Open a note in the main editor',
        '  clear | cls         Clear terminal output'
      ].join('\n'),
      stderr: '',
      exitCode: 0,
      nextCwd: cleanCwd
    };
  }

  if (cmd === 'pwd') {
    return {
      stdout: cleanCwd ? `/${cleanCwd}` : '/',
      stderr: '',
      exitCode: 0,
      nextCwd: cleanCwd
    };
  }

  if (cmd === 'cd') {
    const destArg = args[0] || '/';
    const resolved = destArg === '/' || destArg === '~' ? '' : normalizeVirtualPath(cleanCwd, destArg);
    if (!resolved) {
      return { stdout: '', stderr: '', exitCode: 0, nextCwd: '' };
    }
    const exists = allFolders.some(f => f.toLowerCase() === resolved.toLowerCase());
    if (!exists) {
      return {
        stdout: '',
        stderr: `cd: ${destArg}: No such vault folder`,
        exitCode: 1,
        nextCwd: cleanCwd
      };
    }
    const canonical = allFolders.find(f => f.toLowerCase() === resolved.toLowerCase()) || resolved;
    return { stdout: '', stderr: '', exitCode: 0, nextCwd: canonical };
  }

  if (cmd === 'ls' || cmd === 'dir') {
    const targetFolder = args[0] ? normalizeVirtualPath(cleanCwd, args[0]) : cleanCwd;
    const prefix = targetFolder ? `${targetFolder}/` : '';
    const childFolders = allFolders
      .filter(f => {
        if (!f.startsWith(prefix)) return false;
        const rest = f.slice(prefix.length);
        return rest.length > 0 && !rest.includes('/');
      })
      .map(f => `${f.slice(prefix.length)}/`);

    const childFiles = notes
      .filter(n => {
        if (!n.path.startsWith(prefix)) return false;
        const rest = n.path.slice(prefix.length);
        return rest.length > 0 && !rest.includes('/');
      })
      .map(n => n.path.slice(prefix.length))
      .sort((a, b) => a.localeCompare(b));

    const lines = [...childFolders, ...childFiles];
    return {
      stdout: lines.length > 0 ? lines.join('\n') : '(empty folder)',
      stderr: '',
      exitCode: 0,
      nextCwd: cleanCwd
    };
  }

  if (cmd === 'tree') {
    const prefix = cleanCwd ? `${cleanCwd}/` : '';
    const scoped = notes
      .filter(n => !prefix || n.path.startsWith(prefix))
      .map(n => (prefix ? n.path.slice(prefix.length) : n.path))
      .sort((a, b) => a.localeCompare(b));
    return {
      stdout: scoped.length ? scoped.map(p => `├── ${p}`).join('\n') : '(empty)',
      stderr: '',
      exitCode: 0,
      nextCwd: cleanCwd
    };
  }

  if (cmd === 'cat' || cmd === 'type' || cmd === 'head' || cmd === 'wc' || cmd === 'open') {
    const targetArg = args.join(' ').trim();
    if (!targetArg) {
      return { stdout: '', stderr: `${cmd}: missing note path`, exitCode: 1, nextCwd: cleanCwd };
    }
    const resolved = normalizeVirtualPath(cleanCwd, targetArg);
    const note =
      notes.find(n => n.path.toLowerCase() === resolved.toLowerCase()) ||
      notes.find(n => n.path.toLowerCase() === `${resolved.toLowerCase()}.md`) ||
      notes.find(n => n.path.toLowerCase().endsWith(`/${resolved.toLowerCase()}`)) ||
      notes.find(n => n.path.toLowerCase().endsWith(`/${resolved.toLowerCase()}.md`));
    if (!note) {
      return {
        stdout: '',
        stderr: `${cmd}: ${targetArg}: Note not found in vault`,
        exitCode: 1,
        nextCwd: cleanCwd
      };
    }
    if (cmd === 'open') {
      callbacks?.openNote?.(note.path);
      return { stdout: `Opened ${note.path}`, stderr: '', exitCode: 0, nextCwd: cleanCwd };
    }
    if (cmd === 'wc') {
      const lines = note.content.split(/\r?\n/).length;
      const words = note.content.split(/\s+/).filter(Boolean).length;
      return {
        stdout: `${lines} lines  ${words} words  ${note.content.length} chars  ${note.path}`,
        stderr: '',
        exitCode: 0,
        nextCwd: cleanCwd
      };
    }
    if (cmd === 'head') {
      const top = note.content.split(/\r?\n/).slice(0, 10).join('\n');
      return { stdout: top, stderr: '', exitCode: 0, nextCwd: cleanCwd };
    }
    return { stdout: note.content, stderr: '', exitCode: 0, nextCwd: cleanCwd };
  }

  if (cmd === 'grep') {
    const query = args.join(' ').trim().toLowerCase();
    if (!query) {
      return { stdout: '', stderr: 'grep: search pattern required', exitCode: 1, nextCwd: cleanCwd };
    }
    const prefix = cleanCwd ? `${cleanCwd}/` : '';
    const hits: string[] = [];
    for (const n of notes) {
      if (prefix && !n.path.startsWith(prefix)) continue;
      n.content.split(/\r?\n/).forEach((line, idx) => {
        if (line.toLowerCase().includes(query)) {
          hits.push(`${n.path}:${idx + 1}: ${line.trim()}`);
        }
      });
    }
    return {
      stdout: hits.length > 0 ? hits.slice(0, 40).join('\n') : '(no matches)',
      stderr: '',
      exitCode: hits.length > 0 ? 0 : 1,
      nextCwd: cleanCwd
    };
  }

  if (cmd === 'touch') {
    const rawTarget = args.join(' ').trim();
    if (!rawTarget) {
      return { stdout: '', stderr: 'touch: file path required', exitCode: 1, nextCwd: cleanCwd };
    }
    let resolved = normalizeVirtualPath(cleanCwd, rawTarget);
    if (!/\.md$/i.test(resolved)) resolved = `${resolved}.md`;
    callbacks?.createNote?.(resolved);
    return {
      stdout: `Created note: ${resolved}`,
      stderr: '',
      exitCode: 0,
      nextCwd: cleanCwd
    };
  }

  if (cmd === 'mkdir') {
    const rawTarget = args.join(' ').trim();
    if (!rawTarget) {
      return { stdout: '', stderr: 'mkdir: folder name required', exitCode: 1, nextCwd: cleanCwd };
    }
    const resolved = normalizeVirtualPath(cleanCwd, rawTarget);
    callbacks?.createFolder?.(resolved);
    return {
      stdout: `Created folder: ${resolved}`,
      stderr: '',
      exitCode: 0,
      nextCwd: cleanCwd
    };
  }

  if (cmd === 'echo') {
    return { stdout: args.join(' '), stderr: '', exitCode: 0, nextCwd: cleanCwd };
  }

  return {
    stdout: '',
    stderr: `${cmd}: command not found in Vault Shell (type "help", or switch to System Shell for OS commands)`,
    exitCode: 127,
    nextCwd: cleanCwd
  };
}
