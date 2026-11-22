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
import Hls from "hls.js";

export type MusicKind = "file" | "stream" | "youtube" | "spotify" | "soundcloud";
export interface MusicItem { id: string; kind: MusicKind; name: string; /** File: storage key; stream: URL; embeds: embed URL. */ ref: string; source?: string; /** Other addresses for the same stream, tried in turn. */ alts?: string[] }

export const musicLibrary = appDoc<{ items: MusicItem[] }>("music", () => ({ items: [] }));

// A station can list several addresses; they are tried in turn.
const station = (id: string, name: string, source: string, urls: string[]): MusicItem => ({ id, kind: "stream", name, source, ref: urls[0], alts: urls.slice(1) });

/** Free internet radio (needs a connection). */
export const RADIO: MusicItem[] = [
  station("radio-javan", "Radio Javan", "Radio Javan", ["https://radio.sr-api.ir/hls/stream.m3u8", "https://radio2.sr-api.ir/hls/stream.m3u8", "https://51.254.225.31/hls/stream.m3u8", "https://rjtvhls.wns.live/hls/stream.m3u8"]),
  station("radio-faaz", "Radio Faaz", "Radio Faaz", ["http://www.radiofaaz.com:8000/radiofaaz.m3u"]),
  station("radio-rp-mellow", "Mellow mix", "Radio Paradise", ["https://stream.radioparadise.com/mellow-128", "http://stream.radioparadise.com/mellow-128", "https://stream.radioparadise.com/mellow-64"]),
  station("radio-rp-main", "Main mix", "Radio Paradise", ["https://stream.radioparadise.com/mp3-128", "http://stream.radioparadise.com/mp3-128", "https://stream.radioparadise.com/aac-64"]),
  station("radio-nightride", "Nightride", "Nightride FM", ["https://stream.nightride.fm/nightride.mp3", "https://stream.nightride.fm/nightride.m4a"]),
  station("radio-kexp", "KEXP", "KEXP", ["https://kexp-mp3-128.streamguys1.com/kexp128.mp3", "https://kexp.streamguys1.com/kexp160.aac"]),
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
/** Plays HLS (.m3u8) streams, which the browser audio element cannot play by itself. */
let hls: Hls | null = null;
let objectUrl: string | null = null;

// Position of the playing file, for the seek bar.
const pos = createRoot(() => {
  const [time, setTime] = createSignal(0);
  const [duration, setDuration] = createSignal(0);
  return { time, setTime, duration, setDuration };
});
export const musicTime = pos.time;
export const musicDuration = pos.duration;
/** Jump forward or back by `sec` seconds in the playing file. */
export function seekBy(sec: number): void {
  if (!audio || !Number.isFinite(audio.duration)) return;
  audio.currentTime = Math.max(0, Math.min(audio.duration - 0.25, audio.currentTime + sec));
  pos.setTime(audio.currentTime);
}
export function seekTo(sec: number): void {
  if (!audio || !Number.isFinite(audio.duration)) return;
  audio.currentTime = Math.max(0, Math.min(audio.duration - 0.25, sec));
  pos.setTime(audio.currentTime);
}

function stopAudio() {
  attempt++; // stops a stream that is still trying its addresses
  hls?.destroy();
  hls = null;
  if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); }
  if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
}

let attempt = 0;
/** A .m3u link is a text playlist: return the first real stream address in it. */
async function resolveStream(url: string): Promise<string | null> {
  if (!/\.m3u(\?|$)/i.test(url)) return url;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const line = (await res.text()).split(/\r?\n/).map((l) => l.trim()).find((l) => /^https?:\/\//i.test(l));
  return line ?? null;
}
function attachStream(el: HTMLAudioElement, url: string) {
  hls?.destroy();
  hls = null;
  if (/\.m3u8(\?|$)/i.test(url) && Hls.isSupported()) {
    const h = new Hls();
    hls = h;
    h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) el.dispatchEvent(new Event("error")); });
    h.loadSource(url);
    h.attachMedia(el);
    return;
  }
  el.src = url;
}

async function playAudioItem(item: MusicItem) {
  audio ??= new Audio();
  stopAudio();
  const run = ++attempt;
  const el = audio;
  el.volume = ambient.state.musicVolume;
  el.onended = () => void next();
  el.ontimeupdate = () => pos.setTime(el.currentTime);
  el.ondurationchange = () => pos.setDuration(Number.isFinite(el.duration) ? el.duration : 0);
  pos.setTime(0);
  pos.setDuration(0);
  if (item.kind === "file") {
    const blob = await loadAudio(item.ref).catch(() => undefined);
    if (!blob) { toast(t("music-file-missing"), true); return; }
    objectUrl = URL.createObjectURL(blob);
    el.src = objectUrl;
    el.loop = musicLibrary.state.items.filter((x) => x.kind === "file").length <= 1;
    el.oncanplay = () => sig.setLoading(false);
    el.onerror = () => sig.setLoading(false);
    sig.setLoading(true);
    await el.play().catch(() => sig.setLoading(false));
    return;
  }
  // Streams: try each address; move on after an error or 12 seconds of silence.
  const urls = [item.ref, ...(item.alts ?? [])];
  el.loop = false;
  sig.setLoading(true);
  for (const url of urls) {
    if (run !== attempt) return;
    const target = await resolveStream(url).catch(() => null);
    if (run !== attempt) return;
    if (!target) continue;
    const ok = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 12_000);
      el.onplaying = () => { clearTimeout(timer); resolve(true); };
      el.onerror = () => { clearTimeout(timer); resolve(false); };
      attachStream(el, target);
      void el.play().catch((e: DOMException) => { if (e?.name !== "AbortError") { clearTimeout(timer); resolve(false); } });
    });
    if (run !== attempt) return;
    if (ok) {
      sig.setLoading(false);
      // A stream that drops later gets one more try from the top.
      el.onerror = () => { if (run === attempt && ambient.state.musicPlaying) void playAudioItem(item); };
      return;
    }
  }
  sig.setLoading(false);
  el.removeAttribute("src");
  ambient.update((a) => { a.musicPlaying = false; });
  toast(t("music-radio-offline"), true);
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
