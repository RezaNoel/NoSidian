import type { JSX } from "solid-js";
import { t } from "../i18n";
import { settings } from "../state/settings";
import { enabledModules } from "../state/modules";
import { LiveAnnouncer } from "../a11y/announcer";
import { Ribbon } from "./Ribbon";

/** App frame: landmarks for ribbon, both sidebars, workspace and status bar. */
export function Shell(props: { children: JSX.Element }) {
  const moduleCount = () =>
    enabledModules(settings.experienceLevel, settings.moduleOverrides).size;

  return (
    <>
      <a class="skip-link" href="#workspace">{t("shell-skip-to-content")}</a>
      <div class="ambient" aria-hidden="true"><span /><span /><span /></div>
      <div class="app">
        <Ribbon />
        <aside class="sidebar left glass" aria-label={t("shell-left-sidebar-label")}>
          <h2>{t("shell-left-sidebar-label")}</h2>
          <p>{t("shell-left-sidebar-placeholder")}</p>
        </aside>
        <main id="workspace" class="workspace glass" tabindex="-1" aria-label={t("shell-workspace-label")}>
          {props.children}
        </main>
        <aside class="sidebar right glass" aria-label={t("shell-right-sidebar-label")}>
          <h2>{t("shell-right-sidebar-label")}</h2>
          <p>{t("shell-right-sidebar-placeholder")}</p>
        </aside>
        <footer class="statusbar glass" aria-label={t("shell-status-bar-label")}>
          <span>{t("status-no-vault")}</span>
          <span class="end">{t("status-modules-enabled", { count: moduleCount() })}</span>
        </footer>
      </div>
      <LiveAnnouncer />
    </>
  );
}
