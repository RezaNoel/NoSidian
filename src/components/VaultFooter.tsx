// Bottom of the left sidebar: vault switcher, ambience (weather, sounds,
// music) and settings.
import { CloudSun, Settings, Vault as VaultIcon } from "lucide-solid";
import { t } from "../i18n";
import { ambOpen, setAmbOpen } from "./focus/Ambience";
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
        class="icon-btn sm amb-toggle"
        aria-expanded={ambOpen()}
        aria-haspopup="dialog"
        title={t("footer-ambient")}
        aria-label={t("footer-ambient")}
        onClick={() => setAmbOpen(!ambOpen())}
      >
        <CloudSun />
      </button>
      <button class="icon-btn sm" title={t("footer-settings")} aria-label={t("footer-settings")} aria-haspopup="dialog" onClick={() => setOverlay("settings")}>
        <Settings />
      </button>
    </div>
  );
}
