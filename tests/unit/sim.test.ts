import { describe, expect, it } from 'vitest';
import { enemyAt } from '../../src/sim/core';
import { Rng } from '../../src/sim/rng';
import { step } from '../../src/sim/world';
import type { Dir, PlayerAction } from '../../src/sim/types';
import { D, L, R, U, idle, rewind, snapshot, worldFrom } from './helpers';

const ROOM = ['#########', '#.......#', '#.@.....#', '#.......#', '#########'];

describe('echo', () => {
  it('replays the previous bar from its recorded start, independent of the player', () => {
    const w = worldFrom(ROOM);
    for (const a of [R, U, R, D]) step(w, a);
    expect(w.turn).toBe(4);
    expect(w.echo).not.toBeNull();
    expect([w.echo!.x, w.echo!.y]).toEqual([2, 2]);
    const expected = [
      [3, 2],
      [3, 1],
      [4, 1],
      [4, 2],
    ];
    // player walks somewhere else entirely; echo path must not change
    for (let i = 0; i < 4; i++) {
      step(w, i % 2 ? L : D);
      expect([w.echo!.x, w.echo!.y]).toEqual(expected[i]);
    }
  });

  it('does not exist before the echo is unlocked and never records itself', () => {
    const w = worldFrom(ROOM, { echo: false });
    for (const a of [R, R, R, R]) step(w, a);
    expect(w.echo).toBeNull();
    w.echoUnlocked = true;
    for (const a of [L, L, L, L]) step(w, a);
    // recording holds only the 4 player entries of the last bar
    expect(w.echo!.entries.map((e) => e.k)).toEqual(['move', 'move', 'move', 'move']);
    expect(w.echo!.entries.every((e) => e.d === 3)).toBe(true);
    for (let i = 0; i < 4; i++) step(w, idle);
    expect(w.echo!.entries.every((e) => e.k === 'idle')).toBe(true);
  });

  it('strikes an enemy standing on its recorded path', () => {
    const w = worldFrom(['#########', '#.......#', '#.@.....#', '#.......#', '#########']);
    for (const a of [R, R, R, R]) step(w, a); // player ends at (6,2); echo will walk (3..6,2)
    // drop a stunned buzz onto the echo path
    const map = w.enemies;
    expect(map.length).toBe(0);
    const e = { ...makeStunnedBuzz(w, 4, 2) };
    expect(e.hp).toBe(1);
    step(w, U); // echo -> (3,2)
    step(w, idle); // echo -> (4,2) strikes buzz
    expect(enemyAt(w, 4, 2)).toBeUndefined();
    expect(w.stats.echoKills).toBe(1);
  });

  it('reverse tape replays the bar backwards from where it ended', () => {
    const w = worldFrom(ROOM, { mods: ['reverse'] });
    for (const a of [R, R, D, D]) step(w, a); // (3,2) (4,2) (4,3) bump
    expect([w.echo!.x, w.echo!.y]).toEqual([4, 3]);
    const path: number[][] = [];
    for (let i = 0; i < 4; i++) {
      step(w, idle);
      // read the echo's own move event: on beat 4 the bar boundary already swaps in the next echo
      const mv = w.events.find((e) => e.t === 'move' && e.who === 'echo');
      path.push(mv ? [mv.x2!, mv.y2!] : [w.echo!.x, w.echo!.y]);
    }
    expect(path).toEqual([
      [4, 3],
      [4, 2],
      [3, 2],
      [2, 2],
    ]);
  });

  it('rewind blinks to the echo and spends a charge; fizzles without an echo', () => {
    const w = worldFrom(ROOM);
    step(w, rewind);
    expect([w.player.x, w.player.y]).toEqual([2, 2]);
    expect(w.events.some((e) => e.t === 'fizzle')).toBe(true);
    for (const a of [R, R, R]) step(w, a); // turn 4: echo spawns at (2,2)
    expect(w.echo).not.toBeNull();
    const c = w.player.charge;
    step(w, rewind); // echo moves after the player acts, so we land on its pre-move tile
    expect([w.player.x, w.player.y]).toEqual([2, 2]);
    expect(w.player.charge).toBe(c - 1);
  });
});

