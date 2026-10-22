import { makeBoss } from './boss';
import { blockingPropAt, enemyAt, idx, makeEnemy, makeProp, manh } from './core';
import { hashSeed, Rng } from './rng';
import * as R from './rooms';
import { DIRS, DX, DY, T, type Dir, type EnemyKind, type ModId, type World } from './types';
import { computeDanger, createWorld, walkableStatic } from './world';

export interface FloorDef {
  id: string;
  zone: number;
  name: string;
  kind: 'tutorial' | 'proc' | 'boss';
  cols: number;
  rows: number;
  relays: number;
  /** extra enemies per room */
  tier: number;
  pedestal?: boolean;
  encore?: boolean;
  table: [EnemyKind, number][];
  elite: EnemyKind[];
}

export interface Carry {
  hp: number;
  maxHp: number;
  mods: ModId[];
  echoUnlocked: boolean;
}

const CW = 14;
const CH = 10;
const CAPS: Partial<Record<EnemyKind, number>> = { golem: 2, conductor: 2, spotlight: 3, woofer: 3, ram: 4, warden: 4 };

export function generateFloor(def: FloorDef, seed: number, carry: Carry): World {
  if (def.kind === 'tutorial') return buildTutorial(def, seed, carry);
  if (def.kind === 'boss') return buildBoss(def, seed, carry);
  for (let attempt = 0; attempt < 40; attempt++) {
    const w = buildProc(def, hashSeed(seed, 'try', attempt), carry);
    if (validateWorld(w).length === 0) return w;
  }
  throw new Error(`floor ${def.id}: no valid layout for seed ${seed}`);
}

// ------------------------------------------------------------------ procedural floors

interface Slot {
  x: number;
  y: number;
  c: string;
  room: number;
}

