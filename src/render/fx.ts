// Purely visual effects. All timing is wall-clock ms, never the beat clock, so hit-stop and
// shakes can never desync the game from the music.

import { text, type FontKey } from './text';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  c: string;
  s: number;
}
interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  max: number;
  c: string;
  w: number;
}
interface Pop {
  x: number;
  y: number;
  s: string;
  c: string;
  life: number;
  max: number;
  font: FontKey;
  rise: number;
}
interface Streak {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  life: number;
  max: number;
  c: string;
  w: number;
}

let seed = 1;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

export class Fx {
  parts: Particle[] = [];
  rings: Ring[] = [];
  pops: Pop[] = [];
  streaks: Streak[] = [];
  shakeT = 0;
  shakeAmp = 0;
  flashC = '';
  flashT = 0;
  flashMax = 1;
  reduce = false;
  shakeOn = true;

  burst(x: number, y: number, colors: string[], n: number, speed = 60, grav = 120, life = 420): void {
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const v = speed * (0.4 + rnd() * 0.8);
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - speed * 0.4,
        g: grav,
        life: life * (0.6 + rnd() * 0.6),
        max: life,
        c: colors[i % colors.length],
        s: rnd() < 0.3 ? 2 : 1,
      });
    }
  }

  dust(x: number, y: number, c = '#9e9bbd'): void {
    for (let i = 0; i < 3; i++) {
      this.parts.push({ x: x + (rnd() - 0.5) * 6, y, vx: (rnd() - 0.5) * 20, vy: -8 - rnd() * 8, g: 0, life: 260, max: 260, c, s: 1 });
    }
  }

  rise(x: number, y: number, c: string, n = 4): void {
    for (let i = 0; i < n; i++) {
      this.parts.push({ x: x + (rnd() - 0.5) * 10, y: y + (rnd() - 0.5) * 6, vx: (rnd() - 0.5) * 6, vy: -20 - rnd() * 20, g: 0, life: 600, max: 600, c, s: 1 });
    }
  }

  ring(x: number, y: number, r0: number, r1: number, c: string, life = 350, w = 1): void {
    this.rings.push({ x, y, r0, r1, life, max: life, c, w });
  }

  pop(x: number, y: number, s: string, c: string, font: FontKey = 'tiny', life = 700, rise = 14): void {
    // stack fresh labels that would land on top of each other instead of overprinting
    let yy = y;
    for (let guard = 0; guard < 6; guard++) {
      const clash = this.pops.some((p) => Math.abs(p.x - x) < 48 && Math.abs(p.y - yy) < 9 && p.max - p.life < 350);
      if (!clash) break;
      yy -= 10;
    }
    this.pops.push({ x, y: yy, s, c, life, max: life, font, rise });
  }

  streak(x0: number, y0: number, x1: number, y1: number, c: string, life = 160, w = 2): void {
    this.streaks.push({ x0, y0, x1, y1, life, max: life, c, w });
  }

  shake(amp: number, ms = 160): void {
    if (!this.shakeOn) return;
    this.shakeAmp = Math.max(this.shakeAmp, this.reduce ? amp * 0.5 : amp);
    this.shakeT = Math.max(this.shakeT, ms);
  }

  flash(c: string, ms = 120): void {
    if (this.reduce) ms *= 0.5;
    this.flashC = c;
    this.flashT = ms;
    this.flashMax = ms;
  }

  offset(): [number, number] {
    if (this.shakeT <= 0) return [0, 0];
    const a = this.shakeAmp * (this.shakeT / 160);
    return [Math.round((rnd() - 0.5) * 2 * a), Math.round((rnd() - 0.5) * 2 * a)];
  }

  update(dt: number): void {
    const s = dt / 1000;
    for (const p of this.parts) {
      p.life -= dt;
      p.vy += p.g * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const p of this.pops) p.life -= dt;
    this.pops = this.pops.filter((p) => p.life > 0);
    for (const k of this.streaks) k.life -= dt;
    this.streaks = this.streaks.filter((k) => k.life > 0);
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.shakeT === 0) this.shakeAmp = 0;
    this.flashT = Math.max(0, this.flashT - dt);
    if (this.parts.length > 500) this.parts.splice(0, this.parts.length - 500);
  }

  draw(g: CanvasRenderingContext2D, ox: number, oy: number): void {
    for (const k of this.streaks) {
      g.globalAlpha = k.life / k.max;
      g.strokeStyle = k.c;
      g.lineWidth = k.w;
      g.beginPath();
      g.moveTo(Math.round(k.x0 - ox) + 0.5, Math.round(k.y0 - oy) + 0.5);
      g.lineTo(Math.round(k.x1 - ox) + 0.5, Math.round(k.y1 - oy) + 0.5);
      g.stroke();
    }
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - t) * (1 - t));
      g.globalAlpha = Math.min(1, (r.life / r.max) * 1.4);
      g.strokeStyle = r.c;
      g.lineWidth = r.w;
      g.beginPath();
      // octagon reads as pixel art better than a smooth circle
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const px = Math.round(r.x - ox + Math.cos(a) * rad) + 0.5;
        const py = Math.round(r.y - oy + Math.sin(a) * rad) + 0.5;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();
    }
    for (const p of this.parts) {
      g.globalAlpha = Math.min(1, (p.life / p.max) * 1.6);
      g.fillStyle = p.c;
      g.fillRect(Math.round(p.x - ox), Math.round(p.y - oy), p.s, p.s);
    }
    g.globalAlpha = 1;
    for (const p of this.pops) {
      const t = 1 - p.life / p.max;
      const y = p.y - oy - p.rise * (1 - (1 - t) * (1 - t));
      text(g, p.s, p.x - ox, y, { font: p.font, color: p.c, align: 'center', alpha: Math.min(1, (p.life / p.max) * 2) });
    }
  }

  drawFlash(g: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.flashT <= 0) return;
    g.globalAlpha = (this.flashT / this.flashMax) * (this.reduce ? 0.12 : 0.28);
    g.fillStyle = this.flashC;
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 1;
  }
}
