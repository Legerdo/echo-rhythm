import type { Atlas } from '../render/atlas';
import { bigText, text } from '../render/text';
import { VH, VW } from '../render/view';
import type { RunState } from '../sim/run';
import { City } from './city';

// The ending is played, not told: the last 8 bars of the anthem are the player's own moves from the
// boss fight (one note per beat), and every floor's recorded moves come back as dancing echoes.

const DEG = [5, 3, 1, 6];

/** Convert recorded action codes (one per beat) into 16-step melody bars for Music.setSolo. */
export function melodyBars(codes: number[]): string[] {
  const src = codes.slice(-32);
  while (src.length < 32) src.unshift(4);
  const toks: string[] = [];
  for (const c of src) {
    if (c === 4) toks.push('.', '.', '.', '.');
    else if (c === 5) toks.push('8', '-', '-', '.');
    else if (c >= 6) toks.push(`${DEG[(c - 6) & 3]}^`, '-', '.', '.');
    else toks.push(`${DEG[c & 3]}`, '-', '-', '.');
  }
  const bars: string[] = [];
  for (let i = 0; i < 8; i++) bars.push(toks.slice(i * 16, i * 16 + 16).join(' '));
  return bars;
}

interface Dancer {
  codes: number[];
  x: number;
  y: number;
  start: number;
  flip: boolean;
}

export class Ending {
  private city = new City(11);
  private dancers: Dancer[] = [];
  private kit: Dancer;
  /** Kit's own echo: the same moves, one bar (4 beats) later */
  private shadow: Dancer;
  private notes: { x: number; y: number; t: number; c: string }[] = [];
  private lastBeat = -1;

  constructor(
    private atlas: Atlas,
    run: RunState,
  ) {
    const mels = run.melodies.length ? run.melodies : [[1, 3, 1, 3]];
    const boss = mels[mels.length - 1];
    this.kit = { codes: boss.length ? boss : [1, 3], x: 3, y: 1, start: 0, flip: false };
    this.shadow = { codes: this.kit.codes, x: 3, y: 1, start: 1, flip: false };
    mels.slice(0, -1).forEach((m, i) => {
      this.dancers.push({ codes: m.length ? m : [4], x: 1 + ((i * 2) % 6), y: i % 2 ? 0 : 2, start: 4 + i * 2, flip: i % 2 === 1 });
    });
  }