function buildProc(def: FloorDef, seed: number, carry: Carry): World {
  const rng = new Rng(seed);
  const { cols, rows } = def;
  const W = cols * CW + 1;
  const H = rows * CH + 1;
  const tiles = new Uint8Array(W * H).fill(T.Wall);
  const deco = new Uint8Array(W * H);
  for (let i = 0; i < deco.length; i++) deco[i] = rng.int(256);
  const n = cols * rows;
  const cx = (c: number) => c % cols;
  const cy = (c: number) => Math.floor(c / cols);
  const neighbors = (c: number) => {
    const out: number[] = [];
    if (cx(c) > 0) out.push(c - 1);
    if (cx(c) < cols - 1) out.push(c + 1);
    if (cy(c) > 0) out.push(c - cols);
    if (cy(c) < rows - 1) out.push(c + cols);
    return out;
  };

  // spanning tree by randomized DFS from a corner
  const corners = [0, cols - 1, n - cols, n - 1];
  const start = rng.pick(corners);
  const edges = new Set<string>();
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const c = stack[stack.length - 1];
    const opts = rng.shuffle(neighbors(c).filter((m) => !seen.has(m)));
    if (!opts.length) {
      stack.pop();
      continue;
    }
    const m = opts[0];
    edges.add(key(c, m));
    seen.add(m);
    stack.push(m);
  }
  const adj = (c: number) => neighbors(c).filter((m) => edges.has(key(c, m)));
  const dist = new Array(n).fill(-1);
  dist[start] = 0;
  const q = [start];
  while (q.length) {
    const c = q.shift()!;
    for (const m of adj(c)) if (dist[m] < 0) (dist[m] = dist[c] + 1), q.push(m);
  }
  const maxD = Math.max(...dist);
  const exit = rng.pick([...Array(n).keys()].filter((c) => dist[c] === maxD));
  let encore = -1;
  if (def.encore) {
    const leaves = [...Array(n).keys()].filter((c) => c !== start && c !== exit && adj(c).length === 1);
    if (leaves.length && rng.chance(0.75)) encore = rng.pick(leaves);
  }
  // one loop edge for route choice (never into the encore room)
  const extra = [];
  for (let c = 0; c < n; c++)
    for (const m of neighbors(c)) if (c < m && !edges.has(key(c, m)) && c !== encore && m !== encore) extra.push([c, m]);
  if (extra.length && rng.chance(0.7)) {
    const [a, b] = rng.pick(extra);
    edges.add(key(a, b));
  }
  const free = [...Array(n).keys()].filter((c) => c !== start && c !== exit && c !== encore);
  free.sort((a, b) => dist[b] - dist[a] || a - b);
  const relayCells = new Set<number>();
  // spread relays: alternate far / mid picks
  const pool = [...free];
  while (relayCells.size < def.relays && pool.length) {
    const pickIdx = relayCells.size % 2 === 0 ? 0 : Math.floor(pool.length / 2);
    relayCells.add(pool.splice(pickIdx, 1)[0]);
  }
  if (relayCells.size < def.relays) relayCells.add(exit);

  // carve rooms
  const slots: Slot[] = [];
  const crates: { x: number; y: number }[] = [];
  const specials: { x: number; y: number; c: string }[] = [];
  let sx = 0;
  let sy = 0;
  let ex = 0;
  let ey = 0;
  const used = new Set<R.Template>();
  for (let c = 0; c < n; c++) {
    let tpl: R.Template;
    if (c === start) tpl = R.START_ROOM;
    else if (c === exit && !relayCells.has(c)) tpl = R.EXIT_ROOM;
    else if (c === encore) tpl = R.ENCORE_ROOM;
    else if (relayCells.has(c)) tpl = pickFresh(rng, R.relayPool(def.zone), used);
    else tpl = pickFresh(rng, R.combatPool(def.zone), used);
    const mx = rng.chance(0.5);
    const my = rng.chance(0.5);
    for (let ty = 0; ty < 9; ty++) {
      for (let tx = 0; tx < 13; tx++) {
        let ch = tpl[my ? 8 - ty : ty][mx ? 12 - tx : tx];
        const X = cx(c) * CW + 1 + tx;
        const Y = cy(c) * CH + 1 + ty;
        if (c === exit && relayCells.has(c) && ty === 7 && tx === 6) ch = 'X';
        const i = Y * W + X;
        tiles[i] = ch === '#' ? T.Wall : ch === '=' ? T.Rail : ch === 'v' ? T.Vent : ch === 'X' ? T.Exit : T.Floor;
        if (ch === 'x') crates.push({ x: X, y: Y });
        else if ('eEWS'.includes(ch)) slots.push({ x: X, y: Y, c: ch, room: c });
        else if ('RbpC'.includes(ch)) specials.push({ x: X, y: Y, c: ch });
        if (ch === 's') (sx = X), (sy = Y);
        if (ch === 'X') (ex = X), (ey = Y);
      }
    }
  }

  // doors
  const isOpen = (x: number, y: number) => {
    const t = tiles[y * W + x];
    return t !== T.Wall && !crates.some((k) => k.x === x && k.y === y);
  };
  const carve = (x: number, y: number) => {
    if (tiles[y * W + x] === T.Wall) tiles[y * W + x] = T.Floor;
    const k = crates.findIndex((q) => q.x === x && q.y === y);
    if (k >= 0) crates.splice(k, 1);
  };
  const doorCells: { x: number; y: number }[] = [];
  const gates: { gx: number; gy: number; inX: number; inY: number; outX: number; outY: number; d: Dir }[] = [];
  for (const e of edges) {
    const [a, b] = e.split('-').map(Number);
    const horiz = cy(a) === cy(b); // side by side -> vertical wall
    const isEncore = a === encore || b === encore;
    const cand: number[] = [];
    if (horiz) {
      const x = cx(b) * CW;
      for (let y = cy(a) * CH + 2; y <= cy(a) * CH + 8; y++) if (isOpen(x - 1, y) && isOpen(x + 1, y)) cand.push(y);
      const y = cand.length ? rng.pick(cand) : cy(a) * CH + 5;
      const width = !isEncore && cand.includes(y + 1) && rng.chance(0.5) ? 2 : 1;
      for (let k = 0; k < width; k++) {
        carve(x - 1, y + k);
        carve(x + 1, y + k);
        tiles[(y + k) * W + x] = isEncore ? T.Gate : T.Floor;
        doorCells.push({ x, y: y + k });
      }
      if (isEncore) {
        const inRight = b === encore;
        gates.push({ gx: x, gy: y, inX: inRight ? x + 1 : x - 1, inY: y, outX: inRight ? x - 1 : x + 1, outY: y, d: inRight ? 1 : 3 });
      }
    } else {
      const y = cy(b) * CH;
      for (let x = cx(a) * CW + 3; x <= cx(a) * CW + 11; x++) if (isOpen(x, y - 1) && isOpen(x, y + 1)) cand.push(x);
      const x = cand.length ? rng.pick(cand) : cx(a) * CW + 7;
      const width = !isEncore && cand.includes(x + 1) && rng.chance(0.5) ? 2 : 1;
      for (let k = 0; k < width; k++) {
        carve(x + k, y - 1);
        carve(x + k, y + 1);
        tiles[y * W + x + k] = isEncore ? T.Gate : T.Floor;
        doorCells.push({ x: x + k, y });
      }
      if (isEncore) {
        const inDown = b === encore;
        gates.push({ gx: x, gy: y, inX: x, inY: inDown ? y + 1 : y - 1, outX: x, outY: inDown ? y - 1 : y + 1, d: inDown ? 2 : 0 });
      }
    }
  }

  const w = createWorld({
    w: W,
    h: H,
    tiles,
    deco,
    zone: def.zone,
    floorId: def.id,
    sx,
    sy,
    exitX: ex,
    exitY: ey,
    exitOpen: def.relays === 0,
    seed: hashSeed(seed, 'sim'),
    hp: carry.hp,
    maxHp: carry.maxHp,
    mods: carry.mods,
    echoUnlocked: carry.echoUnlocked,
  });
  for (const k of crates) makeProp(w, 'crate', k.x, k.y, rng.int(4));
  for (const s of specials) {
    if (s.c === 'R') makeProp(w, 'relay', s.x, s.y);
    else if (s.c === 'p' && def.pedestal) makeProp(w, 'pedestal', s.x, s.y);
    else if (s.c === 'C') makeProp(w, 'chest', s.x, s.y);
    else if (s.c === 'b' && rng.chance(0.6)) makeProp(w, rng.chance(0.65) ? 'battery' : 'tape', s.x, s.y);
  }
  w.relaysTotal = w.props.filter((p) => p.kind === 'relay').length;
  if (w.relaysTotal === 0) w.exitOpen = true;

  // encore gate: inner plate beside the gate, outer plate 3 steps away in the neighbouring room
  for (const g of gates) {
    const plates: number[] = [];
    const ix = g.inX + DX[g.d];
    const iy = g.inY + DY[g.d];
    tiles[iy * W + ix] = T.Plate;
    plates.push(iy * W + ix);
    const back = ((g.d + 2) & 3) as Dir;
    const side = ((g.d + 1) & 3) as Dir;
    const cands: [number, number][] = [];
    for (let s = -2; s <= 2; s++) {
      const px = g.outX + DX[back] * 2 + DX[side] * s;
      const py = g.outY + DY[back] * 2 + DY[side] * s;
      if (px > 0 && py > 0 && px < W - 1 && py < H - 1 && tiles[py * W + px] === T.Floor && !blockingPropAt(w, px, py)) cands.push([px, py]);
    }
    const [px, py] = cands.length ? rng.pick(cands) : [g.outX + DX[back], g.outY + DY[back]];
    if (tiles[py * W + px] !== T.Floor) tiles[py * W + px] = T.Floor;
    tiles[py * W + px] = T.Plate;
    plates.push(py * W + px);
    w.gates.push({ x: g.gx, y: g.gy, open: false, plates });
  }

  // enemies
  const nearDoor = (x: number, y: number) => doorCells.some((d) => manh(d.x, d.y, x, y) <= 2);
  const counts: Partial<Record<EnemyKind, number>> = {};
  const can = (k: EnemyKind) => (counts[k] ?? 0) < (CAPS[k] ?? 99);
  const pickKind = (): EnemyKind => {
    const opts = def.table.filter(([k]) => can(k));
    const total = opts.reduce((s, [, wgt]) => s + wgt, 0);
    let r = rng.next() * total;
    for (const [k, wgt] of opts) if ((r -= wgt) < 0) return k;
    return 'buzz';
  };
  const hasKind = (k: EnemyKind) => def.table.some(([q]) => q === k) || def.elite.includes(k);
  const spawn = (kind: EnemyKind, x: number, y: number) => {
    counts[kind] = (counts[kind] ?? 0) + 1;
    const e = makeEnemy(w, kind, x, y, rng.pick(DIRS), rng.int(2));
    if (kind === 'clank') e.facing = patrolDir(w, x, y, rng);
    if (kind === 'spotlight') e.facing = rng.pick(DIRS);
  };
  for (let c = 0; c < n; c++) {
    if (c === start || c === encore) continue;
    const roomSlots = rng.shuffle(slots.filter((s) => s.room === c && !nearDoor(s.x, s.y) && !blockingPropAt(w, s.x, s.y)));
    const isRelay = relayCells.has(c);
    let budget = (isRelay ? 2 : c === exit ? 2 : 3) + def.tier;
    for (const s of roomSlots) {
      if (budget <= 0) break;
      if (manh(s.x, s.y, sx, sy) < 6 || enemyAt(w, s.x, s.y)) continue;
      let kind: EnemyKind | null = null;
      if (s.c === 'E') kind = def.elite.length && rng.chance(0.75) ? rng.pick(def.elite.filter(can).concat(['buzz'])) : null;
      else if (s.c === 'W') kind = hasKind('woofer') && can('woofer') ? 'woofer' : pickKind();
      else if (s.c === 'S') kind = hasKind('spotlight') && can('spotlight') ? 'spotlight' : pickKind();
      else kind = pickKind();
      if (!kind) continue;
      spawn(kind, s.x, s.y);
      budget--;
    }
  }

  detectHazards(w, rng);
  computeDanger(w);
  return w;
}

