import { BeatClock, windows } from '../audio/clock';
import type { AudioEngine } from '../audio/engine';
import type { Music } from '../audio/music';
import type { PlayerAction } from '../sim/types';

export type Grade = 'on' | 'late' | 'miss';
export type PressResult = 'on' | 'buffer' | 'late' | 'early' | 'ignored' | '';

/*
 Judgement (all in heard audio time, seconds):
   window(N) = [tN - half, tN + half]       press inside -> beat N resolves immediately, on-beat
   buffer    = [tN - half - buffer, tN-half) press -> held (one slot, first wins), runs at window open, on-beat
   after a missed beat, a press before the buffer -> held for N as off-beat (executes, costs groove)
   otherwise (already acted, too early)     -> ignored, so double taps never act twice
 No press by tN + half -> beat N resolves as idle. More than 2 beats overdue -> stall, caller pauses.
*/
export class Conductor {
  next = 0;
  running = false;
  /** seconds subtracted from heard time when judging presses (device latency calibration) */
  offset = 0;
  private held: PlayerAction | null = null;
  private lastWasMiss = false;
  onResolve: (a: PlayerAction, grade: Grade) => void = () => {};
  onStall: () => void = () => {};

  constructor(
    private eng: AudioEngine,
    private music: Music,
    public clock: BeatClock,
  ) {}

  /** Start or resume so that turn `turn` lands after a count-in. */
  startAt(turn: number, bpm: number, countBeats = 4): void {
    const spb = 60 / bpm;
    const t0 = this.eng.ctx.currentTime + 0.15 + countBeats * spb;
    this.clock.reset(t0, turn, bpm);
    this.next = turn;
    this.held = null;
    this.lastWasMiss = false;
    this.music.seek(turn);
    const clicks: number[] = [];
    for (let i = countBeats; i >= 1; i--) clicks.push(t0 - i * spb);
    this.music.countIn(clicks);
    this.music.start();
    this.eng.setDelayTime(spb);
    this.running = true;
  }

  stop(): void {
    this.running = false;
    this.held = null;
    this.music.stop();
  }

  changeBpm(atTurn: number, bpm: number): void {
    this.clock.changeAt(atTurn, bpm);
    this.eng.setDelayTime(60 / bpm);
  }

  bpm(): number {
    return this.clock.bpmAt(this.next);
  }

  /** Fractional beat currently heard (for visuals). */
  heardBeat(perf = performance.now()): number {
    return this.clock.beatAt(this.eng.heardTime(perf));
  }

  countInLeft(): number {
    if (!this.running) return 0;
    const b = this.heardBeat();
    return b < this.next && this.next - b <= 4.0 && this.next === this.startTurn ? Math.ceil(this.next - b) : 0;
  }
  private get startTurn(): number {
    return this.clock.segs[0].b0;
  }

  press(a: PlayerAction, perfMs: number): PressResult {
    if (!this.running) return '';
    const t = this.eng.heardTime(perfMs) - this.offset;
    const N = this.next;
    const tN = this.clock.timeOf(N);
    const { half, buffer } = windows(this.clock.spbAt(N));
    if (t > tN + half) {
      // a frame hitch delayed update(): close beat N as missed, the press becomes a late input for N+1
      this.resolve({ k: 'idle', d: 0, onBeat: true }, 'miss');
      this.held = { ...a, onBeat: false };
      return 'late';
    }
    if (t >= tN - half) {
      this.held = null;
      this.resolve({ ...a, onBeat: true }, 'on');
      return 'on';
    }
    if (this.held) return 'ignored';
    if (t >= tN - half - buffer) {
      this.held = { ...a, onBeat: true };
      return 'buffer';
    }
    if (this.lastWasMiss && N !== this.startTurn) {
      this.held = { ...a, onBeat: false };
      return 'late';
    }
    return 'early';
  }

  update(perf = performance.now()): void {
    if (!this.running) return;
    const now = this.eng.heardTime(perf) - this.offset;
    for (let guard = 0; guard < 3 && this.running; guard++) {
      const N = this.next;
      const tN = this.clock.timeOf(N);
      const { half } = windows(this.clock.spbAt(N));
      if (now > this.clock.timeOf(N + 2) + half) {
        this.onStall();
        return;
      }
      if (this.held && now >= tN - half) {
        const a = this.held;
        this.held = null;
        this.resolve(a, a.onBeat ? 'on' : 'late');
        continue;
      }
      if (now > tN + half) {
        this.resolve({ k: 'idle', d: 0, onBeat: true }, 'miss');
        continue;
      }
      break;
    }
  }

  private resolve(a: PlayerAction, grade: Grade): void {
    this.lastWasMiss = grade === 'miss';
    this.next++;
    this.onResolve(a, grade);
  }
}
