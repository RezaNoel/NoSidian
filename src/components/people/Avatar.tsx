import { Show, createResource } from "solid-js";
import { blobUrl } from "../../lib/attachments";
import { coverColor } from "../media/mediaCard";

const nameOf = (p: string) => p.split("/").pop()!.replace(/\.md$/i, "");
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]).join("").toUpperCase() || "?";

/** Round photo, or initials on the person's color. */
export function Avatar(props: { path: string; photo?: string; size?: "sm" | "lg" }) {
  const [res] = createResource(() => props.photo, (p) => blobUrl(p).catch(() => ""));
  // A resource keeps its last value when the source goes empty: show no photo then.
  const url = () => (props.photo ? res() : "");
  return (
    <span class="avatar" classList={{ sm: props.size === "sm", lg: props.size === "lg" }} style={{ "--cover": coverColor(nameOf(props.path)) }} aria-hidden="true">
      <Show when={url()} fallback={initials(nameOf(props.path))}>{(u) => <img src={u()} alt="" draggable={false} />}</Show>
    </span>
  );
}

