import { bossBar, bossDanger, bossPhase, damageBoss } from './boss';
import {
  blockingPropAt,
  bossAt,
  cheb,
  damageEnemy,
  emit,
  enemyAt,
  gainCharge,
  heal,
  hurtPlayer,
  isFree,
  isPlayerAt,
  isSolid,
  pickupAt,
  stunEnemy,
  tileAt,
} from './core';
import { enemyDanger, enemyPhase } from './enemies';
import {
  DIRS,
  DX,
  DY,
  T,
  grooveLevel,
  opp,
  type Danger,
  type Dir,
  type EchoEntry,
  type EchoState,
  type ModId,
  type PlayerAction,
  type Prop,
  type Recording,
  type World,
} from './types';

/*
 Turn order (one resolved beat):
   1 groove grade  2 player action  3 echo replay  4 hit resolution (resonance)
   5 hazards (trains, vents)  6 enemies by id  7 boss  8 cleanup, gates, bar boundary, telegraphs
 Same world + same action sequence => same result. No wall-clock, no Math.random.
*/

type TargetRef = { t: 'enemy'; id: number } | { t: 'relay'; id: number } | { t: 'boss' };
interface Hit {
  src: 'player' | 'echo';
  key: string;
  ref: TargetRef;
  d: Dir;
  x: number;
  y: number;
}

export interface WorldInit {
  w: number;
  h: number;
  tiles: Uint8Array;
  deco?: Uint8Array;
  zone: number;
  floorId: string;
  sx: number;
  sy: number;
  exitX: number;
  exitY: number;
  exitOpen: boolean;
  seed: number;
  hp: number;
  maxHp: number;
  mods: ModId[];
  echoUnlocked: boolean;
}

export function createWorld(o: WorldInit): World {
  const mods: Partial<Record<ModId, number>> = {};
  for (const m of o.mods) mods[m] = (mods[m] ?? 0) + 1;
  const maxCharge = 2 + (mods.feedback ? 1 : 0);
  return {
    w: o.w,
    h: o.h,
    tiles: o.tiles,
    deco: o.deco ?? new Uint8Array(o.w * o.h),
    zone: o.zone,
    floorId: o.floorId,
    turn: 0,
    player: {
      x: o.sx,
      y: o.sy,
      facing: 1,
      hp: o.hp,
      maxHp: o.maxHp,
      charge: 1,
      maxCharge,
      groove: 0,
      streakTarget: -1,
      streak: 0,
      pedalReady: false,
    },
    enemies: [],
    props: [],
    gates: [],
    trains: [],
    vents: [],
    echoUnlocked: o.echoUnlocked,
    record: { sx: o.sx, sy: o.sy, entries: [] },
    echo: null,
    exitX: o.exitX,
    exitY: o.exitY,
    exitOpen: o.exitOpen,
    relaysTotal: 0,
    relaysOn: 0,
    mods,
    boss: null,
    rng: o.seed >>> 0,
    nextId: 1,
    stats: { kills: 0, echoKills: 0, resonances: 0, hitsTaken: 0, maxGroove: 1, beats: 0, onBeat: 0, rewinds: 0, relays: 0 },
    melody: [],
    events: [],
    danger: [],
    cleared: false,
    dead: false,
    pendingChest: 0,
    deathCause: '',
    hints: [],
  };
}

/** Cells covered by a train lane (inclusive, straight line). */
export function laneCells(l: { x0: number; y0: number; x1: number; y1: number }): [number, number][] {
  const out: [number, number][] = [];
  const dx = Math.sign(l.x1 - l.x0);
  const dy = Math.sign(l.y1 - l.y0);
  const n = Math.max(Math.abs(l.x1 - l.x0), Math.abs(l.y1 - l.y0));
  for (let i = 0; i <= n; i++) out.push([l.x0 + dx * i, l.y0 + dy * i]);
  return out;
}

