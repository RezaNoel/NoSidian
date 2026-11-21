// Music: built-in generated tracks, online radio, the user's own files and
// playlist links (YouTube, Spotify, SoundCloud). Files and radio play through
// one <audio> element; links play in an embedded player (see MusicDock).
import { createRoot, createSignal } from "solid-js";
import { t } from "../i18n";
import { deleteAudio, loadAudio, saveAudio } from "../core/utils/audioStore";
import type { AmbientMusicTrack } from "../core/types";
import { appDoc } from "./persist";
import { ambient, syncMusic } from "./focus";
import { toast } from "./ui";

export type MusicKind = "file" | "stream" | "youtube" | "spotify" | "soundcloud";
export interface MusicItem { id: string; kind: MusicKind; name: string; /** File: storage key; stream: URL; embeds: embed URL. */ ref: string; source?: string }

export const musicLibrary = appDoc<{ items: MusicItem[] }>("music", () => ({ items: [] }));

/** Free internet radio (needs a connection). */
export const RADIO: MusicItem[] = [
  { id: "radio-groovesalad", kind: "stream", name: "Groove Salad", ref: "https://ice2.somafm.com/groovesalad-128-mp3", source: "SomaFM" },
  { id: "radio-dronezone", kind: "stream", name: "Drone Zone", ref: "https://ice2.somafm.com/dronezone-128-mp3", source: "SomaFM" },
  { id: "radio-lush", kind: "stream", name: "Lush", ref: "https://ice2.somafm.com/lush-128-mp3", source: "SomaFM" },
  { id: "radio-deepspaceone", kind: "stream", name: "Deep Space One", ref: "https://ice2.somafm.com/deepspaceone-128-mp3", source: "SomaFM" },
  { id: "radio-fluid", kind: "stream", name: "Fluid", ref: "https://ice2.somafm.com/fluid-128-mp3", source: "SomaFM" },
];

const sig = createRoot(() => {
  const [embed, setEmbed] = createSignal<MusicItem | null>(null);
  const [loading, setLoading] = createSignal(false);
  return { embed, setEmbed, loading, setLoading };
});
/** The link currently loaded in the embedded player, if any. */
export const currentEmbed = sig.embed;
export const musicLoading = sig.loading;

const allItems = () => [...musicLibrary.state.items, ...RADIO];
export const findItem = (id: string | undefined) => (id ? allItems().find((x) => x.id === id) ?? null : null);
export const currentItem = () => findItem(ambient.state.musicItem);

let audio: HTMLAudioElement | null = null;
let objectUrl: string | null = null;

function stopAudio() {
  if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); }
  if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
}

async function playAudioItem(item: MusicItem) {
  audio ??= new Audio();
  stopAudio();
  audio.volume = ambient.state.musicVolume;
  audio.onended = () => void next();
  if (item.kind === "file") {
    const blob = await loadAudio(item.ref).catch(() => undefined);
    if (!blob) { toast(t("music-file-missing"), true); return; }
    objectUrl = URL.createObjectURL(blob);
    audio.src = objectUrl;
    audio.loop = musicLibrary.state.items.filter((x) => x.kind === "file").length <= 1;
  } else {
    audio.src = item.ref;
    audio.loop = false;
  }
  sig.setLoading(true);
  audio.oncanplay = () => sig.setLoading(false);
  audio.onerror = () => { sig.setLoading(false); if (item.kind === "stream") toast(t("music-radio-offline"), true); };
  await audio.play().catch(() => sig.setLoading(false));
}

/** Play a built-in generated track. */
export function playTrack(track: AmbientMusicTrack): void {
  stopAudio();
  sig.setEmbed(null);
  ambient.update((a) => { a.musicItem = undefined; a.musicTrack = track; });
  syncMusic(track !== "none");
}

/** Play an item from the library or the radio list. */
export function playItem(id: string): void {
  const item = findItem(id);
  if (!item) return;
  syncMusic(false);
  ambient.update((a) => { a.musicItem = id; a.musicPlaying = true; });
  if (item.kind === "file" || item.kind === "stream") { sig.setEmbed(null); void playAudioItem(item); }
  else { stopAudio(); sig.setEmbed(item); }
}

export const isPlaying = () => ambient.state.musicPlaying;

