// Export a note (Markdown, HTML, print/PDF), the whole vault (JSON backup,
// single-file HTML app) and import files into the vault.
import { t } from "../i18n";
import { backend } from "../backend";
import { noteTitle, renderMarkdown } from "../lib/markdown";
import { buildStandaloneHtml } from "../core/utils/standaloneHtml";
import { loadAllNotes } from "./corpus";
import { contents, ensureLoaded, markdownPaths, refresh, vault } from "./vault";
import { toast } from "./ui";

const css = () => {
  const vars = getComputedStyle(document.documentElement);
  const v = (n: string) => vars.getPropertyValue(n).trim();
  return `body{font:16px/1.7 system-ui,"Vazirmatn",sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:${v("--text-primary") || "#222"};background:${v("--bg-app") || "#fff"}}
pre{background:rgba(127,127,127,.12);padding:12px;border-radius:8px;overflow:auto}code{font-family:ui-monospace,monospace}
blockquote{border-inline-start:3px solid ${v("--accent") || "#3b7ddd"};margin:0;padding:4px 16px;opacity:.9}img{max-width:100%}
table{border-collapse:collapse}td,th{border:1px solid rgba(127,127,127,.3);padding:4px 8px}a{color:${v("--accent") || "#3b7ddd"}}
.callout{border-radius:8px;padding:8px 14px;background:rgba(127,127,127,.1);margin:12px 0}.code-copy{display:none}
@media print{body{margin:0;max-width:none;color:#000;background:#fff}}`;
};

function htmlDoc(title: string, body: string, dir = "auto") {
  return `<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title.replace(/</g, "&lt;")}</title><style>${css()}</style></head><body><article dir="auto">${body}</article></body></html>`;
}

export async function exportMarkdown(path: string): Promise<void> {
  await ensureLoaded(path);
  if (await backend.saveText(`${noteTitle(path)}.md`, contents[path] ?? "", "md")) toast(t("export-done"));
}

export async function exportHtml(path: string): Promise<void> {
  await ensureLoaded(path);
  const html = htmlDoc(noteTitle(path), renderMarkdown(contents[path] ?? ""));
  if (await backend.saveText(`${noteTitle(path)}.html`, html, "html")) toast(t("export-done"));
}

/** Print the rendered note; "Save as PDF" in the print dialog makes a PDF. */
export async function printNote(path: string): Promise<void> {
  await ensureLoaded(path);
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;inset-inline-end:0;bottom:0;width:0;height:0;border:0";
  frame.setAttribute("aria-hidden", "true");
  document.body.append(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(htmlDoc(noteTitle(path), renderMarkdown(contents[path] ?? "")));
  doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  }, 250);
}

export async function exportBackup(): Promise<void> {
  const json = await backend.vaultBackup();
  const name = `${vault()?.meta.name ?? "vault"}-${new Date().toISOString().slice(0, 10)}.json`;
  if (await backend.saveText(name, json, "json")) toast(t("export-done"));
}

export async function exportStandalone(): Promise<void> {
  await loadAllNotes();
  const notes = markdownPaths().map((p) => ({ path: p, content: contents[p] ?? "" }));
  const name = vault()?.meta.name ?? "NoSidian";
  if (await backend.saveText(`${name}.html`, buildStandaloneHtml(notes, name), "html")) toast(t("export-done"));
}

export async function importIntoVault(folder = ""): Promise<void> {
  const added = await backend.importFiles(folder);
  if (!added.length) return;
  await refresh();
  toast(t("import-done", { count: added.length }));
}
