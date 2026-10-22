import {
  blockingPropAt,
  bossAt,
  cheb,
  damageEnemy,
  emit,
  enemyAt,
  hurtPlayer,
  isFree,
  isPlayerAt,
  isSolid,
  lineCells,
  manh,
} from './core';
import { DIRS, DX, DY, type Danger, type Dir, type Enemy, type World } from './types';

export const AWARE_RANGE = 7;
const RAM_RANGE = 6;
const RAM_DASH = 8;

/** Enemies that keep an every-other-beat cadence (and so can be sped up by a Conductor). */
const CADENCED = new Set(['buzz', 'warden', 'ram', 'golem']);

function onCadence(turn: number, e: Enemy): boolean {
  return (CADENCED.has(e.kind) && e.buffed) || ((turn + e.phase) & 1) === 0;
}

/** Preferred steps toward a target: the longer axis first (ties: horizontal). */
export function chaseDirs(e: Enemy, tx: number, ty: number, alignFirst = false): Dir[] {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const h: Dir | -1 = dx > 0 ? 1 : dx < 0 ? 3 : -1;
  const v: Dir | -1 = dy > 0 ? 2 : dy < 0 ? 0 : -1;
  const horizFirst = alignFirst ? Math.abs(dx) <= Math.abs(dy) && h >= 0 : Math.abs(dx) >= Math.abs(dy);
  const out: Dir[] = [];
  if (horizFirst) {
    if (h !== -1) out.push(h);
    if (v !== -1) out.push(v);
  } else {
    if (v !== -1) out.push(v);
    if (h !== -1) out.push(h);
  }
  return out;
}

/** Step along the first open preferred dir. Bumping into the player is a melee attack. */
function stepToward(w: World, e: Enemy, dirs: Dir[], dmg: number, canBump = true): boolean {
  for (const d of dirs) {
    const nx = e.x + DX[d];
    const ny = e.y + DY[d];
    if (isPlayerAt(w, nx, ny)) {
      if (!canBump) return false;
      e.facing = d;
      emit(w, 'swing', nx, ny, { who: 'enemy', d, x2: e.id });
      hurtPlayer(w, dmg, e.kind, e.x, e.y);
      return true;
    }
    if (isFree(w, nx, ny)) {
      emit(w, 'move', e.x, e.y, { who: 'enemy', x2: nx, y2: ny, d, n: e.id });
      e.x = nx;
      e.y = ny;
      e.facing = d;
      return true;
    }
  }
  return false;
}

export function faceToward(e: Enemy, tx: number, ty: number): void {
  const dx = tx - e.x;
  const dy = ty - e.y;
  if (dx === 0 && dy === 0) return;
  const h: Dir = dx > 0 ? 1 : 3;
  const v: Dir = dy > 0 ? 2 : 0;
  if (Math.abs(dx) > Math.abs(dy)) e.facing = h;
  else if (Math.abs(dy) > Math.abs(dx)) e.facing = v;
  else if (e.facing !== h && e.facing !== v) e.facing = h;
}

function clearLane(w: World, e: Enemy, d: Dir, dist: number): boolean {
  let x = e.x;
  let y = e.y;
  for (let i = 1; i < dist; i++) {
    x += DX[d];
    y += DY[d];
    if (isSolid(w, x, y) || blockingPropAt(w, x, y) || bossAt(w, x, y)) return false;
  }
  return true;
}

function ramDash(w: World, e: Enemy): void {
  const d = e.lockDir;
  const fx = e.x;
  const fy = e.y;
  let stun = 2;
  for (let i = 0; i < RAM_DASH; i++) {
    const nx = e.x + DX[d];
    const ny = e.y + DY[d];
    if (isPlayerAt(w, nx, ny)) {
      hurtPlayer(w, 2, 'ram', e.x, e.y);
      stun = 1;
      break;
    }
    const other = enemyAt(w, nx, ny);
    if (other) {
      damageEnemy(w, other, 1, 'enemy');
      stun = 1;
      break;
    }
    if (!isFree(w, nx, ny)) break;
    e.x = nx;
    e.y = ny;
  }
  emit(w, 'dash', fx, fy, { x2: e.x, y2: e.y, d, n: e.id });
  e.mode = 'idle';
  e.stun = stun;
  if (stun === 2) emit(w, 'stun', e.x, e.y, { n: e.id });
}

