// Prompt and confirm dialogs driven by askText()/askConfirm() in state/ui.
import { Show, createSignal } from "solid-js";
import { t } from "../i18n";
import { closeDialog, dialog } from "../state/ui";
import { Modal } from "./Modal";

export function Dialogs() {
  return (
    <Show when={dialog()} keyed>
      {(d) => {
        const [value, setValue] = createSignal(d.value ?? "");
        const submit = (e: Event) => {
          e.preventDefault();
          closeDialog(d.kind === "prompt" ? value() : true);
        };
        return (
          <Modal title={d.title} onClose={() => closeDialog(null)} class="modal-sm">
            <form onSubmit={submit} class="dialog-form">
              <Show when={d.body}><p class="dialog-body" dir="auto">{d.body}</p></Show>
              <Show when={d.kind === "prompt"}>
                <input
                  class="input"
                  value={value()}
                  onInput={(e) => setValue(e.currentTarget.value)}
                  aria-label={d.title}
                  dir="auto"
                  data-autofocus
                  ref={(el) => queueMicrotask(() => el.select())}
                />
              </Show>
              <div class="dialog-actions">
                <button type="button" class="btn" onClick={() => closeDialog(null)}>{t("action-cancel")}</button>
                <button
                  type="submit"
                  class={`btn ${d.danger ? "danger" : "primary"}`}
                  disabled={d.kind === "prompt" && !value().trim()}
                  data-autofocus={d.kind === "confirm" ? true : undefined}
                >
                  {d.confirmLabel}
                </button>
              </div>
            </form>
          </Modal>
        );
      }}
    </Show>
  );
}