function pickFresh<T>(rng: Rng, pool: T[], used: Set<T>): T {
  const fresh = pool.filter((t) => !used.has(t));
  const t = rng.pick(fresh.length ? fresh : pool);
  used.add(t);
  return t;
}

function patrolDir(w: World, x: number, y: number, rng: Rng): Dir {
  const run = (d: Dir) => {
    let k = 0;
    let cx = x + DX[d];
    let cy = y + DY[d];
    while (walkableStatic(w, cx, cy) && k < 12) (k++, (cx += DX[d]), (cy += DY[d]));
    return k;
  };
  const h = run(1) + run(3);
  const v = run(0) + run(2);
  if (h >= v) return rng.chance(0.5) ? 1 : 3;
  return rng.chance(0.5) ? 0 : 2;
}

/** Rail runs become train lanes (staggered phases), vent tiles alternate by checkerboard. */
function detectHazards(w: World, rng: Rng): void {
  const inLane = new Set<number>();
  const phases = [4, 12, 8, 0];
  let li = rng.int(4);
  for (let y = 0; y < w.h; y++) {
    let x = 0;
    while (x < w.w) {
      if (w.tiles[idx(w, x, y)] !== T.Rail) {
        x++;
        continue;
      }
      let x1 = x;
      while (x1 + 1 < w.w && w.tiles[idx(w, x1 + 1, y)] === T.Rail) x1++;
      if (x1 - x >= 2) {
        for (let k = x; k <= x1; k++) inLane.add(idx(w, k, y));
        w.trains.push({ x0: x, y0: y, x1, y1: y, phase: phases[li++ % 4], d: rng.chance(0.5) ? 1 : 3 });
      }
      x = x1 + 1;
    }
  }
  for (let x = 0; x < w.w; x++) {
    let y = 0;
    while (y < w.h) {
      const i = idx(w, x, y);
      if (w.tiles[i] !== T.Rail || inLane.has(i)) {
        y++;
        continue;
      }
      let y1 = y;
      while (y1 + 1 < w.h && w.tiles[idx(w, x, y1 + 1)] === T.Rail && !inLane.has(idx(w, x, y1 + 1))) y1++;
      if (y1 - y >= 2) w.trains.push({ x0: x, y0: y, x1: x, y1, phase: phases[li++ % 4], d: rng.chance(0.5) ? 2 : 0 });
      y = y1 + 1;
    }
  }
  for (let y = 0; y < w.h; y++)
    for (let x = 0; x < w.w; x++) if (w.tiles[idx(w, x, y)] === T.Vent) w.vents.push({ x, y, phase: (x + y) & 1 ? 4 : 0 });
}