export function step(w: World, a: PlayerAction): void {
  w.events = [];
  if (w.dead || w.cleared) return;
  const beat = w.turn & 3;
  const hits: Hit[] = [];
  applyGroove(w, a);
  const entry = playerPhase(w, a, hits);
  w.record.entries.push(entry);
  w.melody.push(a.k === 'dir' ? (entry.k === 'attack' ? 6 + a.d : a.d) : a.k === 'rewind' ? 5 : 4);
  if (w.melody.length > 64) w.melody.shift();
  if (!w.cleared) {
    echoPhase(w, beat, hits);
    resolveHits(w, hits);
    hazardPhase(w);
    enemyPhase(w);
    bossPhase(w);
  }
  endTurn(w);
}

// ---------------------------------------------------------------- groove

function dropGroove(w: World): void {
  const p = w.player;
  p.groove = grooveLevel(p.groove) === 3 ? 8 : 0;
}

function applyGroove(w: World, a: PlayerAction): void {
  const p = w.player;
  const before = grooveLevel(p.groove);
  w.stats.beats++;
  if (a.k === 'idle') {
    if (w.mods.pedal) p.pedalReady = true;
    else dropGroove(w);
  } else if (!a.onBeat) {
    dropGroove(w);
  } else {
    w.stats.onBeat++;
    p.groove = Math.min(p.groove + 1, 40);
  }
  const after = grooveLevel(p.groove);
  if (after > w.stats.maxGroove) w.stats.maxGroove = after;
  if (after !== before) emit(w, 'groove', p.x, p.y, { n: after });
}

// ---------------------------------------------------------------- player

function addTargetHit(w: World, src: 'player' | 'echo', x: number, y: number, d: Dir, hits: Hit[]): boolean {
  const push = (key: string, ref: TargetRef) => {
    if (!hits.some((h) => h.src === src && h.key === key)) hits.push({ src, key, ref, d, x, y });
  };
  const e = enemyAt(w, x, y);
  if (e) {
    push('e' + e.id, { t: 'enemy', id: e.id });
    return true;
  }
  if (bossAt(w, x, y)) {
    push('boss', { t: 'boss' });
    return true;
  }
  const pr = blockingPropAt(w, x, y);
  if (pr && pr.kind === 'relay' && !pr.on) {
    push('r' + pr.id, { t: 'relay', id: pr.id });
    return true;
  }
  return false;
}

function collect(w: World): void {
  const p = w.player;
  const it = pickupAt(w, p.x, p.y);
  if (it) {
    it.on = true;
    if (it.kind === 'battery') heal(w, 1);
    else if (it.kind === 'tape') gainCharge(w, 1);
    emit(w, 'pickup', p.x, p.y, { s: it.kind });
  }
  if (p.x === w.exitX && p.y === w.exitY && w.exitOpen && !w.boss) {
    w.cleared = true;
    emit(w, 'clear', p.x, p.y);
  }
}

function playerPhase(w: World, a: PlayerAction, hits: Hit[]): EchoEntry {
  const p = w.player;
  const fx = p.x;
  const fy = p.y;
  const idle: EchoEntry = { k: 'idle', d: p.facing, fx, fy, tx: fx, ty: fy };
  if (a.k === 'idle') {
    p.streak = 0;
    return idle;
  }
  if (a.k === 'rewind') {
    p.streak = 0;
    const e = w.echo;
    if (!e || e.faded || p.charge < 1 || (e.x === fx && e.y === fy) || !isFree(w, e.x, e.y)) {
      emit(w, 'fizzle', fx, fy);
      return idle;
    }
    p.charge--;
    p.x = e.x;
    p.y = e.y;
    w.stats.rewinds++;
    emit(w, 'rewind', fx, fy, { x2: p.x, y2: p.y });
    if (w.mods.scratch) {
      for (const d of DIRS) {
        const en = enemyAt(w, p.x + DX[d], p.y + DY[d]);
        if (en) damageEnemy(w, en, 1, 'player');
      }
    }
    collect(w);
    return { k: 'warp', d: p.facing, fx, fy, tx: p.x, ty: p.y };
  }
  const d = a.d;
  p.facing = d;
  const tx = fx + DX[d];
  const ty = fy + DY[d];
  const attack: EchoEntry = { k: 'attack', d, fx, fy, tx: fx, ty: fy };
  if (addTargetHit(w, 'player', tx, ty, d, hits)) {
    emit(w, 'swing', tx, ty, { who: 'player', d });
    return attack;
  }
  p.streak = 0;
  const pr = blockingPropAt(w, tx, ty);
  if (pr) {
    if (pr.kind === 'pedestal' && !pr.on) {
      pr.on = true;
      w.echoUnlocked = true;
      emit(w, 'echoGet', tx, ty);
    } else if (pr.kind === 'chest' && !pr.on) {
      pr.on = true;
      w.pendingChest = pr.id;
      emit(w, 'chest', tx, ty);
    } else {
      emit(w, 'bump', tx, ty, { d });
    }
    return attack;
  }
  if (isSolid(w, tx, ty)) {
    emit(w, 'bump', tx, ty, { d });
    return attack;
  }
  p.x = tx;
  p.y = ty;
  emit(w, 'move', fx, fy, { who: 'player', x2: tx, y2: ty, d });
  collect(w);
  return { k: 'move', d, fx, fy, tx, ty };
}