function makeStunnedBuzz(w: ReturnType<typeof worldFrom>, x: number, y: number) {
  w.enemies.push({
    id: w.nextId++,
    kind: 'buzz',
    x,
    y,
    hp: 1,
    maxHp: 1,
    facing: 2,
    phase: 0,
    stun: 99,
    aware: true,
    mode: 'idle',
    lockDir: 2,
    alive: true,
    buffed: false,
    intent: -1,
    ready: false,
  });
  return w.enemies[w.enemies.length - 1];
}

describe('resonance', () => {
  it('restores a relay only when player and echo hit it on the same beat', () => {
    const w = worldFrom(['#######', '#.....#', '#.@.O.#', '#.....#', '#..X..#', '#######']);
    expect(w.exitOpen).toBe(false);
    for (const a of [R, R, idle, idle]) step(w, a); // beat1: player tunes relay alone
    expect(w.props[0].on).toBe(false);
    expect(w.events.length).toBeGreaterThanOrEqual(0);
    step(w, idle); // echo moves to (3,2)
    step(w, R); // player + echo both strike relay on beat 1
    expect(w.props[0].on).toBe(true);
    expect(w.stats.resonances).toBe(1);
    expect(w.exitOpen).toBe(true);
  });

  it('pierces a warden shield: front hit + echo side hit on the same beat', () => {
    const w = worldFrom(['#######', '#.....#', '#@.w..#', '#.....#', '#.....#', '#######']);
    const ward = w.enemies[0];
    ward.stun = 99; // hold facing down for a controlled test
    step(w, R); // (2,2)
    step(w, R); // side hit from the left -> lands
    expect(ward.hp).toBe(1);
    step(w, D); // (2,3)
    step(w, R); // (3,3) = in front of the shield
    step(w, idle); // echo -> (2,2)
    step(w, U); // player front hit (blocked alone) + echo side hit -> resonance
    expect(w.stats.resonances).toBe(1);
    expect(ward.alive).toBe(false);
    expect(w.player.charge).toBe(2);
  });

  it('a lone front hit on a warden is blocked', () => {
    const w = worldFrom(['#######', '#..w..#', '#.....#', '#..@..#', '#######']);
    const ward = w.enemies[0];
    step(w, idle); // turn 0: warden steps down to (3,2), faces player
    expect([ward.x, ward.y]).toEqual([3, 2]);
    step(w, U); // front hit
    expect(ward.hp).toBe(2);
    expect(w.events.some((e) => e.t === 'block' && e.s === 'shield')).toBe(true);
  });
});

