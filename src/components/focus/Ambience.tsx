// Ambience: weather effects, background sounds and music in one place. Opened
// from the button next to Settings; the same controls appear on the Zen page.
// Links (YouTube, Spotify, SoundCloud) play in a small dock that stays open
// while you work.
import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import {
  AudioLines, Bird, Coffee, CloudRain, CloudSnow, Flame, Leaf, Link2, Minus, Music, Pause, Play, Plus, Radio, SkipForward, Sparkles, Square, Star,
  Trash2, Upload, Waves, Wind, X, Ban, Flower2, Volume2,
} from "lucide-solid";
import { t, type MessageKey } from "../../i18n";
import { AMBIENT_MUSIC_TRACKS } from "../../core/utils/ambientMusic";
import { SOUND_CHANNELS } from "../../core/utils/audio";
import type { AmbientEffectType, SoundChannel } from "../../core/types";
import { ambient, setChannel, zen } from "../../state/focus";
import { settings, updateSettings } from "../../state/settings";
import { RADIO, addFiles, addLink, currentEmbed, currentItem, isPlaying, musicLibrary, musicLoading, next, playItem, playTrack, removeItem, setVolume, stopMusic, togglePlay } from "../../state/music";
import { askText } from "../../state/ui";
import { Toggle } from "../controls";
import { openMenu } from "../ContextMenu";

const EFFECT_ICONS: { id: AmbientEffectType; icon: typeof Leaf }[] = [
  { id: "none", icon: Ban },
  { id: "snow", icon: CloudSnow },
  { id: "rain", icon: CloudRain },
  { id: "autumn", icon: Leaf },
  { id: "sakura", icon: Flower2 },
  { id: "fireflies", icon: Sparkles },
  { id: "starfield", icon: Star },
];

const SOUND_ICONS: Record<SoundChannel, typeof Leaf> = { rain: CloudRain, brown: AudioLines, wind: Wind, fireplace: Flame, waves: Waves, cafe: Coffee, birds: Bird };

function Effects() {
  const pick = (id: AmbientEffectType) => {
    ambient.update((a) => { a.effect = id; });
    if (id !== "none" && !settings.ambientEffectsEnabled) updateSettings((c) => { c.ambientEffectsEnabled = true; });
  };
  const piles = () => ["snow", "rain", "autumn", "sakura"].includes(ambient.state.effect);
  return (
    <div class="amb-section">
      <div class="amb-tiles" role="radiogroup" aria-label={t("focus-effect")}>
        <For each={EFFECT_ICONS}>
          {(e) => (
            <button role="radio" class="amb-tile" aria-checked={ambient.state.effect === e.id} title={t(`effect-${e.id}`)} onClick={() => pick(e.id)}>
              <e.icon aria-hidden="true" /><span>{t(`effect-${e.id}`)}</span>
            </button>
          )}
        </For>
      </div>
      <Show when={ambient.state.effect !== "none"}>
        <label class="amb-slider"><span>{t("focus-density")}</span><input type="range" min="20" max="100" value={ambient.state.density} onInput={(e) => { const v = Number(e.currentTarget.value); ambient.update((a) => { a.density = v; }); }} /></label>
        <label class="amb-slider"><span>{t("focus-wind")}</span><input type="range" min="-10" max="10" value={ambient.state.wind} onInput={(e) => { const v = Number(e.currentTarget.value); ambient.update((a) => { a.wind = v; }); }} /></label>
        <Show when={piles()}>
          <label class="amb-slider"><span>{t("amb-pile")}</span><input type="range" min="0" max="60" step="2" value={ambient.state.maxPileHeight} onInput={(e) => { const v = Number(e.currentTarget.value); ambient.update((a) => { a.maxPileHeight = v; }); }} /></label>
          <p class="amb-hint">{t("amb-sweep-hint")}</p>
        </Show>
      </Show>
      <Toggle label={t("amb-soft-background")} checked={settings.appearance.ambientMesh} onChange={(v) => updateSettings((c) => { c.appearance.ambientMesh = v; })} />
    </div>
  );
}

