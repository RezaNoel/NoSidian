// Dashboard: switchable hubs of widgets (notes, tasks, study, focus, media,
// pet). Edit mode adds, removes, resizes and reorders widgets.
import { For, Match, Show, Switch, createMemo, createResource, createSignal, onMount, type Component } from "solid-js";
import {
  ArrowLeft, ArrowRight, BarChart3, BookOpen, Brain, CalendarCheck, CalendarDays, CalendarHeart, Check, Clapperboard, Code2, Download, FilePlus2, FileText, FolderOpen,
  GraduationCap, Hash, History, Hourglass, Image, Inbox, KanbanSquare, Layers, LayoutGrid, ListChecks, Network, PawPrint, PenLine, Pencil, Plus, SquareTerminal,
  Star, StickyNote, Tags, Timer, Trash2, Upload, X, Zap,
} from "lucide-solid";
import { locale, t } from "../../i18n";
import { backend } from "../../backend";
import { DASHBOARD_TEMPLATES, DASHBOARD_WIDGET_CATALOG, createCustomHub, exportDashboardJson, parseImportedDashboardJson, stepWidgetSpan } from "../../core/dashboardPresets";
import { computeDeadlineCountdown } from "../../core/projects";
import { computeNoteStats } from "../../core/markdown";
import type { DashboardConfig, DashboardShortcutItem, DashboardWidget, DashboardWidgetType } from "../../core/types";
import { COVERS, activeHub, addWidget, dashboards, updateHub, updateWidget } from "../../state/dashboard";
import { corpus, loadAllNotes } from "../../state/corpus";
import { appendToNote, indexRev, openNote, tree } from "../../state/vault";
import { profile } from "../../state/workspace";
import { openDailyNote } from "../../state/daily";
import { openView } from "../../state/views";
import { countDeck } from "../../state/srs";
import { allTasks, primaryProject, toggleTask } from "../../state/projects";
import { media } from "../../state/media";
import { askConfirm, askText, isMobile, toast } from "../../state/ui";
import { noteTitle } from "../../lib/markdown";
import { PRESET_SRC } from "../Banner";
import { CalendarPanel } from "../Calendar";
import { CountdownWidget } from "./Countdown";
import { promptNewNote } from "../FileTree";
import { MiniTimer } from "../focus/MiniTimer";
import { PetCard } from "../pet/PetCard";
import { Modal } from "../Modal";
import { openMenu, type MenuItem } from "../ContextMenu";


type IconC = Component<{ class?: string; "aria-hidden"?: boolean | "true" }>;
const WIDGET_ICON: Record<DashboardWidgetType, IconC> = {
  cover: Image, "deadline-hero": Hourglass, stats: BarChart3, "recent-notes": History, todos: ListChecks, calendar: CalendarDays, shortcuts: Zap,
  scratchpad: StickyNote, "project-spotlight": KanbanSquare, "pet-home": PawPrint, "flashcard-queue": Layers, "pomodoro-timer": Timer, "starred-notes": Star,
  "tag-explorer": Hash, "reading-shelf": BookOpen, watchlist: Clapperboard, "writing-goal": PenLine, "quick-capture": Inbox, countdown: CalendarHeart,
};
const SHORTCUT_ICON: Record<DashboardShortcutItem["actionType"], IconC> = {
  note: FileText, folder: FolderOpen, daily: CalendarCheck, flashcards: Brain, graph: Network, "new-note": FilePlus2, projects: KanbanSquare, media: Clapperboard, terminal: SquareTerminal,
};
const HUB_ICON: Record<string, IconC> = { study: GraduationCap, writer: PenLine, developer: Code2 };

const hubName = (h: DashboardConfig) => h.name || t(`hub-${h.templateId === "writer" || h.templateId === "developer" ? h.templateId : "study"}`);
const widgetTitle = (w: DashboardWidget) => w.title || t(`widget-${w.type}`);

