// Terminal drawer. "Vault" mode runs safe built-in commands on the notes
// (ls, cd, cat, grep, touch, mkdir, open…); "System" mode runs real shell
// commands in the vault folder and is only available when enabled in
// Settings > Developer.
import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { Eraser, X } from "lucide-solid";
import { t } from "../../i18n";
import { backend } from "../../backend";
import { formatTerminalPrompt, runVirtualVaultCommand } from "../../core/terminalEngine";
import type { TerminalShellType } from "../../core/types";
import { corpus, loadAllNotes } from "../../state/corpus";
import { createFolder, createNote, openNote, tree } from "../../state/vault";
import { pref, setPref } from "../../state/prefs";
import { inTauri } from "../../state/backend";

interface Line { kind: "cmd" | "out" | "err"; text: string }
const [open, setOpen] = createSignal(false);
export const terminalOpen = open;
if (typeof window !== "undefined") window.addEventListener("nosidian:terminal", () => setOpen((v) => !v));

export function TerminalDrawer() {
  const [mode, setMode] = createSignal<"vault" | "system">("vault");
  const [cwd, setCwd] = createSignal("");
  const [lines, setLines] = createSignal<Line[]>([{ kind: "out", text: t("term-welcome") }]);
  const [input, setInput] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const hist: string[] = [];
  let hi = -1;
  let box!: HTMLDivElement, field!: HTMLInputElement;
  const shell = () => pref("terminalShell") as TerminalShellType;
  const push = (...l: Line[]) => { setLines((x) => [...x, ...l].slice(-800)); queueMicrotask(() => { box.scrollTop = box.scrollHeight; }); };

  const run = async (cmd: string) => {
    push({ kind: "cmd", text: `${formatTerminalPrompt(shell(), cwd() || "/", mode())} ${cmd}` });
    if (!cmd.trim()) return;
    hist.unshift(cmd); hi = -1;
    if (mode() === "vault") {
      await loadAllNotes();
      const r = runVirtualVaultCommand(cmd, cwd(), corpus().map((n) => ({ ...n })), [...tree.folders], {
        createNote: (path, content) => { const clean = path.replace(/\.md$/i, ""); void createNote(clean.split("/").pop()!, clean.includes("/") ? clean.slice(0, clean.lastIndexOf("/")) : undefined, content, false); },
        createFolder: (p) => { const parts = p.split("/"); void createFolder(parts.pop()!, parts.join("/") || undefined); },
        openNote: (p) => openNote(p),
      });
      if (r.clear) setLines([]);
      if (r.stdout) push({ kind: "out", text: r.stdout });
      if (r.stderr) push({ kind: "err", text: r.stderr });
      setCwd(r.nextCwd);
      return;
    }
    setBusy(true);
    try {
      const r = await backend.terminalExec(cmd, shell(), cwd());
      if (r.stdout) push({ kind: "out", text: r.stdout.trimEnd() });
      if (r.stderr) push({ kind: "err", text: r.stderr.trimEnd() });
      if (r.code !== 0) push({ kind: "err", text: t("term-exit", { code: r.code }) });
    } catch (e) {
      push({ kind: "err", text: String((e as { detail?: string })?.detail ?? e) });
    } finally { setBusy(false); field?.focus(); }
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !busy()) { e.preventDefault(); const v = input(); setInput(""); void run(v); }
    else if (e.key === "ArrowUp" && hist.length) { e.preventDefault(); hi = Math.min(hist.length - 1, hi + 1); setInput(hist[hi]); }
    else if (e.key === "ArrowDown") { e.preventDefault(); hi = Math.max(-1, hi - 1); setInput(hi < 0 ? "" : hist[hi]); }
    else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); setLines([]); }
    else if (e.key === "Escape") setOpen(false);
  };
  onMount(() => field?.focus());
  onCleanup(() => undefined);
  return (
    <Show when={open()}>
      <section class="terminal glass-modal" aria-label={t("ribbon-terminal")}>
        <header class="term-bar">
          <div class="segmented compact" role="radiogroup" aria-label={t("term-mode")}>
            <button role="radio" aria-checked={mode() === "vault"} onClick={() => setMode("vault")}>{t("term-vault")}</button>
            <button role="radio" aria-checked={mode() === "system"} disabled={!pref("systemShell") || !inTauri()} title={pref("systemShell") ? "" : t("term-system-off")} onClick={() => setMode("system")}>{t("term-system")}</button>
          </div>
          <Show when={mode() === "system"}>
            <select class="select sm" aria-label={t("term-shell")} value={shell()} onChange={(e) => setPref("terminalShell", e.currentTarget.value)}>
              <option value="powershell">PowerShell</option><option value="cmd">CMD</option><option value="bash">Bash</option><option value="sh">sh</option>
            </select>
          </Show>
          <span class="muted sm">{cwd() || "/"}</span>
          <span class="tb-fill" />
          <button class="icon-btn sm" aria-label={t("term-clear")} title={t("term-clear")} onClick={() => setLines([])}><Eraser /></button>
          <button class="icon-btn sm" aria-label={t("action-close")} onClick={() => setOpen(false)}><X /></button>
        </header>
        <div ref={box} class="term-out" role="log" aria-live="polite" onClick={() => field.focus()}>
          <For each={lines()}>{(l) => <pre class={`term-${l.kind}`} dir="ltr">{l.text}</pre>}</For>
        </div>
        <div class="term-in" dir="ltr">
          <span class="term-prompt">{formatTerminalPrompt(shell(), cwd() || "/", mode())}</span>
          <input ref={field} class="term-field" aria-label={t("term-input")} spellcheck={false} autocomplete="off" value={input()} disabled={busy()} onInput={(e) => setInput(e.currentTarget.value)} onKeyDown={key} />
        </div>
      </section>
    </Show>
  );
}
