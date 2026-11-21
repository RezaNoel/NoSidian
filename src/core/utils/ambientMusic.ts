// Built-in music, generated live so it works offline and has no licence
// strings attached. A small sequencer schedules notes slightly ahead of time
// (Web Audio clock) for steady timing; instruments are simple synth voices
// (electric piano, piano, pad, bass, bells, flute, drums) through a shared
// room reverb. Melodies are improvised from the chord tones and scale with a
// seeded random walk, so every track keeps changing but stays in key.
import type { AmbientMusicTrack } from '../types';

export interface AmbientTrackMeta {
  id: Exclude<AmbientMusicTrack, 'none' | 'custom'>;
  label: string;
  tempoBpm: number;
  mood: string;
}

export const AMBIENT_MUSIC_TRACKS: AmbientTrackMeta[] = [
  { id: 'lofi', label: 'Lo-Fi Study', tempoBpm: 78, mood: 'Electric piano, soft drums, vinyl' },
  { id: 'piano', label: 'Warm Piano', tempoBpm: 66, mood: 'Solo piano, gentle phrases' },
  { id: 'rainy-jazz', label: 'Rainy Café Jazz', tempoBpm: 92, mood: 'Brushes, walking bass, keys' },
  { id: 'forest', label: 'Forest Drift', tempoBpm: 60, mood: 'Pads and wooden flute' },
  { id: 'cosmos', label: 'Deep Cosmos', tempoBpm: 50, mood: 'Slow pads, wide space' },
  { id: 'synthwave', label: 'Nightwave Chill', tempoBpm: 100, mood: 'Arpeggios and a steady beat' },
  { id: 'zen-bells', label: 'Temple Zen Bells', tempoBpm: 54, mood: 'Pentatonic bells' },
  { id: 'binaural', label: 'Alpha Binaural', tempoBpm: 60, mood: '10 Hz alpha beat under a pad' }
];

type TrackId = AmbientTrackMeta['id'];
type Inst = 'epiano' | 'piano' | 'pad' | 'bells' | 'flute' | 'arp' | 'none';

interface Style {
  bpm: number;
  swing: number; // 0..0.33 of an eighth
  /** Chords as MIDI notes, one per bar. */
  chords: number[][];
  scale: number[]; // pitch classes above the key root
  root: number; // MIDI root of the scale
  comp: Inst; // chord instrument
  lead: Inst; // melody instrument
  drums: 'none' | 'lofi' | 'brush' | 'four';
  bass: 'none' | 'roots' | 'walk' | 'pulse';
  vinyl?: boolean;
  reverb: number; // wet 0..1
  leadDensity: number; // chance of a melody note per eighth
  lowpass: number;
  binaural?: number;
}

const m7 = (r: number) => [r, r + 3, r + 7, r + 10];
const M7 = (r: number) => [r, r + 4, r + 7, r + 11];
const M9 = (r: number) => [r, r + 4, r + 7, r + 11, r + 14];
const m9 = (r: number) => [r, r + 3, r + 7, r + 10, r + 14];
const dom9 = (r: number) => [r, r + 4, r + 10, r + 14];
const add9 = (r: number) => [r, r + 7, r + 14, r + 16];
const sus = (r: number) => [r, r + 5, r + 7, r + 12];

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PENTA = [0, 2, 4, 7, 9];
const MINPENTA = [0, 3, 5, 7, 10];

const STYLES: Record<TrackId, Style> = {
  lofi: { bpm: 78, swing: 0.22, chords: [M9(53), m9(52), m7(50), dom9(55)], scale: MAJOR, root: 60, comp: 'epiano', lead: 'epiano', drums: 'lofi', bass: 'roots', vinyl: true, reverb: 0.22, leadDensity: 0.32, lowpass: 3200 },
  piano: { bpm: 66, swing: 0, chords: [add9(50), M7(53), add9(45), sus(43)], scale: MAJOR, root: 62, comp: 'piano', lead: 'piano', drums: 'none', bass: 'none', reverb: 0.35, leadDensity: 0.38, lowpass: 6000 },
  'rainy-jazz': { bpm: 92, swing: 0.3, chords: [m9(50), dom9(55), M9(48), M9(48)], scale: DORIAN, root: 62, comp: 'epiano', lead: 'piano', drums: 'brush', bass: 'walk', reverb: 0.25, leadDensity: 0.42, lowpass: 4200 },
  forest: { bpm: 60, swing: 0, chords: [add9(50), add9(55), add9(52), sus(57)], scale: PENTA, root: 62, comp: 'pad', lead: 'flute', drums: 'none', bass: 'roots', reverb: 0.45, leadDensity: 0.22, lowpass: 3800 },
  cosmos: { bpm: 50, swing: 0, chords: [sus(45), M9(41), sus(48), m9(43)], scale: PENTA, root: 57, comp: 'pad', lead: 'bells', drums: 'none', bass: 'roots', reverb: 0.6, leadDensity: 0.12, lowpass: 2400 },
  synthwave: { bpm: 100, swing: 0, chords: [m7(45), M7(41), M7(48), dom9(43)], scale: MINPENTA, root: 57, comp: 'pad', lead: 'arp', drums: 'four', bass: 'pulse', reverb: 0.25, leadDensity: 0.9, lowpass: 3000 },
  'zen-bells': { bpm: 54, swing: 0, chords: [sus(48), sus(50), sus(45), sus(43)], scale: PENTA, root: 72, comp: 'pad', lead: 'bells', drums: 'none', bass: 'none', reverb: 0.55, leadDensity: 0.28, lowpass: 5000 },
  binaural: { bpm: 60, swing: 0, chords: [sus(45), sus(45), sus(43), sus(43)], scale: PENTA, root: 57, comp: 'pad', lead: 'none', drums: 'none', bass: 'none', reverb: 0.5, leadDensity: 0, lowpass: 1800, binaural: 10 }
};

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

class AmbientMusicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private tone: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private vinylSrc: AudioBufferSourceNode | null = null;
  private binaural: OscillatorNode[] = [];
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0; // eighth notes since start
  private seed = 1;
  private lastLead = 0;
  private activeTrack: AmbientMusicTrack = 'none';
  private isPlaying = false;
  private volume = 0.35;
  private customAudioEl: HTMLAudioElement | null = null;

  private rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!this.ctx) {
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.volume * 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
      this.tone = ctx.createBiquadFilter();
      this.tone.type = 'lowpass';
      this.tone.frequency.value = 4000;
      this.dry = ctx.createGain();
      this.wet = ctx.createGain();
      const verb = ctx.createConvolver();
      verb.buffer = this.impulse(2.8, 2.6);
      this.dry.connect(this.tone);
      this.wet.connect(verb);
      verb.connect(this.tone);
      this.tone.connect(comp);
      comp.connect(this.master);
      this.master.connect(ctx.destination);
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Stereo room impulse: decaying noise. */
  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  /** Route a voice to the dry and reverb buses. */
  private out(node: AudioNode, wet: number): void {
    node.connect(this.dry!);
    const send = this.ctx!.createGain();
    send.gain.value = wet;
    node.connect(send);
    send.connect(this.wet!);
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private voice(inst: Inst, midi: number, t: number, len: number, vel: number, wet: number): void {
    const ctx = this.ctx!;
    const f = hz(midi);
    const g = ctx.createGain();
    const stopAt = t + len + 3;
    const osc = (type: OscillatorType, freq: number, gain: number, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = freq; o.detune.value = detune;
      const og = ctx.createGain(); og.gain.value = gain;
      o.connect(og); og.connect(g); o.start(t); o.stop(stopAt);
      return o;
    };
    switch (inst) {
      case 'epiano': {
        // Tine-like: fundamental, a soft octave and a short bright partial.
        osc('sine', f, 1); osc('sine', f * 2, 0.22, 3);
        const bright = osc('triangle', f * 4, 0.06);
        bright.stop(t + 0.25);
        this.env(g, t, 0.16 * vel, 0.006, Math.min(2.6, len + 1.4));
        break;
      }
      case 'piano': {
        osc('triangle', f, 0.8); osc('sine', f * 2, 0.3, -2); osc('sine', f * 3, 0.12, 2); osc('sine', f * 4.02, 0.05);
        this.env(g, t, 0.15 * vel, 0.004, Math.min(3.2, len + 2));
        break;
      }
      case 'pad': {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.4;
        const pg = ctx.createGain();
        for (const d of [-7, 0, 7]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(lp); o.start(t); o.stop(stopAt); }
        lp.connect(pg); pg.gain.value = 0.18; pg.connect(g);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.05 * vel, t + Math.min(1.2, len * 0.4));
        g.gain.setValueAtTime(0.05 * vel, t + len * 0.8);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len + 1.5);
        break;
      }
      case 'bells': {
        osc('sine', f, 1); osc('sine', f * 2.76, 0.35); osc('sine', f * 5.4, 0.12); osc('sine', f * 8.93, 0.04);
        this.env(g, t, 0.09 * vel, 0.003, 4);
        break;
      }
      case 'flute': {
        const o = osc('sine', f, 1); osc('triangle', f * 2, 0.08);
        const lfo = ctx.createOscillator(); lfo.frequency.value = 5.2;
        const lg = ctx.createGain(); lg.gain.value = f * 0.006;
        lfo.connect(lg); lg.connect(o.frequency); lfo.start(t + 0.2); lfo.stop(stopAt);
        const n = ctx.createBufferSource(); n.buffer = this.noise; const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = f * 2; nf.Q.value = 3;
        const ng = ctx.createGain(); ng.gain.value = 0.05; n.connect(nf); nf.connect(ng); ng.connect(g); n.start(t); n.stop(t + len + 0.4);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.07 * vel, t + 0.12);
        g.gain.setValueAtTime(0.06 * vel, t + len);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.5);
        break;
      }
      case 'arp': {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
        lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.25);
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(t); o.stop(t + 0.6);
        lp.connect(g);
        this.env(g, t, 0.05 * vel, 0.003, 0.32);
        break;
      }
      case 'none': return;
    }
    this.out(g, wet);
  }

  private bassNote(midi: number, t: number, len: number, pluck: boolean): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz(midi);
    const s = ctx.createOscillator(); s.type = 'sine'; s.frequency.value = hz(midi);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = pluck ? 700 : 420;
    const g = ctx.createGain();
    o.connect(lp); s.connect(lp); lp.connect(g);
    this.env(g, t, 0.2, 0.01, pluck ? Math.min(0.5, len) : len + 0.2);
    o.start(t); s.start(t); o.stop(t + len + 0.6); s.stop(t + len + 0.6);
    this.out(g, 0.05);
  }

  private drum(kind: 'kick' | 'snare' | 'hat' | 'brush', t: number, vel = 1): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    if (kind === 'kick') {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
      o.connect(g); this.env(g, t, 0.42 * vel, 0.002, 0.3); o.start(t); o.stop(t + 0.4);
      this.out(g, 0);
      return;
    }
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    n.playbackRate.value = 0.8 + this.rnd() * 0.4;
    const f = ctx.createBiquadFilter();
    if (kind === 'snare') { f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7; this.env(g, t, 0.16 * vel, 0.002, 0.18); }
    else if (kind === 'brush') { f.type = 'bandpass'; f.frequency.value = 3500; f.Q.value = 0.5; this.env(g, t, 0.05 * vel, 0.03, 0.16); }
    else { f.type = 'highpass'; f.frequency.value = 7000; this.env(g, t, 0.05 * vel, 0.001, 0.05); }
    n.connect(f); f.connect(g); n.start(t, this.rnd()); n.stop(t + 0.4);
    if (kind === 'snare') {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 190;
      const og = ctx.createGain(); this.env(og, t, 0.06 * vel, 0.001, 0.08); o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.15);
    }
    this.out(g, kind === 'snare' ? 0.12 : 0.04);
  }

  private startVinyl(): void {
    const ctx = this.ctx!;
    const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const g = ctx.createGain(); g.gain.value = 0.006;
    n.connect(hp); hp.connect(g); g.connect(this.dry!); n.start();
    this.vinylSrc = n;
  }

  /** Schedule one eighth note of the current track. */
  private scheduleStep(s: Style, t: number, eighth: number): void {
    const barLen = 8;
    const bar = Math.floor(this.step / barLen);
    const pos = this.step % barLen;
    const chord = s.chords[bar % s.chords.length];
    const r = () => this.rnd();
    // Chords: on the bar, with a pushed re-hit sometimes.
    if (s.comp !== 'none' && (pos === 0 || (pos === 5 && s.comp === 'epiano' && r() < 0.4))) {
      const len = s.comp === 'pad' ? eighth * 8 : pos === 0 ? eighth * 5 : eighth * 3;
      chord.forEach((n, i) => this.voice(s.comp, n + 12, t + (s.comp === 'piano' ? i * 0.03 : i * 0.008), len, 0.75 + r() * 0.2, s.reverb));
    }
    if (s.comp === 'piano' && pos % 2 === 1 && r() < 0.6) {
      const n = chord[Math.floor(r() * chord.length)] + 24;
      this.voice('piano', n, t, eighth * 2, 0.45, s.reverb);
    }
    // Bass.
    if (s.bass === 'roots' && (pos === 0 || (pos === 6 && r() < 0.5))) this.bassNote(chord[0] - 12, t, eighth * (pos === 0 ? 5 : 2), false);
    if (s.bass === 'walk' && pos % 2 === 0) {
      const tones = [chord[0], chord[1], chord[2], chord[0] + 2 * (r() < 0.5 ? 1 : -1)];
      this.bassNote(tones[pos / 2] - 12, t, eighth * 1.8, true);
    }
    if (s.bass === 'pulse') this.bassNote(chord[0] - 12, t, eighth * 0.8, true);
    // Drums.
    if (s.drums === 'lofi') {
      if (pos === 0 || pos === 5 || (pos === 7 && r() < 0.3)) this.drum('kick', t, pos === 0 ? 1 : 0.8);
      if (pos === 2 || pos === 6) this.drum('snare', t, 0.8);
      this.drum('hat', t, pos % 2 ? 0.5 : 0.8);
    } else if (s.drums === 'brush') {
      this.drum('brush', t, pos % 2 ? 0.6 : 1);
      if (pos === 2 || pos === 6) this.drum('brush', t + 0.02, 1.3);
      if (pos === 0 && r() < 0.5) this.drum('kick', t, 0.5);
    } else if (s.drums === 'four') {
      if (pos % 2 === 0) this.drum('kick', t, 0.9);
      if (pos === 2 || pos === 6) this.drum('snare', t, 0.9);
      if (pos % 2 === 1) this.drum('hat', t, 0.9);
    }
    // Melody.
    if (s.lead === 'arp') {
      const n = chord[pos % chord.length] + 24 + (pos >= 4 ? 12 : 0);
      this.voice('arp', n, t, eighth, 0.8, s.reverb);
    } else if (s.lead !== 'none' && r() < s.leadDensity * (pos % 2 === 0 ? 1 : 0.6)) {
      // Prefer chord tones on strong beats, scale steps elsewhere; move by small steps.
      const pool: number[] = [];
      for (let o = 0; o < 2; o++) for (const p of s.scale) pool.push(s.root + o * 12 + p);
      const strong = pos % 2 === 0;
      const cands = pool.filter((n) => Math.abs(n - (this.lastLead || s.root + 7)) <= (strong ? 5 : 3) && (!strong || chord.some((c) => (n - c) % 12 === 0)));
      const pick = (cands.length ? cands : pool)[Math.floor(r() * (cands.length || pool.length))];
      this.lastLead = pick;
      const len = eighth * (r() < 0.3 ? 3 : r() < 0.5 ? 2 : 1);
      this.voice(s.lead, pick, t, len, 0.6 + r() * 0.3, s.reverb);
    }
  }

  private tick = (): void => {
    if (!this.ctx || !this.isPlaying) return;
    const track = this.activeTrack as TrackId;
    const s = STYLES[track];
    if (!s) return;
    const eighth = 60 / s.bpm / 2;
    while (this.nextTime < this.ctx.currentTime + 0.2) {
      const swing = this.step % 2 === 1 ? s.swing * eighth : 0;
      this.scheduleStep(s, this.nextTime + swing, eighth);
      this.nextTime += eighth;
      this.step++;
    }
  };

  private startGen(track: TrackId): void {
    this.stopGen();
    const ctx = this.ensure();
    if (!ctx) return;
    const s = STYLES[track];
    this.tone!.frequency.setValueAtTime(s.lowpass, ctx.currentTime);
    this.seed = 1 + Math.floor(Math.random() * 100000);
    this.step = 0;
    this.lastLead = 0;
    this.nextTime = ctx.currentTime + 0.08;
    if (s.vinyl) this.startVinyl();
    if (s.binaural) {
      // Two pure tones, one per ear, 10 Hz apart.
      const merger = ctx.createChannelMerger(2);
      const g = ctx.createGain(); g.gain.value = 0.05;
      [s.root - 12, s.root - 12].forEach((n, i) => {
        const o = ctx.createOscillator(); o.frequency.value = hz(n) + (i ? s.binaural! : 0); o.connect(merger, 0, i); o.start(); this.binaural.push(o);
      });
      merger.connect(g); g.connect(this.dry!);
    }
    this.tick();
    this.timer = window.setInterval(this.tick, 50);
  }

  private stopGen(): void {
    if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; }
    try { this.vinylSrc?.stop(); } catch { /* already stopped */ }
    this.vinylSrc = null;
    for (const o of this.binaural) { try { o.stop(); } catch { /* already stopped */ } }
    this.binaural = [];
  }

  private stopCustom(): void {
    if (this.customAudioEl) { this.customAudioEl.pause(); this.customAudioEl = null; }
  }

  public sync(track: AmbientMusicTrack, playing: boolean, volume: number, customSrc?: string): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume * 0.9, this.ctx.currentTime, 0.08);
    if (this.customAudioEl) this.customAudioEl.volume = this.volume;
    const changed = this.activeTrack !== track || this.isPlaying !== playing;
    this.activeTrack = track;
    this.isPlaying = playing;
    if (!playing || track === 'none') { this.stopAll(); return; }
    if (track === 'custom') {
      this.stopGen();
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
    if (changed || this.timer === null) this.startGen(track);
  }

  public stopAll(): void {
    this.isPlaying = false;
    this.stopGen();
    this.stopCustom();
  }
}

export const ambientMusic = new AmbientMusicEngine();