// ------------------------------------------------------------------ fixed maps

function parseFixed(map: R.Template, def: FloorDef, seed: number, carry: Carry) {
  const H = map.length;
  const W = map[0].length;
  const rng = new Rng(seed);
  const tiles = new Uint8Array(W * H);
  const deco = new Uint8Array(W * H);
  for (let i = 0; i < deco.length; i++) deco[i] = rng.int(256);
  let sx = 1;
  let sy = 1;
  let ex = -1;
  let ey = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = map[y][x];
      tiles[y * W + x] = ch === '#' || ch === 'x' ? T.Wall : ch === '=' ? T.Rail : ch === 'X' ? T.Exit : T.Floor;
      if (ch === 's') (sx = x), (sy = y);
      if (ch === 'X') (ex = x), (ey = y);
    }
  }
  const w = createWorld({
    w: W,
    h: H,
    tiles,
    deco,
    zone: def.zone,
    floorId: def.id,
    sx,
    sy,
    exitX: ex,
    exitY: ey,
    exitOpen: true,
    seed: hashSeed(seed, 'sim'),
    hp: carry.hp,
    maxHp: carry.maxHp,
    mods: carry.mods,
    echoUnlocked: carry.echoUnlocked,
  });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = map[y][x];
      if (ch === 'b') makeEnemy(w, 'buzz', x, y, 3, (x + y) & 1);
      else if (ch === 'c') makeEnemy(w, 'clank', x, y, 1, 0);
      else if (ch === 'B') makeProp(w, 'battery', x, y);
      else if (ch >= '1' && ch <= '9') w.hints.push({ x, y, n: Number(ch) });
    }
  }
  return { w, rng };
}