function coverSrc(img?: string) {
  if (!img) return PRESET_SRC.carbon;
  if (img.startsWith("preset:")) return PRESET_SRC[img.slice(7) as keyof typeof PRESET_SRC] ?? PRESET_SRC.carbon;
  return img;
}

function runShortcut(s: DashboardShortcutItem) {
  switch (s.actionType) {
    case "note": if (s.target) openNote(s.target); break;
    case "daily": void openDailyNote(new Date()); break;
    case "new-note": void promptNewNote(); break;
    case "flashcards": void openView("flashcards"); break;
    case "graph": void openView("graph"); break;
    case "projects": void openView("projects"); break;
    case "media": void openView("media"); break;
    case "terminal": window.dispatchEvent(new CustomEvent("nosidian:terminal")); break;
    case "folder": window.dispatchEvent(new CustomEvent("nosidian:reveal", { detail: s.target })); break;
  }
}
const SHORTCUT_TYPES: DashboardShortcutItem["actionType"][] = ["new-note", "daily", "flashcards", "graph", "projects", "media", "terminal", "note"];

/** Words written today: total words now minus the total at the first look today. */
const wordsToday = createMemo(() => {
  const total = corpus().reduce((n, x) => n + computeNoteStats(x.content).words, 0);
  const day = new Date().toISOString().slice(0, 10);
  const base = dashboards.state.wordBase;
  if (dashboards.ready() && (!base || base.day !== day) && total > 0) queueMicrotask(() => dashboards.update((d) => { d.wordBase = { day, words: total }; }));
  return Math.max(0, total - (base?.day === day ? base.words : total));
});

const num = (n: number) => n.toLocaleString(locale());

