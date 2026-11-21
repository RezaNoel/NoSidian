// Three ways into a vault (sample, new, existing) plus recently used vaults.
import { For, Show, createResource, createSignal } from "solid-js";
import { BookOpen, FolderOpen, FolderPlus, Vault as VaultIcon } from "lucide-solid";
import { t } from "../i18n";
import { backend } from "../backend";
import { inTauri } from "../state/backend";
import { settings } from "../state/settings";
import { createVault, openSampleVault, openVaultAt, pickAndOpenVault } from "../state/session";
import { vault } from "../state/vault";
import type { Vault } from "../state/types";

export function VaultPicker(props: { onDone: (v: Vault) => void; showRecent?: boolean }) {
  const [busy, setBusy] = createSignal(false);
  const [creating, setCreating] = createSignal(false);
  const [name, setName] = createSignal("");
  const [parent, setParent] = createSignal<string | null>(null);
  const [defaultParent] = createResource(() => backend.defaultVaultParent().catch(() => ""));
  const location = () => parent() ?? defaultParent() ?? "";

  const run = async (op: () => Promise<Vault | null>) => {
    if (busy()) return;
    setBusy(true);
    try {
      const v = await op();
      if (v) props.onDone(v);
    } finally {
      setBusy(false);
    }
  };

  const chooseLocation = async () => {
    const p = await backend.pickFolder();
    if (p) setParent(p);
  };

  return (
    <div class="vault-picker" aria-busy={busy()}>
      <div class="vault-cards">
        <button class="vault-card glass-card" disabled={busy()} onClick={() => void run(openSampleVault)}>
          <span class="vault-card-icon accent"><BookOpen /></span>
          <strong>{t("vault-open-default")}</strong>
          <span>{t("vault-open-default-desc")}</span>
        </button>
        <div class="vault-card glass-card" classList={{ open: creating() }}>
          <button class="vault-card-main" disabled={busy()} aria-expanded={creating()} onClick={() => setCreating(!creating())}>
            <span class="vault-card-icon"><FolderPlus /></span>
            <strong>{t("vault-create-new")}</strong>
            <span>{t("vault-create-new-desc")}</span>
          </button>
          <Show when={creating()}>
            <form class="vault-create" onSubmit={(e) => { e.preventDefault(); void run(() => createVault(location(), name())); }}>
              <input class="input" placeholder={t("vault-name-placeholder")} aria-label={t("vault-name-placeholder")} value={name()} onInput={(e) => setName(e.currentTarget.value)} dir="auto" autofocus />
              <Show when={inTauri()}>
                <div class="vault-location">
                  <span dir="ltr" title={location()}>{t("vault-choose-location", { path: location() })}</span>
                  <button type="button" class="btn" onClick={() => void chooseLocation()}>{t("vault-change-location")}</button>
                </div>
              </Show>
              <button class="btn primary" type="submit" disabled={busy() || !name().trim()}>{t("vault-create-btn")}</button>
            </form>
          </Show>
        </div>
        <button class="vault-card glass-card" disabled={busy() || !inTauri()} onClick={() => void run(pickAndOpenVault)}>
          <span class="vault-card-icon"><FolderOpen /></span>
          <strong>{t("vault-load-existing")}</strong>
          <span>{t("vault-load-existing-desc")}</span>
        </button>
      </div>
      <Show when={props.showRecent && settings.recentVaults.length}>
        <h3 class="section-title">{t("vault-recent")}</h3>
        <ul class="list recent-vaults">
          <For each={settings.recentVaults}>
            {(r) => (
              <li>
                <button class="list-row inline" classList={{ active: vault()?.root === r.path }} disabled={busy()} onClick={() => void run(() => openVaultAt(r.path))}>
                  <VaultIcon aria-hidden="true" />
                  <span class="list-title" dir="auto">{r.name}</span>
                  <span class="list-meta" dir="ltr">{r.path}</span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
