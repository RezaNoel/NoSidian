// Hotkey editor: every command with its shortcut; click a shortcut and press keys to change it.
import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import { RotateCcw } from "lucide-solid";
import { t } from "../../i18n";
import { COMMANDS, comboOf, conflictFor, formatCombo, keyFor, setKey, setRecording, commandById } from "../../state/commands";

// ---------- Hotkeys ----------

export function Hotkeys() {
  const [filter, setFilter] = createSignal("");
  const [recording, setRec] = createSignal<string | null>(null);
  const [problem, setProblem] = createSignal<{ id: string; text: string } | null>(null);
  const rows = createMemo(() => {
    const q = filter().trim().toLocaleLowerCase();
    return COMMANDS.filter((c) => !q || t(c.label).toLocaleLowerCase().includes(q) || formatCombo(keyFor(c.id)).toLocaleLowerCase().includes(q));
  });
  const stop = () => { setRec(null); setRecording(false); };
  onCleanup(() => setRecording(false));
  const onKey = (id: string, ev: KeyboardEvent) => {
    if (recording() !== id) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.key === "Escape") return stop();
    if (ev.key === "Backspace" || ev.key === "Delete") {
      setKey(id, "");
      setProblem(null);
      return stop();
    }
    const combo = comboOf(ev);
    if (!combo) return;
    const other = conflictFor(combo, id);
    if (other) {
      setProblem({ id, text: t("hotkeys-conflict", { name: t(other.label) }) });
      return;
    }
    setKey(id, combo);
    setProblem(null);
    stop();
  };
  return (
    <div class="hotkeys">
      <input class="input" type="search" placeholder={t("hotkeys-filter")} aria-label={t("hotkeys-filter")} value={filter()} onInput={(ev) => setFilter(ev.currentTarget.value)} dir="auto" />
      <p class="hint">{t("hotkeys-record-hint")}</p>
      <ul class="hotkey-list">
        <For each={rows()}>
          {(c) => {
            const isCustom = () => keyFor(c.id) !== (commandById(c.id)?.defaultKey ?? "");
            return (
              <li class="hotkey-row">
                <span class="hotkey-name" id={`hk-${c.id}`}>{t(c.label)}</span>
                <button
                  class="kbd-btn"
                  classList={{ recording: recording() === c.id }}
                  aria-describedby={`hk-${c.id}`}
                  aria-label={`${t(c.label)}: ${recording() === c.id ? t("hotkeys-record") : formatCombo(keyFor(c.id)) || t("hotkey-none")}`}
                  onClick={() => { setRec(c.id); setRecording(true); setProblem(null); }}
                  onKeyDown={(ev) => onKey(c.id, ev)}
                  onBlur={() => recording() === c.id && stop()}
                >
                  {recording() === c.id ? t("hotkeys-record") : formatCombo(keyFor(c.id)) || t("hotkey-none")}
                </button>
                <button class="icon-btn" disabled={!isCustom()} title={t("hotkeys-reset")} aria-label={`${t("hotkeys-reset")}: ${t(c.label)}`} onClick={() => setKey(c.id, commandById(c.id)?.defaultKey ?? "")}>
                  <RotateCcw />
                </button>
                <Show when={problem()?.id === c.id}><p class="field-error" role="alert">{problem()!.text}</p></Show>
              </li>
            );
          }}
        </For>
      </ul>
    </div>
  );
}

