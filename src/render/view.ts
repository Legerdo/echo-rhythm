import { STATIONS, nextStationCells } from '../sim/boss';
import { DX, DY, T, grooveLevel, type Enemy, type SimEvent, type World } from '../sim/types';
import { laneCells } from '../sim/world';
import type { Atlas } from './atlas';
import type { Fx } from './fx';
import { ZONE_SKY } from './palette';
import { text } from './text';

export const VW = 384;
export const VH = 216;
const TS = 16;
const WALL_LIFT = 6;

interface Vis {
  x: number;
  y: number;
  fx: number;
  fy: number;
  t0: number;
  dur: number;
  hop: number;
  flash: number;
  flip: boolean;
  lx: number;
  ly: number;
  lungeT: number;
  dying: number;
  kind: string;
  stop: number;
  hurtT: number;
}

const mkVis = (x: number, y: number, kind: string): Vis => ({
  x: x * TS,
  y: y * TS,
  fx: x * TS,
  fy: y * TS,
  t0: 0,
  dur: 0,
  hop: 0,
  flash: 0,
  flip: false,
  lx: 0,
  ly: 0,
  lungeT: -1e9,
  dying: 0,
  kind,
  stop: 0,
  hurtT: -1e9,
});

const ENEMY_COLORS: Record<string, string[]> = {
  buzz: ['#9e9bbd', '#e0343c', '#d6d4ea'],
  clank: ['#c8962e', '#f2d266', '#7a5a1c'],
  warden: ['#4f74c0', '#8fb0ee', '#e0343c'],
  ram: ['#e0343c', '#8c1a2c', '#fff3c4'],
  woofer: ['#9a2c86', '#ff9ad6', '#6f6a94'],
  conductor: ['#f2d266', '#c8962e', '#e0343c'],
  golem: ['#e0343c', '#f2d266', '#d6d4ea'],
  spotlight: ['#d6d4ea', '#6f6a94', '#f2d266'],
};

export class View {
  cam = { x: 0, y: 0 };
  player = mkVis(0, 0, 'player');
  echo = mkVis(0, 0, 'echo');
  echoAlpha = 0;
  echoTrail: { x: number; y: number; t: number }[] = [];
  enemies = new Map<number, Vis>();
  ghosts: { v: Vis; e: Enemy }[] = [];
  boss = mkVis(0, 0, 'boss');
  bossCast = -1e9;
  trains: { lane: { x0: number; y0: number; x1: number; y1: number; d: number }; t0: number }[] = [];
  beams: { cells: [number, number][]; t0: number; c: string }[] = [];
  relayPulse = new Map<number, number>();
  /** 0..1 position within the current beat (audio-heard), for idle bobs and floor pulse */
  phase = 0;
  beat = 0;
  lastBeatSeen = -1;
  private light = new Float32Array(0);

  constructor(
    private atlas: Atlas,
    private fx: Fx,
  ) {}

  reset(w: World, now: number): void {
    this.player = mkVis(w.player.x, w.player.y, 'player');
    this.echo = mkVis(0, 0, 'echo');
    this.echoAlpha = 0;
    this.echoTrail = [];
    this.enemies.clear();
    this.ghosts = [];
    this.trains = [];
    this.beams = [];
    this.relayPulse.clear();
    for (const e of w.enemies) this.enemies.set(e.id, mkVis(e.x, e.y, e.kind));
    if (w.boss) this.boss = mkVis(w.boss.x, w.boss.y, 'boss');
    const [cx, cy] = this.camTarget(w);
    this.cam.x = cx;
    this.cam.y = cy;
    this.player.t0 = now;
  }

  // ------------------------------------------------------------- tweens

  private tween(v: Vis, tx: number, ty: number, now: number, dur: number, hop: number): void {
    const [cx, cy] = this.pos(v, now);
    v.fx = cx;
    v.fy = cy;
    v.x = tx * TS;
    v.y = ty * TS;
    v.t0 = now;
    v.dur = dur;
    v.hop = hop;
  }

  private pos(v: Vis, now: number): [number, number, number] {
    if (v.dur <= 0) return [v.x, v.y, 0];
    const t = Math.min(1, Math.max(0, (now - v.t0) / v.dur));
    const e = 1 - (1 - t) * (1 - t);
    let x = v.fx + (v.x - v.fx) * e;
    let y = v.fy + (v.y - v.fy) * e;
    const h = Math.sin(Math.PI * t) * v.hop;
    const lt = (now - v.lungeT) / 130;
    if (lt >= 0 && lt < 1) {
      const k = Math.sin(Math.PI * lt) * 4;
      x += v.lx * k;
      y += v.ly * k;
    }
    return [x, y, h];
  }

  private lunge(v: Vis, d: number, now: number): void {
    v.lx = DX[d];
    v.ly = DY[d];
    v.lungeT = now;
    if (v.dur <= 0 || now - v.t0 > v.dur) {
      v.fx = v.x;
      v.fy = v.y;
      v.dur = 1;
      v.t0 = now - 10;
    }
  }

  // ------------------------------------------------------------- events -> visuals

