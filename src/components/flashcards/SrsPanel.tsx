// Right sidebar "Review" tab: cards in the open note and a study button.
import { For, Show, createMemo } from "solid-js";
import { t } from "../../i18n";
import { allCards, countDeck, stateOf } from "../../state/srs";
import { startStudy } from "./study-state";
import { openView } from "../../state/views";

export function SrsPanel(props: { path: string }) {
  const cards = createMemo(() => allCards().filter((c) => c.sourcePath === props.path));
  const counts = createMemo(() => countDeck(props.path));
  return (
    <div class="stack">
      <p class="muted">{t("srs-note-counts", { total: counts().total, due: counts().due, fresh: counts().fresh })}</p>
      <div class="row">
        <button class="btn sm primary" disabled={!cards().length} onClick={() => { startStudy(props.path); void openView("flashcards"); }}>{t("srs-study-note")}</button>
        <button class="btn sm" onClick={() => void openView("flashcards")}>{t("view-flashcards")}</button>
      </div>
      <Show when={cards().length} fallback={<p class="empty sm">{t("srs-note-empty")}</p>}>
        <ul class="list">
          <For each={cards()}>
            {(c) => {
              const st = stateOf(c);
              return <li class="list-row static"><span class="list-title" dir="auto">{c.question.slice(0, 90)}</span><span class="list-snippet">{st?.reps ? t("srs-next-due", { date: new Date(st.dueAt).toLocaleDateString() }) : t("srs-new")}</span></li>;
            }}
          </For>
        </ul>
      </Show>
    </div>
  );
}