// ---------------------------------------------------------------- echo

/** The echo is sound: it passes through bodies, but solid terrain that appeared since recording dissolves it. */
function echoBlocked(w: World, x: number, y: number): boolean {
  return isSolid(w, x, y);
}

function echoStrike(w: World, x: number, y: number, d: Dir, hits: Hit[]): void {
  addTargetHit(w, 'echo', x, y, d, hits);
  if (w.mods.reverb) {
    const x2 = x + DX[d];
    const y2 = y + DY[d];
    if (!isSolid(w, x2, y2)) addTargetHit(w, 'echo', x2, y2, d, hits);
  }
}

function echoPhase(w: World, beat: number, hits: Hit[]): void {
  const e = w.echo;
  if (!e || e.faded) return;
  const en = e.entries[beat];
  if (!en || en.k === 'idle') return;
  if (en.k === 'attack') {
    const sx = en.fx + DX[en.d];
    const sy = en.fy + DY[en.d];
    emit(w, 'swing', sx, sy, { who: 'echo', d: en.d });
    echoStrike(w, sx, sy, en.d, hits);
    return;
  }
  if (echoBlocked(w, en.tx, en.ty)) {
    e.faded = true;
    emit(w, 'echoFade', e.x, e.y);
    return;
  }
  emit(w, 'move', e.x, e.y, { who: 'echo', x2: en.tx, y2: en.ty, d: en.d, s: en.k });
  e.x = en.tx;
  e.y = en.ty;
  if (en.k === 'move') echoStrike(w, en.tx, en.ty, en.d, hits);
}

export function buildEcho(rec: Recording, reverse: boolean): EchoState {
  if (!reverse) {
    return { x: rec.sx, y: rec.sy, sx: rec.sx, sy: rec.sy, entries: rec.entries.map((e) => ({ ...e })), faded: false };
  }
  const last = rec.entries[rec.entries.length - 1];
  const entries = [...rec.entries].reverse().map((e): EchoEntry => {
    if (e.k === 'move') return { k: 'move', d: opp(e.d), fx: e.tx, fy: e.ty, tx: e.fx, ty: e.fy };
    if (e.k === 'warp') return { k: 'warp', d: e.d, fx: e.tx, fy: e.ty, tx: e.fx, ty: e.fy };
    return { ...e };
  });
  return { x: last.tx, y: last.ty, sx: last.tx, sy: last.ty, entries, faded: false };
}

// ---------------------------------------------------------------- hits

function findEnemy(w: World, id: number) {
  return w.enemies.find((e) => e.id === id && e.alive);
}
function findProp(w: World, id: number): Prop | undefined {
  return w.props.find((p) => p.id === id);
}

function restoreRelay(w: World, r: Prop): void {
  if (r.on) return;
  r.on = true;
  w.relaysOn++;
  w.stats.relays++;
  heal(w, 1);
  for (const e of w.enemies) if (e.alive && cheb(e.x, e.y, r.x, r.y) <= 2) stunEnemy(w, e, 2);
  emit(w, 'relayOn', r.x, r.y, { n: w.relaysOn, x2: w.relaysTotal });
  if (w.relaysOn >= w.relaysTotal && !w.exitOpen) {
    w.exitOpen = true;
    emit(w, 'exitOpen', w.exitX, w.exitY);
  }
}

