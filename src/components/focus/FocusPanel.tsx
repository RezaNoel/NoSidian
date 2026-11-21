// Right sidebar "Focus" tab: timer, Zen links and the ambience button.
import { For } from "solid-js";
import { CloudSun, Maximize2 } from "lucide-solid";
import { setAmbOpen } from "./Ambience";
import { t } from "../../i18n";
import { SOUND_CHANNELS } from "../../core/utils/audio";
import { setChannel, setZenOpen, zen } from "../../state/focus";
import { openView } from "../../state/views";
import { MiniTimer } from "./MiniTimer";

export function Mixer() {
  return (
    <div class="mixer">
      <For each={SOUND_CHANNELS}>
        {(ch) => (
          <label class="mixer-row">
            <span>{t(`sound-${ch}`)}</span>
            <input type="range" min="0" max="1" step="0.05" value={zen.state.soundChannels[ch] ?? 0} onInput={(e) => setChannel(ch, Number(e.currentTarget.value))} />
          </label>
        )}
      </For>
    </div>
  );
}

export function FocusPanel() {
  return (
    <div class="stack">
      <MiniTimer />
      <div class="row">
        <button class="btn sm" onClick={() => setZenOpen(true)}><Maximize2 />{t("focus-zen-mode")}</button>
        <button class="btn sm" onClick={() => void openView("zen")}>{t("view-zen")}</button>
      </div>
      <button class="btn sm amb-toggle" onClick={() => setAmbOpen(true)}><CloudSun />{t("footer-ambient")}</button>
    </div>
  );
}