function buildTutorial(def: FloorDef, seed: number, carry: Carry): World {
  const { w, rng } = parseFixed(R.TUTORIAL_MAP, def, seed, carry);
  detectHazards(w, rng);
  computeDanger(w);
  return w;
}

function buildBoss(def: FloorDef, seed: number, carry: Carry): World {
  const { w } = parseFixed(R.BOSS_MAP, def, seed, carry);
  for (let y = 0; y < R.BOSS_MAP.length; y++) {
    const x = R.BOSS_MAP[y].indexOf('h');
    if (x >= 0) w.boss = makeBoss(x, y);
  }
  w.exitOpen = false;
  w.exitX = -1;
  w.exitY = -1;
  computeDanger(w);
  return w;
}

// ------------------------------------------------------------------ validation

export function reachable(w: World, fromX: number, fromY: number): Uint8Array {
  const seen = new Uint8Array(w.w * w.h);
  const q = [idx(w, fromX, fromY)];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % w.w;
    const y = Math.floor(i / w.w);
    for (const d of DIRS) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w.w || ny >= w.h) continue;
      const j = idx(w, nx, ny);
      if (seen[j] || !walkableStatic(w, nx, ny)) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return seen;
}

export function validateWorld(w: World): string[] {
  const errs: string[] = [];
  const p = w.player;
  if (!walkableStatic(w, p.x, p.y)) errs.push('start not walkable');
  const seen = reachable(w, p.x, p.y);
  const near = (x: number, y: number) => DIRS.some((d) => seen[idx(w, x + DX[d], y + DY[d])] === 1);
  if (!w.boss) {
    if (w.exitX < 0 || w.tiles[idx(w, w.exitX, w.exitY)] !== T.Exit) errs.push('exit missing');
    else if (!seen[idx(w, w.exitX, w.exitY)]) errs.push('exit unreachable');
  }
  for (const pr of w.props) {
    if ((pr.kind === 'relay' || pr.kind === 'pedestal') && !near(pr.x, pr.y)) errs.push(`${pr.kind} unreachable at ${pr.x},${pr.y}`);
  }
  for (const g of w.gates) {
    const outer = g.plates[1];
    if (outer === undefined || !seen[outer]) errs.push('encore plate unreachable');
    else if (manh(outer % w.w, Math.floor(outer / w.w), g.x, g.y) > 4) errs.push('encore plate too far');
  }
  const occ = new Set<number>();
  for (const e of w.enemies) {
    const i = idx(w, e.x, e.y);
    if (!walkableStatic(w, e.x, e.y)) errs.push(`enemy ${e.kind} inside solid`);
    if (occ.has(i)) errs.push('stacked enemies');
    occ.add(i);
    if (manh(e.x, e.y, p.x, p.y) < 5) errs.push(`enemy ${e.kind} too close to start`);
  }
  if (w.relaysTotal !== w.props.filter((q) => q.kind === 'relay').length) errs.push('relay count mismatch');
  return errs;
}
