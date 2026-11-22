// Files dropped from outside the app (the explorer, the desktop) are copied
// into the vault. Used by the file tree and by notes.
import { backend } from "../backend";
import { t } from "../i18n";
import { refresh } from "./vault";
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

/** Folder that files dropped or pasted into notes are saved in. */
export const ATTACH_FOLDER = "attachments";

/**
 * Save files dropped or pasted into a note and return the Markdown that
 * embeds them: images, audio, video and PDFs as `![[...]]`, anything else as
 * a link.
 */
export async function embedDroppedFiles(files: FileList | File[]): Promise<string> {
  const { fileKind, reloadAttachments } = await import("../lib/attachments");
  const named = Array.from(files).map((f, i) =>
    // Pasted screenshots come in as "image.png"; give them a dated name.
    f.name && f.name !== "image.png" ? f : new File([f], `Pasted image ${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}${i ? `-${i}` : ""}.${(f.type.split("/")[1] || "png").replace("jpeg", "jpg")}`, { type: f.type }),
  );
  const paths = await copyDroppedFiles(named, ATTACH_FOLDER, true);
  if (paths.length) await reloadAttachments();
  return paths
    .map((p) => (fileKind(p) ? `![[${p}]]` : `[${p.split("/").pop()}](<${p}>)`))
    .join("\n");
}
