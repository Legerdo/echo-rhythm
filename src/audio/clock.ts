// Beat timeline in AudioContext time. Piecewise constant tempo: segments only start on beats,
// so beat N always has exactly one time and tempo changes never accumulate drift.

export interface Seg {
  t0: number;
  b0: number;
  spb: number;
}

export class BeatClock {
  segs: Seg[] = [{ t0: 0, b0: 0, spb: 0.5 }];

  reset(t0: number, b0: number, bpm: number): void {
    this.segs = [{ t0, b0, spb: 60 / bpm }];
  }

  /** Switch tempo exactly at beat b (callers use bar lines). */
  changeAt(b: number, bpm: number): void {
    const t = this.timeOf(b);
    this.segs = this.segs.filter((s) => s.b0 < b);
    this.segs.push({ t0: t, b0: b, spb: 60 / bpm });
  }

  private segForBeat(b: number): Seg {
    let s = this.segs[0];
    for (const q of this.segs) if (q.b0 <= b) s = q;
    return s;
  }

  private segForTime(t: number): Seg {
    let s = this.segs[0];
    for (const q of this.segs) if (q.t0 <= t) s = q;
    return s;
  }

  timeOf(b: number): number {
    const s = this.segForBeat(b);
    return s.t0 + (b - s.b0) * s.spb;
  }

  beatAt(t: number): number {
    const s = this.segForTime(t);
    return s.b0 + (t - s.t0) / s.spb;
  }

  spbAt(b: number): number {
    return this.segForBeat(b).spb;
  }

  bpmAt(b: number): number {
    return 60 / this.spbAt(b);
  }
}

/** Generous judgement: on-beat half window and the pre-window input buffer, in seconds. */
export function windows(spb: number): { half: number; buffer: number } {
  return { half: Math.min(0.33 * spb, 0.175), buffer: 0.2 * spb };
}
