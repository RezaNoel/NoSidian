// The card that offers a newer desktop release (see state/updater.ts).
import { Show } from "solid-js";
import { t } from "../i18n";
import { dismissUpdate, installUpdate, updateBusy, updateFailed, updateVersion } from "../state/updater";

export function UpdateBanner() {
  return (
    <Show when={updateVersion()}>
      {(v) => (
        <aside class="update-card" role="status" aria-live="polite">
          <p class="update-title">{t("update-available", { version: v() })}</p>
          <Show when={updateFailed()}><p class="update-error">{t("update-failed")}</p></Show>
          <div class="update-actions">
            <button class="start-primary update-go" disabled={updateBusy()} onClick={() => void installUpdate()}>
              {updateBusy() ? t("update-installing") : t("update-install")}
            </button>
            <button class="start-chip" disabled={updateBusy()} onClick={dismissUpdate}>{t("update-later")}</button>
          </div>
        </aside>
      )}
    </Show>
  );
}
