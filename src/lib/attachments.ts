// Vault attachments (images, audio, video, PDFs) for embeds and the PDF
// viewer: resolving `![[name]]` targets and turning files into blob URLs.
import { createResource, createRoot } from "solid-js";
import { backend } from "../backend";
import { indexRev, tree } from "../state/vault";

const store = createRoot(() => {
  const [list, { refetch }] = createResource(() => indexRev() + 1, () => backend.attachments().catch(() => [] as string[]), { initialValue: [] });
  return { list, refetch };
});

export const attachmentList = store.list;
/** Re-read the attachment list now (after adding files), resolved once loaded. */
export const reloadAttachments = async (): Promise<void> => { await store.refetch(); };

const KIND: [RegExp, "image" | "audio" | "video" | "pdf"][] = [
  [/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i, "image"],
  [/\.(mp3|wav|ogg|oga|m4a|flac)$/i, "audio"],
  [/\.(mp4|m4v|webm)$/i, "video"],
  [/\.pdf$/i, "pdf"],
];
export const fileKind = (name: string) => KIND.find(([re]) => re.test(name))?.[1] ?? null;

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  bmp: "image/bmp", avif: "image/avif", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg",
  m4a: "audio/mp4", flac: "audio/flac", mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", pdf: "application/pdf",
};

/** Resolve an embed target (name, relative or vault path) to a vault path. */
export function resolveAttachment(target: string, from?: string): string | null {
  const clean = target.split("#")[0].replace(/^\.\//, "").trim();
  const all = [...attachmentList(), ...tree.notes.filter((n) => n.kind === "pdf").map((n) => n.path)];
  if (all.includes(clean)) return clean;
  if (from?.includes("/")) {
    const rel = `${from.slice(0, from.lastIndexOf("/"))}/${clean}`;
    if (all.includes(rel)) return rel;
  }
  const name = clean.split("/").pop()!.toLowerCase();
  return all.find((p) => p.split("/").pop()!.toLowerCase() === name) ?? null;
}

const urls = new Map<string, Promise<string>>();
/** Blob URL for a vault file (cached for the session). */
export function blobUrl(path: string): Promise<string> {
  let p = urls.get(path);
  if (!p) {
    p = backend.fileRead(path).then((bytes) => {
      const ext = path.split(".").pop()!.toLowerCase();
      return URL.createObjectURL(new Blob([bytes as BlobPart], { type: MIME[ext] ?? "application/octet-stream" }));
    });
    p.catch(() => urls.delete(path));
    urls.set(path, p);
  }
  return p;
}

export function forgetBlob(path: string): void {
  const p = urls.get(path);
  urls.delete(path);
  void p?.then((u) => URL.revokeObjectURL(u)).catch(() => undefined);
}