describe('enemy rules', () => {
  it('buzz acts every other beat and bumps the player', () => {
    const w = worldFrom(['#########', '#@...b..#', '#########']);
    const b = w.enemies[0];
    step(w, idle); // turn 0 acts
    expect(b.x).toBe(4);
    step(w, idle); // turn 1 rests
    expect(b.x).toBe(4);
    step(w, idle); // turn 2 acts
    expect(b.x).toBe(3);
    step(w, idle);
    step(w, idle); // turn 4 -> (2,1)
    expect(b.x).toBe(2);
    const hp = w.player.hp;
    step(w, idle);
    step(w, idle); // turn 6 bump
    expect(w.player.hp).toBe(hp - 1);
  });

  it('ram telegraphs a locked lane, then dashes into the wall and is stunned', () => {
    const w = worldFrom(['#########', '#.......#', '#r...@..#', '#.......#', '#########']);
    const r = w.enemies[0];
    step(w, idle);
    expect(r.mode).toBe('rev');
    expect(w.danger.filter((d) => d.y === 2 && d.inn === 1).length).toBeGreaterThan(4);
    step(w, U); // sidestep out of the lane
    expect(r.x).toBe(7);
    expect(r.stun).toBe(2);
    expect(w.player.hp).toBe(5);
  });

  it('woofer pulses its 8 neighbours on the 4th beat only', () => {
    const w = worldFrom(['#######', '#.....#', '#..f..#', '#..@..#', '#######']);
    for (let i = 0; i < 3; i++) step(w, idle);
    expect(w.player.hp).toBe(5);
    expect(w.danger.some((d) => d.x === 3 && d.y === 3 && d.inn === 1)).toBe(true);
    step(w, idle);
    expect(w.player.hp).toBe(4);
  });

  it('golem armour ignores normal hits; telegraphs a cross before slamming', () => {
    const w = worldFrom(['#######', '#.....#', '#..g..#', '#..@..#', '#######']);
    const g = w.enemies[0];
    step(w, U); // turn 0: hit (blocked), golem adjacent on cadence -> windup
    expect(g.hp).toBe(3);
    expect(g.mode).toBe('windup');
    expect(w.danger.some((d) => d.x === 3 && d.y === 3 && d.inn === 1 && d.dmg === 2)).toBe(true);
    step(w, L); // dodge to (2,3) diagonal
    expect(w.player.hp).toBe(5);
    expect(w.events.some((e) => e.t === 'slam')).toBe(true);
  });

  it('spotlight fires its line on beat 2 and rotates each bar', () => {
    const w = worldFrom(['#########', '#s......#', '#.......#', '#.......#', '#########']);
    const s = w.enemies[0];
    s.facing = 1;
    w.player.x = 5;
    w.player.y = 1;
    step(w, idle); // beat 0 aim
    expect(w.player.hp).toBe(5);
    step(w, idle); // beat 1 fire
    expect(w.player.hp).toBe(4);
    step(w, idle);
    step(w, idle); // beat 3 rotate
    expect(s.facing).toBe(2);
  });

  it('clank patrols its lane and reverses at walls', () => {
    const w = worldFrom(['#######', '#c....#', '#.....#', '#..@..#', '#######']);
    const c = w.enemies[0];
    c.facing = 1;
    for (let i = 0; i < 4; i++) step(w, idle);
    expect(c.x).toBe(5);
    step(w, idle); // bonk -> turn
    expect(c.facing).toBe(3);
    step(w, idle);
    expect(c.x).toBe(4);
  });

  it('train hits whatever stands on its lane when it arrives', () => {
    const w = worldFrom(['#######', '#.....#', '#=====#', '#..@..#', '#######']);
    w.trains.push({ x0: 1, y0: 2, x1: 5, y1: 2, phase: 4, d: 1 });
    step(w, idle);
    step(w, idle);
    step(w, idle);
    step(w, U); // step onto the rails right before the train (turn 3)
    step(w, idle); // turn 4: train
    expect(w.player.hp).toBe(3);
  });
});

describe('gates, exits', () => {
  it('echo standing on a plate holds the gate open for the player', () => {
    const w = worldFrom(['#######', '#@P...#', '###G###', '#..X..#', '#######']);
    w.gates.push({ x: 3, y: 2, open: false, plates: [1 * 7 + 2] });
    step(w, R); // onto plate: gate opens at end of turn
    expect(w.gates[0].open).toBe(true);
    step(w, R); // off plate -> closes
    expect(w.gates[0].open).toBe(false);
    step(w, idle);
    step(w, idle); // bar 1: echo walks (2,1) at beat 0
    step(w, idle); // beat0: echo onto plate
    expect(w.gates[0].open).toBe(true);
    step(w, D); // player at (3,1) -> into gate (3,2)
    expect([w.player.x, w.player.y]).toEqual([3, 2]);
    step(w, D);
    expect(w.cleared).toBe(true);
  });
});

describe('determinism', () => {
  it('same world + same inputs = same state', () => {
    const run = () => {
      const w = worldFrom([
        '###########',
        '#@...b....#',
        '#..w...r..#',
        '#....g....#',
        '#.f.....n.#',
        '#....c....#',
        '###########',
      ]);
      const rng = new Rng(42);
      const acts: PlayerAction[] = [];
      for (let i = 0; i < 200; i++) {
        const r = rng.int(6);
        acts.push(r < 4 ? { k: 'dir', d: r as Dir, onBeat: rng.chance(0.8) } : r === 4 ? idle : rewind);
      }
      for (const a of acts) step(w, a);
      return snapshot(w);
    };
    expect(run()).toBe(run());
  });
});