function resonance(w: World, ref: TargetRef, h: Hit): void {
  w.stats.resonances++;
  gainCharge(w, 1);
  emit(w, 'reso', h.x, h.y);
  if (ref.t === 'enemy') {
    const e = findEnemy(w, ref.id);
    if (!e) return;
    const ex = e.x;
    const ey = e.y;
    damageEnemy(w, e, 3, 'reso');
    if (w.mods.sidechain) {
      for (const o of w.enemies) if (o.alive && cheb(o.x, o.y, ex, ey) <= 1) stunEnemy(w, o, 2);
    }
  } else if (ref.t === 'relay') {
    const r = findProp(w, ref.id);
    if (r) restoreRelay(w, r);
  } else {
    damageBoss(w, 3, 'reso');
  }
}

const ANCHORED = new Set(['woofer', 'spotlight', 'golem']);

function playerHit(w: World, ref: TargetRef, h: Hit): void {
  const p = w.player;
  if (ref.t === 'relay') {
    emit(w, 'relayTune', h.x, h.y, { who: 'player' });
    return;
  }
  if (ref.t === 'boss') {
    emit(w, 'block', h.x, h.y, { s: 'mute' });
    return;
  }
  const e = findEnemy(w, ref.id);
  if (!e) return;
  p.streak = p.streakTarget === e.id ? p.streak + 1 : 1;
  p.streakTarget = e.id;
  if (e.kind === 'warden' && h.d === opp(e.facing)) {
    emit(w, 'block', e.x, e.y, { s: 'shield', d: h.d });
    return;
  }
  if (e.kind === 'golem') {
    emit(w, 'block', e.x, e.y, { s: 'armor', d: h.d });
    return;
  }
  let dmg = 1;
  if (w.mods.crescendo) dmg += Math.min(2, p.streak - 1);
  if (p.pedalReady) {
    dmg += 1;
    p.pedalReady = false;
  }
  const killed = damageEnemy(w, e, dmg, 'player');
  if (!killed && w.mods.bass && !ANCHORED.has(e.kind)) {
    const nx = e.x + DX[h.d];
    const ny = e.y + DY[h.d];
    if (isFree(w, nx, ny) && !isPlayerAt(w, nx, ny)) {
      emit(w, 'move', e.x, e.y, { who: 'enemy', x2: nx, y2: ny, d: h.d, n: e.id, s: 'knock' });
      e.x = nx;
      e.y = ny;
    } else {
      damageEnemy(w, e, 1, 'player');
    }
  }
}

function echoHit(w: World, ref: TargetRef, h: Hit): void {
  const dmg = grooveLevel(w.player.groove) === 3 ? 2 : 1;
  if (ref.t === 'relay') {
    emit(w, 'relayTune', h.x, h.y, { who: 'echo' });
    return;
  }
  if (ref.t === 'boss') {
    // groove bonus does not apply to the boss: its pacing is set by stations, not by stat stacking
    damageBoss(w, 1, 'echo');
    return;
  }
  const e = findEnemy(w, ref.id);
  if (!e) return;
  if (e.kind === 'warden' && h.d === opp(e.facing)) {
    emit(w, 'block', e.x, e.y, { s: 'shield', d: h.d });
    return;
  }
  if (e.kind === 'golem') {
    emit(w, 'block', e.x, e.y, { s: 'armor', d: h.d });
    return;
  }
  damageEnemy(w, e, dmg, 'echo');
}

function resolveHits(w: World, hits: Hit[]): void {
  const groups = new Map<string, { ref: TargetRef; p?: Hit; e?: Hit }>();
  for (const h of hits) {
    let g = groups.get(h.key);
    if (!g) groups.set(h.key, (g = { ref: h.ref }));
    if (h.src === 'player') g.p ??= h;
    else g.e ??= h;
  }
  for (const g of groups.values()) {
    if (g.p && g.e) resonance(w, g.ref, g.p);
    else if (g.p) playerHit(w, g.ref, g.p);
    else if (g.e) echoHit(w, g.ref, g.e);
  }
}

