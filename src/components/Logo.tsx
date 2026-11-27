import logo from "../assets/logo.png";
import { HatOn } from "./Christmas";

/** The NoSidian app mark (decorative; the app name is always next to it or in the title). */
export function Logo(props: { size?: number; class?: string }) {
  return <HatOn><img class={`logo ${props.class ?? ""}`} src={logo} alt="" width={props.size ?? 30} height={props.size ?? 30} draggable={false} /></HatOn>;
}
