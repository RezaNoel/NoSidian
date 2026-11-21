// Vault banner above the left sidebar, and its settings dialog.
import { For, Show, createResource } from "solid-js";
import { ImageUp, Trash2 } from "lucide-solid";
import { t } from "../i18n";
import { backend } from "../backend";
import { reportError } from "../state/vault";
import { profile, updateProfile } from "../state/workspace";
import { BANNER_PRESETS, type BannerPreset } from "../state/types";
import carbon from "../assets/banners/carbon.webp";
import language from "../assets/banners/language.webp";
import writer from "../assets/banners/writer.webp";
import observatory from "../assets/banners/observatory.webp";
import { Modal } from "./Modal";
import { Toggle } from "./controls";

const PRESET_SRC: Record<BannerPreset, string> = { carbon, language, writer, observatory };
const MAX_WIDTH = 1600;

/** Resolves the current banner image to a URL (preset file or uploaded asset). */
function useBannerSrc() {
  const [src] = createResource(
    () => profile.banner.image,
    async (image) => {
      if (image.startsWith("asset:")) return backend.assetRead(image.slice(6)).catch(() => PRESET_SRC.carbon);
      return PRESET_SRC[image as BannerPreset] ?? PRESET_SRC.carbon;
    },
  );
  return src;
}

export function VaultBanner() {
  const src = useBannerSrc();
  return (
    <Show when={profile.banner.enabled && src()}>
      <div class="vault-banner" style={{ "block-size": `${profile.banner.height}px` }} aria-hidden="true">
        <img src={src()} alt="" style={{ "object-position": `50% ${profile.banner.posY}%`, opacity: profile.banner.opacity / 100 }} />
      </div>
    </Show>
  );
}

/** Downscale to at most MAX_WIDTH and re-encode as WebP, returning base64. */
async function prepareImage(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bmp.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/webp", 0.82);
  return url.slice(url.indexOf(",") + 1);
}

export function BannerSettings(props: { onClose: () => void }) {
  const b = () => profile.banner;
  const set = (fn: (x: typeof profile.banner) => void) => updateProfile((p) => fn(p.banner));
  const oldAsset = () => (b().image.startsWith("asset:") ? b().image.slice(6) : null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = await prepareImage(file);
      const name = `banner-${Date.now()}.webp`;
      await backend.assetWrite(name, data);
      const previous = oldAsset();
      set((x) => { x.image = `asset:${name}`; x.enabled = true; });
      if (previous) await backend.assetDelete(previous).catch(() => undefined);
    } catch (e) {
      reportError(e);
    }
  };

  const remove = async () => {
    const previous = oldAsset();
    set((x) => { x.enabled = false; x.image = "carbon"; });
    if (previous) await backend.assetDelete(previous).catch(() => undefined);
  };

  const pick = async (preset: BannerPreset) => {
    const previous = oldAsset();
    set((x) => { x.image = preset; x.enabled = true; });
    if (previous) await backend.assetDelete(previous).catch(() => undefined);
  };

  return (
    <Modal title={t("banner-title")} onClose={props.onClose} class="modal-sm">
      <Toggle label={t("banner-toggle")} checked={b().enabled} onChange={(v) => set((x) => { x.enabled = v; })} />
      <div class="banner-presets" role="radiogroup" aria-label={t("banner-title")}>
        <For each={BANNER_PRESETS}>
          {(p) => (
            <button role="radio" aria-checked={b().image === p} class="banner-preset" onClick={() => void pick(p)} title={t(`banner-preset-${p}`)}>
              <img src={PRESET_SRC[p]} alt="" />
              <span>{t(`banner-preset-${p}`)}</span>
            </button>
          )}
        </For>
      </div>
      <div class="field">
        <label for="bn-h">{`${t("banner-height")} (${b().height}px)`}</label>
        <input id="bn-h" type="range" min="48" max="220" value={b().height} onInput={(e) => set((x) => { x.height = Number(e.currentTarget.value); })} />
      </div>
      <div class="field">
        <label for="bn-y">{`${t("banner-position")} (${b().posY}%)`}</label>
        <input id="bn-y" type="range" min="0" max="100" value={b().posY} onInput={(e) => set((x) => { x.posY = Number(e.currentTarget.value); })} />
      </div>
      <div class="field">
        <label for="bn-o">{`${t("banner-opacity")} (${b().opacity}%)`}</label>
        <input id="bn-o" type="range" min="20" max="100" value={b().opacity} onInput={(e) => set((x) => { x.opacity = Number(e.currentTarget.value); })} />
      </div>
      <div class="dialog-actions">
        <label class="btn">
          <ImageUp aria-hidden="true" />{t("banner-upload")}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="sr-only" onChange={(e) => { void upload(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} />
        </label>
        <button class="btn" onClick={() => void remove()}><Trash2 aria-hidden="true" />{t("banner-remove")}</button>
        <button class="btn primary" onClick={props.onClose}>{t("action-close")}</button>
      </div>
    </Modal>
  );
}
