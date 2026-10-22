import { emit, enemyAt, hurtPlayer, idx, isFree, isPlayerAt, isSolid, makeEnemy, rngNext } from './core';
import { DIRS, DX, DY, type BossAttack, type BossState, type Danger, type World } from './types';

// MAESTRO HUSH
// - Its mute field blocks every direct hit. Only the echo (sound from the past) gets through,
//   and a player hit on the same beat as an echo hit is a resonance (3 dmg).
// - It relocates on the last beat of every bar to a station announced a full bar ahead.
//   Echo hits come from last bar's path, so the player scores by walking through the
//   *next* station (and leaving before it lands); next bar the echo runs through the boss.

export const BOSS_HP = 45;
export const PHASE_FLOOR = [0, 30, 15, 0];
export const PHASE_BPM = [0, 120, 128, 136];
export const STATIONS: readonly [number, number][] = [
  [6, 2],
  [2, 2],
  [10, 2],
  [2, 7],
  [10, 7],
  [6, 6],
];

export function makeBoss(x: number, y: number): BossState {
  const st = Math.max(0, STATIONS.findIndex(([sx, sy]) => sx === x && sy === y));
  return {
    x: STATIONS[st][0],
    y: STATIONS[st][1],
    w: 2,
    h: 2,
    hp: BOSS_HP,
    maxHp: BOSS_HP,
    phase: 1,
    transition: 0,
    pendingPhase: 1,
    attacks: [],
    lastBar: [],
    defeated: false,
    victoryTurns: 0,
    bpm: PHASE_BPM[1],
    hitFlash: 0,
    station: st,
    next: st,
  };
}

function bodyCells(w: World, st: number): number[] {
  const [sx, sy] = STATIONS[st];
  return [idx(w, sx, sy), idx(w, sx + 1, sy), idx(w, sx, sy + 1), idx(w, sx + 1, sy + 1)];
}

function inBody(st: number, x: number, y: number): boolean {
  const [sx, sy] = STATIONS[st];
  return x >= sx && x < sx + 2 && y >= sy && y < sy + 2;
}

export function nextStationCells(w: World): number[] {
  const b = w.boss;
  if (!b || b.defeated || b.next === b.station) return [];
  return bodyCells(w, b.next);
}

function open(w: World, st: number, x: number, y: number): boolean {
  return x > 0 && y > 0 && x < w.w - 1 && y < w.h - 1 && !isSolid(w, x, y) && !inBody(st, x, y);
}

function cellsCol(w: World, st: number, x: number): number[] {
  const out: number[] = [];
  for (let y = 1; y < w.h - 1; y++) if (open(w, st, x, y)) out.push(idx(w, x, y));
  return out;
}

function cellsRow(w: World, st: number, y: number): number[] {
  const out: number[] = [];
  for (let x = 1; x < w.w - 1; x++) if (open(w, st, x, y)) out.push(idx(w, x, y));
  return out;
}

function cellsStomp(w: World, st: number): number[] {
  const [sx, sy] = STATIONS[st];
  const out: number[] = [];
  for (let y = sy - 1; y <= sy + 2; y++)
    for (let x = sx - 1; x <= sx + 2; x++) if (open(w, st, x, y)) out.push(idx(w, x, y));
  return out;
}

function cellsShape(w: World, st: number, cx: number, cy: number, shape: 'cross' | 'box'): number[] {
  const out: number[] = [];
  const add = (x: number, y: number) => {
    if (open(w, st, x, y)) out.push(idx(w, x, y));
  };
  if (shape === 'box') {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) add(cx + dx, cy + dy);
  } else {
    add(cx, cy);
    for (let r = 1; r <= 2; r++) {
      add(cx + r, cy);
      add(cx - r, cy);
      add(cx, cy + r);
      add(cx, cy - r);
    }
  }
  return out;
}

function cellsRain(w: World, st: number, n: number): number[] {
  const out = new Set<number>();
  for (let tries = 0; out.size < n && tries < 80; tries++) {
    const x = 1 + Math.floor(rngNext(w) * (w.w - 2));
    const y = 1 + Math.floor(rngNext(w) * (w.h - 2));
    if (open(w, st, x, y)) out.add(idx(w, x, y));
  }
  return [...out];
}

