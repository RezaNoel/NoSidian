// Sharing a generated image. On a phone the system share sheet opens (Instagram,
// Telegram, ...); elsewhere, or when the system has no share sheet, the image is saved.
import { backend } from "./index";

export async function shareImage(name: string, bytes: Uint8Array): Promise<boolean> {
  const phone = typeof matchMedia === "function" && matchMedia("(max-width: 767px)").matches;
  const file = new File([bytes as BlobPart], name, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (phone && navigator.share && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return false;
    }
  }
  return backend.saveBytes(name, bytes, "png");
}
