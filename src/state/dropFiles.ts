// Files dropped from outside the app (the explorer, the desktop) are copied
// into the vault. Used by the file tree and by notes.
import { backend } from "../backend";
import { t } from "../i18n";
import { refresh } from "./vault";
import { pref } from "./prefs";
import { toast } from "./ui";

const MAX_BYTES = 200 * 1024 * 1024;

export const hasOsFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Copy dropped files into `folder` ("" is the vault root). Returns the new paths. */
export async function copyDroppedFiles(files: FileList | File[], folder: string, quiet = false): Promise<string[]> {
  const out: string[] = [];
  for (const f of Array.from(files)) {
    if (f.size > MAX_BYTES) { toast(t("drop-too-big", { name: f.name }), true); continue; }
    try {
      out.push(await backend.fileAdd(folder, f.name, toBase64(await f.arrayBuffer())));
    } catch {
      toast(t("drop-failed", { name: f.name }), true);
    }
  }
  if (out.length) {
    await refresh();
    if (!quiet) toast(t("drop-copied", { count: out.length }));
  }
  return out;
}

/** Folder that files dropped or pasted into notes are saved in (Settings > Files; "" is the vault root). */
export const attachFolder = () => pref("attachmentFolder").trim().replace(/^\/+|\/+$/g, "");

/** Markdown that embeds (media, PDFs) or links (anything else) a vault file. */
export async function attachmentMarkdown(paths: string[]): Promise<string> {
  const { fileKind } = await import("../lib/attachments");
  return paths.map((p) => (fileKind(p) ? `![[${p}]]` : `[${p.split("/").pop()}](<${p}>)`)).join("\n");
}

/**
 * Attach files from the computer with the dialog, following Settings > Files:
 * copy them in, move them in, or link to them where they are. Returns the
 * Markdown to insert, or "" when nothing was attached. Falls back to a plain
 * file picker (copy) where there is no native dialog.
 */
export async function attachFromComputer(): Promise<string> {
  const { reloadAttachments } = await import("../lib/attachments");
  const res = await backend.attachFiles(attachFolder(), pref("attachmentMode")).catch(() => null);
  if (res) {
    if (res.vault.length) { await refresh(); await reloadAttachments(); }
    const outside = res.outside.map((a) => `[${a.split(/[\\/]/).pop()}](<file:///${a.replace(/\\/g, "/").replace(/^\/+/, "")}>)`);
    return [await attachmentMarkdown(res.vault), ...outside].filter(Boolean).join("\n");
  }
  const files = await new Promise<File[]>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
  return files.length ? embedDroppedFiles(files) : "";
}

/**
 * Save files dropped or pasted into a note and return the Markdown that
 * embeds them: images, audio, video and PDFs as `![[...]]`, anything else as
 * a link.
 */
export async function embedDroppedFiles(files: FileList | File[]): Promise<string> {
  const { reloadAttachments } = await import("../lib/attachments");
  const named = Array.from(files).map((f, i) =>
    // Pasted screenshots come in as "image.png"; give them a dated name.
    f.name && f.name !== "image.png" ? f : new File([f], `Pasted image ${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}${i ? `-${i}` : ""}.${(f.type.split("/")[1] || "png").replace("jpeg", "jpg")}`, { type: f.type }),
  );
  const paths = await copyDroppedFiles(named, attachFolder(), true);
  if (paths.length) await reloadAttachments();
  return attachmentMarkdown(paths);
}