type Kind = Exclude<BossAttack['kind'], 'land'>;
type Slot = [beat: number, kind: Kind, offset?: number];
const PATTERNS: Record<number, Slot[][]> = {
  1: [
    [
      [1, 'col'],
      [2, 'stomp'],
    ],
    [
      [0, 'row'],
      [2, 'col'],
    ],
    [
      [1, 'stomp'],
      [2, 'cross'],
    ],
    [
      [0, 'box'],
      [2, 'stomp'],
    ],
  ],
  2: [
    [
      [0, 'col'],
      [1, 'col', 2],
      [2, 'stomp'],
    ],
    [
      [0, 'row'],
      [1, 'cross'],
      [2, 'stomp'],
    ],
    [
      [0, 'box'],
      [1, 'rain'],
      [2, 'col'],
    ],
  ],
  3: [
    [
      [1, 'cross'],
      [2, 'stomp'],
    ],
    [
      [0, 'box'],
      [2, 'col'],
    ],
    [
      [1, 'rain'],
      [2, 'stomp'],
    ],
  ],
};

/** Plan bar `bar`: the boss will stand at b.next for that bar. Also schedules the landing move for its last beat. */
function compose(w: World, b: BossState, bar: number, landing: boolean): void {
  const p = w.player;
  const base = bar * 4;
  const st = b.next;
  if (b.phase === 3) {
    // Reprise: the boss echoes its own previous bar once (reprises never repeat again).
    for (const a of b.attacks) {
      if (!a.reprise && a.kind !== 'land' && a.turn >= base - 4 && a.turn < base) {
        b.attacks.push({ turn: a.turn + 4, kind: a.kind, cells: a.cells.filter((c) => !bodyCells(w, st).includes(c)), reprise: true, st });
      }
    }
  }
  const pats = PATTERNS[b.phase];
  const pat = pats[Math.floor(rngNext(w) * pats.length)];
  for (const [beat, kind, off = 0] of pat) {
    const px = Math.max(1, Math.min(w.w - 2, p.x + (p.x + off > w.w - 2 ? -off : off)));
    let cells: number[];
    if (kind === 'col') cells = cellsCol(w, st, px);
    else if (kind === 'row') cells = cellsRow(w, st, p.y);
    else if (kind === 'stomp') cells = cellsStomp(w, st);
    else if (kind === 'cross' || kind === 'box') cells = cellsShape(w, st, p.x, p.y, kind);
    else cells = cellsRain(w, st, 6);
    b.attacks.push({ turn: base + beat, kind, cells, reprise: false, st });
  }
  if (landing) {
    // pick where it goes after this bar; never stays, never lands on its current spot
    const opts = STATIONS.map((_, i) => i).filter((i) => i !== st);
    const nx = opts[Math.floor(rngNext(w) * opts.length)];
    b.attacks.push({ turn: base + 3, kind: 'land', cells: bodyCells(w, nx), reprise: false, st: nx });
  }
}

/** Called at every bar boundary after the turn counter advanced (w.turn = first beat of the new bar). */
export function bossBar(w: World): void {
  const b = w.boss;
  if (!b || b.defeated) return;
  const bar = w.turn >> 2;
  b.attacks = b.attacks.filter((a) => a.turn >= w.turn);
  if (b.pendingPhase > b.phase) {
    // Retune bar: no attacks, invulnerable, stays put. New tempo from the next bar line.
    b.phase = b.pendingPhase as 2 | 3;
    b.transition = 4;
    b.attacks = [];
    b.next = b.station;
    b.bpm = PHASE_BPM[b.phase];
    emit(w, 'bossPhase', b.x, b.y, { n: b.phase });
    emit(w, 'bpm', b.x, b.y, { n: b.bpm, x2: (bar + 1) * 4 });
    const spots: [number, number][] = [
      [1, Math.floor(w.h / 2)],
      [w.w - 2, Math.floor(w.h / 2)],
    ];
    for (const [sx, sy] of spots) {
      if (isFree(w, sx, sy) && !isPlayerAt(w, sx, sy)) {
        const e = makeEnemy(w, b.phase === 2 ? 'buzz' : 'clank', sx, sy, sx < w.w / 2 ? 1 : 3, (sx + sy) & 1);
        e.aware = true;
        if (e.kind === 'clank') e.facing = 0;
        emit(w, 'summon', sx, sy);
      }
    }
    compose(w, b, bar + 1, true);
    return;
  }
  // b.next is where the boss stands during `bar`; plan bar+1 from the station it will move to
  const land = b.attacks.find((a) => a.kind === 'land' && a.turn === bar * 4 + 3);
  if (bar === 0 || !land) {
    // first bars: schedule a landing now so there is always one bar of warning
    if (!land) {
      const opts = STATIONS.map((_, i) => i).filter((i) => i !== b.station);
      const nx = opts[Math.floor(rngNext(w) * opts.length)];
      b.attacks.push({ turn: bar * 4 + 3, kind: 'land', cells: bodyCells(w, nx), reprise: false, st: nx });
      b.next = nx;
    }
  } else {
    b.next = land.st;
  }
  compose(w, b, bar + 1, true);
}

