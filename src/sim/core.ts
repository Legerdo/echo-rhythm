import {
  DX,
  DY,
  ENEMY_HP,
  T,
  grooveLevel,
  type Dir,
  type Enemy,
  type EnemyKind,
  type EvType,
  type Prop,
  type PropKind,
  type SimEvent,
  type World,
} from './types';

export const idx = (w: World, x: number, y: number) => y * w.w + x;
export const inBounds = (w: World, x: number, y: number) => x >= 0 && y >= 0 && x < w.w && y < w.h;
export const tileAt = (w: World, x: number, y: number): number => (inBounds(w, x, y) ? w.tiles[idx(w, x, y)] : T.Void);
export const cheb = (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
export const manh = (ax: number, ay: number, bx: number, by: number) => Math.abs(ax - bx) + Math.abs(ay - by);

export function emit(w: World, t: EvType, x: number, y: number, extra?: Partial<SimEvent>): void {
  w.events.push({ t, x, y, ...extra });
}

export function gateAt(w: World, x: number, y: number) {
  for (const g of w.gates) if (g.x === x && g.y === y) return g;
  return undefined;
}

/** Terrain solidity (walls, void, closed gates). */
export function isSolid(w: World, x: number, y: number): boolean {
  const t = tileAt(w, x, y);
  if (t === T.Void || t === T.Wall) return true;
  if (t === T.Gate) return !gateAt(w, x, y)?.open;
  return false;
}

const BLOCKING: Record<PropKind, boolean> = {
  relay: true,
  chest: true,
  pedestal: true,
  crate: true,
  battery: false,
  tape: false,
};

export function blockingPropAt(w: World, x: number, y: number): Prop | undefined {
  for (const p of w.props) {
    if (p.x === x && p.y === y && BLOCKING[p.kind] && !(p.kind === 'pedestal' && p.on)) return p;
  }
  return undefined;
}

export function pickupAt(w: World, x: number, y: number): Prop | undefined {
  for (const p of w.props) if (p.x === x && p.y === y && !BLOCKING[p.kind] && !p.on) return p;
  return undefined;
}

export function enemyAt(w: World, x: number, y: number): Enemy | undefined {
  for (const e of w.enemies) if (e.alive && e.x === x && e.y === y) return e;
  return undefined;
}

export function bossAt(w: World, x: number, y: number): boolean {
  const b = w.boss;
  return !!b && !b.defeated && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
}

/** Can a body (player or enemy) occupy this tile, ignoring the player itself? */
export function isFree(w: World, x: number, y: number): boolean {
  return !isSolid(w, x, y) && !blockingPropAt(w, x, y) && !enemyAt(w, x, y) && !bossAt(w, x, y);
}

export function isPlayerAt(w: World, x: number, y: number): boolean {
  return w.player.x === x && w.player.y === y;
}

export function makeEnemy(w: World, kind: EnemyKind, x: number, y: number, facing: Dir = 2, phase = 0): Enemy {
  const e: Enemy = {
    id: w.nextId++,
    kind,
    x,
    y,
    hp: ENEMY_HP[kind],
    maxHp: ENEMY_HP[kind],
    facing,
    phase,
    stun: 0,
    aware: kind === 'clank' || kind === 'woofer' || kind === 'spotlight',
    mode: 'idle',
    lockDir: facing,
    alive: true,
    buffed: false,
    intent: -1,
    ready: false,
  };
  w.enemies.push(e);
  return e;
}

export function makeProp(w: World, kind: PropKind, x: number, y: number, v = 0): Prop {
  const p: Prop = { id: w.nextId++, kind, x, y, on: false, v };
  w.props.push(p);
  return p;
}

export function hurtPlayer(w: World, dmg: number, cause: string, x: number, y: number): void {
  if (dmg <= 0 || w.dead || w.cleared) return;
  const p = w.player;
  const e = w.echo;
  if (w.mods.harmonic && e && !e.faded && e.x === p.x && e.y === p.y) {
    emit(w, 'shielded', p.x, p.y, { s: 'harmonic' });
    return;
  }
  if (w.mods.ghost && grooveLevel(p.groove) >= 2) {
    p.groove = 0;
    emit(w, 'shielded', p.x, p.y, { s: 'ghost' });
    emit(w, 'groove', p.x, p.y, { n: 1 });
    return;
  }
  p.hp = Math.max(0, p.hp - dmg);
  const had = grooveLevel(p.groove);
  p.groove = 0;
  if (had > 1) emit(w, 'groove', p.x, p.y, { n: 1 });
  w.stats.hitsTaken++;
  emit(w, 'hurt', p.x, p.y, { n: dmg, s: cause, x2: x, y2: y });
  if (p.hp <= 0) {
    w.dead = true;
    w.deathCause = cause;
    emit(w, 'death', p.x, p.y, { s: cause });
  }
}

export function damageEnemy(
  w: World,
  e: Enemy,
  dmg: number,
  src: 'player' | 'echo' | 'reso' | 'hazard' | 'enemy',
): boolean {
  if (!e.alive || dmg <= 0) return false;
  e.hp -= dmg;
  e.aware = true;
  emit(w, 'hit', e.x, e.y, { n: dmg, s: src, x2: e.id });
  if (e.hp <= 0) {
    e.alive = false;
    w.stats.kills++;
    if (src === 'echo' || src === 'reso') w.stats.echoKills++;
    if (src === 'echo' && w.mods.feedback) gainCharge(w, 1);
    emit(w, 'kill', e.x, e.y, { s: e.kind, who: src === 'echo' ? 'echo' : 'player' });
    return true;
  }
  return false;
}

/** Stun cancels committed wind-ups (ram rev, golem slam) so stuns are a real counter. */
export function stunEnemy(w: World, e: Enemy, beats: number): void {
  if (!e.alive) return;
  e.stun = Math.max(e.stun, beats);
  if (e.kind === 'ram' || e.kind === 'golem') e.mode = 'idle';
  emit(w, 'stun', e.x, e.y, { n: e.id });
}

export function gainCharge(w: World, n: number): void {
  const p = w.player;
  p.charge = Math.min(p.maxCharge, p.charge + n);
}

export function heal(w: World, n: number): void {
  const p = w.player;
  p.hp = Math.min(p.maxHp, p.hp + n);
}

/** All tiles in a straight line from (x,y) exclusive, stopping before solid terrain or blocking props. */
export function lineCells(w: World, x: number, y: number, d: Dir, max: number): [number, number][] {
  const out: [number, number][] = [];
  let cx = x;
  let cy = y;
  for (let i = 0; i < max; i++) {
    cx += DX[d];
    cy += DY[d];
    if (isSolid(w, cx, cy) || blockingPropAt(w, cx, cy) || bossAt(w, cx, cy)) break;
    out.push([cx, cy]);
  }
  return out;
}

export function rngNext(w: World): number {
  let t = (w.rng = (w.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
