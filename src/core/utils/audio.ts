import type { SoundChannel } from '../types';

export type { SoundChannel };

export const SOUND_CHANNELS: SoundChannel[] = [
  'rain',
  'brown',
  'wind',
  'fireplace',
  'waves',
  'cafe',
  'birds'
];

export function createDefaultSoundChannels(): Record<SoundChannel, number> {
  return {
    rain: 0,
    brown: 0,
    wind: 0,
    fireplace: 0,
    waves: 0,
    cafe: 0,
    birds: 0
  };
}

/** Real recordings for these channels (public/sounds, see CREDITS.md); the rest are generated. */
const RECORDINGS: Partial<Record<SoundChannel, { url: string; gain: number }>> = {
  cafe: { url: 'sounds/cafe.ogg', gain: 0.55 },
  waves: { url: 'sounds/waves.ogg', gain: 1.05 },
  fireplace: { url: 'sounds/fireplace.ogg', gain: 3.2 },
  birds: { url: 'sounds/birds.ogg', gain: 2.0 },
  rain: { url: 'sounds/rain.ogg', gain: 1.25 },
  wind: { url: 'sounds/wind.ogg', gain: 0.9 },
};

/** Make a loop seamless: blend the last `sec` seconds into the start and drop them from the end. */
function crossfadeLoop(ctx: AudioContext, src: AudioBuffer, sec: number): AudioBuffer {
  const fade = Math.min(Math.floor(sec * src.sampleRate), Math.floor(src.length / 4));
  const len = src.length - fade;
  const out = ctx.createBuffer(src.numberOfChannels, len, src.sampleRate);
  for (let c = 0; c < src.numberOfChannels; c++) {
    const a = src.getChannelData(c);
    const b = out.getChannelData(c);
    b.set(a.subarray(0, len));
    for (let i = 0; i < fade; i++) {
      const x = i / fade;
      // Equal-power crossfade from the tail into the head.
      b[i] = a[i] * Math.sin((x * Math.PI) / 2) + a[len + i] * Math.cos((x * Math.PI) / 2);
    }
  }
  return out;
}

