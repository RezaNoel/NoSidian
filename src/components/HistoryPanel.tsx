// Note history: automatic and manual snapshots, a side-by-side diff against
// the current text, and restore.
import { For, Show, createResource, createSignal } from "solid-js";
import { Camera, RotateCcw } from "lucide-solid";
import { t } from "../i18n";
import { backend, type Snapshot } from "../backend";
import { diffLines } from "../lib/diff";
import { contents, setContent } from "../state/vault";
import { askConfirm, toast } from "../state/ui";
import { Modal } from "./Modal";

const fmt = (ts: number) => new Date(ts).toLocaleString(document.documentElement.lang || undefined, { dateStyle: "medium", timeStyle: "short" });
const [historyRev, setHistoryRev] = createSignal(0);

export async function snapshotNow(path: string, manual = true): Promise<void> {
  const snap = await backend.historySnapshot(path, contents[path] ?? "").catch(() => null);
  setHistoryRev((n) => n + 1);
  if (manual) toast(snap ? t("history-saved") : t("history-unchanged"));
}

function DiffModal(props: { path: string; snap: Snapshot; onClose: () => void }) {
  const [old] = createResource(() => backend.historyRead(props.path, props.snap.ts));
  const restore = async () => {
    if (!(await askConfirm(t("history-restore"), t("history-restore-confirm", { date: fmt(props.snap.ts) }), t("history-restore"), false))) return;
    await snapshotNow(props.path, false);
    setContent(props.path, old() ?? "");
    toast(t("history-restored"));
    props.onClose();
  };
  return (
    <Modal title={t("history-compare", { date: fmt(props.snap.ts) })} onClose={props.onClose} class="modal-xl">
      <Show when={old() !== undefined} fallback={<p class="empty">{t("pdf-loading")}</p>}>
        <div class="diff" role="table" aria-label={t("history-compare", { date: fmt(props.snap.ts) })}>
          <div class="diff-row diff-head" role="row"><span role="columnheader">{fmt(props.snap.ts)}</span><span role="columnheader">{t("history-current")}</span></div>
          <For each={diffLines(old() ?? "", contents[props.path] ?? "")}>
            {(r) => (
              <div class={`diff-row ${r.kind}`} role="row">
                <span role="cell" class="diff-cell left" dir="auto"><i aria-hidden="true">{r.ln ?? ""}</i>{r.left ?? ""}</span>
                <span role="cell" class="diff-cell right" dir="auto"><i aria-hidden="true">{r.rn ?? ""}</i>{r.right ?? ""}</span>
              </div>
            )}
          </For>
        </div>
        <div class="modal-actions">
          <button class="btn" onClick={props.onClose}>{t("action-close")}</button>
          <button class="btn primary" onClick={() => void restore()}><RotateCcw />{t("history-restore")}</button>
        </div>
      </Show>
    </Modal>
  );
}

export function HistoryPanel(props: { path: string }) {
  const [list] = createResource(() => ({ p: props.path, r: historyRev() }), ({ p }) => backend.historyList(p).catch(() => [] as Snapshot[]), { initialValue: [] });
  const [open, setOpen] = createSignal<Snapshot | null>(null);
  return (
    <>
      <button class="btn sm block" onClick={() => void snapshotNow(props.path)}><Camera />{t("history-snapshot")}</button>
      <Show when={list().length} fallback={<p class="empty sm">{t("history-empty")}</p>}>
        <ul class="list">
          <For each={[...list()].reverse()}>
            {(s) => (
              <li><button class="list-row" onClick={() => setOpen(s)}>
                <span class="list-title">{fmt(s.ts)}</span>
                <span class="list-snippet">{t("history-size", { size: Math.max(1, Math.round(s.size / 1024)) })}</span>
              </button></li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={open()} keyed>{(s) => <DiffModal path={props.path} snap={s} onClose={() => setOpen(null)} />}</Show>
    </>
  );
}
