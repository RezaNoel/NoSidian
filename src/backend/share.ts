// Sharing a generated image. On a phone the system share sheet opens (Instagram,
// Telegram, ...); elsewhere, or when the system has no share sheet, the image is saved.
import { backend } from "./index";

const isPhoneApp = () => "__TAURI_INTERNALS__" in window && /android|iphone|ipad/i.test(navigator.userAgent);

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** "shared" when a share sheet took it, "saved" when it was saved as a file, null when cancelled. */
export async function shareImage(name: string, bytes: Uint8Array): Promise<"shared" | "saved" | null> {
  // The phone app has no Web Share in its web view: use the system share sheet.
  if (isPhoneApp()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const url = await invoke<string>("share_temp_file", { name, data: toBase64(bytes) });
      await invoke("plugin:sharekit|share_file", { url, mimeType: "image/png", title: name });
      return "shared";
    } catch (err) {
      console.warn("share sheet failed", err);
    }
  }
  const phone = typeof matchMedia === "function" && matchMedia("(max-width: 767px)").matches;
  const file = new File([bytes as BlobPart], name, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (phone && navigator.share && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return "shared";
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return null;
    }
  }
  return (await backend.saveBytes(name, bytes, "png")) ? "saved" : null;
}
