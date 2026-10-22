import type { AudioEngine } from './engine';

// Small synthesized instrument set. Every voice is scheduled at an exact context time `t`.
// Nodes are registered with the Voices tracker so pause can silence anything still queued.

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export interface Sends {
  rev?: number;
  dly?: number;
}

export class Voices {
  private live: { node: AudioScheduledSourceNode; end: number }[] = [];
  constructor(public eng: AudioEngine) {}

  track(node: AudioScheduledSourceNode, end: number): void {
    this.live.push({ node, end });
    if (this.live.length > 600) this.prune();
  }

  prune(): void {
    const now = this.eng.ctx.currentTime;
    this.live = this.live.filter((v) => v.end > now);
  }

  stopAll(): void {
    for (const v of this.live) {
      try {
        v.node.stop();
      } catch {
        /* already stopped */
      }
    }
    this.live = [];
  }

  // -------------------------------------------------------------- helpers

  private out(dest: AudioNode, t: number, s?: Sends): GainNode {
    const g = this.eng.ctx.createGain();
    g.connect(dest);
    if (s?.rev) {
      const r = this.eng.ctx.createGain();
      r.gain.value = s.rev;
      g.connect(r).connect(this.eng.reverbIn);
    }
    if (s?.dly) {
      const d = this.eng.ctx.createGain();
      d.gain.value = s.dly;
      g.connect(d).connect(this.eng.delayIn);
    }
    g.gain.setValueAtTime(0, t);
    return g;
  }

  private osc(type: OscillatorType, f: number, t: number, end: number, dest: AudioNode, detune = 0): OscillatorNode {
    const o = this.eng.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(end);
    this.track(o, end);
    return o;
  }

  private noise(t: number, end: number, dest: AudioNode): AudioBufferSourceNode {
    const n = this.eng.ctx.createBufferSource();
    n.buffer = this.eng.noise;
    n.loop = true;
    n.connect(dest);
    n.start(t, Math.random() * 1.5);
    n.stop(end);
    this.track(n, end);
    return n;
  }