  /** beat = fractional heard beat of the ending song (bar 0 starts at beat 0). */
  draw(g: CanvasRenderingContext2D, beat: number, now: number, stats: string[]): void {
    const bar = Math.floor(beat / 4);
    const phase = beat - Math.floor(beat);
    const lit = [0, 1, 2, 3].map((d) => Math.max(0, Math.min(1, (beat - (d === 3 ? 12 : d * 4)) / 4)));
    this.city.draw(g, now, lit, phase);
    const gy = this.city.ground;
    const names = ['지하 선로', '네온 시장', '옥상 변전소', '시계탑'];
    for (let d = 0; d < 4; d++) {
      const t = beat - (d === 3 ? 12 : d * 4);
      if (t > 0 && t < 6) text(g, names[d], [60, 146, 300, 192][d], gy - 96 + (d === 3 ? -40 : 0), { font: 'small', color: ['#5fd0b4', '#ff5fb8', '#ffb347', '#f2d266'][d], align: 'center', alpha: Math.min(1, t, 6 - t) });
    }
    const ib = Math.floor(beat);
    if (ib !== this.lastBeat && ib >= 0) {
      this.lastBeat = ib;
      for (const d of [this.kit, ...this.dancers]) if (bar >= d.start || d === this.kit) this.stepDancer(d, ib);
      if (ib >= 4) this.stepDancer(this.shadow, ib - 4);
      if (bar >= 8 && bar < 16) {
        const c = this.kit.codes[(ib - 32 + this.kit.codes.length * 8) % this.kit.codes.length];
        if (c !== 4) this.notes.push({ x: 150 + this.kit.x * 14, y: gy + 10, t: now, c: c >= 6 ? '#7fe3ff' : '#fff3c4' });
      }
    }
    // stage grid on the foreground roof
    const sx = 150;
    const sy = gy + 14;
    g.fillStyle = '#2a2440';
    for (let x = 0; x < 7; x++) for (let y = 0; y < 3; y++) if ((x + y + ib) & 1) g.fillRect(sx + x * 14, sy + y * 10, 13, 9);
    for (const d of this.dancers) {
      if (bar < d.start) continue;
      const a = Math.min(1, (beat - d.start * 4) / 4);
      g.globalAlpha = a * (0.55 + 0.35 * (1 - phase));
      this.atlas.draw(g, phase < 0.5 ? 'echo_idle1' : 'echo_idle0', sx + d.x * 14 - 1, sy + d.y * 10 - 12, d.flip);
      g.globalAlpha = 1;
    }
    if (beat >= 4) {
      g.globalAlpha = 0.6 + 0.3 * (1 - phase);
      this.atlas.draw(g, phase < 0.5 ? 'echo_idle1' : 'echo_idle0', sx + this.shadow.x * 14 - 1, sy + this.shadow.y * 10 - 12, this.shadow.flip);
      g.globalAlpha = 1;
    }
    this.atlas.draw(g, phase < 0.5 ? 'kit_idle1' : 'kit_idle0', sx + this.kit.x * 14 - 1, sy + this.kit.y * 10 - 12, this.kit.flip);
    this.notes = this.notes.filter((n) => now - n.t < 1600);
    for (const n of this.notes) {
      const t = (now - n.t) / 1600;
      g.globalAlpha = 1 - t;
      this.atlas.draw(g, 'ui_note', n.x + Math.sin(t * 6) * 4, n.y - t * 60);
      g.globalAlpha = 1;
    }
    if (bar < 2) bigText(g, 'AFTERBEAT', VW / 2, 40, 3, '#fff3c4');
    if (bar >= 8 && bar < 16) {
      g.fillStyle = '#0b0a14';
      g.globalAlpha = 0.7;
      g.fillRect(0, VH - 22, VW, 22);
      g.globalAlpha = 1;
      text(g, '지금 들리는 멜로디는 보스전에서 당신이 남긴 마지막 32박입니다.', VW / 2, VH - 17, { font: 'small', color: '#7fe3ff', align: 'center' });
    }
    if (bar >= 16) {
      const a = Math.min(1, (beat - 64) / 4);
      g.globalAlpha = a * 0.82;
      g.fillStyle = '#0b0a14';
      g.fillRect(80, 30, VW - 160, 150);
      g.globalAlpha = a;
      bigText(g, '도시의 박자가 돌아왔다', VW / 2, 40, 2, '#f2d266');
      stats.forEach((s, i) => text(g, s, VW / 2, 78 + i * 14, { font: 'small', color: '#d6d4ea', align: 'center' }));
      text(g, 'Enter — 타이틀로', VW / 2, 162, { font: 'small', color: '#7fe3ff', align: 'center' });
      g.globalAlpha = 1;
    }
  }

  private stepDancer(d: Dancer, beatIdx: number): void {
    const c = d.codes[((beatIdx % d.codes.length) + d.codes.length) % d.codes.length];
    const dir = c >= 6 ? c - 6 : c;
    if (c === 5) {
      d.x = 3;
      d.y = 1;
    } else if (c <= 3) {
      const nx = d.x + [0, 1, 0, -1][dir];
      const ny = d.y + [-1, 0, 1, 0][dir];
      if (nx >= 0 && nx < 7) d.x = nx;
      if (ny >= 0 && ny < 3) d.y = ny;
      if (dir === 1) d.flip = false;
      if (dir === 3) d.flip = true;
    }
  }

  get duration(): number {
    return 64;
  }
}
