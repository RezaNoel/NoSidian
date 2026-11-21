// Screen-reader announcements through two visually hidden live regions.
// Any module can call announce() for spoken feedback (theme changed, card
// graded, timer finished...).
import { createRoot, createSignal } from "solid-js";

type Politeness = "polite" | "assertive";

const regions = createRoot(() => {
  const [polite, setPolite] = createSignal("");
  const [assertive, setAssertive] = createSignal("");
  return { polite, setPolite, assertive, setAssertive };
});

export function announce(message: string, politeness: Politeness = "polite"): void {
  const set = politeness === "assertive" ? regions.setAssertive : regions.setPolite;
  // Clear first so repeating the same text is announced again.
  set("");
  setTimeout(() => set(message), 50);
}

export function LiveAnnouncer() {
  return (
    <>
      <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {regions.polite()}
      </div>
      <div class="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {regions.assertive()}
      </div>
    </>
  );
}
