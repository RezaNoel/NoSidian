// Minimal stroke icons (24x24). Decorative: the button carries the label.
const PATHS: Record<string, string> = {
  home: "M3 11 12 4l9 7M5 10v10h5v-6h4v6h5V10",
  files: "M4 5h6l2 2h8v12H4z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  graph: "M6 6a2 2 0 1 0 0 .1M18 8a2 2 0 1 0 0 .1M10 18a2 2 0 1 0 0 .1M7.5 7l9 1M7 7.5l2.5 9M16.6 9.5 11.5 16.5",
  cards: "M4 7h12v12H4zM8 4h12v12",
  focus: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
};

export function Icon(props: { name: keyof typeof PATHS | string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={PATHS[props.name] ?? ""} />
    </svg>
  );
}