export function togglePlay(): void {
  const item = currentItem();
  if (!item) { syncMusic(!ambient.state.musicPlaying && ambient.state.musicTrack !== "none"); return; }
  if (item.kind === "file" || item.kind === "stream") {
    if (ambient.state.musicPlaying) { audio?.pause(); ambient.update((a) => { a.musicPlaying = false; }); }
    else if (audio?.src) { void audio.play(); ambient.update((a) => { a.musicPlaying = true; }); }
    else playItem(item.id);
  } else {
    // Embedded players have their own controls; closing stops them.
    if (sig.embed()) { sig.setEmbed(null); ambient.update((a) => { a.musicPlaying = false; }); }
    else playItem(item.id);
  }
}

export function stopMusic(): void {
  stopAudio();
  sig.setEmbed(null);
  syncMusic(false);
  ambient.update((a) => { a.musicPlaying = false; });
}

/** Next file in the library (wraps), or the next built-in track. */
export async function next(): Promise<void> {
  const item = currentItem();
  if (item?.kind === "file") {
    const files = musicLibrary.state.items.filter((x) => x.kind === "file");
    const i = files.findIndex((x) => x.id === item.id);
    if (files.length) playItem(files[(i + 1) % files.length].id);
  }
}

export function setVolume(v: number): void {
  ambient.update((a) => { a.musicVolume = v; });
  if (audio) audio.volume = v;
  if (!currentItem()) syncMusic();
}

// ---------- Adding to the library ----------

const id = () => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function addFiles(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav,.flac";
  input.multiple = true;
  input.onchange = async () => {
    const files = [...(input.files ?? [])];
    let first: string | null = null;
    for (const f of files) {
      const key = id();
      try {
        await saveAudio(key, f);
        musicLibrary.update((m) => { m.items.push({ id: key, kind: "file", name: f.name.replace(/\.[^.]+$/, ""), ref: key }); });
        first ??= key;
      } catch { toast(t("music-add-failed"), true); }
    }
    if (first) playItem(first);
  };
  input.click();
}

/** Turn a pasted link into a playable item, or null when it isn't supported. */
export function parseMusicLink(raw: string): Omit<MusicItem, "id" | "name"> & { name: string } | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\.|^music\./, "");
  if (host === "youtube.com" || host === "youtu.be") {
    const v = host === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v") ?? (u.pathname.startsWith("/shorts/") || u.pathname.startsWith("/live/") ? u.pathname.split("/")[2] : null);
    const list = u.searchParams.get("list");
    const safe = (s: string | null) => (s && /^[\w-]+$/.test(s) ? s : null);
    if (safe(v)) return { kind: "youtube", name: "YouTube", ref: `https://www.youtube-nocookie.com/embed/${v}?autoplay=1${safe(list) ? `&list=${list}` : ""}`, source: raw };
    if (safe(list)) return { kind: "youtube", name: "YouTube", ref: `https://www.youtube-nocookie.com/embed/videoseries?list=${list}&autoplay=1`, source: raw };
    return null;
  }
  if (host === "open.spotify.com") {
    const m = /^\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/.exec(u.pathname);
    return m ? { kind: "spotify", name: "Spotify", ref: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, source: raw } : null;
  }
  if (host === "soundcloud.com" || host === "on.soundcloud.com") {
    return { kind: "soundcloud", name: "SoundCloud", ref: `https://w.soundcloud.com/player/?url=${encodeURIComponent(`https://soundcloud.com${u.pathname}`)}&auto_play=true&visual=false&hide_related=true`, source: raw };
  }
  if ((u.protocol === "https:" || u.protocol === "http:") && /\.(mp3|aac|m4a|ogg|opus|wav|flac)$|\/(stream|listen|live)\b|;stream/i.test(u.pathname + u.search)) {
    return { kind: "stream", name: u.hostname, ref: u.toString(), source: raw };
  }
  return null;
}

export function addLink(url: string, name?: string): boolean {
  const parsed = parseMusicLink(url);
  if (!parsed) { toast(t("music-link-unsupported"), true); return false; }
  const key = id();
  musicLibrary.update((m) => { m.items.push({ ...parsed, id: key, name: name?.trim() || parsed.name }); });
  playItem(key);
  return true;
}

export function renameItem(itemId: string, name: string): void {
  musicLibrary.update((m) => { const x = m.items.find((i) => i.id === itemId); if (x && name.trim()) x.name = name.trim(); });
}

export function removeItem(itemId: string): void {
  const item = musicLibrary.state.items.find((x) => x.id === itemId);
  if (!item) return;
  if (ambient.state.musicItem === itemId) stopMusic();
  if (item.kind === "file") void deleteAudio(item.ref).catch(() => undefined);
  musicLibrary.update((m) => { m.items = m.items.filter((x) => x.id !== itemId); });
}
