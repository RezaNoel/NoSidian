// Dashboard hubs (pages of widgets), stored per vault.
import { vaultDoc } from "./persist";
import { buildAllDefaultDashboards, buildWidgetFromType } from "../core/dashboardPresets";
import type { DashboardConfig, DashboardWidget, DashboardWidgetType } from "../core/types";

export const COVERS = { general: "preset:carbon", language: "preset:language", writer: "preset:writer", research: "preset:observatory" } as const;

export interface DashboardDoc { hubs: DashboardConfig[]; activeId: string; captureNote: string; wordBase?: { day: string; words: number } }

export const dashboards = vaultDoc<DashboardDoc>("dashboards", () => {
  // Default hubs get localized names/titles at render time (empty strings here).
  const hubs = buildAllDefaultDashboards({ ...COVERS }).map((h) => ({
    ...h, name: "", description: "",
    widgets: h.widgets.map((w) => ({ ...w, title: "", subtitle: "", todos: w.todos ? [] : undefined, shortcuts: w.shortcuts?.map((s) => ({ ...s, label: "" })) })),
  }));
  return { hubs, activeId: hubs[0]?.id ?? "", captureNote: "Inbox.md" };
});

export const activeHub = () => dashboards.state.hubs.find((h) => h.id === dashboards.state.activeId) ?? dashboards.state.hubs[0] ?? null;

export function updateHub(fn: (h: DashboardConfig) => void): void {
  dashboards.update((d) => {
    const h = d.hubs.find((x) => x.id === d.activeId) ?? d.hubs[0];
    if (h) { fn(h); h.updatedAt = Date.now(); }
  });
}

export function updateWidget(id: string, fn: (w: DashboardWidget) => void): void {
  updateHub((h) => { const w = h.widgets.find((x) => x.id === id); if (w) fn(w); });
}

export function addWidget(type: DashboardWidgetType, extra?: Partial<DashboardWidget>): void {
  const w = buildWidgetFromType(type, { ...COVERS });
  w.title = "";
  if (extra) Object.assign(w, extra);
  updateHub((h) => { h.widgets.push(w); });
}
