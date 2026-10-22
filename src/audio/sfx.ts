import type { SimEvent } from '../sim/types';
import type { AudioEngine } from './engine';
import type { Music } from './music';
import type { Voices } from './synth';

// Feedback sounds are tuned to the chord currently playing so they sit inside the groove.

export class Sfx {
  constructor(
    private eng: AudioEngine,
    private v: Voices,
    private music: Music,
  ) {}

  private get t(): number {
    return this.eng.ctx.currentTime + 0.005;
  }
  private get out(): AudioNode {
    return this.eng.sfxBus;
  }
  private tones(beat: number): number[] {
    return this.music.chordAtBeat(beat);
  }

  menu(kind: 'move' | 'ok' | 'back' | 'deny'): void {
    const t = this.t;
    const v = this.v;
    if (kind === 'move') v.blip(this.out, t, 84, 0.04, 0.5, 'triangle');
    else if (kind === 'ok') {
      v.blip(this.out, t, 79, 0.06, 0.6, 'square');
      v.blip(this.out, t + 0.06, 86, 0.1, 0.6, 'square');
    } else if (kind === 'back') {
      v.blip(this.out, t, 79, 0.06, 0.5, 'triangle');
      v.blip(this.out, t + 0.06, 72, 0.1, 0.5, 'triangle');
    } else v.blip(this.out, t, 52, 0.12, 0.6, 'sawtooth');
  }

  warn(): void {
    this.v.blip(this.out, this.t, 96, 0.03, 0.35, 'square');
  }

  warnBell(): void {
    const t = this.t;
    this.v.bell(this.out, t, 88, 0.05, 0.35);
  }

  offbeat(): void {
    this.v.noiseHit(this.out, this.t, 400, 1, 0.06, 0.4, 'lowpass');
  }

