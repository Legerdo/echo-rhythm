import { describe, expect, it } from 'vitest';
import { melodyBars } from '../../src/game/ending';
import { newRun, parseRun, rollRewards } from '../../src/sim/run';

describe('ending melody', () => {
  it('turns 32 recorded beats into 8 bars of 16 steps', () => {
    const codes = Array.from({ length: 40 }, (_, i) => i % 10);
    const bars = melodyBars(codes);
    expect(bars).toHaveLength(8);
    for (const b of bars) expect(b.split(' ')).toHaveLength(16);
    // idle beats are rests, attacks are raised an octave
    expect(melodyBars([4])[7]).toBe('. . . . . . . . . . . . . . . .');
    expect(melodyBars([6]).at(-1)!.split(' ').slice(12)).toEqual(['5^', '-', '.', '.']);
  });
});

describe('persistence', () => {
  it('round-trips a run and rejects tampered or corrupt data', () => {
    const r = newRun(1234);
    r.floor = 3;
    r.mods = ['reverse', 'bass'];
    const back = parseRun(JSON.parse(JSON.stringify(r)));
    expect(back).toEqual(r);
    expect(parseRun(null)).toBeNull();
    expect(parseRun({ ...r, v: 2 })).toBeNull();
    expect(parseRun({ ...r, floor: 99 })).toBeNull();
    expect(parseRun({ ...r, hp: 9, maxHp: 5 })).toBeNull();
    expect(parseRun({ ...r, mods: ['nope'] })).toBeNull();
    expect(parseRun({ ...r, stats: { kills: 'x' } })?.stats.kills).toBe(0);
  });

  it('offers rewards deterministically and never a mod twice', () => {
    const r = newRun(77);
    const a = rollRewards(r, 'floor');
    const b = rollRewards(r, 'floor');
    expect(a).toEqual(b);
    r.mods = ['reverse', 'reverb', 'bass', 'harmonic', 'ghost', 'crescendo', 'sidechain', 'feedback'];
    const c = rollRewards(r, 'floor');
    for (const x of c) if (x.k === 'mod') expect(r.mods).not.toContain(x.id);
  });
});
