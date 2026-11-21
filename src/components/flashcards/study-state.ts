// Which deck the flashcards view should open on (set from other panels).
import { createSignal } from "solid-js";

const [pending, setPending] = createSignal<string | null | undefined>(undefined);
export const pendingStudy = pending;
export const clearPendingStudy = () => setPending(undefined);
/** Open the flashcards view straight into a study session for a deck (null = all). */
export const startStudy = (deck: string | null) => setPending(deck);
