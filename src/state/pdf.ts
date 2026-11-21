// PDF tabs: which page each open PDF should show, and helpers to open a PDF
// at a page (from `[[file.pdf#page=5]]` links and citations).
import { createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { openNote } from "./vault";

const s = createRoot(() => {
  const [pages, setPages] = createStore<Record<string, number>>({});
  return { pages, setPages };
});

export const pdfPages = s.pages;
export const setPdfPage = (path: string, page: number) => s.setPages(path, page);

export function openPdfAt(path: string, page = 1): void {
  s.setPages(path, Math.max(1, Math.floor(page) || 1));
  openNote(path);
}
