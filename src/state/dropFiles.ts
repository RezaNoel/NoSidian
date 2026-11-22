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
export async function copyDroppedFiles(files: FileList | File[], folder: string): Promise<string[]> {
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
    toast(t("drop-copied", { count: out.length }));
  }
  return out;
}