// ---------------------------------------------------------------- hazards

export function nextTrainTurn(lane: { phase: number }, from: number): number {
  let m = Math.max(from, 4);
  m += (((lane.phase - m) % 16) + 16) % 16;
  return m;
}

export function nextVentTurn(v: { phase: number }, from: number): number {
  let m = Math.max(from, 4);
  m += (((v.phase - m) % 8) + 8) % 8;
  return m;
}

function hazardPhase(w: World): void {
  const t = w.turn;
  for (const lane of w.trains) {
    if (nextTrainTurn(lane, t) !== t) continue;
    emit(w, 'train', lane.x0, lane.y0, { x2: lane.x1, y2: lane.y1, d: lane.d });
    for (const [x, y] of laneCells(lane)) {
      if (isPlayerAt(w, x, y)) hurtPlayer(w, 2, 'train', x, y);
      const e = enemyAt(w, x, y);
      if (e) damageEnemy(w, e, 2, 'hazard');
    }
  }
  const fired: number[] = [];
  for (const v of w.vents) {
    if (nextVentTurn(v, t) !== t) continue;
    fired.push(v.x + v.y * w.w);
    if (isPlayerAt(w, v.x, v.y)) hurtPlayer(w, 1, 'vent', v.x, v.y);
    const e = enemyAt(w, v.x, v.y);
    if (e) damageEnemy(w, e, 1, 'hazard');
  }
  if (fired.length) emit(w, 'vent', 0, 0, { cells: fired });
}

function hazardDanger(w: World, out: Danger[]): void {
  const n = w.turn;
  for (const lane of w.trains) {
    const m = nextTrainTurn(lane, n);
    if (m - n < 4) for (const [x, y] of laneCells(lane)) out.push({ x, y, inn: m - n + 1, dmg: 2 });
  }
  for (const v of w.vents) {
    const m = nextVentTurn(v, n);
    if (m - n < 2) out.push({ x: v.x, y: v.y, inn: m - n + 1, dmg: 1 });
  }
}

// ---------------------------------------------------------------- end of turn

function updateGates(w: World): void {
  const p = w.player;
  const e = w.echo && !w.echo.faded ? w.echo : null;
  for (const g of w.gates) {
    const pressed = g.plates.some((pi) => pi === p.x + p.y * w.w || (e !== null && pi === e.x + e.y * w.w));
    const occupied = isPlayerAt(w, g.x, g.y) || !!enemyAt(w, g.x, g.y) || (e !== null && e.x === g.x && e.y === g.y);
    const open = pressed || (g.open && occupied);
    if (open !== g.open) {
      g.open = open;
      emit(w, 'gate', g.x, g.y, { n: open ? 1 : 0 });
    }
  }
}

function barBoundary(w: World): void {
  const p = w.player;
  const rec = w.record;
  w.echo = null;
  if (w.echoUnlocked && rec.entries.length === 4) {
    w.echo = buildEcho(rec, !!w.mods.reverse);
    emit(w, 'echoSpawn', w.echo.x, w.echo.y);
  }
  w.record = { sx: p.x, sy: p.y, entries: [] };
  bossBar(w);
}

export function computeDanger(w: World): void {
  const out: Danger[] = [];
  enemyDanger(w, out);
  hazardDanger(w, out);
  bossDanger(w, out);
  w.danger = out;
}

function endTurn(w: World): void {
  w.enemies = w.enemies.filter((e) => e.alive);
  updateGates(w);
  const beat = w.turn & 3;
  w.turn++;
  if (beat === 3) barBoundary(w);
  computeDanger(w);
}

/** Tile walkable for the player ignoring dynamic bodies (used by generation/bot). */
export function walkableStatic(w: World, x: number, y: number): boolean {
  const t = tileAt(w, x, y);
  if (t === T.Void || t === T.Wall || t === T.Gate) return false;
  return !blockingPropAt(w, x, y);
}

export function applyChestMod(w: World, mod: ModId): void {
  w.mods[mod] = (w.mods[mod] ?? 0) + 1;
  if (mod === 'feedback') w.player.maxCharge = 3;
  w.pendingChest = 0;
}
