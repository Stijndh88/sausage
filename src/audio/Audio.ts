import { getSettings, onSettingsChange, type Settings } from '../state/settings';

/**
 * All sound is synthesized with Web Audio: no files to load. Effects are short envelopes on
 * oscillators and filtered noise; music is a tiny step sequencer with three moods.
 * Browsers only allow audio after a user gesture, so `unlock()` is called on the first key/tap.
 */
export type SfxName =
  | 'shoot_single' | 'shoot_cone' | 'shoot_shotgun' | 'shoot_pierce' | 'shoot_lob' | 'shoot_boomerang'
  | 'explode' | 'hit' | 'crit' | 'kill' | 'hurt' | 'dodge' | 'dash' | 'crumb' | 'heal'
  | 'telegraph' | 'enemyShoot' | 'waveStart' | 'waveClear' | 'buy' | 'reroll' | 'deny' | 'click'
  | 'bossRoar' | 'bossPhase' | 'death' | 'victory' | 'unlock' | 'save';

export type Mood = 'off' | 'menu' | 'fight' | 'boss';

/** Minimum gap between two plays of the same effect, so 300 bullets don't make 300 sounds. */
const THROTTLE_MS: Partial<Record<SfxName, number>> = {
  shoot_single: 45, shoot_cone: 60, shoot_shotgun: 60, shoot_pierce: 60, shoot_lob: 80, shoot_boomerang: 120,
  hit: 35, crit: 50, kill: 30, crumb: 22, telegraph: 140, enemyShoot: 70, explode: 60, dodge: 120,
};

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private last = new Map<SfxName, number>();
  private crumbStreak = 0;
  private crumbStreakAt = 0;
  private mood: Mood = 'off';
  private seqTimer: ReturnType<typeof setInterval> | null = null;
  private nextStepTime = 0;
  private step = 0;
  private ducked = false;
  /** Count of effects played, for tests. */
  played = 0;

  constructor() {
    onSettingsChange((s) => this.applyVolumes(s));
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Create/resume the AudioContext. Safe to call on every gesture. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();
        this.musicBus = this.ctx.createGain();
        this.sfxBus.connect(this.master);
        this.musicBus.connect(this.master);
        this.master.connect(this.ctx.destination);
        this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.applyVolumes(getSettings());
        if (this.mood !== 'off') this.startSequencer();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private applyVolumes(s: Settings): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.masterVolume, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(s.sfxVolume, t, 0.02);
    this.musicBus.gain.setTargetAtTime(s.musicVolume * (this.ducked ? 0.3 : 1) * 0.55, t, 0.05);
  }

  /** Quieter music while paused. */
  duck(on: boolean): void {
    this.ducked = on;
    this.applyVolumes(getSettings());
  }

  play(name: SfxName, pitch = 1): void {
    const now = performance.now();
    const gap = THROTTLE_MS[name];
    if (gap && now - (this.last.get(name) ?? -1e9) < gap) return;
    this.last.set(name, now);
    this.played++;
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.005;
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    switch (name) {
      case 'shoot_single': this.tone(t, 1000 * pitch, 640, 0.045, 'square', 0.035); break;
      case 'shoot_cone': this.noise(t, 0.08, 0.05, 'lowpass', 1600, 600); this.tone(t, 280, 200, 0.07, 'sine', 0.04); break;
      case 'shoot_shotgun': this.noise(t, 0.07, 0.07, 'bandpass', 3200, 1400); break;
      case 'shoot_pierce': this.tone(t, 420, 1300, 0.08, 'sawtooth', 0.035); break;
      case 'shoot_lob': this.tone(t, 240, 110, 0.13, 'sine', 0.09); break;
      case 'shoot_boomerang': this.noise(t, 0.16, 0.035, 'bandpass', 900, 2400); break;
      case 'explode': this.noise(t, 0.35, 0.22, 'lowpass', 900, 150); this.tone(t, 90, 38, 0.3, 'sine', 0.18); break;
      case 'hit': this.tone(t, r(200, 260), 150, 0.03, 'square', 0.025); break;
      case 'crit': this.tone(t, 1400, 1900, 0.06, 'triangle', 0.05); break;
      case 'kill': this.tone(t, r(520, 680), r(880, 1000), 0.06, 'triangle', 0.05); this.noise(t, 0.05, 0.03, 'highpass', 3000, 3000); break;
      case 'hurt': this.tone(t, 170, 70, 0.22, 'sawtooth', 0.16); this.noise(t, 0.1, 0.1, 'lowpass', 1200, 400); break;
      case 'dodge': this.noise(t, 0.16, 0.07, 'bandpass', 1800, 6000); break;
      case 'dash': this.noise(t, 0.18, 0.08, 'bandpass', 700, 2800); break;
      case 'crumb': {
        if (now - this.crumbStreakAt > 450) this.crumbStreak = 0;
        this.crumbStreakAt = now;
        const f = 900 * Math.pow(2, Math.min(this.crumbStreak++, 14) / 12);
        this.tone(t, f, f, 0.05, 'triangle', 0.035);
        break;
      }
      case 'heal': [660, 880, 1100].forEach((f, i) => this.tone(t + i * 0.06, f, f, 0.09, 'sine', 0.06)); break;
      case 'telegraph': this.tone(t, 520, 480, 0.06, 'sine', 0.018); break;
      case 'enemyShoot': this.tone(t, 330, 260, 0.04, 'square', 0.012); break;
      case 'waveStart': [0, 0.18].forEach((d) => this.tone(t + d, 130, 48, 0.16, 'sine', 0.22)); break;
      case 'waveClear': [72, 76, 79, 84].forEach((n, i) => this.tone(t + i * 0.08, NOTE(n), NOTE(n), 0.16, 'triangle', 0.08)); break;
      case 'buy': this.tone(t, 1320, 1320, 0.05, 'square', 0.05); this.tone(t + 0.06, 1760, 1760, 0.12, 'square', 0.05); break;
      case 'reroll': this.noise(t, 0.2, 0.06, 'bandpass', 600, 2400); this.tone(t + 0.12, 700, 900, 0.06, 'triangle', 0.04); break;
      case 'deny': this.tone(t, 150, 130, 0.14, 'square', 0.06); break;
      case 'click': this.tone(t, 760, 760, 0.03, 'triangle', 0.04); break;
      case 'save': this.tone(t, 990, 1320, 0.1, 'sine', 0.06); break;
      case 'bossRoar': this.noise(t, 1.2, 0.2, 'lowpass', 420, 120); this.tone(t, 62, 40, 1.1, 'sawtooth', 0.12); break;
      case 'bossPhase': this.noise(t, 0.8, 0.18, 'lowpass', 600, 150); this.tone(t, 900, 300, 0.6, 'sawtooth', 0.07); break;
      case 'death': this.tone(t, 420, 55, 0.9, 'sawtooth', 0.14); this.noise(t + 0.1, 0.6, 0.08, 'lowpass', 900, 100); break;
      case 'victory': [60, 64, 67, 72, 67, 72, 76].forEach((n, i) => this.tone(t + i * 0.11, NOTE(n), NOTE(n), 0.22, 'triangle', 0.09)); break;
      case 'unlock': [79, 83, 86, 91].forEach((n, i) => this.tone(t + i * 0.07, NOTE(n), NOTE(n), 0.16, 'sine', 0.07)); break;
    }
  }

  private tone(t: number, f0: number, f1: number, dur: number, type: OscillatorType, vol: number, bus: GainNode = this.sfxBus): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.01, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(t: number, dur: number, vol: number, type: BiquadFilterType, f0: number, f1: number, bus: GainNode = this.sfxBus): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // --- Music ----------------------------------------------------------------------------------

  setMood(mood: Mood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    if (mood === 'off') this.stopSequencer();
    else if (this.ctx) this.startSequencer();
  }

  get currentMood(): Mood {
    return this.mood;
  }

  private startSequencer(): void {
    if (!this.ctx || this.seqTimer) return;
    this.nextStepTime = this.ctx.currentTime + 0.05;
    this.step = 0;
    this.seqTimer = setInterval(() => this.schedule(), 25);
  }

  private stopSequencer(): void {
    if (this.seqTimer) clearInterval(this.seqTimer);
    this.seqTimer = null;
  }

  /** Schedules 16th-note steps up to 120ms ahead. */
  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || this.mood === 'off') return;
    const bpm = this.mood === 'boss' ? 146 : this.mood === 'fight' ? 128 : 92;
    const stepDur = 60 / bpm / 4;
    while (this.nextStepTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextStepTime, stepDur);
      this.nextStepTime += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, t: number, stepDur: number): void {
    const bus = this.musicBus;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    // A minor, F, G, E: a little grill-side tension.
    const roots = this.mood === 'boss' ? [45, 46, 45, 43] : [45, 41, 43, 40];
    const root = roots[bar];
    if (this.mood === 'menu') {
      if (s % 4 === 0) this.tone(t, NOTE(root), NOTE(root), stepDur * 3.5, 'triangle', 0.09, bus);
      if (s % 8 === 6) {
        const arp = [0, 3, 7, 12][(step >> 3) % 4];
        this.tone(t, NOTE(root + 24 + arp), NOTE(root + 24 + arp), stepDur * 2, 'sine', 0.035, bus);
      }
      return;
    }
    // Fight / boss: kick, hats, driving bass, sparse stabs.
    if (s % 4 === 0) this.tone(t, 140, 45, 0.14, 'sine', 0.3, bus);
    if (s % 2 === 1) this.noise(t, 0.03, 0.04, 'highpass', 7000, 7000, bus);
    if (this.mood === 'boss' && s % 8 === 4) this.noise(t, 0.12, 0.09, 'bandpass', 1800, 900, bus);
    const bassPattern = this.mood === 'boss' ? [0, 0, 12, 0, 0, 12, 0, 7] : [0, 0, 0, 12, 0, 0, 7, 0];
    if (s % 2 === 0) {
      const n = root - 12 + bassPattern[(s / 2) % 8];
      this.tone(t, NOTE(n), NOTE(n), stepDur * 1.6, 'sawtooth', 0.05, bus);
    }
    if (s === 14 || (this.mood === 'boss' && s === 6)) {
      for (const iv of [12, 15, 19]) this.tone(t, NOTE(root + iv), NOTE(root + iv), stepDur * 1.5, 'square', 0.018, bus);
    }
  }
}

export const audio = new AudioEngine();
