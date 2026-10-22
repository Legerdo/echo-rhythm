import { describe, expect, it } from 'vitest';
import { BeatClock, windows } from '../../src/audio/clock';
import type { AudioEngine } from '../../src/audio/engine';
import type { Music } from '../../src/audio/music';
import { Conductor, type Grade } from '../../src/game/conductor';
import type { PlayerAction } from '../../src/sim/types';

// Fake audio: heard time == perf/1000, context time controlled by the test.
function rig(bpm = 120) {
  const ctx = { currentTime: 0 };
  const eng = {
    ctx,
    heardTime: (perf?: number) => (perf ?? ctx.currentTime * 1000) / 1000,
    setDelayTime: () => undefined,
  } as unknown as AudioEngine;
  const music = { seek: () => undefined, countIn: () => undefined, start: () => undefined, stop: () => undefined } as unknown as Music;
  const clock = new BeatClock();
  const c = new Conductor(eng, music, clock);
  const log: { a: PlayerAction; g: Grade; turn: number }[] = [];
  c.onResolve = (a, g) => log.push({ a, g, turn: c.next - 1 });
  let stalls = 0;
  c.onStall = () => stalls++;
  c.startAt(0, bpm, 4); // beat 0 at 0.15 + 4 * spb
  const spb = 60 / bpm;
  const t0 = 0.15 + 4 * spb;
  const at = (beat: number, offsetMs = 0) => (t0 + beat * spb) * 1000 + offsetMs; // perf ms of a beat
  const tick = (perf: number) => {
    ctx.currentTime = perf / 1000;
    c.update(perf);
  };
  return { c, log, at, tick, spb, stalls: () => stalls };
}
const R: PlayerAction = { k: 'dir', d: 1, onBeat: true };
const U: PlayerAction = { k: 'dir', d: 0, onBeat: true };

describe('conductor judgement', () => {
  it('accepts presses inside the window and resolves immediately', () => {
    const { c, log, at } = rig();
    const half = windows(0.5).half * 1000;
    expect(c.press(R, at(0, -half + 5))).toBe('on');
    expect(log).toHaveLength(1);
    expect(log[0].g).toBe('on');
    expect(c.press(U, at(1, half - 5))).toBe('on');
    expect(log.map((l) => l.turn)).toEqual([0, 1]);
  });

  it('never lets a double tap act twice in one beat', () => {
    const { c, log, at } = rig();
    expect(c.press(R, at(0, -10))).toBe('on');
    expect(c.press(U, at(0, 20))).toBe('early'); // same beat, already acted
    expect(c.press(U, at(0, 60))).toBe('early');
    expect(log).toHaveLength(1);
  });

  it('holds one early press in the buffer and runs it at window open; first press wins', () => {
    const { c, log, at, tick } = rig();
    const { half, buffer } = windows(0.5);
    const p = at(0, -half * 1000 - buffer * 500);
    expect(c.press(R, p)).toBe('buffer');
    expect(c.press(U, p + 10)).toBe('ignored');
    tick(at(0, -half * 1000 - 20));
    expect(log).toHaveLength(0);
    tick(at(0, -half * 1000 + 1));
    expect(log).toHaveLength(1);
    expect(log[0].a.d).toBe(1);
    expect(log[0].g).toBe('on');
  });

  it('resolves a beat with no press as a miss, and a late press becomes an off-beat action next beat', () => {
    const { c, log, at, tick } = rig();
    const half = windows(0.5).half * 1000;
    tick(at(0, half + 5));
    expect(log[0].g).toBe('miss');
    expect(log[0].a.k).toBe('idle');
    expect(c.press(R, at(0, half + 40))).toBe('late');
    tick(at(1, -half + 1));
    expect(log[1].g).toBe('late');
    expect(log[1].a.onBeat).toBe(false);
  });

  it('ignores presses during the count-in except the last buffer slot', () => {
    const { c, log, at } = rig();
    expect(c.press(R, at(-3))).toBe('early');
    expect(c.press(R, at(-2))).toBe('early');
    expect(log).toHaveLength(0);
  });

  it('reports a stall instead of replaying many missed beats at once', () => {
    const { log, at, tick, stalls } = rig();
    tick(at(5));
    expect(stalls()).toBe(1);
    expect(log.length).toBeLessThanOrEqual(2);
  });

  it('keeps one resolve per beat over a long session with no drift', () => {
    const { log, at, tick } = rig(128);
    // simulate 60 fps frames for 600 beats, with occasional 120ms hitches
    let perf = at(0, -300);
    const end = at(600);
    let frame = 0;
    while (perf < end) {
      perf += frame % 97 === 0 ? 120 : 16.7;
      tick(perf);
      frame++;
    }
    expect(log.length).toBe(600);
    log.forEach((l, i) => expect(l.turn).toBe(i));
  });

  it('changes tempo exactly at a bar line without moving earlier beats', () => {
    const clock = new BeatClock();
    clock.reset(1, 0, 120);
    const before = clock.timeOf(8);
    clock.changeAt(8, 150);
    expect(clock.timeOf(8)).toBeCloseTo(before, 9);
    expect(clock.timeOf(7)).toBeCloseTo(1 + 7 * 0.5, 9);
    expect(clock.timeOf(12) - clock.timeOf(8)).toBeCloseTo(4 * 0.4, 9);
    expect(clock.beatAt(clock.timeOf(10))).toBeCloseTo(10, 9);
  });
});
