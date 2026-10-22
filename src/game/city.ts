import { Rng } from '../sim/rng';
import { VH, VW } from '../render/view';

// Night skyline for the title and the ending. Four districts (subway, market, rooftop, clocktower)
// can be lit independently; the ending lights them as the music gains each layer.

interface Bld {
  x: number;
  w: number;
  h: number;
  layer: number;
  d: number;
  wins: [number, number, number][];
  sign: number;
}

const ACCENT = ['#5fd0b4', '#ff5fb8', '#ffb347', '#f2d266'];

export class City {
  private b: Bld[] = [];
  private stars: [number, number][] = [];
  private horizon = VH - 64;

  constructor(
    seed = 7,
    private towerX = 192,
    private moonX = 300,
  ) {
    const rng = new Rng(seed);
    for (let i = 0; i < 60; i++) this.stars.push([rng.int(VW), rng.int(this.horizon - 40)]);
    for (const layer of [0, 1]) {
      let x = -6;
      while (x < VW) {
        const w = layer ? rng.range(18, 34) : rng.range(14, 26);
        const h = layer ? rng.range(28, 70) : rng.range(46, 96);
        const cx = x + w / 2;
        const d = Math.abs(cx - this.towerX) < 20 ? 3 : cx < 120 ? 0 : cx < 172 ? 1 : 2;
        if (d !== 3 || layer === 0) {
          const wins: [number, number, number][] = [];
          for (let wy = this.horizon - h + 5; wy < this.horizon - 3; wy += layer ? 6 : 5)
            for (let wx = x + 3; wx < x + w - 3; wx += layer ? 5 : 4) if (rng.chance(0.42)) wins.push([wx, wy, rng.int(100)]);
          this.b.push({ x, w, h, layer, d, wins, sign: layer && rng.chance(0.5) ? rng.range(6, 18) : 0 });
        }
        x += w + (layer ? rng.range(0, 4) : rng.range(-2, 2));
      }
    }
  }

  draw(g: CanvasRenderingContext2D, now: number, lit: number[], beatPhase: number): void {
    // banded sky with checker dither between bands
    const bands = ['#06050d', '#0a0818', '#110c24', '#1a1030', '#26123a'];
    const bh = Math.ceil(this.horizon / bands.length);
    for (let i = 0; i < bands.length; i++) {
      g.fillStyle = bands[i];
      g.fillRect(0, i * bh, VW, bh);
      if (i < bands.length - 1) {
        g.fillStyle = bands[i + 1];
        for (let y = i * bh + bh - 3; y < i * bh + bh; y++) for (let x = (y & 1) * 1; x < VW; x += 2) g.fillRect(x, y, 1, 1);
      }
    }
    g.fillStyle = '#d6d4ea';
    for (const [x, y] of this.stars) {
      if ((x * 7 + y * 3 + Math.floor(now / 700)) % 11 === 0) continue;
      g.fillRect(x, y, 1, 1);
    }
    // moon
    g.fillStyle = '#fff3c4';
    g.beginPath();
    g.arc(this.moonX, 34, 13, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#06050d';
    g.beginPath();
    g.arc(this.moonX + 6, 30, 12, 0, Math.PI * 2);
    g.fill();

    for (const b of this.b.filter((q) => q.layer === 0)) this.building(g, b, lit[b.d], now, beatPhase);
    this.tower(g, lit[3], beatPhase);
    for (const b of this.b.filter((q) => q.layer === 1)) this.building(g, b, lit[b.d], now, beatPhase);

    // foreground roof
    g.fillStyle = '#1f1b2e';
    g.fillRect(0, this.horizon, VW, VH - this.horizon);
    g.fillStyle = '#3a3355';
    g.fillRect(0, this.horizon, VW, 2);
    g.fillStyle = '#2a2440';
    for (let x = 4; x < VW; x += 12) g.fillRect(x, this.horizon - 9, 2, 9);
    g.fillRect(0, this.horizon - 10, VW, 2);
  }

  private building(g: CanvasRenderingContext2D, b: Bld, lit: number, now: number, phase: number): void {
    const top = this.horizon - b.h;
    g.fillStyle = b.layer ? '#171326' : '#100d1f';
    g.fillRect(b.x, top, b.w, b.h);
    g.fillStyle = b.layer ? '#221c38' : '#16122a';
    g.fillRect(b.x, top, b.w, 1);
    for (const [x, y, s] of b.wins) {
      const on = s < 12 + lit * 75;
      if (!on) continue;
      const warm = s % 3 !== 0;
      g.fillStyle = lit > 0.5 && s % 5 === 0 ? ACCENT[b.d] : warm ? '#ffd27a' : '#8fb0ee';
      g.globalAlpha = 0.35 + 0.65 * Math.min(1, lit + 0.2);
      g.fillRect(x, y, b.layer ? 2 : 1, b.layer ? 2 : 1);
    }
    g.globalAlpha = 1;
    if (b.sign && lit > 0.3) {
      const flick = (Math.floor(now / 90) + b.x) % 23 === 0 ? 0.3 : 1;
      g.globalAlpha = Math.min(1, lit) * flick * (0.7 + 0.3 * (1 - phase));
      g.fillStyle = ACCENT[b.d];
      g.fillRect(b.x + 2, top + 4, Math.min(b.sign, b.w - 4), 3);
      g.globalAlpha = 1;
    }
  }

  private tower(g: CanvasRenderingContext2D, lit: number, phase: number): void {
    const cx = this.towerX;
    const top = 26;
    g.fillStyle = '#14101f';
    g.fillRect(cx - 14, top + 30, 28, this.horizon - top - 30);
    g.fillRect(cx - 10, top + 14, 20, 18);
    g.beginPath();
    g.moveTo(cx - 12, top + 15);
    g.lineTo(cx, top - 4);
    g.lineTo(cx + 12, top + 15);
    g.fill();
    // clock face
    const glow = 0.25 + 0.75 * lit;
    g.fillStyle = '#3a2a10';
    g.beginPath();
    g.arc(cx, top + 24, 8, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = glow;
    g.fillStyle = '#f2d266';
    g.beginPath();
    g.arc(cx, top + 24, 6, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = '#3a2a10';
    g.fillRect(cx, top + 19, 1, 5);
    g.fillRect(cx, top + 24, 4, 1);
    if (lit > 0.6) {
      g.globalAlpha = (1 - phase) * 0.35 * lit;
      g.fillStyle = '#f2d266';
      g.fillRect(cx - 16, top + 12, 32, 26);
      g.globalAlpha = 1;
    }
    for (let y = top + 40; y < this.horizon - 4; y += 7) {
      g.fillStyle = lit > 0.4 ? '#ffd27a' : '#2a2440';
      g.fillRect(cx - 2, y, 4, 3);
    }
  }

  get ground(): number {
    return this.horizon;
  }
}