const RING: [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

function areaStrike(w: World, src: Enemy, cells: [number, number][], dmgPlayer: number, dmgEnemy: number): void {
  for (const [x, y] of cells) {
    if (isPlayerAt(w, x, y)) hurtPlayer(w, dmgPlayer, src.kind, src.x, src.y);
    const o = enemyAt(w, x, y);
    if (o && o !== src) damageEnemy(w, o, dmgEnemy, 'enemy');
  }
}

export function ringCells(e: Enemy): [number, number][] {
  return RING.map(([dx, dy]) => [e.x + dx, e.y + dy] as [number, number]);
}

export function crossCells(e: Enemy): [number, number][] {
  return DIRS.map((d) => [e.x + DX[d], e.y + DY[d]] as [number, number]);
}

function act(w: World, e: Enemy): void {
  const p = w.player;
  const turn = w.turn;
  const beat = turn & 3;
  if (e.stun > 0) {
    e.stun--;
    if (e.kind === 'woofer' || e.kind === 'spotlight') e.mode = 'idle';
    return;
  }
  switch (e.kind) {
    case 'buzz':
      if (e.aware && onCadence(turn, e)) stepToward(w, e, chaseDirs(e, p.x, p.y), 1);
      break;
    case 'clank': {
      const nx = e.x + DX[e.facing];
      const ny = e.y + DY[e.facing];
      if (isPlayerAt(w, nx, ny)) {
        emit(w, 'swing', nx, ny, { who: 'enemy', d: e.facing, x2: e.id });
        hurtPlayer(w, 1, 'clank', e.x, e.y);
      } else if (isFree(w, nx, ny)) {
        emit(w, 'move', e.x, e.y, { who: 'enemy', x2: nx, y2: ny, d: e.facing, n: e.id });
        e.x = nx;
        e.y = ny;
      } else {
        e.facing = ((e.facing + 2) & 3) as Dir;
      }
      break;
    }
    case 'warden':
      if (e.aware) {
        if (onCadence(turn, e)) stepToward(w, e, chaseDirs(e, p.x, p.y), 1);
        faceToward(e, p.x, p.y);
      }
      break;
    case 'ram': {
      if (e.mode === 'rev') {
        ramDash(w, e);
        break;
      }
      if (!e.aware) break;
      const aligned = e.x === p.x || e.y === p.y;
      const dist = manh(e.x, e.y, p.x, p.y);
      if (aligned && dist <= RAM_RANGE) {
        const d: Dir = e.x === p.x ? (p.y > e.y ? 2 : 0) : p.x > e.x ? 1 : 3;
        if (clearLane(w, e, d, dist)) {
          e.mode = 'rev';
          e.lockDir = d;
          e.facing = d;
          break;
        }
      }
      if (onCadence(turn, e)) stepToward(w, e, chaseDirs(e, p.x, p.y, true), 1);
      break;
    }
    case 'woofer':
      if (beat === 3) {
        e.mode = 'idle';
        emit(w, 'pulse', e.x, e.y, { n: e.id });
        areaStrike(w, e, ringCells(e), 1, 1);
      } else if (beat === 2) {
        e.mode = 'windup';
      }
      break;
    case 'conductor': {
      if (!e.aware || ((turn + e.phase) & 1) !== 0) break;
      const base = manh(e.x, e.y, p.x, p.y);
      let best: Dir | -1 = -1;
      let bestD = base;
      for (const d of DIRS) {
        const nx = e.x + DX[d];
        const ny = e.y + DY[d];
        if (!isFree(w, nx, ny) || isPlayerAt(w, nx, ny)) continue;
        const nd = manh(nx, ny, p.x, p.y);
        if (nd > bestD) {
          bestD = nd;
          best = d;
        }
      }
      if (best >= 0) {
        const d = best as Dir;
        emit(w, 'move', e.x, e.y, { who: 'enemy', x2: e.x + DX[d], y2: e.y + DY[d], d, n: e.id });
        e.x += DX[d];
        e.y += DY[d];
        e.facing = d;
      }
      break;
    }
    case 'golem': {
      if (e.mode === 'windup') {
        e.mode = 'recover';
        emit(w, 'slam', e.x, e.y, { n: e.id });
        areaStrike(w, e, crossCells(e), 2, 1);
        break;
      }
      if (e.mode === 'recover') {
        e.mode = 'idle';
        break;
      }
      if (!e.aware || !onCadence(turn, e)) break;
      if (manh(e.x, e.y, p.x, p.y) === 1) {
        e.mode = 'windup';
        faceToward(e, p.x, p.y);
      } else {
        stepToward(w, e, chaseDirs(e, p.x, p.y), 0, false);
      }
      break;
    }
    case 'spotlight':
      if (beat === 0) e.mode = 'windup';
      else if (beat === 1) {
        e.mode = 'idle';
        const cells = lineCells(w, e.x, e.y, e.facing, 14);
        emit(w, 'beam', e.x, e.y, { d: e.facing, n: cells.length, x2: e.id });
        areaStrike(w, e, cells, 1, 1);
      } else if (beat === 3) {
        for (let i = 0; i < 4; i++) {
          e.facing = ((e.facing + 1) & 3) as Dir;
          if (lineCells(w, e.x, e.y, e.facing, 2).length >= 2) break;
        }
      }
      break;
  }
}

export function enemyPhase(w: World): void {
  const p = w.player;
  const conductors = w.enemies.filter((e) => e.alive && e.kind === 'conductor');
  for (const e of w.enemies) {
    if (!e.alive) continue;
    e.buffed = conductors.some((c) => c !== e && c.alive && cheb(c.x, c.y, e.x, e.y) <= 2);
    if (!e.aware && manh(e.x, e.y, p.x, p.y) <= AWARE_RANGE) e.aware = true;
  }
  for (const e of w.enemies) {
    if (w.dead) return;
    if (e.alive) act(w, e);
  }
}

/** Telegraphs for committed attacks plus per-enemy intent (display only, no state change). */
export function enemyDanger(w: World, out: Danger[]): void {
  const n = w.turn; // index of the next beat to resolve
  const nb = n & 3;
  const p = w.player;
  for (const e of w.enemies) {
    if (!e.alive) continue;
    e.ready = false;
    e.intent = -1;
    const stunned = e.stun > 0;
    switch (e.kind) {
      case 'ram':
        if (e.mode === 'rev' && !stunned) {
          let x = e.x;
          let y = e.y;
          for (let i = 0; i < RAM_DASH; i++) {
            x += DX[e.lockDir];
            y += DY[e.lockDir];
            if (isSolid(w, x, y) || blockingPropAt(w, x, y) || bossAt(w, x, y)) break;
            out.push({ x, y, inn: 1, dmg: 2 });
            if (enemyAt(w, x, y)) break;
          }
          e.ready = true;
        }
        break;
      case 'woofer':
        if (!stunned && (nb === 3 || nb === 2)) for (const [x, y] of ringCells(e)) out.push({ x, y, inn: nb === 3 ? 1 : 2, dmg: 1 });
        e.ready = nb === 3;
        break;
      case 'golem':
        if (e.mode === 'windup' && !stunned) for (const [x, y] of crossCells(e)) out.push({ x, y, inn: 1, dmg: 2 });
        e.ready = e.mode === 'windup';
        break;
      case 'spotlight':
        if (!stunned && (nb === 1 || nb === 0)) {
          for (const [x, y] of lineCells(w, e.x, e.y, e.facing, 14)) out.push({ x, y, inn: nb === 1 ? 1 : 2, dmg: 1 });
        }
        e.ready = nb === 1;
        break;
      case 'clank':
        e.ready = !stunned;
        e.intent = e.facing;
        break;
      case 'conductor':
        e.ready = e.aware && !stunned && ((n + e.phase) & 1) === 0;
        break;
      default:
        break;
    }
    if (e.kind === 'buzz' || e.kind === 'warden' || (e.kind === 'ram' && e.mode !== 'rev') || (e.kind === 'golem' && e.mode === 'idle')) {
      const aware = e.aware || manh(e.x, e.y, p.x, p.y) <= AWARE_RANGE;
      e.ready = aware && !stunned && onCadence(n, e);
      if (e.ready) {
        const dirs = chaseDirs(e, p.x, p.y, e.kind === 'ram');
        for (const d of dirs) {
          const nx = e.x + DX[d];
          const ny = e.y + DY[d];
          if (isPlayerAt(w, nx, ny) || isFree(w, nx, ny)) {
            e.intent = d;
            break;
          }
        }
      }
    }
  }
}