class FocusAudioEngine {
  private ctx: AudioContext | null = null;
  private sources: Partial<
    Record<
      SoundChannel,
      {
        node?: AudioBufferSourceNode;
        gain: GainNode;
        lfo?: OscillatorNode;
        lfoGain?: GainNode;
        extraOsc?: OscillatorNode;
      }
    >
  > = {};
  public volumes: Record<SoundChannel, number> = createDefaultSoundChannels();

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public setVolume(channel: SoundChannel, value: number): void {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
    this.volumes[channel] = clamped;
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (clamped > 0) {
      if (!this.sources[channel]) {
        this.startChannel(ctx, channel);
      }
      const entry = this.sources[channel];
      if (entry) {
        const rec = RECORDINGS[channel];
        const gainScale = rec ? rec.gain * 0.5 : channel === 'waves' || channel === 'cafe' ? 0.36 : 0.32;
        entry.gain.gain.setTargetAtTime(clamped * gainScale, ctx.currentTime, 0.06);
      }
    } else if (this.sources[channel]) {
      this.sources[channel]!.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.06);
    }
  }

  public stopAll(): void {
    SOUND_CHANNELS.forEach(ch => {
      this.volumes[ch] = 0;
      const entry = this.sources[ch];
      if (entry && this.ctx) {
        entry.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
      }
    });
  }

  private startChannel(ctx: AudioContext, channel: SoundChannel): void {
    const rec = RECORDINGS[channel];
    if (rec) {
      // A recording: start silent, fade in once it has loaded.
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
      const entry: { node?: AudioBufferSourceNode; gain: GainNode } = { gain };
      this.sources[channel] = entry;
      void fetch(rec.url)
        .then((r) => r.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buf) => {
          if (this.sources[channel] !== entry) return;
          const node = ctx.createBufferSource();
          node.buffer = crossfadeLoop(ctx, buf, 1.5);
          node.loop = true;
          node.connect(gain);
          node.start();
          entry.node = node;
        })
        .catch(() => {
          // Couldn't load the file: fall back to the generated sound.
          if (this.sources[channel] !== entry) return;
          gain.disconnect();
          delete this.sources[channel];
          this.startSynth(ctx, channel);
          this.setVolume(channel, this.volumes[channel]);
        });
      return;
    }
    this.startSynth(ctx, channel);
  }

  private startSynth(ctx: AudioContext, channel: SoundChannel): void {
    const durationSec = channel === 'waves' || channel === 'birds' ? 5 : 3;
    const bufferSize = ctx.sampleRate * durationSec;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      if (channel === 'brown') {
        data[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = data[i];
        data[i] *= 3.0;
      } else if (channel === 'rain') {
        data[i] = white * (Math.random() > 0.985 ? 1.4 : 0.38);
      } else if (channel === 'fireplace') {
        // Warm low rumble mixed with crisp occasional wood crackles
        lastOut = (lastOut + 0.03 * white) / 1.03;
        const crackle = Math.random() > 0.9965 ? (Math.random() * 2 - 1) * 1.9 : 0;
        const pop = Math.random() > 0.9992 ? (Math.random() > 0.5 ? 2.4 : -2.4) : 0;
        data[i] = lastOut * 2.1 + crackle * 0.65 + pop * 0.5;
      } else if (channel === 'waves') {
        // Pink-tinted surf shaped dynamically by LFO + subtle foam hiss
        lastOut = (lastOut + 0.045 * white) / 1.045;
        data[i] = lastOut * 2.4 + white * 0.08;
      } else if (channel === 'cafe') {
        // Soft mid-warm crowd murmur + gentle clink overtones
        lastOut = (lastOut + 0.09 * white) / 1.09;
        const murmurMod = 0.72 + 0.28 * Math.sin((i / ctx.sampleRate) * 2.7);
        const clink = Math.random() > 0.9997 ? Math.sin(i * 0.45) * 0.85 : 0;
        data[i] = lastOut * 1.65 * murmurMod + clink;
      } else if (channel === 'birds') {
        // Gentle leaf rustle with occasional harmonic woodland whistles
        lastOut = (lastOut + 0.05 * white) / 1.05;
        const t = i / ctx.sampleRate;
        const phrase = Math.sin(t * 1.9) > 0.86 ? Math.sin(t * (2400 + Math.sin(t * 32) * 380) * 2 * Math.PI) * 0.22 : 0;
        data[i] = lastOut * 0.9 + phrase;
      } else {
        // Soft wind
        data[i] = (lastOut + 0.06 * white) / 1.06;
        lastOut = data[i];
      }
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    if (channel === 'rain') {
      filter.type = 'bandpass';
      filter.frequency.value = 1150;
      filter.Q.value = 0.65;
    } else if (channel === 'brown') {
      filter.type = 'lowpass';
      filter.frequency.value = 320;
    } else if (channel === 'fireplace') {
      filter.type = 'lowpass';
      filter.frequency.value = 1450;
    } else if (channel === 'waves') {
      filter.type = 'lowpass';
      filter.frequency.value = 680;
    } else if (channel === 'cafe') {
      filter.type = 'bandpass';
      filter.frequency.value = 620;
      filter.Q.value = 0.55;
    } else if (channel === 'birds') {
      filter.type = 'bandpass';
      filter.frequency.value = 1950;
      filter.Q.value = 0.45;
    } else {
      filter.type = 'lowpass';
      filter.frequency.value = 520;
    }

    const gain = ctx.createGain();
    gain.gain.value = 0;

    let lfo: OscillatorNode | undefined;
    let lfoGain: GainNode | undefined;

    if (channel === 'waves' || channel === 'wind') {
      lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = channel === 'waves' ? 0.14 : 0.22;
      lfoGain = ctx.createGain();
      lfoGain.gain.value = channel === 'waves' ? 360 : 190;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();
    }

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start();

    this.sources[channel] = { node: noise, gain, lfo, lfoGain };
  }

  public playChime(): void {
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(528, ctx.currentTime);
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 1.3);
    } catch {
      // ignore audio failure
    }
  }
}

export const focusAudio = new FocusAudioEngine();