  onEvents(w: World, evs: SimEvent[], now: number): void {
    const ctr = (x: number, y: number): [number, number] => [x * TS + 8, y * TS + 8];
    for (const e of evs) {
      switch (e.t) {
        case 'move': {
          if (e.who === 'player') {
            this.tween(this.player, e.x2!, e.y2!, now, 95, 3);
            if (e.d === 1) this.player.flip = false;
            else if (e.d === 3) this.player.flip = true;
            this.fx.dust(e.x * TS + 8, e.y * TS + 14);
          } else if (e.who === 'echo') {
            this.echoTrail.push({ x: this.echo.x, y: this.echo.y, t: now });
            this.tween(this.echo, e.x2!, e.y2!, now, e.s === 'warp' ? 1 : 95, e.s === 'warp' ? 0 : 3);
            if (e.d === 1) this.echo.flip = false;
            else if (e.d === 3) this.echo.flip = true;
          } else if (e.who === 'enemy' && e.n !== undefined) {
            const v = this.enemies.get(e.n);
            if (v) {
              this.tween(v, e.x2!, e.y2!, now, e.s === 'knock' ? 70 : 95, e.s === 'knock' ? 0 : 2);
              if (e.d === 1) v.flip = false;
              else if (e.d === 3) v.flip = true;
            }
          }
          break;
        }
        case 'dash': {
          const v = this.enemies.get(e.n!);
          if (v) {
            this.tween(v, e.x2!, e.y2!, now, 120, 0);
            v.flip = e.d === 3;
          }
          const [ax, ay] = ctr(e.x, e.y);
          const [bx, by] = ctr(e.x2!, e.y2!);
          this.fx.streak(ax, ay + 3, bx, by + 3, '#ff7a6a', 220, 3);
          this.fx.shake(2, 120);
          break;
        }
        case 'swing': {
          const [sx, sy] = ctr(e.x, e.y);
          if (e.who === 'player') {
            this.lunge(this.player, e.d ?? 1, now);
            if (e.d === 1) this.player.flip = false;
            else if (e.d === 3) this.player.flip = true;
            this.fx.burst(sx - DX[e.d ?? 1] * 4, sy - DY[e.d ?? 1] * 4, ['#fff3c4', '#ffd27a'], 4, 40, 0, 160);
          } else if (e.who === 'echo') {
            this.lunge(this.echo, e.d ?? 1, now);
            this.fx.burst(sx - DX[e.d ?? 1] * 4, sy - DY[e.d ?? 1] * 4, ['#7fe3ff', '#d4fbff'], 4, 40, 0, 160);
          } else if (e.x2 !== undefined) {
            const v = this.enemies.get(e.x2);
            if (v) this.lunge(v, e.d ?? 2, now);
          }
          break;
        }
        case 'bump':
          this.lunge(this.player, e.d ?? 1, now);
          this.fx.dust(e.x * TS + 8 - DX[e.d ?? 1] * 6, e.y * TS + 10);
          break;
        case 'hit': {
          const [hx, hy] = ctr(e.x, e.y);
          if (e.who === 'boss') {
            this.boss.flash = now;
            this.fx.burst(this.boss.x + 16, this.boss.y + 12, ['#7fe3ff', '#fff3c4', '#f2d266'], 10, 80);
            this.fx.pop(this.boss.x + 16, this.boss.y - 4, `-${e.n}`, '#7fe3ff', 'small');
            this.fx.shake(2);
            break;
          }
          const v = e.x2 !== undefined ? this.enemies.get(e.x2) : undefined;
          if (v) {
            v.flash = now;
            v.stop = now + 70;
          }
          const col = e.s === 'echo' ? '#7fe3ff' : e.s === 'reso' ? '#ffffff' : '#ffd27a';
          this.fx.burst(hx, hy, [col, '#ffffff'], 6, 70);
          this.fx.pop(hx, hy - 10, `${e.n}`, col, 'tiny');
          break;
        }
        case 'kill': {
          // the vis itself is retired in collectBodies once the enemy leaves the world list
          const [kx, ky] = ctr(e.x, e.y);
          this.fx.burst(kx, ky, ENEMY_COLORS[e.s ?? ''] ?? ['#d6d4ea'], 16, 90, 160, 520);
          this.fx.ring(kx, ky, 2, 14, e.who === 'echo' ? '#7fe3ff' : '#ffd27a', 300);
          if (e.who === 'echo') this.fx.pop(kx, ky - 14, '잔향 처치', '#7fe3ff', 'tiny', 800);
          this.fx.shake(1.5, 100);
          break;
        }
        case 'block': {
          const [bx, by] = e.s === 'mute' ? [this.boss.x + 16, this.boss.y + 16] : ctr(e.x, e.y);
          this.fx.burst(bx, by, e.s === 'mute' ? ['#6f6a94', '#3a3355'] : ['#f2d266', '#ffffff'], 5, 50, 0, 200);
          this.fx.pop(bx, by - 12, e.s === 'shield' ? '막힘' : e.s === 'armor' ? '단단함' : '무음', '#9e9bbd', 'tiny', 600);
          break;
        }
        case 'reso': {
          const [rx, ry] = ctr(e.x, e.y);
          this.fx.ring(rx, ry, 3, 26, '#ffffff', 380, 2);
          this.fx.ring(rx, ry, 1, 18, '#7fe3ff', 420);
          this.fx.ring(rx, ry, 1, 12, '#ffd27a', 300);
          this.fx.burst(rx, ry, ['#7fe3ff', '#ffd27a', '#ffffff'], 18, 110, 60, 600);
          this.fx.pop(rx, ry - 16, '공명!', '#ffffff', 'small', 900, 18);
          this.fx.flash('#d4fbff', 140);
          this.fx.shake(3, 180);
          break;
        }
        case 'hurt':
          this.player.hurtT = now;
          this.fx.flash('#e0343c', 200);
          this.fx.shake(3.5, 220);
          this.fx.burst(this.player.x + 8, this.player.y + 6, ['#e0343c', '#ff7a6a'], 10, 70);
          this.fx.pop(this.player.x + 8, this.player.y - 10, `-${e.n}`, '#ff7a6a', 'small');
          break;
        case 'shielded':
          this.fx.ring(this.player.x + 8, this.player.y + 8, 4, 14, e.s === 'ghost' ? '#ffd27a' : '#7fe3ff', 300);
          this.fx.pop(this.player.x + 8, this.player.y - 10, e.s === 'ghost' ? '그루브 방어' : '하모닉', '#d4fbff', 'tiny');
          break;
        case 'relayTune': {
          const [tx, ty] = ctr(e.x, e.y);
          this.fx.ring(tx, ty - 4, 2, 9, e.who === 'echo' ? '#7fe3ff' : '#ffd27a', 260);
          break;
        }
        case 'relayOn': {
          const [tx, ty] = ctr(e.x, e.y);
          this.fx.ring(tx, ty, 4, 40, '#f2d266', 600, 2);
          this.fx.ring(tx, ty, 2, 30, '#7fe3ff', 700);
          this.fx.rise(tx, ty, '#f2d266', 10);
          this.fx.pop(tx, ty - 22, `중계기 복구 ${e.n}/${e.x2}`, '#f2d266', 'small', 1400, 20);
          break;
        }
        case 'exitOpen': {
          const [tx, ty] = ctr(e.x, e.y);
          this.fx.ring(tx, ty, 2, 24, '#b6e85a', 700, 2);
          break;
        }
        case 'pickup':
          this.fx.rise(e.x * TS + 8, e.y * TS + 6, e.s === 'battery' ? '#b6e85a' : '#7fe3ff', 6);
          this.fx.pop(e.x * TS + 8, e.y * TS - 6, e.s === 'battery' ? '+1 체력' : '+1 충전', e.s === 'battery' ? '#b6e85a' : '#7fe3ff', 'tiny');
          break;
        case 'rewind': {
          const [ax, ay] = ctr(e.x, e.y);
          const [bx, by] = ctr(e.x2!, e.y2!);
          this.fx.streak(ax, ay, bx, by, '#7fe3ff', 260, 2);
          this.fx.ring(bx, by, 2, 16, '#7fe3ff', 300);
          this.player.x = e.x2! * TS;
          this.player.y = e.y2! * TS;
          this.player.dur = 0;
          break;
        }
        case 'fizzle':
          this.fx.pop(this.player.x + 8, this.player.y - 10, '되감기 불가', '#9e9bbd', 'tiny');
          break;
        case 'echoSpawn':
          this.echo = { ...mkVis(e.x, e.y, 'echo'), flip: this.player.flip };
          this.echoTrail = [];
          this.echoAlpha = 0;
          break;
        case 'echoFade':
          this.fx.burst(this.echo.x + 8, this.echo.y + 8, ['#7fe3ff', '#1f6fa3'], 8, 40, -20, 500);
          break;
        case 'train':
          this.trains.push({ lane: { x0: e.x, y0: e.y, x1: e.x2!, y1: e.y2!, d: e.d ?? 1 }, t0: now });
          this.fx.shake(2.5, 260);
          break;
        case 'vent':
          for (const c of e.cells ?? []) this.fx.rise((c % w.w) * TS + 8, Math.floor(c / w.w) * TS + 10, '#d6d4ea', 6);
          break;
        case 'pulse': {
          const [px, py] = ctr(e.x, e.y);
          this.fx.ring(px, py, 6, 26, '#ff9ad6', 300, 2);
          this.fx.shake(1.5, 100);
          break;
        }
        case 'beam': {
          const cells: [number, number][] = [];
          for (let i = 1; i <= (e.n ?? 0); i++) cells.push([e.x + DX[e.d ?? 1] * i, e.y + DY[e.d ?? 1] * i]);
          this.beams.push({ cells, t0: now, c: '#fff3c4' });
          break;
        }
        case 'slam': {
          const [sx, sy] = ctr(e.x, e.y);
          for (let d = 0; d < 4; d++) this.fx.dust(sx + DX[d] * 16, sy + DY[d] * 16 + 4, '#c8962e');
          this.fx.ring(sx, sy, 6, 22, '#e0343c', 260, 2);
          this.fx.shake(2.5, 160);
          break;
        }
        case 'stun':
          this.fx.pop(e.x * TS + 8, e.y * TS - 6, '기절', '#f2d266', 'tiny', 600, 8);
          break;
        case 'bossAttack': {
          this.bossCast = now;
          const cells: [number, number][] = (e.cells ?? []).map((c) => [c % w.w, Math.floor(c / w.w)]);
          if (e.s === 'land') {
            this.tween(this.boss, e.x, e.y, now, 180, 18);
            this.fx.shake(3, 220);
            for (const [x, y] of cells) this.fx.dust(x * TS + 8, y * TS + 14, '#c8962e');
          } else {
            this.beams.push({ cells, t0: now, c: e.n ? '#ff9ad6' : '#ff7a6a' });
            this.fx.shake(1.5, 120);
          }
          break;
        }
        case 'bossPhase':
          this.fx.flash('#f2d266', 300);
          this.fx.ring(this.boss.x + 16, this.boss.y + 16, 8, 90, '#f2d266', 900, 2);
          this.fx.pop(this.boss.x + 16, this.boss.y - 10, `악장 ${e.n}`, '#f2d266', 'big', 1600, 16);
          break;
        case 'bossDown':
          this.fx.flash('#ffffff', 600);
          for (let i = 0; i < 4; i++) this.fx.ring(this.boss.x + 16, this.boss.y + 16, 4, 60 + i * 30, i % 2 ? '#7fe3ff' : '#f2d266', 900 + i * 200, 2);
          this.fx.burst(this.boss.x + 16, this.boss.y + 16, ['#f2d266', '#7fe3ff', '#ffffff', '#ff9ad6'], 60, 160, 40, 1400);
          this.boss.dying = now;
          break;
        case 'summon':
          this.fx.ring(e.x * TS + 8, e.y * TS + 8, 2, 14, '#9a2c86', 400);
          break;
        case 'echoGet':
          this.fx.flash('#7fe3ff', 400);
          this.fx.ring(e.x * TS + 8, e.y * TS + 8, 2, 50, '#7fe3ff', 900, 2);
          this.fx.burst(e.x * TS + 8, e.y * TS + 4, ['#7fe3ff', '#d4fbff'], 30, 90, 20, 900);
          break;
        case 'chest':
          this.fx.burst(e.x * TS + 8, e.y * TS + 4, ['#f2d266', '#7fe3ff'], 16, 70);
          break;
        case 'groove':
          if ((e.n ?? 1) > 1) this.fx.pop(this.player.x + 8, this.player.y - 12, `그루브 x${e.n}`, e.n === 3 ? '#7fe3ff' : '#ffd27a', 'tiny', 800);
          break;
        default:
          break;
      }
    }
    // spawn vis for enemies that appeared (boss summons)
    for (const en of w.enemies) if (!this.enemies.has(en.id)) this.enemies.set(en.id, mkVis(en.x, en.y, en.kind));
  }

