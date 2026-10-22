// Search-based autoplayer. Used by tests (full-run reachability) and the ?autoplay debug mode,
// where it presses real keys through the normal input path. It never touches world state directly.
import { nextStationCells } from './boss';
import { bossAt, enemyAt, idx } from './core';
import { DIRS, DX, DY, type Dir, type PlayerAction, type World } from './types';
import { step, walkableStatic } from './world';

export function cloneWorld(w: World): World {
  return {
    ...w,
    player: { ...w.player },
    enemies: w.enemies.map((e) => ({ ...e })),
    props: w.props.map((p) => ({ ...p })),
    gates: w.gates.map((g) => ({ ...g })),
    record: { ...w.record, entries: w.record.entries.slice() },
    echo: w.echo ? { ...w.echo } : null,
    boss: w.boss ? { ...w.boss, attacks: w.boss.attacks.map((a) => ({ ...a })), lastBar: [] } : null,
    stats: { ...w.stats },
    mods: { ...w.mods },
    melody: [],
    events: [],
    danger: [],
  };
}

const ACTIONS: PlayerAction[] = [
  { k: 'dir', d: 0, onBeat: true },
  { k: 'dir', d: 1, onBeat: true },
  { k: 'dir', d: 2, onBeat: true },
  { k: 'dir', d: 3, onBeat: true },
  { k: 'idle', d: 0, onBeat: true },
  { k: 'rewind', d: 0, onBeat: true },
];

export class Bot {
  private distKey = '';
  private dist: Int32Array = new Int32Array(0);
  private visits = new Map<number, number>();
  private salt = 0;

  private objective(w: World): { key: string; sources: number[] } {
    const ped = w.props.find((p) => p.kind === 'pedestal' && !p.on);
    const around = (x: number, y: number) =>
      DIRS.map((d) => [x + DX[d], y + DY[d]] as const)
        .filter(([nx, ny]) => walkableStatic(w, nx, ny))
        .map(([nx, ny]) => idx(w, nx, ny));
    if (ped) return { key: 'ped', sources: around(ped.x, ped.y) };
    if (w.boss) {
      const cells = nextStationCells(w);
      const b = w.boss;
      return { key: 'boss' + b.next + ':' + b.station, sources: cells.length ? cells : [idx(w, b.x, b.y + b.h)] };
    }
    if (!w.exitOpen) {
      const relays = w.props.filter((p) => p.kind === 'relay' && !p.on);
      return { key: 'relay' + relays.map((r) => r.id).join(','), sources: relays.flatMap((r) => around(r.x, r.y)) };
    }
    return { key: 'exit', sources: [idx(w, w.exitX, w.exitY)] };
  }

  private ensureDist(w: World): void {
    const o = this.objective(w);
    if (o.key === this.distKey && this.dist.length === w.w * w.h) return;
    this.distKey = o.key;
    this.visits.clear();
    const dist = new Int32Array(w.w * w.h).fill(1 << 20);
    const q: number[] = [];
    for (const s of o.sources) {
      dist[s] = 0;
      q.push(s);
    }
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      const x = i % w.w;
      const y = (i / w.w) | 0;
      for (const d of DIRS) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= w.w || ny >= w.h || !walkableStatic(w, nx, ny)) continue;
        const j = idx(w, nx, ny);
        if (dist[j] > dist[i] + 1) {
          dist[j] = dist[i] + 1;
          q.push(j);
        }
      }
    }
    this.dist = dist;
  }

  private evaluate(w: World, base: World): number {
    if (w.dead) return -1e7;
    if (w.cleared) return 1e7 - w.turn;
    const p = w.player;
    let v = p.hp * 1200 + p.charge * 40;
    v += w.relaysOn * 4000 + (w.echoUnlocked && !base.echoUnlocked ? 3000 : 0);
    v += (w.stats.kills - base.stats.kills) * 60;
    const d = this.dist[idx(w, p.x, p.y)];
    v -= Math.min(d, 400) * 12;
    v -= (this.visits.get(idx(w, p.x, p.y)) ?? 0) * 6;
    if (w.boss) v += (w.boss.maxHp - w.boss.hp) * 2500;
    // steps through the boss's next station become echo hits next bar
    const next = new Set(nextStationCells(w));
    for (const e of w.record.entries) {
      if (e.k === 'move' && next.has(idx(w, e.tx, e.ty))) v += 700;
      if (e.k !== 'attack') continue;
      const tx = e.fx + DX[e.d];
      const ty = e.fy + DY[e.d];
      if (w.boss && bossAt(w, tx, ty)) v += 60;
      else if (w.props.some((r) => r.kind === 'relay' && !r.on && r.x === tx && r.y === ty)) v += 120;
    }
    for (const dg of w.danger) if (dg.inn === 1 && dg.x === p.x && dg.y === p.y) v -= 900 * dg.dmg;
    for (const e of w.enemies) {
      if (!e.ready) continue;
      if (Math.abs(e.x - p.x) + Math.abs(e.y - p.y) === 1 && e.kind !== 'conductor') v -= 500;
    }
    return v;
  }

  private search(w: World, depth: number, base: World): number {
    let best = -Infinity;
    for (const a of ACTIONS) {
      if (a.k === 'rewind' && (!w.echo || w.player.charge < 1)) continue;
      const c = cloneWorld(w);
      step(c, a);
      if (c.pendingChest) c.pendingChest = 0;
      let v = this.evaluate(c, base);
      if (depth > 1 && !c.dead && !c.cleared) v = Math.max(v * 0.2, this.search(c, depth - 1, base) * 0.8 + v * 0.2);
      if (v > best) best = v;
    }
    return best;
  }

  choose(w: World, depth = 3): PlayerAction {
    this.ensureDist(w);
    const here = idx(w, w.player.x, w.player.y);
    this.visits.set(here, (this.visits.get(here) ?? 0) + 1);
    let best = ACTIONS[4];
    let bestV = -Infinity;
    this.salt = (this.salt + 1) % 7;
    for (let i = 0; i < ACTIONS.length; i++) {
      const a = ACTIONS[(i + this.salt) % ACTIONS.length];
      if (a.k === 'rewind' && (!w.echo || w.player.charge < 1)) continue;
      const c = cloneWorld(w);
      step(c, a);
      if (c.pendingChest) c.pendingChest = 0;
      let v = this.evaluate(c, w);
      if (depth > 1 && !c.dead && !c.cleared) v = v * 0.2 + this.search(c, depth - 1, w) * 0.8;
      if (v > bestV) {
        bestV = v;
        best = a;
      }
    }
    return best;
  }
}

/** Direction keys a bot action maps to (for the input-driven autoplay). */
export function actionKey(a: PlayerAction): string {
  if (a.k === 'rewind') return 'Space';
  if (a.k === 'idle') return '';
  return ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'][a.d as Dir];
}

export { enemyAt };