  events(evs: SimEvent[], beat: number): void {
    const t = this.t;
    const v = this.v;
    const o = this.out;
    const ch = this.tones(beat);
    let hits = 0;
    for (const e of evs) {
      switch (e.t) {
        case 'move':
          if (e.who === 'player') {
            const idx = [2, 1, 0, 3][e.d ?? 0] ?? 0;
            v.pluck(o, t, (ch[idx] ?? ch[0]) + 24, 0.08, 0.35, { dly: 0.12 }, 'triangle');
          } else if (e.who === 'enemy' && e.s === 'knock') v.noiseHit(o, t, 300, 1, 0.12, 0.6, 'lowpass');
          break;
        case 'swing':
          if (e.who === 'player') v.noiseHit(o, t, 2600, 1.2, 0.07, 0.5, 'bandpass', 900);
          else if (e.who === 'echo') v.noiseHit(o, t, 2200, 1.2, 0.07, 0.3, 'bandpass', 900, { dly: 0.5 });
          else v.noiseHit(o, t, 900, 1, 0.08, 0.5, 'bandpass', 300);
          break;
        case 'hit':
          if (hits++ > 3) break;
          if (e.s === 'player') {
            v.noiseHit(o, t, 1100, 0.8, 0.09, 0.9, 'lowpass');
            v.blip(o, t, ch[0] + 24, 0.07, 0.7, 'square');
          } else if (e.s === 'echo') {
            v.noiseHit(o, t, 1400, 0.8, 0.08, 0.6, 'lowpass', undefined, { dly: 0.4 });
            v.blip(o, t, ch[2] + 24, 0.07, 0.55, 'triangle', { dly: 0.45 });
          } else if (e.s === 'reso') {
            v.kick(o, t, 0.8);
          } else v.noiseHit(o, t, 600, 1, 0.12, 0.6, 'lowpass');
          if (e.who === 'boss') v.bell(o, t, ch[0] + 12, 0.2, 0.5);
          break;
        case 'kill':
          ch.slice(0, 3).forEach((n, i) => v.pluck(o, t + i * 0.045, n + 24 + (e.who === 'echo' ? 12 : 0), 0.06, 0.6, { dly: 0.2 }, 'square'));
          v.noiseHit(o, t, 3000, 0.7, 0.12, 0.5, 'highpass');
          break;
        case 'block':
          if (e.s === 'shield') {
            v.blip(o, t, 98, 0.08, 0.5, 'square');
            v.blip(o, t, 103, 0.12, 0.35, 'square');
            v.noiseHit(o, t, 6000, 2, 0.08, 0.4, 'bandpass');
          } else if (e.s === 'armor') {
            v.sweep(o, t, 140, 60, 0.15, 1.2, 'sine');
          } else {
            v.noiseHit(o, t, 380, 0.7, 0.14, 0.7, 'lowpass');
            v.blip(o, t, 40, 0.18, 0.6, 'sine');
          }
          break;
        case 'reso':
          v.stab(o, t, ch.slice(0, 4).map((n) => n + 24), 1.1);
          v.bell(o, t + 0.02, ch[0] + 36, 0.3, 0.7);
          break;
        case 'hurt':
          v.sweep(o, t, 220, 55, 0.25, 1.4, 'sawtooth');
          v.noiseHit(o, t, 500, 0.8, 0.2, 1, 'lowpass');
          this.eng.duck();
          break;
        case 'shielded':
          v.bell(o, t, 96, 0.1, 0.6);
          break;
        case 'relayTune':
          v.bell(o, t, ch[0] + 24, 0.1, e.who === 'echo' ? 0.35 : 0.5);
          break;
        case 'relayOn':
          v.sweep(o, t, 200, 1600, 0.5, 0.5, 'sawtooth', { rev: 0.4 });
          ch.forEach((n, i) => v.bell(o, t + 0.08 * i, n + 24, 0.3, 0.8));
          break;
        case 'exitOpen':
          [1, 3, 5, 8].forEach((d, i) => v.bell(o, t + 0.25 + i * 0.12, this.music.scaleNote(d, 36), 0.25, 0.9));
          break;
        case 'pickup':
          v.blip(o, t, ch[0] + 24, 0.06, 0.6, 'square');
          v.blip(o, t + 0.07, ch[2] + 24, 0.1, 0.6, 'square');
          break;
        case 'rewind':
          v.sweep(o, t, 180, 1800, 0.18, 0.9, 'sawtooth', { dly: 0.3 });
          v.noiseHit(o, t, 500, 2, 0.2, 0.6, 'bandpass', 4000);
          break;
        case 'fizzle':
          v.blip(o, t, 45, 0.12, 0.5, 'sawtooth');
          break;
        case 'echoSpawn':
          v.noiseHit(o, t, 5000, 0.5, 0.22, 0.12, 'highpass', 9000, { dly: 0.3 });
          break;
        case 'echoFade':
          v.sweep(o, t, 900, 200, 0.3, 0.3, 'triangle', { dly: 0.4 });
          break;
        case 'train':
          v.noiseHit(o, t, 260, 0.7, 0.7, 1.3, 'lowpass');
          v.noiseHit(o, t, 900, 1, 0.5, 0.6, 'bandpass', 3000);
          v.blip(o, t, 63, 0.3, 0.6, 'square');
          v.blip(o, t, 67, 0.3, 0.5, 'square');
          break;
        case 'vent':
          v.noiseHit(o, t, 4000, 0.6, 0.32, 0.55, 'highpass');
          break;
        case 'pulse':
          v.sweep(o, t, 90, 38, 0.38, 2.4, 'sine');
          break;
        case 'beam':
          v.sweep(o, t, 2400, 260, 0.22, 0.8, 'square');
          break;
        case 'slam':
          v.kick(o, t, 1.2);
          v.noiseHit(o, t, 700, 0.8, 0.3, 1, 'lowpass');
          break;
        case 'dash':
          v.noiseHit(o, t, 400, 1.2, 0.26, 0.9, 'bandpass', 2200);
          break;
        case 'stun':
          v.blip(o, t, 100, 0.04, 0.35, 'triangle');
          v.blip(o, t + 0.07, 103, 0.04, 0.35, 'triangle');
          break;
        case 'bossAttack':
          if (e.s === 'land' || e.s === 'stomp') {
            v.kick(o, t, 1.3);
            v.noiseHit(o, t, 500, 0.7, 0.4, 1.1, 'lowpass');
          } else if (e.s === 'col' || e.s === 'row') v.sweep(o, t, 3000, 200, 0.3, 1, 'sawtooth');
          else v.noiseHit(o, t, 2500, 0.6, 0.35, 0.9, 'bandpass', 600);
          break;
        case 'bossPhase':
          v.sweep(o, t, 80, 1200, 1.6, 0.6, 'sawtooth', { rev: 0.5 });
          v.bell(o, t, 33, 2, 1);
          break;
        case 'bossDown':
          v.stab(o, t, [57, 61, 64, 69], 1.3);
          v.choir(o, t, [57, 61, 64], 2.5, 1.4);
          [69, 73, 76, 81].forEach((n, i) => v.bell(o, t + 0.15 * i, n, 0.5, 0.9));
          break;
        case 'summon':
          v.sweep(o, t, 120, 600, 0.4, 0.5, 'triangle');
          break;
        case 'echoGet':
          [1, 3, 5, 8].forEach((d, i) => v.bell(o, t + i * 0.1, this.music.scaleNote(d, 36), 0.4, 0.9));
          v.choir(o, t, ch.slice(0, 3).map((n) => n + 12), 1.5, 1);
          break;
        case 'chest':
          [0, 2, 1, 3].forEach((k, i) => v.pluck(o, t + i * 0.06, (ch[k] ?? ch[0]) + 36, 0.08, 0.6, { dly: 0.3 }, 'square'));
          break;
        case 'groove':
          if ((e.n ?? 1) > 1) {
            v.blip(o, t, ch[0] + 24, 0.05, 0.4, 'square');
            v.blip(o, t + 0.05, ch[2] + 24 + ((e.n ?? 1) === 3 ? 12 : 0), 0.08, 0.45, 'square');
          } else v.blip(o, t, ch[0] + 12, 0.1, 0.3, 'triangle');
          break;
        case 'gate':
          v.noiseHit(o, t, 300, 1, 0.1, 0.6, 'lowpass');
          v.blip(o, t, (e.n ? 55 : 48), 0.08, 0.4, 'square');
          break;
        case 'clear':
          [1, 3, 5, 4, 5].forEach((d, i) => v.pluck(o, t + i * 0.09, this.music.scaleNote(d, 24), 0.1, 0.8, { dly: 0.3 }, 'square'));
          break;
        case 'death':
          v.stab(o, t, [48, 51, 55], 1);
          v.sweep(o, t, 400, 40, 1.2, 1.2, 'sawtooth');
          break;
        default:
          break;
      }
    }
  }
}