function landAt(w: World, b: BossState, st: number): void {
  const [sx, sy] = STATIONS[st];
  b.station = st;
  b.x = sx;
  b.y = sy;
  emit(w, 'bossAttack', sx, sy, { s: 'land', cells: bodyCells(w, st) });
  for (const e of w.enemies) {
    if (e.alive && inBody(st, e.x, e.y)) {
      e.alive = false;
      emit(w, 'kill', e.x, e.y, { s: e.kind, who: 'boss' });
    }
  }
  const p = w.player;
  if (inBody(st, p.x, p.y)) {
    hurtPlayer(w, 1, 'boss', sx, sy);
    // shove out to the nearest free tile, deterministic order (away from body centre first)
    const cx = sx + 0.5;
    const cy = sy + 0.5;
    const order = [...DIRS].sort((a, c) => {
      const da = (p.x + DX[a] - cx) ** 2 + (p.y + DY[a] - cy) ** 2;
      const dc = (p.x + DX[c] - cx) ** 2 + (p.y + DY[c] - cy) ** 2;
      return dc - da || a - c;
    });
    let moved = false;
    for (let r = 1; r <= 3 && !moved; r++) {
      const d = order.find((q) => {
        const nx = p.x + DX[q] * r;
        const ny = p.y + DY[q] * r;
        return isFree(w, nx, ny) && !inBody(st, nx, ny);
      });
      if (d !== undefined) {
        p.x += DX[d] * r;
        p.y += DY[d] * r;
        moved = true;
      }
    }
    if (!moved) {
      // crowded arena: nearest free tile in scan order (deterministic)
      let best = -1;
      let bestD = Infinity;
      for (let y = 1; y < w.h - 1; y++)
        for (let x = 1; x < w.w - 1; x++) {
          const dd = Math.abs(x - p.x) + Math.abs(y - p.y);
          if (dd < bestD && isFree(w, x, y) && !inBody(st, x, y)) (bestD = dd), (best = idx(w, x, y));
        }
      if (best >= 0) (p.x = best % w.w), (p.y = Math.floor(best / w.w));
    }
  }
}

export function bossPhase(w: World): void {
  const b = w.boss;
  if (!b) return;
  if (b.hitFlash > 0) b.hitFlash--;
  if (b.defeated) {
    if (b.victoryTurns > 0 && --b.victoryTurns === 0) {
      w.cleared = true;
      emit(w, 'clear', w.player.x, w.player.y);
    }
    return;
  }
  if (b.transition > 0) {
    b.transition--;
    return;
  }
  const pi = idx(w, w.player.x, w.player.y);
  let playerHit = false;
  for (const a of b.attacks) {
    if (a.turn !== w.turn || a.kind === 'land') continue;
    emit(w, 'bossAttack', b.x, b.y, { cells: a.cells, s: a.kind, n: a.reprise ? 1 : 0 });
    for (const c of a.cells) {
      if (c === pi && !playerHit) {
        playerHit = true;
        hurtPlayer(w, 1, 'boss', b.x, b.y);
      }
      const e = enemyAt(w, c % w.w, Math.floor(c / w.w));
      if (e && e.alive) {
        e.alive = false;
        emit(w, 'kill', e.x, e.y, { s: e.kind, who: 'boss' });
      }
    }
  }
  const land = b.attacks.find((a) => a.turn === w.turn && a.kind === 'land');
  if (land && !w.dead) landAt(w, b, land.st);
}

export function damageBoss(w: World, n: number, src: 'echo' | 'reso'): void {
  const b = w.boss;
  if (!b || b.defeated) return;
  if (b.transition > 0 || b.pendingPhase > b.phase) {
    emit(w, 'block', b.x, b.y, { s: 'mute' });
    return;
  }
  const floor = PHASE_FLOOR[b.phase];
  b.hp = Math.max(floor, b.hp - n);
  b.hitFlash = 2;
  emit(w, 'hit', b.x, b.y, { n, s: src, who: 'boss' });
  if (b.hp <= 0) {
    b.defeated = true;
    b.attacks = [];
    b.victoryTurns = 6;
    for (const e of w.enemies) {
      if (e.alive) {
        e.alive = false;
        emit(w, 'kill', e.x, e.y, { s: e.kind, who: 'boss' });
      }
    }
    emit(w, 'bossDown', b.x, b.y);
  } else if (b.hp <= floor) {
    b.pendingPhase = b.phase + 1;
  }
}

export function bossDanger(w: World, out: Danger[]): void {
  const b = w.boss;
  if (!b || b.defeated) return;
  const n = w.turn;
  for (const a of b.attacks) {
    if (a.turn < n || a.turn > n + 7) continue;
    for (const c of a.cells) out.push({ x: c % w.w, y: Math.floor(c / w.w), inn: a.turn - n + 1, dmg: 1 });
  }
}
