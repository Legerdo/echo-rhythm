import { describe, expect, it } from 'vitest';
import { cheb, isSolid } from '../../src/sim/core';
import { generateFloor, validateWorld } from '../../src/sim/gen';
import { Rng } from '../../src/sim/rng';
import { BOSS_MAP, TUTORIAL_MAP, combatPool, relayPool } from '../../src/sim/rooms';
import { FLOORS } from '../../src/sim/run';
import type { Dir, PlayerAction, World } from '../../src/sim/types';
import { step } from '../../src/sim/world';
import { snapshot } from './helpers';

const carry = { hp: 5, maxHp: 5, mods: [], echoUnlocked: true };

describe('templates', () => {
  it('all room templates are 13x9 and fixed maps are rectangular', () => {
    for (let z = 0; z < 3; z++)
      for (const t of [...combatPool(z), ...relayPool(z)]) {
        expect(t.length).toBe(9);
        for (const row of t) expect(row.length).toBe(13);
      }
    for (const m of [TUTORIAL_MAP, BOSS_MAP]) for (const row of m) expect(row.length).toBe(m[0].length);
  });
});

describe('generation', () => {
  it('produces valid, reachable floors across many seeds', () => {
    let worlds = 0;
    for (const def of FLOORS) {
      const seeds = def.kind === 'proc' ? 150 : 3;
      for (let s = 1; s <= seeds; s++) {
        const w = generateFloor(def, s * 7919, carry);
        expect(validateWorld(w), `${def.id} seed ${s}`).toEqual([]);
        if (def.kind === 'proc') expect(w.relaysTotal).toBe(def.relays);
        worlds++;
      }
    }
    expect(worlds).toBeGreaterThan(700);
  });

  it('is reproducible from the seed', () => {
    for (const def of FLOORS) {
      const a = generateFloor(def, 1234, carry);
      const b = generateFloor(def, 1234, carry);
      expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
      expect(snapshot(a)).toBe(snapshot(b));
    }
  });

  it('has no telegraphed hazard covering the start tile on the first beats', () => {
    for (const def of FLOORS)
      for (let s = 1; s <= 40; s++) {
        const w = generateFloor(def, s, carry);
        expect(w.danger.some((d) => d.x === w.player.x && d.y === w.player.y && d.inn <= 2)).toBe(false);
      }
  });
});

function invariants(w: World): string | null {
  const seen = new Set<number>();
  for (const e of w.enemies) {
    if (!e.alive) return 'dead enemy kept';
    const k = e.y * w.w + e.x;
    if (seen.has(k)) return `stacked enemies at ${e.x},${e.y}`;
    seen.add(k);
    if (isSolid(w, e.x, e.y) && w.tiles[k] !== 5) return `enemy in wall ${e.kind}`;
    if (e.x === w.player.x && e.y === w.player.y) return `enemy on player ${e.kind}`;
  }
  const p = w.player;
  if (p.hp < 0 || p.hp > p.maxHp) return 'hp out of range';
  if (p.charge < 0 || p.charge > p.maxCharge) return 'charge out of range';
  if (isSolid(w, p.x, p.y) && w.tiles[p.y * w.w + p.x] !== 5) return 'player in wall';
  if (w.record.entries.length > 4) return 'recording too long';
  if (w.echo && w.echo.entries.length !== 4) return 'echo not 4 beats';
  if (w.boss && w.boss.hp < 0) return 'boss hp negative';
  if (w.echo && !w.echo.faded && cheb(w.echo.x, w.echo.y, w.echo.sx, w.echo.sy) > 4 && !w.echo.entries.some((e) => e.k === 'warp'))
    return 'echo drifted';
  return null;
}

describe('fuzz', () => {
  it('random play never breaks world invariants', () => {
    for (const def of FLOORS) {
      for (let s = 1; s <= 12; s++) {
        const w = generateFloor(def, s * 31, { ...carry, mods: s % 2 ? ['reverse', 'bass', 'reverb'] : ['harmonic', 'scratch', 'crescendo'] });
        const rng = new Rng(s);
        for (let t = 0; t < 500 && !w.dead && !w.cleared; t++) {
          const r = rng.int(10);
          const a: PlayerAction = r < 7 ? { k: 'dir', d: rng.int(4) as Dir, onBeat: rng.chance(0.85) } : r < 9 ? { k: 'idle', d: 0, onBeat: false } : { k: 'rewind', d: 0, onBeat: true };
          step(w, a);
          if (w.pendingChest) w.pendingChest = 0;
          const bad = invariants(w);
          expect(bad, `${def.id} seed ${s} turn ${t}`).toBeNull();
        }
      }
    }
  });
});