  private filter(type: BiquadFilterType, f: number, q: number, dest: AudioNode): BiquadFilterNode {
    const b = this.eng.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    b.connect(dest);
    return b;
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number, sus = 0.0001, hold = 0): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    if (hold > 0) {
      g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + d);
      g.gain.setValueAtTime(Math.max(sus, 0.0001), t + a + d + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + hold + 0.08);
    } else {
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
  }

  // -------------------------------------------------------------- drums

  kick(dest: AudioNode, t: number, v = 1): void {
    const g = this.out(dest, t);
    this.env(g, t, 0.002, 1.1 * v, 0.42);
    const o = this.osc('sine', 150, t, t + 0.5, g);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
    const c = this.out(dest, t);
    this.env(c, t, 0.001, 0.25 * v, 0.02);
    this.noise(t, t + 0.03, this.filter('highpass', 1800, 0.7, c));
  }

  snare(dest: AudioNode, t: number, v = 1, s: Sends = { rev: 0.25 }): void {
    const g = this.out(dest, t, s);
    this.env(g, t, 0.002, 0.55 * v, 0.19);
    this.noise(t, t + 0.25, this.filter('bandpass', 1900, 0.9, g));
    const b = this.out(dest, t);
    this.env(b, t, 0.002, 0.42 * v, 0.09);
    const o = this.osc('triangle', 210, t, t + 0.12, b);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
  }

  clap(dest: AudioNode, t: number, v = 1): void {
    const g = this.out(dest, t, { rev: 0.3 });
    g.gain.setValueAtTime(0.0001, t);
    for (const k of [0, 0.011, 0.022]) {
      g.gain.setValueAtTime(0.5 * v, t + k);
      g.gain.exponentialRampToValueAtTime(0.08 * v, t + k + 0.009);
    }
    g.gain.setValueAtTime(0.42 * v, t + 0.033);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    this.noise(t, t + 0.22, this.filter('bandpass', 1250, 1.3, g));
  }

  hat(dest: AudioNode, t: number, v = 1, open = false): void {
    const g = this.out(dest, t);
    this.env(g, t, 0.001, 0.22 * v, open ? 0.24 : 0.04);
    this.noise(t, t + (open ? 0.3 : 0.06), this.filter('highpass', open ? 6800 : 8200, 0.8, g));
  }

  rim(dest: AudioNode, t: number, v = 1): void {
    const g = this.out(dest, t, { rev: 0.18 });
    this.env(g, t, 0.001, 0.32 * v, 0.035);
    this.osc('triangle', 1050, t, t + 0.05, g);
    this.noise(t, t + 0.02, this.filter('bandpass', 3200, 2, g));
  }

  tick(dest: AudioNode, t: number, v = 1, f = 2400): void {
    const g = this.out(dest, t, { rev: 0.15 });
    this.env(g, t, 0.001, 0.2 * v, 0.03);
    this.osc('triangle', f, t, t + 0.04, g);
  }

  shaker(dest: AudioNode, t: number, v = 1): void {
    const g = this.out(dest, t);
    this.env(g, t, 0.012, 0.09 * v, 0.06);
    this.noise(t, t + 0.09, this.filter('highpass', 9500, 0.6, g));
  }

  tom(dest: AudioNode, t: number, m: number, v = 1): void {
    const g = this.out(dest, t, { rev: 0.2 });
    this.env(g, t, 0.002, 0.6 * v, 0.3);
    const o = this.osc('sine', mtof(m) * 1.7, t, t + 0.35, g);
    o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.14);
  }

  // -------------------------------------------------------------- tonal

  bass(dest: AudioNode, t: number, m: number, dur: number, v = 1, kind: 'sub' | 'saw' | 'slap' | 'dist' = 'sub'): void {
    const f = mtof(m);
    const end = t + dur + 0.12;
    const g = this.out(dest, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.32 * v, t + Math.min(dur, 0.15));
    g.gain.setValueAtTime(0.32 * v, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
    this.osc('sine', f, t, end, g);
    if (kind === 'sub') {
      const h = this.eng.ctx.createGain();
      h.gain.value = 0.18;
      h.connect(g);
      this.osc('triangle', f * 2, t, end, h);
      return;
    }
    const lp = this.filter('lowpass', 300, kind === 'slap' ? 5 : 7, g);
    const top = kind === 'slap' ? 3200 : kind === 'dist' ? 1500 : 1300;
    lp.frequency.setValueAtTime(220, t);
    lp.frequency.exponentialRampToValueAtTime(top, t + 0.012);
    lp.frequency.exponentialRampToValueAtTime(kind === 'slap' ? 420 : 360, t + (kind === 'slap' ? 0.09 : 0.22));
    let src: AudioNode = lp;
    if (kind === 'dist') {
      const ws = this.eng.ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) curve[i] = Math.tanh(((i / 255) * 2 - 1) * 3.2);
      ws.curve = curve;
      ws.connect(lp);
      src = ws;
    }
    const mix = this.eng.ctx.createGain();
    mix.gain.value = kind === 'dist' ? 0.5 : 0.42;
    mix.connect(src);
    this.osc(kind === 'slap' ? 'square' : 'sawtooth', f, t, end, mix);
    this.osc('sawtooth', f, t, end, mix, 9);
  }

  /** Electric-piano: 1:1 FM with decaying index. */
  ep(dest: AudioNode, t: number, m: number, dur: number, v = 1): void {
    const f = mtof(m);
    const end = t + dur + 0.6;
    const g = this.out(dest, t, { rev: 0.25 });
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.17 * v, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.07 * v, t + 0.5);
    g.gain.setValueAtTime(0.07 * v, t + Math.max(dur, 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    const car = this.osc('sine', f, t, end, g);
    const mg = this.eng.ctx.createGain();
    mg.gain.setValueAtTime(f * 1.6, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.08, t + 0.6);
    mg.connect(car.frequency);
    this.osc('sine', f, t, end, mg);
  }

  pad(dest: AudioNode, t: number, notes: number[], dur: number, v = 1, cutoff = 1500): void {
    const end = t + dur + 0.7;
    const g = this.out(dest, t, { rev: 0.45 });
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06 * v, t + 0.22);
    g.gain.setValueAtTime(0.06 * v, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    const lp = this.filter('lowpass', cutoff, 0.6, g);
    for (const m of notes) {
      this.osc('sawtooth', mtof(m), t, end, lp, -8);
      this.osc('sawtooth', mtof(m), t, end, lp, 8);
    }
  }

  pluck(dest: AudioNode, t: number, m: number, dur: number, v = 1, s: Sends = { dly: 0.35 }, type: OscillatorType = 'square'): void {
    const end = t + Math.min(dur, 0.6) + 0.3;
    const g = this.out(dest, t, s);
    this.env(g, t, 0.003, 0.16 * v, Math.min(dur + 0.15, 0.55));
    const lp = this.filter('lowpass', 2600, 2, g);
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + 0.2);
    this.osc(type, mtof(m), t, end, lp);
  }

  lead(dest: AudioNode, t: number, m: number, dur: number, v = 1, kind: 'square' | 'saw' = 'square'): void {
    const f = mtof(m);
    const end = t + dur + 0.12;
    const g = this.out(dest, t, { dly: 0.3, rev: 0.2 });
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11 * v, t + 0.012);
    g.gain.setValueAtTime(0.1 * v, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    const lp = this.filter('lowpass', kind === 'saw' ? 2600 : 3400, 1, g);
    const o = this.osc(kind === 'saw' ? 'sawtooth' : 'square', f, t, end, lp);
    if (dur > 0.18) {
      const lfo = this.eng.ctx.createOscillator();
      lfo.frequency.value = 5.6;
      const lg = this.eng.ctx.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(14, t + 0.25);
      lfo.connect(lg).connect(o.detune);
      lfo.start(t);
      lfo.stop(end);
      this.track(lfo, end);
    }
    if (kind === 'saw') this.osc('sawtooth', f, t, end, lp, 11);
  }

  bell(dest: AudioNode, t: number, m: number, dur: number, v = 1): void {
    const f = mtof(m);
    const end = t + Math.max(dur, 0.4) + 1.1;
    const g = this.out(dest, t, { rev: 0.5, dly: 0.2 });
    this.env(g, t, 0.002, 0.14 * v, Math.max(dur, 0.4) + 1);
    this.osc('sine', f, t, end, g);
    const p = this.eng.ctx.createGain();
    p.gain.setValueAtTime(0.35, t);
    p.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    p.connect(g);
    this.osc('sine', f * 2.76, t, end, p);
    this.osc('sine', f * 5.4, t, t + 0.3, p);
  }

  choir(dest: AudioNode, t: number, notes: number[], dur: number, v = 1): void {
    const end = t + dur + 0.9;
    const g = this.out(dest, t, { rev: 0.6 });
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05 * v, t + 0.4);
    g.gain.setValueAtTime(0.05 * v, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    const f1 = this.filter('bandpass', 760, 3, g);
    const f2 = this.filter('bandpass', 1180, 4, g);
    for (const m of notes) {
      for (const dst of [f1, f2]) this.osc('sawtooth', mtof(m), t, end, dst, (m % 3) * 5 - 5);
    }
  }

  stab(dest: AudioNode, t: number, notes: number[], v = 1): void {
    const g = this.out(dest, t, { rev: 0.35, dly: 0.25 });
    this.env(g, t, 0.003, 0.1 * v, 0.35);
    const lp = this.filter('lowpass', 3000, 3, g);
    lp.frequency.setValueAtTime(5200, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + 0.3);
    for (const m of notes) this.osc('sawtooth', mtof(m), t, t + 0.45, lp, (m & 1) * 10 - 5);
  }

  // -------------------------------------------------------------- fx primitives

  sweep(dest: AudioNode, t: number, from: number, to: number, dur: number, v = 1, type: OscillatorType = 'sawtooth', s?: Sends): void {
    const g = this.out(dest, t, s);
    this.env(g, t, 0.005, 0.12 * v, dur);
    const o = this.osc(type, from, t, t + dur + 0.05, g);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
  }

  noiseHit(dest: AudioNode, t: number, f: number, q: number, dur: number, v = 1, type: BiquadFilterType = 'bandpass', toF?: number, s?: Sends): void {
    const g = this.out(dest, t, s);
    this.env(g, t, 0.003, 0.4 * v, dur);
    const bp = this.filter(type, f, q, g);
    if (toF) bp.frequency.exponentialRampToValueAtTime(toF, t + dur);
    this.noise(t, t + dur + 0.05, bp);
  }

  blip(dest: AudioNode, t: number, m: number, dur: number, v = 1, type: OscillatorType = 'square', s?: Sends): void {
    const g = this.out(dest, t, s);
    this.env(g, t, 0.002, 0.12 * v, dur);
    this.osc(type, mtof(m), t, t + dur + 0.05, g);
  }
}
