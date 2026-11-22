// Root: boots into the first-launch wizard or straight into the last vault.
import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { t } from "./i18n";
import { LiveAnnouncer } from "./a11y/announcer";
import { settings } from "./state/settings";
import { restoreVault } from "./state/session";
import { overlay, setOverlay, setZenPage, toasts, zenPage } from "./state/ui";
import { Suspense, lazy } from "solid-js";
const ZenStudioPage = lazy(() => import("./components/focus/ZenStudio"));
import { vault } from "./state/vault";
import { BannerSettings } from "./components/Banner";
import { ContextMenu, installContextMenuGuard, installSelectEnhancer } from "./components/ContextMenu";
import { Dialogs } from "./components/Dialogs";
import { Modal } from "./components/Modal";
import { Onboarding } from "./components/Onboarding";
import { VaultPicker } from "./components/VaultPicker";
import { Workspace } from "./components/Workspace";
import { TitleBar, hasTitleBar } from "./components/TitleBar";
import { CommandPalette, QuickSwitcher } from "./components/Palette";
import { SettingsWindow } from "./components/settings/SettingsWindow";
import { promptNewFolder, promptNewNote } from "./components/FileTree";
import { bindPrompts, installHotkeys } from "./state/commands";
import { applyPrefsToDocument } from "./state/prefs";
import { enabledModules } from "./state/modules";
import { Lightbox, SlidesOverlay } from "./components/Overlays";
import { ZenOverlay } from "./components/focus/ZenOverlay";
import { AmbientOverlay } from "./components/focus/AmbientOverlay";
import { AmbiencePopover, MusicDock } from "./components/focus/Ambience";
import { PetCompanion, PetStudio, openPetStudio } from "./components/pet/PetCard";
import { TerminalDrawer, terminalOpen } from "./components/terminal/Terminal";
import { welcome } from "./state/personal";
import { toast } from "./state/ui";
import { announce } from "./a11y/announcer";
import { applyCustomCss, dev, mcp, runStartupPlugins, syncMcp } from "./state/devtools";

bindPrompts((folder) => promptNewNote(folder), () => promptNewFolder());

type Phase = "loading" | "onboarding" | "pick-vault" | "workspace";

export function App() {
  const [phase, setPhase] = createSignal<Phase>("loading");

  createEffect(() => applyPrefsToDocument());
  onCleanup(installHotkeys());
  installContextMenuGuard();
  installSelectEnhancer();

  const mods = createMemo(() => enabledModules(settings.experienceLevel, settings.moduleOverrides));
  const inWorkspace = () => phase() === "workspace" && !!vault();
  const onPet = () => openPetStudio();
  window.addEventListener("nosidian:pet", onPet);
  onCleanup(() => window.removeEventListener("nosidian:pet", onPet));
  createEffect(() => { if (dev.ready()) applyCustomCss(); });
  // Start sound and greeting once the app has opened (onboarding done).
  createEffect(() => { if (phase() !== "onboarding" && settings.onboarding.completed) void welcome(toast, announce); });
  let pluginsStarted = false;
  createEffect(() => {
    if (!inWorkspace() || !dev.ready() || pluginsStarted) return;
    pluginsStarted = true;
    runStartupPlugins();
  });
  createEffect(() => {
    if (!mcp.ready()) return;
    void [mcp.state.enabled, mcp.state.mode, mcp.state.port, mcp.state.token];
    void syncMcp();
  });

  const onClosed = () => { setOverlay("none"); setPhase("pick-vault"); };
  window.addEventListener("nosidian:vault-closed", onClosed);
  onCleanup(() => window.removeEventListener("nosidian:vault-closed", onClosed));

  onMount(async () => {
    if (!settings.onboarding.completed) return setPhase("onboarding");
    setPhase((await restoreVault()) ? "workspace" : "pick-vault");
  });

  return (
    <>
      <a class="skip-link" href="#main">{t("shell-skip-to-content")}</a>
      <div class="backdrop" aria-hidden="true"><span /><span /><span /></div>
      <Show when={hasTitleBar()}><TitleBar /></Show>
      <Switch>
        <Match when={phase() === "onboarding"}><Onboarding onFinish={() => setPhase("workspace")} /></Match>
        <Match when={phase() === "pick-vault"}>
          <main class="onboarding" id="main">
            <div class="onboarding-card glass-modal">
              <h1>{t("vault-welcome-title")}</h1>
              <p class="ob-hint">{t("vault-welcome-subtitle")}</p>
              <VaultPicker onDone={() => setPhase("workspace")} showRecent />
            </div>
          </main>
        </Match>
        <Match when={phase() === "workspace" && vault()}><Workspace /></Match>
      </Switch>
      <Show when={overlay() === "settings"}><SettingsWindow /></Show>
      <Show when={phase() === "workspace" && vault()}>
        <Show when={overlay() === "switcher"}><QuickSwitcher /></Show>
        <Show when={overlay() === "palette"}><CommandPalette /></Show>
      </Show>
      <Show when={overlay() === "vaults"}>
        <Modal title={t("vault-switcher-title")} onClose={() => setOverlay("none")} class="modal-lg">
          <VaultPicker onDone={() => { setOverlay("none"); setPhase("workspace"); }} showRecent />
        </Modal>
      </Show>
      <Show when={overlay() === "banner"}><BannerSettings onClose={() => setOverlay("none")} /></Show>
      <Show when={inWorkspace()}>
        <Show when={mods().has("ambient-effects")}><AmbientOverlay /></Show>
        <Show when={zenPage()}>
          <section class="zen-page" aria-label={t("view-zen")} onKeyDown={(e) => { if (e.key === "Escape" && !e.defaultPrevented) setZenPage(false); }}>
            <Suspense><ZenStudioPage onClose={() => setZenPage(false)} /></Suspense>
          </section>
        </Show>
        <AmbiencePopover />
        <MusicDock />
        <ZenOverlay />
        <SlidesOverlay />
        <Show when={mods().has("integrated-terminal") && terminalOpen()}><TerminalDrawer /></Show>
        <Show when={mods().has("companion-pet") && settings.petEnabled}>
          <PetCompanion />
          <PetStudio />
        </Show>
      </Show>
      <Lightbox />
      <Dialogs />
      <ContextMenu />
      <div class="toasts" aria-hidden="true">
        <For each={toasts()}>{(x) => <div class="toast glass-modal" classList={{ error: x.error }}>{x.text}</div>}</For>
      </div>
      <LiveAnnouncer />
    </>
  );
}
