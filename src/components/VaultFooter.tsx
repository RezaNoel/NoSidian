// Bottom of the left sidebar: vault switcher, ambient toggle and settings.
import { Blend, Settings, Vault as VaultIcon } from "lucide-solid";
import { t } from "../i18n";
import { settings, updateSettings } from "../state/settings";
import { setOverlay } from "../state/ui";
import { vault } from "../state/vault";

export function VaultFooter() {
  return (
    <div class="sidebar-footer">
      <button class="vault-switch" onClick={() => setOverlay("vaults")} title={t("vault-switcher-title")} aria-haspopup="dialog">
        <VaultIcon aria-hidden="true" />
        <span dir="auto">{vault()?.meta.name ?? t("status-no-vault")}</span>
      </button>
      <button
        class="icon-btn sm"
        aria-pressed={settings.appearance.ambientMesh}
        title={t("footer-ambient")}
        aria-label={t("footer-ambient")}
        onClick={() => updateSettings((c) => { c.appearance.ambientMesh = !c.appearance.ambientMesh; })}
      >
        <Blend />
      </button>
      <button class="icon-btn sm" title={t("footer-settings")} aria-label={t("footer-settings")} aria-haspopup="dialog" onClick={() => setOverlay("settings")}>
        <Settings />
      </button>
    </div>
  );
}
