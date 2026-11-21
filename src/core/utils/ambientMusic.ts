import type { AmbientMusicTrack } from '../types';

export interface AmbientTrackMeta {
  id: Exclude<AmbientMusicTrack, 'none' | 'custom'>;
  label: string;
  tempoBpm: number;
  mood: string;
}

export const AMBIENT_MUSIC_TRACKS: AmbientTrackMeta[] = [
  { id: 'lofi', label: 'Lo-Fi Study', tempoBpm: 72, mood: 'Dusty rhodes & soft beat' },
  { id: 'piano', label: 'Warm Piano', tempoBpm: 66, mood: 'Felt keys & gentle arpeggios' },
  { id: 'forest', label: 'Forest Drift', tempoBpm: 58, mood: 'Woodwind fifths & moss pads' },
  { id: 'cosmos', label: 'Deep Cosmos', tempoBpm: 48, mood: 'Sub-bass & celestial shimmer' },
  { id: 'binaural', label: 'Alpha Binaural', tempoBpm: 60, mood: '432Hz + 10Hz alpha focus' },
  { id: 'rainy-jazz', label: 'Rainy Café Jazz', tempoBpm: 78, mood: 'Maj9 chords & walking bass' },
  { id: 'synthwave', label: 'Nightwave Chill', tempoBpm: 86, mood: 'Warm analog arp & sub' },
  { id: 'zen-bells', label: 'Temple Zen Bells', tempoBpm: 52, mood: 'Pentatonic singing bowls' }
];

type SynthTrackId = Exclude<AmbientMusicTrack, 'none' | 'custom'>;

interface TrackArrangement {
  stepMs: number;
  chords: number[][];
  bassline: number[];
  wave: OscillatorType;
  subWave: OscillatorType;
  filterHz: number;
  arpSpreadSec: number;
  attackSec: number;
  releaseSec: number;
  hasPulseBeat?: boolean;
  detuneCents?: number;
  binauralBeatHz?: number;
  overtoneRatio?: number;
}