  // ------------------------------------------------------------- camera

  private camTarget(w: World): [number, number] {
    const px = this.player.x + 8;
    const py = this.player.y + 8;
    const mw = w.w * TS;
    const mh = w.h * TS;
    const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));
    return [clamp(px, VW / 2, mw - VW / 2), clamp(py + 6, VH / 2 - 14, mh - VH / 2 + 24)];
  }

  // ------------------------------------------------------------- draw

  draw(g: CanvasRenderingContext2D, w: World, now: number, dt: number, opts: { preview: boolean }): void {
    this.ctx = g;
    const [tx, ty] = this.camTarget(w);
    const k = Math.min(1, dt / 90);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    const [sx, sy] = this.fx.offset();
    const ox = Math.round(this.cam.x - VW / 2) - sx;
    const oy = Math.round(this.cam.y - VH / 2) - sy;
    const z = Math.min(3, w.zone);
    g.fillStyle = ZONE_SKY[z];
    g.fillRect(0, 0, VW, VH);

    const x0 = Math.max(0, Math.floor(ox / TS) - 1);
    const y0 = Math.max(0, Math.floor(oy / TS) - 1);
    const x1 = Math.min(w.w - 1, Math.ceil((ox + VW) / TS) + 1);
    const y1 = Math.min(w.h - 1, Math.ceil((oy + VH) / TS) + 2);
    const tileAt = (x: number, y: number) => (x < 0 || y < 0 || x >= w.w || y >= w.h ? T.Void : w.tiles[y * w.w + x]);
    const isWallish = (x: number, y: number) => {
      const t = tileAt(x, y);
      return t === T.Wall;
    };

    // danger lookup
    const danger = new Map<number, { inn: number; dmg: number }>();
    for (const d of w.danger) {
      const key = d.y * w.w + d.x;
      const cur = danger.get(key);
      if (!cur || d.inn < cur.inn) danger.set(key, { inn: d.inn, dmg: d.dmg });
    }
    const pulse = 0.5 + 0.5 * Math.cos(this.phase * Math.PI * 2);

    // floor pass
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = tileAt(x, y);
        if (t === T.Void || t === T.Wall) continue;
        const px = x * TS - ox;
        const py = y * TS - oy;
        const dv = w.deco[y * w.w + x];
        // feature tiles are rare on purpose: a gear inlay or puddle should read as a place, not a pattern
        const variant = dv % 23 === 0 ? 1 : dv % 7 === 0 ? 2 : 0;
        this.atlas.draw(g, `f${z}_${variant}`, px, py);
        if (t === T.Rail) {
          const h = tileAt(x - 1, y) === T.Rail || tileAt(x + 1, y) === T.Rail;
          this.atlas.draw(g, h ? 'rail_h' : 'rail_v', px, py);
        } else if (t === T.Vent) {
          const d = danger.get(y * w.w + x);
          this.atlas.draw(g, d && d.inn === 1 ? 'vent_hot' : 'vent', px, py);
        } else if (t === T.Plate) {
          const on = (w.player.x === x && w.player.y === y) || (!!w.echo && !w.echo.faded && w.echo.x === x && w.echo.y === y);
          this.atlas.draw(g, on ? 'plate_on' : 'plate', px, py);
        } else if (t === T.Exit) {
          this.atlas.draw(g, w.exitOpen ? 'exit_open' : 'exit', px, py);
          if (w.exitOpen) {
            g.globalAlpha = 0.25 + 0.25 * pulse;
            g.fillStyle = '#7fe3ff';
            g.fillRect(px + 3, py + 3, 10, 10);
            g.globalAlpha = 1;
          }
        }
      }
    }

    // beat pulse on the floor around the player (music made visible)
    const pbx = Math.round(this.player.x / TS);
    const pby = Math.round(this.player.y / TS);
    g.fillStyle = z === 1 ? '#ff5fb8' : z === 2 ? '#8fb0ee' : z === 3 ? '#f2d266' : '#5fd0b4';
    const fade = Math.max(0, 1 - this.phase * 1.6);
    for (let y = pby - 4; y <= pby + 4; y++)
      for (let x = pbx - 4; x <= pbx + 4; x++) {
        const t = tileAt(x, y);
        if (t === T.Void || t === T.Wall || ((x + y + this.beat) & 1)) continue;
        const d = Math.abs(x - pbx) + Math.abs(y - pby);
        if (d > 4) continue;
        g.globalAlpha = fade * 0.09 * (1 - d / 5);
        g.fillRect(x * TS - ox, y * TS - oy, TS, TS);
      }
    g.globalAlpha = 1;

    // boss next-station shadow
    if (w.boss && !w.boss.defeated) {
      const cells = nextStationCells(w);
      if (cells.length) {
        const [sx2, sy2] = STATIONS[w.boss.next];
        const left = 4 - (w.turn & 3);
        g.globalAlpha = 0.35 + 0.2 * pulse;
        g.fillStyle = '#3a2a10';
        g.fillRect(sx2 * TS - ox + 2, sy2 * TS - oy + 2, 28, 28);
        g.globalAlpha = 1;
        g.strokeStyle = '#f2d266';
        g.setLineDash([2, 2]);
        g.strokeRect(sx2 * TS - ox + 1.5, sy2 * TS - oy + 1.5, 29, 29);
        g.setLineDash([]);
        text(g, `${left}`, sx2 * TS - ox + 16, sy2 * TS - oy + 10, { font: 'small', color: '#f2d266', align: 'center' });
      }
    }

    // telegraphs
    for (const [key, d] of danger) {
      const x = key % w.w;
      const y = Math.floor(key / w.w);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const px = x * TS - ox;
      const py = y * TS - oy;
      if (d.inn === 1) {
        g.globalAlpha = 0.32 + 0.22 * pulse;
        g.fillStyle = '#e0343c';
        g.fillRect(px + 1, py + 1, 14, 14);
        g.globalAlpha = 1;
        g.fillStyle = '#ff7a6a';
        g.fillRect(px + 1, py + 1, 3, 1);
        g.fillRect(px + 1, py + 1, 1, 3);
        g.fillRect(px + 12, py + 1, 3, 1);
        g.fillRect(px + 14, py + 1, 1, 3);
        g.fillRect(px + 1, py + 14, 3, 1);
        g.fillRect(px + 1, py + 12, 1, 3);
        g.fillRect(px + 12, py + 14, 3, 1);
        g.fillRect(px + 14, py + 12, 1, 3);
      } else if (d.inn <= 4) {
        // later beats: quiet countdown so a bar of warnings never floods the floor
        g.globalAlpha = 0.1 + 0.04 * (4 - d.inn);
        g.fillStyle = '#e0343c';
        g.fillRect(px + 2, py + 2, 12, 12);
        g.globalAlpha = 0.55;
        g.fillStyle = '#ff7a6a';
        g.fillRect(px + 2, py + 2, 2, 1);
        g.fillRect(px + 2, py + 2, 1, 2);
        g.fillRect(px + 12, py + 13, 2, 1);
        g.fillRect(px + 13, py + 12, 1, 2);
        if (d.inn === 2) text(g, '2', px + 8, py + 4, { font: 'tiny', color: '#ff7a6a', align: 'center', shadow: null });
        g.globalAlpha = 1;
      }
    }

    if (opts.preview) this.drawEchoPreview(g, w, ox, oy, pulse);

    // rows: walls then bodies, top to bottom
    const bodies = this.collectBodies(w, now);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = tileAt(x, y);
        if (t === T.Wall) {
          const dv = w.deco[y * w.w + x];
          const variant = (dv & 15) === 0 && !isWallish(x, y + 1) ? ((dv >> 4) % 2) + 1 : 0;
          const name = variant && this.atlas.has(`w${z}_${variant}`) ? `w${z}_${variant}` : `w${z}`;
          this.atlas.draw(g, name, x * TS - ox, y * TS - oy - WALL_LIFT);
        } else if (t === T.Gate) {
          const gt = w.gates.find((q) => q.x === x && q.y === y);
          this.atlas.draw(g, gt?.open ? 'gate_open' : 'gate', x * TS - ox, y * TS - oy - WALL_LIFT);
        }
      }
      for (const b of bodies) if (b.row === y) b.draw(ox, oy);
    }
    for (const b of bodies) if (b.row < y0 || b.row > y1) b.draw(ox, oy);

    // trains, beams
    this.drawTrains(g, now, ox, oy);
    this.beams = this.beams.filter((bm) => now - bm.t0 < 240);
    for (const bm of this.beams) {
      const a = 1 - (now - bm.t0) / 240;
      const line = bm.cells.length > 1 && (bm.cells.every(([, y]) => y === bm.cells[0][1]) || bm.cells.every(([x]) => x === bm.cells[0][0]));
      if (line && bm.c === '#fff3c4') {
        // spotlight: one continuous beam (glow + hot core), not tiles
        const horiz = bm.cells.every(([, y]) => y === bm.cells[0][1]);
        const xs = bm.cells.map(([x]) => x);
        const ys = bm.cells.map(([, y]) => y);
        const x0 = Math.min(...xs) * TS - ox;
        const y0 = Math.min(...ys) * TS - oy;
        const len = (horiz ? Math.max(...xs) - Math.min(...xs) : Math.max(...ys) - Math.min(...ys)) * TS + TS;
        const wob = Math.round(Math.sin(now / 25) * 1);
        g.globalAlpha = a * 0.35;
        g.fillStyle = '#ffd27a';
        if (horiz) g.fillRect(x0, y0 + 3 + wob, len, 10);
        else g.fillRect(x0 + 3 + wob, y0, 10, len);
        g.globalAlpha = a;
        g.fillStyle = '#fff3c4';
        if (horiz) g.fillRect(x0, y0 + 6 + wob, len, 4);
        else g.fillRect(x0 + 6 + wob, y0, 4, len);
        g.fillStyle = '#ffffff';
        if (horiz) g.fillRect(x0, y0 + 7 + wob, len, 2);
        else g.fillRect(x0 + 7 + wob, y0, 2, len);
      } else {
        // shockwave cells: bright rim that collapses inward
        const inset = Math.round((1 - a) * 5);
        for (const [x, y] of bm.cells) {
          const px = x * TS - ox;
          const py = y * TS - oy;
          g.globalAlpha = a * 0.3;
          g.fillStyle = bm.c;
          g.fillRect(px + 1, py + 1, 14, 14);
          g.globalAlpha = a;
          g.strokeStyle = bm.c;
          g.strokeRect(px + 1.5 + inset, py + 1.5 + inset, 13 - inset * 2, 13 - inset * 2);
        }
      }
      g.globalAlpha = 1;
    }

    // lighting
    this.drawLight(g, w, x0, y0, x1, y1, ox, oy);
    this.fx.draw(g, ox, oy);
    this.drawOverlays(g, w, ox, oy, now);
  }

  private drawEchoPreview(g: CanvasRenderingContext2D, w: World, ox: number, oy: number, pulse: number): void {
    const b = w.turn & 3;
    // the current bar's recording: this is next bar's echo path
    const rec = w.record.entries;
    for (let i = 0; i < rec.length; i++) {
      const e = rec[i];
      const x = (e.k === 'attack' ? e.fx + DX[e.d] : e.tx) * TS - ox;
      const y = (e.k === 'attack' ? e.fy + DY[e.d] : e.ty) * TS - oy;
      g.globalAlpha = 0.55;
      g.fillStyle = '#f39a3a';
      if (e.k === 'move' || e.k === 'warp') g.fillRect(x + 6, y + 10, 4, 3);
      else if (e.k === 'attack') {
        g.fillRect(x + 4, y + 11, 8, 1);
        g.fillRect(x + 7, y + 8, 2, 7);
      }
      g.globalAlpha = 1;
    }
    const ec = w.echo;
    if (!ec || ec.faded) return;
    let cx = ec.x;
    let cy = ec.y;
    for (let i = b; i < 4; i++) {
      const e = ec.entries[i];
      const next = i === b;
      const num = `${i + 1}`;
      if (e.k === 'move' || e.k === 'warp') {
        const px = e.tx * TS - ox;
        const py = e.ty * TS - oy;
        g.globalAlpha = next ? 0.75 + 0.25 * pulse : 0.45;
        g.fillStyle = '#2fa3d6';
        // path line from previous tile
        const ax = cx * TS - ox + 8;
        const ay = cy * TS - oy + 8;
        const bx = px + 8;
        const by = py + 8;
        for (let s = 0; s <= 6; s++) {
          if (s % 2) continue;
          g.fillRect(Math.round(ax + ((bx - ax) * s) / 6), Math.round(ay + ((by - ay) * s) / 6), 1, 1);
        }
        this.atlas.draw(g, 'fx_foot', px + 6, py + 7);
        if (next && e.k === 'move') this.bracket(g, px, py, '#7fe3ff');
        text(g, num, px + 12, py + 1, { font: 'tiny', color: '#7fe3ff', alpha: next ? 1 : 0.6 });
        cx = e.tx;
        cy = e.ty;
      } else if (e.k === 'attack') {
        const sx = (e.fx + DX[e.d]) * TS - ox;
        const sy = (e.fy + DY[e.d]) * TS - oy;
        g.globalAlpha = next ? 0.85 : 0.5;
        g.fillStyle = '#7fe3ff';
        for (let q = 0; q < 8; q++) g.fillRect(sx + 4 + q, sy + 11 - q, 1, 1);
        if (next) this.bracket(g, sx, sy, '#d4fbff');
        text(g, num, sx + 12, sy + 1, { font: 'tiny', color: '#7fe3ff', alpha: next ? 1 : 0.6 });
      }
      g.globalAlpha = 1;
    }
  }

  private bracket(g: CanvasRenderingContext2D, px: number, py: number, c: string): void {
    g.fillStyle = c;
    for (const [x, y, w, h] of [
      [0, 0, 4, 1],
      [0, 0, 1, 4],
      [12, 0, 4, 1],
      [15, 0, 1, 4],
      [0, 15, 4, 1],
      [0, 12, 1, 4],
      [12, 15, 4, 1],
      [15, 12, 1, 4],
    ])
      g.fillRect(px + x, py + y, w, h);
  }

  private collectBodies(w: World, now: number): { row: number; draw: (ox: number, oy: number) => void }[] {
    const out: { row: number; draw: (ox: number, oy: number) => void }[] = [];
    const g = this.ctx!;
    const a = this.atlas;
    const half = this.phase < 0.5;
    // props
    for (const p of w.props) {
      if ((p.kind === 'battery' || p.kind === 'tape') && p.on) continue;
      out.push({
        row: p.y,
        draw: (ox, oy) => {
          const x = p.x * TS - ox;
          const y = p.y * TS - oy;
          let name: string = p.kind;
          if (p.kind === 'crate') name = `crate${(w.zone % 4) * 2 + (p.v % 2)}`;
          else if (p.kind === 'relay') {
            name = p.on ? (half ? 'relay_on1' : 'relay_on0') : 'relay_off';
            if (p.on) {
              g.globalAlpha = 0.25 * (1 - this.phase);
              g.fillStyle = '#f2d266';
              g.fillRect(x - 2, y - 2, 20, 20);
              g.globalAlpha = 1;
            }
          } else if (p.kind === 'chest') name = p.on ? 'chest_open' : 'chest';
          else if (p.kind === 'pedestal') name = p.on ? 'pedestal_empty' : 'pedestal';
          const bob = (p.kind === 'battery' || p.kind === 'tape') && half ? -1 : 0;
          a.onTile(g, name, x, y + bob, false, 'img', p.kind === 'battery' || p.kind === 'tape' ? 3 : 1);
          if (p.kind === 'pedestal' && !p.on) {
            g.globalAlpha = 0.3 + 0.3 * (1 - this.phase);
            g.fillStyle = '#7fe3ff';
            g.fillRect(x + 4, y - 10, 8, 10);
            g.globalAlpha = 1;
          }
        },
      });
    }
    // enemies
    const alive = new Set(w.enemies.map((e) => e.id));
    for (const en of w.enemies) {
      const v = this.enemies.get(en.id);
      if (!v) continue;
      out.push({ row: en.y, draw: (ox, oy) => this.drawEnemy(g, en, v, now, ox, oy) });
    }
    for (const [id, v] of this.enemies) {
      if (alive.has(id)) continue;
      if (!v.dying) v.dying = now;
      if (now - v.dying > 260) {
        this.enemies.delete(id);
        continue;
      }
      out.push({
        row: Math.round(v.y / TS),
        draw: (ox, oy) => {
          const t = (now - v.dying) / 260;
          g.globalAlpha = 1 - t;
          a.onTile(g, this.enemyFrame(v.kind, { mode: 'idle', facing: 2 } as Enemy, true), v.x - ox, v.y - oy - t * 4, v.flip, 'white');
          g.globalAlpha = 1;
        },
      });
    }
    // echo
    if (w.echo && !w.echo.faded) {
      this.echoAlpha = Math.min(1, this.echoAlpha + 0.08);
      out.push({ row: w.echo.y, draw: (ox, oy) => this.drawEcho(g, now, ox, oy) });
    }
    // boss
    if (w.boss) {
      const b = w.boss;
      out.push({ row: b.y + 1, draw: (ox, oy) => this.drawBoss(g, w, now, ox, oy) });
    }
    // player
    out.push({ row: w.player.y, draw: (ox, oy) => this.drawPlayer(g, w, now, ox, oy) });
    out.sort((p, q) => p.row - q.row);
    return out;
  }

  ctx: CanvasRenderingContext2D | null = null;

  private enemyFrame(kind: string, e: Enemy, half: boolean): string {
    switch (kind) {
      case 'buzz':
        return half ? 'buzz0' : 'buzz1';
      case 'clank':
        return half ? 'clank0' : 'clank1';
      case 'warden':
        return half ? 'warden1' : 'warden0';
      case 'ram':
        return e.mode === 'rev' ? 'ram_rev' : 'ram0';
      case 'woofer':
        return e.mode === 'windup' ? 'woofer1' : 'woofer0';
      case 'conductor':
        return this.beat & 1 ? 'conductor1' : 'conductor0';
      case 'golem':
        return e.mode === 'windup' ? 'golem_wind' : 'golem0';
      case 'spotlight':
        return e.facing === 0 ? 'spot_u' : e.facing === 2 ? 'spot_d' : 'spot_r';
    }
    return 'buzz0';
  }

  private drawEnemy(g: CanvasRenderingContext2D, e: Enemy, v: Vis, now: number, ox: number, oy: number): void {
    const a = this.atlas;
    const frozen = now < v.stop;
    const [x, y, hop] = frozen ? [v.x, v.y, 0] : this.pos(v, now);
    const half = e.kind === 'buzz' ? Math.floor(now / 90) % 2 === 0 : this.phase < 0.5;
    const name = this.enemyFrame(e.kind, e, half);
    const flip = e.kind === 'spotlight' ? e.facing === 3 : e.kind === 'ram' ? (e.mode === 'rev' ? e.lockDir === 3 : v.flip) : v.flip;
    let jx = 0;
    if (e.kind === 'ram' && e.mode === 'rev') jx = Math.floor(now / 40) % 2 ? 1 : -1;
    const px = x - ox + jx;
    const py = y - oy - hop + (e.kind === 'buzz' ? -3 + (half ? 0 : 1) : 0);
    // shadow
    g.globalAlpha = 0.35;
    g.fillStyle = '#05040a';
    g.fillRect(x - ox + 3, y - oy + 13, 10, 2);
    g.globalAlpha = 1;
    const flashing = now - v.flash < 90;
    if (e.stun > 0) g.globalAlpha = 0.85;
    a.onTile(g, name, px, py, flip, flashing ? 'white' : 'img');
    g.globalAlpha = 1;
    if (e.kind === 'warden') {
      const f = e.facing;
      if (f === 1) a.draw(g, 'shield_h', px + 12, py + 2);
      else if (f === 3) a.draw(g, 'shield_h', px + 1, py + 2);
      else if (f === 2) a.draw(g, 'shield_v', px + 3, py + 11);
      else a.draw(g, 'shield_v', px + 3, py - 3);
    }
    // hp pips for tougher enemies
    if (e.maxHp > 1 && e.hp < e.maxHp) {
      for (let i = 0; i < e.maxHp; i++) {
        g.fillStyle = i < e.hp ? '#e0343c' : '#3a3355';
        g.fillRect(px + 8 - e.maxHp * 2 + i * 4, py - 2, 3, 2);
      }
    }
    if (e.stun > 0) {
      const t = now / 120;
      g.fillStyle = '#f2d266';
      g.fillRect(Math.round(px + 8 + Math.cos(t) * 5), Math.round(py + 1 + Math.sin(t) * 2), 1, 1);
      g.fillRect(Math.round(px + 8 - Math.cos(t) * 5), Math.round(py + 1 - Math.sin(t) * 2), 1, 1);
    }
  }

  private drawPlayer(g: CanvasRenderingContext2D, w: World, now: number, ox: number, oy: number): void {
    const v = this.player;
    const [x, y, hop] = this.pos(v, now);
    const moving = v.dur > 1 && now - v.t0 < v.dur;
    const attacking = now - v.lungeT < 140;
    const hurt = now - v.hurtT < 220;
    let name = this.phase < 0.5 ? 'kit_idle1' : 'kit_idle0';
    if (moving) name = 'kit_hop';
    if (attacking) name = 'kit_attack';
    if (hurt) name = 'kit_hurt';
    g.globalAlpha = 0.4;
    g.fillStyle = '#05040a';
    g.fillRect(x - ox + 3, y - oy + 13, 10, 2);
    g.globalAlpha = 1;
    const blink = w.dead ? 0.6 : 1;
    g.globalAlpha = blink;
    this.atlas.onTile(g, name, x - ox, y - oy - hop, v.flip, hurt && Math.floor(now / 60) % 2 ? 'white' : 'img');
    g.globalAlpha = 1;
    // groove aura
    const gl = grooveLevel(w.player.groove);
    if (gl >= 2) {
      g.globalAlpha = 0.5 * (1 - this.phase);
      g.fillStyle = gl === 3 ? '#7fe3ff' : '#ffd27a';
      g.fillRect(x - ox + 2, y - oy + 15, 12, 1);
      g.fillRect(x - ox + 4, y - oy + 16, 8, 1);
      g.globalAlpha = 1;
    }
  }

  private drawEcho(g: CanvasRenderingContext2D, now: number, ox: number, oy: number): void {
    const v = this.echo;
    const [x, y, hop] = this.pos(v, now);
    this.echoTrail = this.echoTrail.filter((p) => now - p.t < 260);
    for (const p of this.echoTrail) {
      g.globalAlpha = 0.25 * (1 - (now - p.t) / 260) * this.echoAlpha;
      this.atlas.onTile(g, 'echo_idle0', p.x - ox, p.y - oy, v.flip);
    }
    const moving = v.dur > 1 && now - v.t0 < v.dur;
    const attacking = now - v.lungeT < 140;
    const name = attacking ? 'echo_attack' : moving ? 'echo_hop' : this.phase < 0.5 ? 'echo_idle1' : 'echo_idle0';
    // flicker on the beat: brightest right on it
    g.globalAlpha = (0.62 + 0.3 * (1 - this.phase)) * this.echoAlpha;
    this.atlas.onTile(g, name, x - ox, y - oy - hop, v.flip);
    g.globalAlpha = 1;
    // scanline cut-outs so it never reads as solid
    g.fillStyle = '#05040a';
    g.globalAlpha = 0.25;
    for (let k = 1; k < 16; k += 3) g.fillRect(x - ox + 1, y - oy - hop + k - 1, 14, 1);
    g.globalAlpha = 1;
  }

  private drawBoss(g: CanvasRenderingContext2D, w: World, now: number, ox: number, oy: number): void {
    const b = w.boss!;
    const v = this.boss;
    const [x, y, hop] = this.pos(v, now);
    if (b.defeated) {
      const t = (now - v.dying) / 1600;
      if (t > 1) return;
      g.globalAlpha = 1 - t;
    }
    const cast = now - this.bossCast < 160;
    const hurt = now - v.flash < 120;
    const name = hurt ? 'boss_hurt' : cast ? 'boss_cast' : this.phase < 0.5 ? 'boss1' : 'boss0';
    const f = this.atlas.size(name);
    g.globalAlpha *= 1;
    g.fillStyle = '#05040a';
    const sa = g.globalAlpha;
    g.globalAlpha = sa * 0.45;
    g.fillRect(x - ox + 3, y - oy + 28, 26, 3);
    g.globalAlpha = sa;
    const transition = b.transition > 0;
    this.atlas.draw(g, name, x - ox + 16 - f.w / 2, y - oy + 31 - f.h - hop, false, hurt && Math.floor(now / 50) % 2 ? 'white' : 'img');
    if (transition) {
      g.globalAlpha = 0.3 + 0.2 * Math.sin(now / 80);
      g.strokeStyle = '#9a2c86';
      g.strokeRect(x - ox - 1.5, y - oy - 4.5, 35, 37);
    }
    g.globalAlpha = 1;
  }

  private drawTrains(g: CanvasRenderingContext2D, now: number, ox: number, oy: number): void {
    this.trains = this.trains.filter((tr) => now - tr.t0 < 520);
    for (const tr of this.trains) {
      const t = (now - tr.t0) / 520;
      const cells = laneCells(tr.lane);
      const horiz = tr.lane.y0 === tr.lane.y1;
      const len = cells.length * TS + 96;
      const off = t * (len + 64) - 64;
      g.save();
      const bx0 = Math.min(tr.lane.x0, tr.lane.x1) * TS - ox;
      const by0 = Math.min(tr.lane.y0, tr.lane.y1) * TS - oy;
      g.beginPath();
      g.rect(bx0, by0 - (horiz ? 2 : 0), horiz ? cells.length * TS : TS, horiz ? TS + 2 : cells.length * TS);
      g.clip();
      for (let car = 0; car < 4; car++) {
        const pos = off - car * 33;
        const forward = tr.lane.d === 1 || tr.lane.d === 2;
        if (horiz) {
          const px = forward ? bx0 + pos - 32 : bx0 + cells.length * TS - pos;
          this.atlas.draw(g, 'train_h', px, by0 + 1, !forward);
        } else {
          const py = forward ? by0 + pos - 32 : by0 + cells.length * TS - pos;
          this.atlas.draw(g, 'train_v', bx0 + 1, py);
        }
      }
      g.restore();
    }
  }

  private drawLight(g: CanvasRenderingContext2D, w: World, x0: number, y0: number, x1: number, y1: number, ox: number, oy: number): void {
    const base = [0.5, 0.42, 0.46, 0.34][Math.min(3, w.zone)];
    const lights: [number, number, number][] = [[this.player.x / TS, this.player.y / TS, 6.5]];
    if (w.echo && !w.echo.faded) lights.push([this.echo.x / TS, this.echo.y / TS, 3.5]);
    for (const p of w.props) if (p.kind === 'relay' && p.on) lights.push([p.x, p.y, 5]);
    if (w.exitOpen && w.exitX >= 0) lights.push([w.exitX, w.exitY, 3.5]);
    if (w.boss && !w.boss.defeated) lights.push([this.boss.x / TS + 0.5, this.boss.y / TS + 0.5, 5]);
    const cols = x1 - x0 + 1;
    const rows = y1 - y0 + 1;
    if (this.light.length < cols * rows) this.light = new Float32Array(cols * rows);
    g.fillStyle = '#05040a';
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        let best = 0;
        for (const [lx, ly, r] of lights) {
          const d = Math.hypot(x - lx, y - ly);
          const v = 1 - d / r;
          if (v > best) best = v;
        }
        const level = Math.min(3, Math.floor(best * 4.2));
        const a = base * (1 - level / 3);
        if (a <= 0.01) continue;
        g.globalAlpha = a;
        g.fillRect(x * TS - ox, y * TS - oy - (y === y0 ? 16 : 0), TS, TS + (y === y0 ? 16 : 0));
      }
    }
    g.globalAlpha = 1;
  }

  private drawOverlays(g: CanvasRenderingContext2D, w: World, ox: number, oy: number, now: number): void {
    const p = w.player;
    for (const e of w.enemies) {
      const v = this.enemies.get(e.id);
      if (!v || !e.ready || e.stun > 0) continue;
      const [x, y] = this.pos(v, now);
      const px = x - ox;
      const py = y - oy;
      const adjacentHit = e.intent >= 0 && e.x + DX[e.intent] === p.x && e.y + DY[e.intent] === p.y;
      const c = adjacentHit ? '#ff4a4a' : '#ffd27a';
      // "!" pip above head
      g.fillStyle = '#0b0a14';
      g.fillRect(px + 6, py - 9, 4, 7);
      g.fillStyle = c;
      g.fillRect(px + 7, py - 8, 2, 3);
      g.fillRect(px + 7, py - 4, 2, 1);
      if (e.intent >= 0) {
        const d = e.intent;
        const cx = px + 8 + DX[d] * 9;
        const cy = py + 8 + DY[d] * 9;
        g.fillStyle = c;
        if (DX[d] !== 0) for (let i = 0; i < 3; i++) g.fillRect(cx + (DX[d] > 0 ? i : -i), cy - (2 - i), 1, 5 - i * 2);
        else for (let i = 0; i < 3; i++) g.fillRect(cx - (2 - i), cy + (DY[d] > 0 ? i : -i), 5 - i * 2, 1);
      }
    }
    // the player's own tile is about to be hit: high-contrast ring so it is never lost under effects
    const hot = w.danger.some((d) => d.inn === 1 && d.x === p.x && d.y === p.y);
    if (hot && !w.dead) {
      const px = this.player.x - ox;
      const py = this.player.y - oy;
      g.strokeStyle = Math.floor(now / 100) % 2 ? '#ffffff' : '#ff4a4a';
      g.strokeRect(px + 0.5, py + 0.5, 15, 15);
    }
  }
}