function WidgetBody(props: { w: DashboardWidget; edit: boolean }) {
  const w = () => props.w;
  const [tags] = createResource(() => indexRev() + 1, () => backend.tags().catch(() => []), { initialValue: [] });
  const [todo, setTodo] = createSignal("");
  const [capture, setCapture] = createSignal("");
  return (
    <Switch fallback={<p class="empty sm">{t("panel-coming-soon")}</p>}>
      <Match when={w().type === "cover"}>
        <div class="w-cover" style={{ "background-image": `url(${coverSrc(w().coverImage)})` }}>
          <div class="w-cover-text">
            <h2 dir="auto">{activeHub() ? hubName(activeHub()!) : ""}</h2>
            <Show when={props.edit} fallback={<p dir="auto">{w().subtitle || new Date().toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" })}</p>}>
              <input class="input sm" dir="auto" value={w().subtitle ?? ""} placeholder={t("dash-subtitle")} aria-label={t("dash-subtitle")} onChange={(e) => { const v = e.currentTarget.value; updateWidget(w().id, (x) => { x.subtitle = v; }); }} />
              <select class="select sm" aria-label={t("dash-cover-image")} value={w().coverImage ?? ""} onChange={(e) => { const v = e.currentTarget.value; updateWidget(w().id, (x) => { x.coverImage = v; }); }}>
                <For each={Object.values(COVERS)}>{(c) => <option value={c}>{t(`banner-preset-${c.slice(7)}` as "banner-preset-carbon")}</option>}</For>
              </select>
            </Show>
          </div>
        </div>
      </Match>
      <Match when={w().type === "stats"}>
        <dl class="w-stats">
          <div><dt><FileText aria-hidden="true" />{t("dash-stat-notes")}</dt><dd>{num(tree.notes.filter((n) => n.kind === "markdown").length)}</dd></div>
          <div><dt><PenLine aria-hidden="true" />{t("dash-stat-words")}</dt><dd>{num(corpus().reduce((n, x) => n + computeNoteStats(x.content).words, 0))}</dd></div>
          <div><dt><Tags aria-hidden="true" />{t("dash-stat-tags")}</dt><dd>{num(tags().length)}</dd></div>
          <div><dt><Brain aria-hidden="true" />{t("dash-stat-due")}</dt><dd>{num(countDeck(null).due)}</dd></div>
        </dl>
      </Match>
      <Match when={w().type === "recent-notes"}>
        <NoteList paths={profile.recent.map((r) => r.path).filter((p) => tree.notes.some((n) => n.path === p)).slice(0, 7)} />
      </Match>
      <Match when={w().type === "starred-notes"}>
        <NoteList paths={profile.starred.slice(0, 7)} />
      </Match>
      <Match when={w().type === "todos"}>
        <ul class="w-todos">
          <For each={w().todos ?? []}>
            {(item, i) => (
              <li classList={{ done: item.done }}>
                <label><input type="checkbox" checked={item.done} onChange={(e) => { const v = e.currentTarget.checked; updateWidget(w().id, (x) => { x.todos![i()].done = v; }); }} /><span dir="auto">{item.text}</span></label>
                <button class="icon-btn sm ghost" aria-label={t("action-delete")} onClick={() => updateWidget(w().id, (x) => { x.todos!.splice(i(), 1); })}><X /></button>
              </li>
            )}
          </For>
        </ul>
        <form onSubmit={(e) => { e.preventDefault(); const v = todo().trim(); if (!v) return; updateWidget(w().id, (x) => { (x.todos ??= []).push({ id: `td-${Date.now()}`, text: v, done: false }); }); setTodo(""); }}>
          <input class="input sm" dir="auto" placeholder={t("dash-todo-add")} aria-label={t("dash-todo-add")} value={todo()} onInput={(e) => setTodo(e.currentTarget.value)} />
        </form>
      </Match>
      <Match when={w().type === "calendar"}><CalendarPanel /></Match>
      <Match when={w().type === "countdown"}><CountdownWidget /></Match>
      <Match when={w().type === "shortcuts"}>
        <div class="w-shortcuts">
          <For each={(w().shortcuts ?? []).filter((s) => !(isMobile() && s.actionType === "terminal"))}>
            {(s, i) => (
              <div class="w-shortcut">
                <button class="sc-tile" style={{ "--chip": s.color ?? "var(--accent)" }} title={s.target ?? ""} onClick={() => runShortcut(s)}>
                  {(() => { const I = SHORTCUT_ICON[s.actionType] ?? Zap; return <I aria-hidden="true" />; })()}
                  <span dir="auto">{s.label || t(`dash-sc-${s.actionType}`)}</span>
                </button>
                <Show when={props.edit}><button class="icon-btn sm ghost" aria-label={t("action-delete")} onClick={() => updateWidget(w().id, (x) => { x.shortcuts!.splice(i(), 1); })}><X /></button></Show>
              </div>
            )}
          </For>
          <Show when={props.edit}>
            <select class="select sm" aria-label={t("dash-sc-add")} value="" onChange={async (e) => {
              const type = e.currentTarget.value as DashboardShortcutItem["actionType"];
              e.currentTarget.value = "";
              let target: string | undefined;
              if (type === "note") { target = (await askText(t("dash-sc-note-path"), profile.activeTab ?? "", t("action-add"))) ?? undefined; if (!target) return; }
              updateWidget(w().id, (x) => { (x.shortcuts ??= []).push({ id: `sc-${Date.now()}`, label: type === "note" && target ? noteTitle(target) : "", icon: "file", actionType: type, target }); });
            }}>
              <option value="" disabled>{t("dash-sc-add")}</option>
              <For each={SHORTCUT_TYPES.filter((ty) => !(isMobile() && ty === "terminal"))}>{(ty) => <option value={ty}>{t(`dash-sc-${ty}`)}</option>}</For>
            </select>
          </Show>
        </div>
      </Match>
      <Match when={w().type === "scratchpad"}>
        <textarea class="w-scratch" dir="auto" aria-label={widgetTitle(w())} placeholder={t("dash-scratch-placeholder")} value={w().scratchpadText ?? ""} onInput={(e) => { const v = e.currentTarget.value; updateWidget(w().id, (x) => { x.scratchpadText = v; }); }} />
      </Match>
      <Match when={w().type === "quick-capture"}>
        <form class="w-capture" onSubmit={async (e) => {
          e.preventDefault();
          const v = capture().trim();
          if (!v) return;
          await appendToNote(dashboards.state.captureNote || "Inbox.md", `- [ ] ${v}`);
          setCapture("");
          toast(t("dash-captured", { name: noteTitle(dashboards.state.captureNote || "Inbox.md") }));
        }}>
          <textarea class="w-scratch sm" dir="auto" placeholder={t("dash-capture-placeholder")} aria-label={widgetTitle(w())} value={capture()} onInput={(e) => setCapture(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
          <button class="btn sm primary">{t("dash-capture-save")}</button>
        </form>
      </Match>
      <Match when={w().type === "tag-explorer"}>
        <div class="w-tags">
          <For each={tags().slice(0, 30)}>{(tg) => <button class="tag-chip" onClick={() => window.dispatchEvent(new CustomEvent("nosidian:search", { detail: `#${tg.tag}` }))}>#{tg.tag} <span class="count">{tg.count}</span></button>}</For>
          <Show when={!tags().length}><p class="empty sm">{t("tags-empty")}</p></Show>
        </div>
      </Match>
      <Match when={w().type === "flashcard-queue"}>
        {(() => { const c = createMemo(() => countDeck(null)); return (
          <div class="w-queue">
            <div class="w-big">{num(c().due + Math.min(c().fresh, 20))}</div>
            <p class="w-queue-label">{t("dash-queue-today")}<span class="muted">{t("dash-queue-detail", { due: c().due, fresh: c().fresh })}</span></p>
            <button class="btn primary sm" onClick={() => void openView("flashcards")}>{t("srs-study")}</button>
          </div>
        ); })()}
      </Match>
      <Match when={w().type === "pomodoro-timer"}><MiniTimer /></Match>
      <Match when={w().type === "deadline-hero"}>
        {(() => { const p = primaryProject(); const c = p ? computeDeadlineCountdown(p.deadline) : null; return (
          <Show when={p && c} fallback={<p class="empty sm">{t("dash-no-project")}</p>}>
            <div class={`w-deadline ${c!.urgency}`}>
              <span class="w-deadline-name" dir="auto">{p!.name}</span>
              <span class="w-big">{c!.expired ? t("dash-overdue", { days: c!.days }) : t("dash-countdown", { days: c!.days, hours: c!.hours })}</span>
              <span class="muted">{p!.deadline}</span>
            </div>
          </Show>
        ); })()}
      </Match>
      <Match when={w().type === "project-spotlight"}>
        {(() => { const p = () => primaryProject(); const tasks = () => allTasks().filter((x) => x.projectId === p()?.id && !x.done).slice(0, 8); return (
          <Show when={p()} fallback={<p class="empty sm">{t("dash-no-project")}</p>}>
            <p class="muted" dir="auto">{p()!.name}</p>
            <ul class="w-todos">
              <For each={tasks()}>{(x) => <li><label><input type="checkbox" checked={x.done} onChange={() => void toggleTask(x)} /><span dir="auto">{x.title}</span></label></li>}</For>
            </ul>
            <button class="btn sm" onClick={() => void openView("projects")}>{t("view-projects")}</button>
          </Show>
        ); })()}
      </Match>
      <Match when={w().type === "writing-goal"}>
        {(() => { const goal = () => w().dailyWordTarget ?? 750; const pct = () => Math.min(100, Math.round((wordsToday() / goal()) * 100)); return (
          <div class="w-goal">
            <div class="w-big">{num(wordsToday())}<span class="muted"> / {num(goal())}</span></div>
            <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct()} aria-label={t("widget-writing-goal")}><span style={{ width: `${pct()}%` }} /></div>
            <Show when={props.edit}>
              <input class="input sm" type="number" min="50" step="50" value={goal()} aria-label={t("dash-goal-target")} onChange={(e) => { const v = Number(e.currentTarget.value) || 750; updateWidget(w().id, (x) => { x.dailyWordTarget = v; }); }} />
            </Show>
          </div>
        ); })()}
      </Match>
      <Match when={w().type === "reading-shelf"}>
        <ul class="w-media">
          <For each={media.state.books.filter((b) => b.status === "reading").slice(0, 5)} fallback={<li class="empty sm">{t("media-none-reading")}</li>}>
            {(b) => <li><span dir="auto">{b.title}</span><div class="meter sm"><span style={{ width: `${b.totalPages ? Math.round((b.currentPage / b.totalPages) * 100) : 0}%` }} /></div></li>}
          </For>
        </ul>
      </Match>
      <Match when={w().type === "watchlist"}>
        <ul class="w-media">
          <For each={media.state.movies.filter((m) => m.status !== "watched").slice(0, 6)} fallback={<li class="empty sm">{t("media-none-watchlist")}</li>}>
            {(m) => <li><span dir="auto">{m.title}</span><span class="muted">{t(`media-status-${m.status}`)}</span></li>}
          </For>
        </ul>
      </Match>
      <Match when={w().type === "pet-home"}><PetCard compact /></Match>
    </Switch>
  );
}

function NoteList(props: { paths: string[] }) {
  return (
    <ul class="list">
      <For each={props.paths} fallback={<li class="empty sm">{t("dash-nothing")}</li>}>
        {(p) => <li><button class="list-row" onClick={() => openNote(p)}><span class="list-title" dir="auto">{noteTitle(p)}</span></button></li>}
      </For>
    </ul>
  );
}

function NewHub(props: { onClose: () => void }) {
  const [name, setName] = createSignal("");
  const [tpl, setTpl] = createSignal(DASHBOARD_TEMPLATES[0].id);
  const create = () => {
    const hub = createCustomHub(name().trim() || t(`hub-${tpl()}` as "hub-study"), tpl(), { ...COVERS });
    hub.widgets = hub.widgets.map((w) => ({ ...w, title: "", subtitle: "", todos: w.todos ? [] : undefined }));
    dashboards.update((d) => { d.hubs.push(hub); d.activeId = hub.id; });
    props.onClose();
  };
  return (
    <Modal title={t("dash-new-hub")} onClose={props.onClose}>
      <form class="stack" onSubmit={(e) => { e.preventDefault(); create(); }}>
        <label class="field"><span>{t("dash-hub-name")}</span><input class="input" data-autofocus dir="auto" value={name()} onInput={(e) => setName(e.currentTarget.value)} /></label>
        <fieldset class="choice-grid">
          <legend>{t("dash-template")}</legend>
          <For each={DASHBOARD_TEMPLATES}>
            {(x) => <label class="choice-card"><input type="radio" name="tpl" checked={tpl() === x.id} onChange={() => setTpl(x.id)} /><strong>{t(`hub-${x.id}` as "hub-study")}</strong><span>{t(`hub-${x.id}-desc` as "hub-study-desc")}</span></label>}
          </For>
        </fieldset>
        <div class="modal-actions"><button type="button" class="btn" onClick={props.onClose}>{t("action-cancel")}</button><button class="btn primary">{t("action-create")}</button></div>
      </form>
    </Modal>
  );
}

export default function Dashboard() {
  const [edit, setEdit] = createSignal(false);
  const [adding, setAdding] = createSignal(false);
  const [newHub, setNewHub] = createSignal(false);
  const [drag, setDrag] = createSignal<number | null>(null);
  onMount(() => void loadAllNotes());

  const move = (from: number, to: number) => updateHub((h) => {
    if (to < 0 || to >= h.widgets.length) return;
    const [w] = h.widgets.splice(from, 1);
    h.widgets.splice(to, 0, w);
  });
  const rename = async () => {
    const h = activeHub();
    if (!h) return;
    const v = await askText(t("dash-rename-hub"), hubName(h), t("action-rename"));
    if (v?.trim()) updateHub((x) => { x.name = v.trim(); });
  };
  const remove = async () => {
    const h = activeHub();
    if (!h || dashboards.state.hubs.length < 2) return;
    if (!(await askConfirm(t("dash-delete-hub"), t("dash-delete-hub-confirm", { name: hubName(h) }), t("action-delete")))) return;
    dashboards.update((d) => { d.hubs = d.hubs.filter((x) => x.id !== h.id); d.activeId = d.hubs[0].id; });
  };
  const exportHub = async () => {
    const h = activeHub();
    if (h && (await backend.saveText(`${hubName(h)}.json`, exportDashboardJson(JSON.parse(JSON.stringify(h))), "json"))) toast(t("export-done"));
  };
  const importHub = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const hub = parseImportedDashboardJson(await f.text());
        hub.id = `hub-${Date.now().toString(36)}`;
        dashboards.update((d) => { d.hubs.push(hub); d.activeId = hub.id; });
      } catch { toast(t("dash-import-failed"), true); }
    };
    input.click();
  };

  const widgetMenu = (e: MouseEvent, w: DashboardWidget, i: number) => {
    const count = activeHub()?.widgets.length ?? 0;
    const items: MenuItem[] = [
      { label: t("dash-move-back"), icon: <ArrowLeft class="flip-rtl" />, disabled: i === 0, run: () => move(i, i - 1) },
      { label: t("dash-move-forward"), icon: <ArrowRight class="flip-rtl" />, disabled: i >= count - 1, run: () => move(i, i + 1) },
      ...([1, 2, 3] as const).map((n, k) => ({ label: t("dash-width", { span: n }), mark: w.span === n, sep: k === 0, run: () => updateWidget(w.id, (x) => { x.span = n; }) })),
      { label: t("dash-widget-title"), icon: <Pencil />, sep: true, run: async () => { const v = await askText(t("dash-widget-title"), widgetTitle(w), t("action-save")); if (v !== null) updateWidget(w.id, (x) => { x.title = v.trim(); }); } },
      { label: t("dash-add-widget"), icon: <Plus />, run: () => setAdding(true) },
      { label: edit() ? t("dash-done") : t("dash-edit"), icon: edit() ? <Check /> : <LayoutGrid />, run: () => setEdit(!edit()) },
      { label: t("dash-remove-widget"), icon: <Trash2 />, danger: true, sep: true, run: () => updateHub((h) => { h.widgets.splice(i, 1); }) },
    ];
    openMenu(e, items);
  };
  const hubMenu = (e: MouseEvent) => openMenu(e, [
    { label: t("dash-rename-hub"), icon: <Pencil />, run: () => void rename() },
    { label: t("dash-add-widget"), icon: <Plus />, run: () => setAdding(true) },
    { label: t("dash-export"), icon: <Download />, sep: true, run: () => void exportHub() },
    { label: t("dash-import"), icon: <Upload />, run: importHub },
    { label: t("dash-new-hub"), icon: <Plus />, sep: true, run: () => setNewHub(true) },
    { label: t("dash-delete-hub"), icon: <Trash2 />, danger: true, disabled: dashboards.state.hubs.length < 2, run: () => void remove() },
  ]);

  return (
    <div class="dashboard">
      <header class="dash-bar">
        <div class="dash-hubs" role="tablist" aria-label={t("view-dashboard")}>
          <For each={dashboards.state.hubs}>
            {(h) => { const I = HUB_ICON[h.templateId] ?? LayoutGrid; return <button role="tab" class="chip" aria-selected={h.id === activeHub()?.id} onClick={() => dashboards.update((d) => { d.activeId = h.id; })} onContextMenu={(e) => { dashboards.update((d) => { d.activeId = h.id; }); hubMenu(e); }}><I aria-hidden="true" /><span dir="auto">{hubName(h)}</span></button>; }}
          </For>
          <button class="icon-btn sm" title={t("dash-new-hub")} aria-label={t("dash-new-hub")} onClick={() => setNewHub(true)}><Plus /></button>
        </div>
        <span class="tb-fill" />
        <Show when={edit()}>
          <button class="btn sm" onClick={() => setAdding(true)}><Plus />{t("dash-add-widget")}</button>
          <button class="icon-btn" title={t("dash-rename-hub")} aria-label={t("dash-rename-hub")} onClick={() => void rename()}><Pencil /></button>
          <button class="icon-btn" title={t("dash-export")} aria-label={t("dash-export")} onClick={() => void exportHub()}><Download /></button>
          <button class="icon-btn" title={t("dash-import")} aria-label={t("dash-import")} onClick={importHub}><Upload /></button>
          <button class="icon-btn" title={t("dash-delete-hub")} aria-label={t("dash-delete-hub")} disabled={dashboards.state.hubs.length < 2} onClick={() => void remove()}><Trash2 /></button>
        </Show>
        <button class="btn sm" classList={{ primary: edit() }} aria-pressed={edit()} onClick={() => setEdit(!edit())}>{edit() ? <><Check />{t("dash-done")}</> : <><Pencil />{t("dash-edit")}</>}</button>
      </header>
      <div class="dash-grid" classList={{ editing: edit() }}>
        <For each={activeHub()?.widgets ?? []}>
          {(w, i) => (
            <section class={`widget glass-soft wt-${w.type}`} style={{ "--span": w.span }} aria-label={widgetTitle(w)} onContextMenu={(e) => { if ((e.target as HTMLElement).closest("input, textarea, [contenteditable]")) return; widgetMenu(e, w, i()); }}
              draggable={edit()} onDragStart={() => setDrag(i())} onDragOver={(e) => { if (drag() !== null) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); const d = drag(); setDrag(null); if (d !== null && d !== i()) move(d, i()); }}>
              <Show when={w.type !== "cover" || edit()}>
                <header class="widget-head">
                  <Show when={edit()} fallback={<h3 dir="auto">{(() => { const I = WIDGET_ICON[w.type] ?? LayoutGrid; return <I aria-hidden="true" />; })()}<span>{widgetTitle(w)}</span></h3>}>
                    <input class="input sm widget-title-input" dir="auto" value={w.title} placeholder={t(`widget-${w.type}`)} aria-label={t("dash-widget-title")} onChange={(e) => { const v = e.currentTarget.value; updateWidget(w.id, (x) => { x.title = v; }); }} />
                    <div class="widget-tools">
                      <button class="icon-btn sm" aria-label={t("dash-move-back")} title={t("dash-move-back")} onClick={() => move(i(), i() - 1)}><ArrowLeft class="flip-rtl" /></button>
                      <button class="icon-btn sm" aria-label={t("dash-move-forward")} title={t("dash-move-forward")} onClick={() => move(i(), i() + 1)}><ArrowRight class="flip-rtl" /></button>
                      <button class="btn sm" aria-label={t("dash-width", { span: w.span })} title={t("dash-width", { span: w.span })} onClick={() => updateWidget(w.id, (x) => { x.span = x.span === 3 ? 1 : stepWidgetSpan(x.span, 1); })}>{w.span}/3</button>
                      <button class="icon-btn sm" aria-label={t("dash-remove-widget")} title={t("dash-remove-widget")} onClick={() => updateHub((h) => { h.widgets.splice(i(), 1); })}><Trash2 /></button>
                    </div>
                  </Show>
                </header>
              </Show>
              <div class="widget-body"><WidgetBody w={w} edit={edit()} /></div>
            </section>
          )}
        </For>
      </div>
      <Show when={adding()}>
        <Modal title={t("dash-add-widget")} onClose={() => setAdding(false)} class="modal-lg">
          <div class="choice-grid">
            <For each={DASHBOARD_WIDGET_CATALOG}>
              {(c) => { const I = WIDGET_ICON[c.type as DashboardWidgetType] ?? LayoutGrid; return <button class="choice-card widget-choice" onClick={() => { addWidget(c.type as DashboardWidgetType); setAdding(false); }}><I aria-hidden="true" /><strong>{t(`widget-${c.type}`)}</strong><span>{t(`widget-cat-${c.category}`)}</span></button>; }}
            </For>
          </div>
        </Modal>
      </Show>
      <Show when={newHub()}><NewHub onClose={() => setNewHub(false)} /></Show>
    </div>
  );
}
