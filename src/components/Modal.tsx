// Accessible modal: labelled dialog, Escape closes, Tab stays inside, focus
// returns to whatever opened it.
import { Show, createUniqueId, onCleanup, onMount, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { X } from "lucide-solid";
import { t } from "../i18n";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function Modal(props: {
  title: string;
  onClose: () => void;
  children: JSX.Element;
  class?: string;
  hideTitle?: boolean;
  dismissable?: boolean;
  /** Phones have no Escape key: show a close button there too (default on). */
  closeButton?: boolean;
}) {
  const id = createUniqueId();
  let box!: HTMLDivElement;
  const opener = document.activeElement as HTMLElement | null;

  onMount(() => {
    const first = box.querySelector<HTMLElement>("[autofocus], [data-autofocus]") ?? box.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? box).focus();
  });
  onCleanup(() => opener?.focus?.());

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && props.dismissable !== false) {
      e.stopPropagation();
      props.onClose();
    } else if (e.key === "Tab") {
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  return (
    <Portal>
      <div class="modal-scrim" onClick={(e) => e.target === e.currentTarget && props.dismissable !== false && props.onClose()}>
        <div
          ref={box}
          class={`glass-modal modal ${props.class ?? ""}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={id}
          tabIndex={-1}
          onKeyDown={onKey}
        >
          <Show when={props.closeButton !== false && props.dismissable !== false}>
            <button class="icon-btn modal-close" aria-label={t("action-close")} title={t("action-close")} onClick={() => props.onClose()}><X aria-hidden="true" /></button>
          </Show>
          <h2 id={id} class={props.hideTitle ? "sr-only" : "modal-title"}>{props.title}</h2>
          {props.children}
        </div>
      </div>
    </Portal>
  );
}
