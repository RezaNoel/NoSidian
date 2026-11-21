// Root: boots into the first-launch wizard or straight into the last vault.
import { For, Match, Show, Switch, createSignal, onMount } from "solid-js";
import { t } from "./i18n";
import { LiveAnnouncer } from "./a11y/announcer";
import { settings } from "./state/settings";
import { restoreVault } from "./state/session";
import { overlay, setOverlay, toasts } from "./state/ui";
import { vault } from "./state/vault";
import { ContextMenu } from "./components/ContextMenu";
import { Dialogs } from "./components/Dialogs";
import { Modal } from "./components/Modal";
import { Onboarding } from "./components/Onboarding";
import { SettingsOverlay } from "./components/SettingsOverlay";
import { VaultPicker } from "./components/VaultPicker";
import { Workspace } from "./components/Workspace";

type Phase = "loading" | "onboarding" | "pick-vault" | "workspace";

export function App() {
  const [phase, setPhase] = createSignal<Phase>("loading");

  onMount(async () => {
    if (!settings.onboarding.completed) return setPhase("onboarding");
    setPhase((await restoreVault()) ? "workspace" : "pick-vault");
  });

  return (
    <>
      <a class="skip-link" href="#main">{t("shell-skip-to-content")}</a>
      <div class="backdrop" aria-hidden="true"><span /><span /><span /></div>
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
      <Show when={overlay() === "settings"}><SettingsOverlay /></Show>
      <Show when={overlay() === "vaults"}>
        <Modal title={t("vault-switcher-title")} onClose={() => setOverlay("none")} class="modal-lg">
          <VaultPicker onDone={() => { setOverlay("none"); setPhase("workspace"); }} showRecent />
        </Modal>
      </Show>
      <Dialogs />
      <ContextMenu />
      <div class="toasts" aria-hidden="true">
        <For each={toasts()}>{(x) => <div class="toast glass-modal" classList={{ error: x.error }}>{x.text}</div>}</For>
      </div>
      <LiveAnnouncer />
    </>
  );
}
