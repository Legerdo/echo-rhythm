import { makeEnemy, makeProp } from '../../src/sim/core';
import { T, type Dir, type EnemyKind, type ModId, type PlayerAction, type World } from '../../src/sim/types';
import { computeDanger, createWorld } from '../../src/sim/world';

export const mv = (d: Dir): PlayerAction => ({ k: 'dir', d, onBeat: true });
export const idle: PlayerAction = { k: 'idle', d: 0, onBeat: true };
export const rewind: PlayerAction = { k: 'rewind', d: 0, onBeat: true };
export const U = mv(0);
export const R = mv(1);
export const D = mv(2);
export const L = mv(3);

const KIND: Record<string, EnemyKind> = {
  b: 'buzz',
  c: 'clank',
  w: 'warden',
  r: 'ram',
  f: 'woofer',
  n: 'conductor',
  g: 'golem',
  s: 'spotlight',
};

/** '#' wall '.' floor '@' player 'X' exit 'O' relay '=' rail 'P' plate 'G' gate; lowercase letters = enemies (aware, facing down). */
export function worldFrom(map: string[], opts: { echo?: boolean; mods?: ModId[]; hp?: number } = {}): World {
  const H = map.length;
  const W = map[0].length;
  const tiles = new Uint8Array(W * H);
  let sx = 1;
  let sy = 1;
  let ex = -1;
  let ey = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = map[y][x];
      tiles[y * W + x] = c === '#' ? T.Wall : c === '=' ? T.Rail : c === 'X' ? T.Exit : c === 'P' ? T.Plate : c === 'G' ? T.Gate : T.Floor;
      if (c === '@') (sx = x), (sy = y);
      if (c === 'X') (ex = x), (ey = y);
    }
  const w = createWorld({
    w: W,
    h: H,
    tiles,
    zone: 0,
    floorId: 'test',
    sx,
    sy,
    exitX: ex,
    exitY: ey,
    exitOpen: true,
    seed: 1,
    hp: opts.hp ?? 5,
    maxHp: 5,
    mods: opts.mods ?? [],
    echoUnlocked: opts.echo ?? true,
  });
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = map[y][x];
      if (KIND[c]) {
        const e = makeEnemy(w, KIND[c], x, y, 2, 0);
        e.aware = true;
      } else if (c === 'O') makeProp(w, 'relay', x, y);
    }
  w.relaysTotal = w.props.filter((p) => p.kind === 'relay').length;
  if (w.relaysTotal > 0) w.exitOpen = false;
  computeDanger(w);
  return w;
}

/** Stable snapshot of everything that matters for determinism. */
export function snapshot(w: World): string {
  return JSON.stringify({
    t: w.turn,
    p: w.player,
    e: w.enemies.map((e) => [e.id, e.kind, e.x, e.y, e.hp, e.facing, e.mode, e.stun]),
    pr: w.props.map((p) => [p.id, p.kind, p.x, p.y, p.on]),
    echo: w.echo,
    rec: w.record,
    boss: w.boss,
    g: w.gates,
    s: w.stats,
    dead: w.dead,
    cl: w.cleared,
    rng: w.rng,
  });
}