const ARRANGEMENTS: Record<SynthTrackId, TrackArrangement> = {
  lofi: {
    stepMs: 1650,
    wave: 'triangle',
    subWave: 'sine',
    filterHz: 760,
    arpSpreadSec: 0.08,
    attackSec: 0.09,
    releaseSec: 1.75,
    hasPulseBeat: true,
    detuneCents: 6,
    chords: [
      [261.63, 329.63, 392.0, 493.88], // Cmaj7
      [220.0, 261.63, 329.63, 392.0], // Am7
      [174.61, 220.0, 261.63, 329.63], // Fmaj7
      [196.0, 246.94, 293.66, 349.23] // G7
    ],
    bassline: [130.81, 110.0, 87.31, 98.0]
  },
  piano: {
    stepMs: 1250,
    wave: 'sine',
    subWave: 'triangle',
    filterHz: 1450,
    arpSpreadSec: 0.17,
    attackSec: 0.03,
    releaseSec: 1.65,
    overtoneRatio: 2,
    chords: [
      [293.66, 349.23, 440.0, 523.25], // Dm7
      [261.63, 329.63, 392.0, 493.88], // Cmaj7
      [220.0, 261.63, 329.63, 440.0], // Am
      [246.94, 293.66, 392.0, 493.88] // G/B
    ],
    bassline: [146.83, 130.81, 110.0, 123.47]
  },
  forest: {
    stepMs: 2150,
    wave: 'sine',
    subWave: 'sine',
    filterHz: 980,
    arpSpreadSec: 0.24,
    attackSec: 0.28,
    releaseSec: 2.35,
    detuneCents: 4,
    chords: [
      [196.0, 293.66, 392.0, 587.33],
      [220.0, 329.63, 440.0, 659.25],
      [164.81, 246.94, 329.63, 493.88],
      [174.61, 261.63, 349.23, 523.25]
    ],
    bassline: [98.0, 110.0, 82.41, 87.31]
  },
  cosmos: {
    stepMs: 2650,
    wave: 'sine',
    subWave: 'sine',
    filterHz: 680,
    arpSpreadSec: 0.35,
    attackSec: 0.55,
    releaseSec: 3.1,
    detuneCents: 11,
    overtoneRatio: 1.5,
    chords: [
      [130.81, 196.0, 246.94, 392.0],
      [146.83, 220.0, 261.63, 440.0],
      [110.0, 164.81, 246.94, 329.63],
      [123.47, 185.0, 246.94, 369.99]
    ],
    bassline: [65.41, 73.42, 55.0, 61.74]
  },
  binaural: {
    stepMs: 2400,
    wave: 'sine',
    subWave: 'sine',
    filterHz: 820,
    arpSpreadSec: 0.05,
    attackSec: 0.45,
    releaseSec: 2.6,
    binauralBeatHz: 10, // Alpha focus wave (10 Hz delta)
    chords: [
      [216.0, 324.0, 432.0],
      [216.0, 288.0, 432.0],
      [192.0, 288.0, 384.0]
    ],
    bassline: [108.0, 108.0, 96.0]
  },
  'rainy-jazz': {
    stepMs: 1480,
    wave: 'triangle',
    subWave: 'triangle',
    filterHz: 1050,
    arpSpreadSec: 0.11,
    attackSec: 0.05,
    releaseSec: 1.4,
    hasPulseBeat: true,
    detuneCents: 5,
    chords: [
      [233.08, 293.66, 349.23, 440.0, 523.25], // Bbmaj9
      [196.0, 233.08, 293.66, 349.23], // Gm7
      [261.63, 311.13, 392.0, 466.16], // Cm7
      [174.61, 220.0, 261.63, 311.13, 392.0] // F9
    ],
    bassline: [116.54, 98.0, 130.81, 87.31]
  },
  synthwave: {
    stepMs: 920,
    wave: 'sawtooth',
    subWave: 'triangle',
    filterHz: 940,
    arpSpreadSec: 0.16,
    attackSec: 0.04,
    releaseSec: 0.88,
    hasPulseBeat: true,
    detuneCents: 9,
    chords: [
      [220.0, 261.63, 329.63, 440.0],
      [174.61, 220.0, 261.63, 349.23],
      [196.0, 246.94, 293.66, 392.0],
      [164.81, 246.94, 329.63, 392.0]
    ],
    bassline: [110.0, 87.31, 98.0, 82.41]
  },
  'zen-bells': {
    stepMs: 2500,
    wave: 'sine',
    subWave: 'sine',
    filterHz: 2100,
    arpSpreadSec: 0.42,
    attackSec: 0.018,
    releaseSec: 3.3,
    overtoneRatio: 2.756, // Bell harmonic partial
    chords: [
      [261.63, 392.0, 523.25], // C5 / G5 / C6 pentatonic
      [293.66, 440.0, 659.25],
      [329.63, 523.25, 783.99],
      [220.0, 329.63, 523.25]
    ],
    bassline: [130.81, 146.83, 164.81, 110.0]
  }
};

class AmbientMusicEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private schedulerId: number | null = null;
  private stepIdx = 0;
  private customAudioEl: HTMLAudioElement | null = null;
  private activeTrack: AmbientMusicTrack = 'none';
  private isPlaying = false;
  private volume = 0.35;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume * 0.28;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public sync(track: AmbientMusicTrack, playing: boolean, volume: number, customSrc?: string): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume * 0.28, this.ctx.currentTime, 0.08);
    }
    if (this.customAudioEl) {
      this.customAudioEl.volume = this.volume;
    }

    const trackChanged = this.activeTrack !== track;
    const playChanged = this.isPlaying !== playing;

    this.activeTrack = track;
    this.isPlaying = playing;

    if (!playing || track === 'none') {
      this.stopAll();
      return;
    }

    if (track === 'custom') {
      this.stopSynth();
      if (customSrc) {
        if (!this.customAudioEl || this.customAudioEl.src !== customSrc) {
          this.stopCustom();
          this.customAudioEl = new Audio(customSrc);
          this.customAudioEl.loop = true;
          this.customAudioEl.volume = this.volume;
        }
        void this.customAudioEl.play().catch(() => undefined);
      }
      return;
    }

    this.stopCustom();
    if (trackChanged || playChanged || this.schedulerId === null) {
      this.startSynth(track);
    }
  }

  private startSynth(track: SynthTrackId): void {
    this.stopSynth();
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const cfg = ARRANGEMENTS[track];
    const playStep = () => {
      if (!this.ctx || !this.masterGain || !this.isPlaying) return;
      const idx = this.stepIdx;
      const chord = cfg.chords[idx % cfg.chords.length];
      const bassFreq = cfg.bassline[idx % cfg.bassline.length];
      this.stepIdx++;
      const now = this.ctx.currentTime;

      // Sub / Bass anchor voice
      const bassOsc = this.ctx.createOscillator();
      const bassGain = this.ctx.createGain();
      const bassFilter = this.ctx.createBiquadFilter();
      bassOsc.type = cfg.subWave;
      bassOsc.frequency.setValueAtTime(bassFreq, now);
      bassFilter.type = 'lowpass';
      bassFilter.frequency.value = Math.min(480, cfg.filterHz);
      bassGain.gain.setValueAtTime(0.0001, now);
      bassGain.gain.linearRampToValueAtTime(0.085, now + Math.min(0.14, cfg.attackSec + 0.04));
      bassGain.gain.exponentialRampToValueAtTime(0.0001, now + cfg.releaseSec);
      bassOsc.connect(bassFilter);
      bassFilter.connect(bassGain);
      bassGain.connect(this.masterGain);
      bassOsc.start(now);
      bassOsc.stop(now + cfg.releaseSec + 0.1);

      // Soft muted pulse thump on rhythm-driven tracks
      if (cfg.hasPulseBeat) {
        const kickOsc = this.ctx.createOscillator();
        const kickGain = this.ctx.createGain();
        kickOsc.type = 'sine';
        kickOsc.frequency.setValueAtTime(98, now);
        kickOsc.frequency.exponentialRampToValueAtTime(42, now + 0.16);
        kickGain.gain.setValueAtTime(0.11, now);
        kickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        kickOsc.connect(kickGain);
        kickGain.connect(this.masterGain);
        kickOsc.start(now);
        kickOsc.stop(now + 0.24);
      }

      // Binaural second carrier offset
      if (cfg.binauralBeatHz) {
        const binOsc = this.ctx.createOscillator();
        const binGain = this.ctx.createGain();
        binOsc.type = 'sine';
        binOsc.frequency.setValueAtTime(chord[0] + cfg.binauralBeatHz, now);
        binGain.gain.setValueAtTime(0.0001, now);
        binGain.gain.linearRampToValueAtTime(0.045, now + cfg.attackSec);
        binGain.gain.exponentialRampToValueAtTime(0.0001, now + cfg.releaseSec);
        binOsc.connect(binGain);
        binGain.connect(this.masterGain);
        binOsc.start(now);
        binOsc.stop(now + cfg.releaseSec + 0.1);
      }

      // Chord arpeggio / pad voices
      chord.forEach((freq, i) => {
        if (!this.ctx || !this.masterGain) return;
        const startAt = now + i * cfg.arpSpreadSec;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = cfg.wave;
        osc.frequency.setValueAtTime(freq, startAt);
        if (cfg.detuneCents) {
          osc.detune.setValueAtTime((i % 2 === 0 ? 1 : -1) * cfg.detuneCents, startAt);
        }

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(cfg.filterHz, startAt);

        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.linearRampToValueAtTime(0.13 / chord.length, startAt + cfg.attackSec);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + cfg.releaseSec);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start(startAt);
        osc.stop(startAt + cfg.releaseSec + 0.12);

        // Optional harmonic shimmer or bell partial
        if (cfg.overtoneRatio && i % 2 === 0) {
          const ovOsc = this.ctx.createOscillator();
          const ovGain = this.ctx.createGain();
          ovOsc.type = 'sine';
          ovOsc.frequency.setValueAtTime(freq * cfg.overtoneRatio, startAt);
          ovGain.gain.setValueAtTime(0.0001, startAt);
          ovGain.gain.linearRampToValueAtTime(0.028 / chord.length, startAt + 0.02);
          ovGain.gain.exponentialRampToValueAtTime(0.0001, startAt + cfg.releaseSec * 0.75);
          ovOsc.connect(ovGain);
          ovGain.connect(this.masterGain);
          ovOsc.start(startAt);
          ovOsc.stop(startAt + cfg.releaseSec);
        }
      });
    };

    playStep();
    this.schedulerId = window.setInterval(playStep, cfg.stepMs);
  }

  private stopSynth(): void {
    if (this.schedulerId !== null) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
  }

  private stopCustom(): void {
    if (this.customAudioEl) {
      this.customAudioEl.pause();
      this.customAudioEl = null;
    }
  }

  public stopAll(): void {
    this.stopSynth();
    this.stopCustom();
  }
}

export const ambientMusic = new AmbientMusicEngine();
