/** Sounds made with the Web Audio API. No audio files. Sound starts only after a user gesture. */
export class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private crowdGain: GainNode | null = null;
  private cheerGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** Call from a tap or key handler. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.master.connect(ctx.destination);

    // Two seconds of soft noise, used for the crowd and for hits.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.04 * w) / 1.04;
      d[i] = last * 3.2 + w * 0.12;
    }
    // Crowd murmur.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 650;
    bp.Q.value = 0.5;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0.16;
    src.connect(bp).connect(this.crowdGain).connect(this.master);
    src.start();
    // Cheer layer (louder and brighter).
    const src2 = ctx.createBufferSource();
    src2.buffer = this.noise;
    src2.loop = true;
    src2.playbackRate.value = 1.7;
    const bp2 = ctx.createBiquadFilter();
    bp2.type = 'bandpass';
    bp2.frequency.value = 1500;
    bp2.Q.value = 0.4;
    this.cheerGain = ctx.createGain();
    this.cheerGain.gain.value = 0;
    src2.connect(bp2).connect(this.cheerGain).connect(this.master);
    src2.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.23;
    const lg = ctx.createGain();
    lg.gain.value = 0.045;
    lfo.connect(lg).connect(this.crowdGain.gain);
    lfo.start();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.03);
  }

  get started(): boolean {
    return this.ctx !== null;
  }

  private burst(freq: number, q: number, dur: number, gain: number, delay = 0) {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Bat on ball. power 0 to 1. */
  bat(power: number) {
    const p = Math.max(0.15, Math.min(1, power));
    this.burst(2300, 1.2, 0.05 + 0.03 * p, 1.4 * p);
    this.tone('triangle', 520 + 240 * p, 180, 0.07, 0.5 * p);
    this.tone('sine', 190, 80, 0.09, 0.5 * p);
  }

  edge() {
    this.burst(3800, 3, 0.03, 0.6);
    this.tone('triangle', 1400, 700, 0.03, 0.2);
  }

  bounce() {
    this.tone('sine', 150, 60, 0.07, 0.35);
    this.burst(500, 0.8, 0.04, 0.25);
  }

  stumps() {
    for (let i = 0; i < 4; i++) {
      this.tone('triangle', 900 + Math.random() * 500, 300, 0.07, 0.4, i * 0.035);
      this.burst(2600, 2, 0.04, 0.5, i * 0.035);
    }
  }

  catchBall() {
    this.burst(900, 1, 0.05, 0.45);
    this.tone('sine', 220, 110, 0.06, 0.25);
  }

  click() {
    this.tone('sine', 880, 660, 0.05, 0.12);
  }

  /** Crowd reaction. level 0 to 1. */
  cheer(level: number, dur = 2.4) {
    if (!this.ctx || !this.cheerGain || !this.crowdGain) return;
    const t = this.ctx.currentTime;
    const g = this.cheerGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.0001, g.value), t);
    g.linearRampToValueAtTime(0.55 * level, t + 0.25);
    g.setTargetAtTime(0, t + 0.25 + dur * 0.4, dur * 0.3);
    if (level > 0.7) {
      // Horn.
      this.tone('sawtooth', 233, 233, 0.5, 0.05, 0.2);
      this.tone('sawtooth', 311, 311, 0.7, 0.05, 0.75);
    }
  }

  /** Short "ooh" when the batter misses or there is a close call. */
  ooh() {
    this.cheer(0.3, 1.0);
  }
}