function Sounds() {
  return (
    <div class="amb-sounds">
      <For each={SOUND_CHANNELS}>
        {(ch) => {
          const I = SOUND_ICONS[ch];
          const v = () => zen.state.soundChannels[ch] ?? 0;
          return (
            <label class="amb-sound" classList={{ on: v() > 0 }} title={t(`sound-${ch}`)}>
              <I aria-hidden="true" />
              <span>{t(`sound-${ch}`)}</span>
              <input type="range" min="0" max="1" step="0.05" value={v()} aria-label={t(`sound-${ch}`)} onInput={(e) => setChannel(ch, Number(e.currentTarget.value))} />
            </label>
          );
        }}
      </For>
    </div>
  );
}

function Music_() {
  const nowName = () => {
    const item = currentItem();
    if (item) return item.name;
    return ambient.state.musicTrack !== "none" ? t(`music-${ambient.state.musicTrack}` as MessageKey) : t("focus-music-none");
  };
  const playing = () => isPlaying() || !!currentEmbed();
  const activeTrack = (id: string) => !currentItem() && ambient.state.musicTrack === id && isPlaying();
  const activeItem = (id: string) => ambient.state.musicItem === id && playing();
  const addLinkPrompt = async () => {
    const v = await askText(t("music-add-link"), "", t("action-add"));
    if (v?.trim()) addLink(v);
  };
  const itemMenu = (e: MouseEvent, id: string, name: string) => {
    e.preventDefault();
    openMenu(e, [
      { label: t("action-rename"), run: async () => { const v = await askText(t("action-rename"), name, t("action-rename")); if (v) musicLibrary.update((m) => { const x = m.items.find((i) => i.id === id); if (x) x.name = v.trim(); }); } },
      { label: t("action-delete"), danger: true, run: () => removeItem(id) },
    ]);
  };
  return (
    <div class="amb-section">
      <div class="amb-now">
        <button class="icon-btn" aria-label={playing() ? t("focus-pause") : t("focus-start")} title={playing() ? t("focus-pause") : t("focus-start")} onClick={togglePlay} disabled={!currentItem() && ambient.state.musicTrack === "none"}>
          {playing() ? <Pause /> : <Play />}
        </button>
        <div class="amb-now-text">
          <strong dir="auto">{nowName()}</strong>
          <span>{musicLoading() ? t("music-loading") : currentItem()?.source && currentItem()!.kind === "stream" ? currentItem()!.source : currentItem() ? t(`music-kind-${currentItem()!.kind}` as MessageKey) : t("music-kind-built-in")}</span>
        </div>
        <Show when={currentItem()?.kind === "file"}><button class="icon-btn sm" title={t("music-next")} aria-label={t("music-next")} onClick={() => void next()}><SkipForward /></button></Show>
        <Show when={playing()}><button class="icon-btn sm" title={t("music-stop")} aria-label={t("music-stop")} onClick={stopMusic}><Square /></button></Show>
      </div>
      <label class="amb-slider"><Volume2 aria-hidden="true" /><input type="range" min="0" max="1" step="0.05" value={ambient.state.musicVolume} aria-label={t("focus-volume")} onInput={(e) => setVolume(Number(e.currentTarget.value))} /></label>

      <h4 class="amb-sub"><Music aria-hidden="true" />{t("music-built-in")}</h4>
      <div class="amb-list">
        <For each={AMBIENT_MUSIC_TRACKS}>
          {(tr) => <button class="amb-item" aria-pressed={activeTrack(tr.id)} onClick={() => (activeTrack(tr.id) ? stopMusic() : playTrack(tr.id))}><span dir="auto">{t(`music-${tr.id}`)}</span></button>}
        </For>
      </div>

      <h4 class="amb-sub"><Radio aria-hidden="true" />{t("music-radio")}</h4>
      <div class="amb-list">
        <For each={RADIO}>{(r) => <button class="amb-item" aria-pressed={activeItem(r.id)} onClick={() => (activeItem(r.id) ? stopMusic() : playItem(r.id))}><span>{r.name}</span></button>}</For>
      </div>

      <h4 class="amb-sub"><Upload aria-hidden="true" />{t("music-mine")}</h4>
      <Show when={musicLibrary.state.items.length} fallback={<p class="amb-hint">{t("music-mine-empty")}</p>}>
        <ul class="amb-mine">
          <For each={musicLibrary.state.items}>
            {(it) => (
              <li onContextMenu={(e) => itemMenu(e, it.id, it.name)}>
                <button class="amb-item" aria-pressed={activeItem(it.id)} onClick={() => (activeItem(it.id) ? stopMusic() : playItem(it.id))}>
                  {it.kind === "file" ? <Music aria-hidden="true" /> : it.kind === "stream" ? <Radio aria-hidden="true" /> : <Link2 aria-hidden="true" />}
                  <span dir="auto">{it.name}</span>
                </button>
                <button class="icon-btn sm ghost" title={t("action-delete")} aria-label={t("action-delete")} onClick={() => removeItem(it.id)}><Trash2 /></button>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <div class="row wrap">
        <button class="btn sm" onClick={addFiles}><Upload />{t("music-add-files")}</button>
        <button class="btn sm" onClick={() => void addLinkPrompt()}><Link2 />{t("music-add-link")}</button>
      </div>
    </div>
  );
}

type Tab = "effects" | "sounds" | "music";
const [ambTab, setAmbTab] = createSignal<Tab>("effects");

/** Tabs with the three groups; used in the popover and on the Zen page. */
export function AmbienceControls() {
  const tabs: { id: Tab; icon: typeof Leaf; key: MessageKey }[] = [
    { id: "effects", icon: CloudSnow, key: "amb-effects" },
    { id: "sounds", icon: Waves, key: "amb-sounds" },
    { id: "music", icon: Music, key: "focus-music" },
  ];
  return (
    <div class="amb">
      <div class="segmented amb-tabs" role="tablist">
        <For each={tabs}>{(x) => <button role="tab" aria-selected={ambTab() === x.id} onClick={() => setAmbTab(x.id)}><x.icon aria-hidden="true" /><span class="seg-label">{t(x.key)}</span></button>}</For>
      </div>
      <div class="amb-body">
        <Show when={ambTab() === "effects"}><Effects /></Show>
        <Show when={ambTab() === "sounds"}><Sounds /></Show>
        <Show when={ambTab() === "music"}><Music_ /></Show>
      </div>
    </div>
  );
}

const [ambOpen, setAmbOpen] = createSignal(false);
export { ambOpen, setAmbOpen };

/** Popover above the footer button. */
export function AmbiencePopover() {
  let el!: HTMLDivElement;
  const onDoc = (e: MouseEvent) => {
    if (!ambOpen()) return;
    const target = e.target as HTMLElement;
    if (el.contains(target) || target.closest(".amb-toggle, .menu, .modal-scrim")) return;
    setAmbOpen(false);
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && ambOpen()) setAmbOpen(false); };
  onMount(() => { document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey); });
  onCleanup(() => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); });
  return (
    <Show when={ambOpen()}>
      <div ref={el} class="amb-popover glass" role="dialog" aria-label={t("footer-ambient")}>
        <header class="amb-head">
          <h3>{t("footer-ambient")}</h3>
          <button class="icon-btn sm" title={t("action-close")} aria-label={t("action-close")} onClick={() => setAmbOpen(false)}><X /></button>
        </header>
        <AmbienceControls />
      </div>
    </Show>
  );
}

/** Embedded player for links; stays mounted so music keeps playing. */
export function MusicDock() {
  const [small, setSmall] = createSignal(false);
  return (
    <Show when={currentEmbed()} keyed>
      {(item) => (
        <div class="music-dock glass" classList={{ small: small(), [`k-${item.kind}`]: true }} role="region" aria-label={t("music-player")}>
          <div class="music-dock-head">
            <Music aria-hidden="true" />
            <span dir="auto">{item.name}</span>
            <button class="icon-btn sm" title={small() ? t("music-expand") : t("music-minimize")} aria-label={small() ? t("music-expand") : t("music-minimize")} onClick={() => setSmall(!small())}>{small() ? <Plus /> : <Minus />}</button>
            <button class="icon-btn sm" title={t("music-stop")} aria-label={t("music-stop")} onClick={stopMusic}><X /></button>
          </div>
          <iframe
            class="music-dock-frame"
            src={item.ref}
            title={item.name}
            allow="autoplay; encrypted-media; clipboard-write; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            loading="eager"
          />
        </div>
      )}
    </Show>
  );
}
