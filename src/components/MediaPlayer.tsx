// A small player for audio and video embedded in notes: play, seek, time,
// skip 10 seconds, mute, speed and full screen (video).
import { Show, createSignal, onCleanup } from "solid-js";
import { Dynamic, render } from "solid-js/web";
import { Maximize2, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-solid";
import { t } from "../i18n";

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(sec).padStart(2, "0")}`;
};
const SPEEDS = [1, 1.25, 1.5, 2, 0.75];

export function MediaPlayer(props: { kind: "audio" | "video"; src: string; name: string }) {
  let media!: HTMLMediaElement;
  let box!: HTMLDivElement;
  const [playing, setPlaying] = createSignal(false);
  const [time, setTime] = createSignal(0);
  const [dur, setDur] = createSignal(0);
  const [muted, setMuted] = createSignal(false);
  const [speed, setSpeed] = createSignal(1);
  const [volume, setVolume] = createSignal(1);
  const toggle = () => (media.paused ? void media.play().catch(() => undefined) : media.pause());
  const skip = (d: number) => { media.currentTime = Math.max(0, Math.min(dur() || 0, media.currentTime + d)); };
  const nextSpeed = () => {
    const s = SPEEDS[(SPEEDS.indexOf(speed()) + 1) % SPEEDS.length];
    media.playbackRate = s;
    setSpeed(s);
  };
  const full = () => (document.fullscreenElement ? void document.exitFullscreen() : void box.requestFullscreen?.().catch(() => undefined));
  const key = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).matches("input")) return;
    if (e.key === " " || e.key === "k") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowRight" || e.key === "l") { e.preventDefault(); skip(e.key === "l" ? 10 : 5); }
    else if (e.key === "ArrowLeft" || e.key === "j") { e.preventDefault(); skip(e.key === "j" ? -10 : -5); }
    else if (e.key === "m") { media.muted = !media.muted; }
    else if (e.key === "f" && props.kind === "video") full();
  };
  onCleanup(() => media?.pause());
  return (
    <div ref={box} class={`media-player ${props.kind}`} classList={{ playing: playing() }} dir="ltr" tabIndex={0} onKeyDown={key} aria-label={props.name}>
      <Dynamic
        component={props.kind}
        ref={(el: HTMLMediaElement) => (media = el)}
        src={props.src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={() => setTime(media.currentTime)}
        onLoadedMetadata={() => setDur(media.duration)}
        onDurationChange={() => setDur(media.duration)}
        onVolumeChange={() => { setMuted(media.muted); setVolume(media.volume); }}
        onClick={toggle}
        onDblClick={full}
      />
      <Show when={props.kind === "audio"}>
        <div class="mp-name" dir="auto">{props.name}</div>
      </Show>
      <div class="mp-bar">
        <button class="icon-btn mp-play" aria-label={playing() ? t("focus-pause") : t("pet-play")} onClick={toggle}>
          <Show when={playing()} fallback={<Play />}><Pause /></Show>
        </button>
        <button class="icon-btn" aria-label={t("player-back")} title={t("player-back")} onClick={() => skip(-10)}><RotateCcw /></button>
        <button class="icon-btn" aria-label={t("player-forward")} title={t("player-forward")} onClick={() => skip(10)}><RotateCw /></button>
        <span class="mp-time">{fmt(time())}</span>
        <input
          class="mp-seek range"
          type="range"
          min="0"
          max={dur() || 0}
          step="0.1"
          value={time()}
          aria-label={t("player-seek")}
          onInput={(e) => { media.currentTime = Number(e.currentTarget.value); setTime(media.currentTime); }}
        />
        <span class="mp-time">{fmt(dur())}</span>
        <button class="mp-speed" aria-label={t("player-speed")} title={t("player-speed")} onClick={nextSpeed}>{speed()}×</button>
        <span class="mp-volume">
          <button class="icon-btn" aria-label={muted() ? t("player-unmute") : t("player-mute")} onClick={() => (media.muted = !media.muted)}>
            <Show when={muted() || volume() === 0} fallback={<Volume2 />}><VolumeX /></Show>
          </button>
          <input class="range mp-vol" type="range" min="0" max="1" step="0.05" value={muted() ? 0 : volume()} aria-label={t("player-volume")}
            onInput={(e) => { const v = Number(e.currentTarget.value); media.volume = v; media.muted = v === 0; }} />
        </span>
        <Show when={props.kind === "video"}>
          <button class="icon-btn" aria-label={t("player-fullscreen")} title={t("player-fullscreen")} onClick={full}><Maximize2 /></button>
        </Show>
      </div>
    </div>
  );
}

/** Mount a player into plain DOM (rendered Markdown). Returns its disposer. */
export function mountPlayer(host: HTMLElement, kind: "audio" | "video", src: string, name: string): () => void {
  return render(() => <MediaPlayer kind={kind} src={src} name={name} />, host);
}
