import type { BeatClock } from './clock';
import type { AudioEngine } from './engine';
import type { Voices } from './synth';

// Procedural, layered soundtrack. Every zone shares one city motif (lead) re-voiced in a new
// key, groove and instrument set. Layers unlock at bar lines as relays are restored.

type Inst =
  | 'kick'
  | 'snare'
  | 'clap'
  | 'hat'
  | 'rim'
  | 'tick'
  | 'shaker'
  | 'tom'
  | 'bass'
  | 'ep'
  | 'pad'
  | 'pluck'
  | 'lead'
  | 'bell'
  | 'choir'
  | 'stab';

interface TrackDef {
  inst: Inst;
  min: number;
  mode: 'drum' | 'chord' | 'melody' | 'block';
  pat: string[];
  fill?: string;
  oct?: number;
  vol?: number;
  kind?: string;
  /** keeps playing during a breakdown bar */
  bd?: boolean;
  /** melody that can be swapped for the player's own line */
  solo?: boolean;
}

export interface SongDef {
  id: string;
  root: number;
  scale: number[];
  chords: string[];
  tracks: TrackDef[];
}

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const HARM = [0, 2, 3, 5, 7, 8, 11];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

const MOTIF = [
  '1 - - 3 - - 5 - 4 - 3 4 - - 5 -',
  '7 - - 5 - - 4 - 3 - - - 2 - 3 -',
  '1 - - 3 - - 5 - 4 - 3 4 - - 8 -',
  '7 - 8 7 5 - 4 - 5 - - - - - - .',
  '5 - - 4 - - 3 - 2 - 3 - 5 - - -',
  '4 - - 3 - - 2 - 1 - - - 2 - 3 -',
  '5 - - 8 - - 7 - 5 - 4 - 5 - 7 -',
  '8 - - - 7 - 5 - 4 - - - 5 - - .',
];
const REST = '. . . . . . . . . . . . . . . .';

export const SONGS: Record<string, SongDef> = {
  title: {
    id: 'title',
    root: 45,
    scale: MINOR,
    chords: ['0:m7', '8:M7', '5:m7', '7:m7'],
    tracks: [
      { inst: 'pad', min: 0, mode: 'block', pat: ['C - - - - - - - - - - - - - - -'], oct: 12, vol: 0.9, bd: true },
      { inst: 'bass', min: 0, mode: 'chord', pat: ['R - - - - - - - . . . . . . . .'], oct: -12, kind: 'sub', vol: 0.7 },
      { inst: 'rim', min: 0, mode: 'drum', pat: ['....x.......x...'], vol: 0.45 },
      { inst: 'hat', min: 0, mode: 'drum', pat: ['..x...x...x...x.'], vol: 0.35 },
      { inst: 'pluck', min: 0, mode: 'melody', pat: [...MOTIF.slice(0, 4), REST, REST, REST, REST], oct: 24, vol: 0.7, kind: 'triangle' },
    ],
  },
  subway: {
    id: 'subway',
    root: 45,
    scale: MINOR,
    chords: ['0:m7', '8:M7', '5:m7', '7:m7'],
    tracks: [
      { inst: 'kick', min: 0, mode: 'drum', pat: ['X......x..x.....', 'X......x..x...x.'], fill: 'X......x..x.x...' },
      { inst: 'snare', min: 0, mode: 'drum', pat: ['....x.......x...'], fill: '....x.......x.xx', vol: 0.9 },
      { inst: 'hat', min: 0, mode: 'drum', pat: ['..x...x...x...xx'], vol: 0.8 },
      { inst: 'bass', min: 0, mode: 'chord', pat: ['R - - R - - R - 5 - . 5 . . 8 .', 'R - - R - - R - 5 - . 7 . 8 . 5'], oct: -12, kind: 'sub' },
      { inst: 'ep', min: 1, mode: 'block', pat: ['C - - - - - . C - - . . C - - .'], oct: 12, vol: 1, bd: true },
      { inst: 'pluck', min: 2, mode: 'chord', pat: ['R . 5 . 8 . 5 . 3 . 5 . 8 . 7 .'], oct: 24, vol: 0.55, kind: 'triangle' },
      { inst: 'lead', min: 3, mode: 'melody', pat: MOTIF, oct: 24, vol: 0.85, solo: true },
      { inst: 'rim', min: 4, mode: 'drum', pat: ['...x.....x....x.'], vol: 0.6 },
      { inst: 'shaker', min: 4, mode: 'drum', pat: ['x.x.x.x.x.x.x.x.'], vol: 0.8 },
    ],
  },
  market: {
    id: 'market',
    root: 38,
    scale: MINOR,
    chords: ['0:m9', '8:M7', '5:m7', '7:m7'],
    tracks: [
      { inst: 'kick', min: 0, mode: 'drum', pat: ['X...x...X...x...'], fill: 'X...x...X.x.x.x.' },
      { inst: 'clap', min: 0, mode: 'drum', pat: ['....x.......x...'], fill: '....x.......x.xx' },
      { inst: 'hat', min: 0, mode: 'drum', pat: ['xxoxxxoxxxoxxxox'], vol: 0.7 },
      { inst: 'bass', min: 0, mode: 'chord', pat: ['R . R 8 . R . 5 R . 7 8 . R 5 .'], oct: 0, kind: 'slap', vol: 0.9 },
      { inst: 'stab', min: 1, mode: 'block', pat: ['. . C . . . C . . . C . . . C .'], oct: 12, vol: 0.9, bd: true },
      { inst: 'pluck', min: 2, mode: 'chord', pat: ['R 5 8 5 3 5 8 5 R 5 8 5 7 5 9 5'], oct: 24, vol: 0.45 },
      { inst: 'lead', min: 3, mode: 'melody', pat: MOTIF, oct: 24, vol: 0.8, kind: 'saw', solo: true },
      { inst: 'shaker', min: 4, mode: 'drum', pat: ['.x.x.x.x.x.x.x.x'], vol: 0.9 },
      { inst: 'bell', min: 4, mode: 'melody', pat: [REST, REST, REST, '. . . . . . . . 8 - 7 - 5 - - -', REST, REST, REST, '. . . . . . . . 5 - 7 - 8 - - -'], oct: 36, vol: 0.6 },
    ],
  },
  roof: {
    id: 'roof',
    root: 40,
    scale: MINOR,
    chords: ['0:m', '8:M', '5:m', '7:m'],
    tracks: [
      { inst: 'kick', min: 0, mode: 'drum', pat: ['X...x...X...x..x'], fill: 'X...x...X.x.x.xx' },
      { inst: 'snare', min: 0, mode: 'drum', pat: ['....X.......X...'], vol: 1 },
      { inst: 'hat', min: 0, mode: 'drum', pat: ['x.x.x.x.x.x.x.x.'], vol: 0.75 },
      { inst: 'bass', min: 0, mode: 'chord', pat: ['R . R . R . R . R . R . 5 . 8 .'], oct: 0, kind: 'saw', vol: 0.85 },
      { inst: 'pad', min: 1, mode: 'block', pat: ['C - - - - - - - C - - - - - - -'], oct: 12, vol: 1, bd: true },
      { inst: 'pluck', min: 2, mode: 'chord', pat: ['R 3 5 8 R 3 5 8 R 3 5 8 R 3 5 9'], oct: 24, vol: 0.42 },
      { inst: 'bell', min: 3, mode: 'melody', pat: MOTIF, oct: 24, vol: 0.95, solo: true },
      { inst: 'tom', min: 4, mode: 'drum', pat: ['................', '................', '................', '..........1.2.3.'], vol: 0.8 },
      { inst: 'choir', min: 4, mode: 'block', pat: ['C - - - - - - - - - - - - - - -'], oct: 12, vol: 0.9, bd: true },
    ],
  },
  boss: {
    id: 'boss',
    root: 45,
    scale: HARM,
    chords: ['0:m', '8:M', '5:m', '7:M'],
    tracks: [
      { inst: 'tick', min: 0, mode: 'drum', pat: ['X.x.X.x.X.x.X.x.'], vol: 0.7, bd: true },
      { inst: 'kick', min: 0, mode: 'drum', pat: ['X.....x...X.....'], fill: 'X.....x...X.x.x.' },
      { inst: 'snare', min: 0, mode: 'drum', pat: ['........X.......'], vol: 1 },
      { inst: 'bass', min: 0, mode: 'chord', pat: ['R - - - R - . R R - - - 5 - 3 -'], oct: -12, kind: 'dist', vol: 0.9 },
      { inst: 'choir', min: 1, mode: 'block', pat: ['C - - - - - - - - - - - - - - -'], oct: 12, vol: 1.1, bd: true },
      { inst: 'pluck', min: 2, mode: 'chord', pat: ['R . 3 . 5 . 3 . R . 3 . 7 . 5 .'], oct: 24, vol: 0.5, kind: 'sawtooth' },
      { inst: 'lead', min: 3, mode: 'melody', pat: MOTIF, oct: 12, vol: 0.9, kind: 'saw', solo: true },
      { inst: 'snare', min: 4, mode: 'drum', pat: ['....x.......x...'], vol: 0.7 },
      { inst: 'hat', min: 4, mode: 'drum', pat: ['xxxxxxxxxxxxxxxx'], vol: 0.5 },
      { inst: 'kick', min: 4, mode: 'drum', pat: ['....x.......x...'] },
    ],
  },
  ending: {
    id: 'ending',
    root: 45,
    scale: MAJOR,
    chords: ['0:M', '9:m', '5:M', '7:M'],
    tracks: [
      { inst: 'kick', min: 0, mode: 'drum', pat: ['X...x...X...x...'], fill: 'X...x...X.x.x.x.' },
      { inst: 'clap', min: 0, mode: 'drum', pat: ['....x.......x...'] },
      { inst: 'hat', min: 0, mode: 'drum', pat: ['..x...x...x...x.'], vol: 0.8 },
      { inst: 'shaker', min: 0, mode: 'drum', pat: ['x.x.x.x.x.x.x.x.'], vol: 0.7 },
      { inst: 'bass', min: 0, mode: 'chord', pat: ['R - - R - - R - 5 - - 5 - 8 - .'], oct: -12, kind: 'saw', vol: 0.8 },
      { inst: 'pad', min: 0, mode: 'block', pat: ['C - - - - - - - C - - - - - - -'], oct: 12, vol: 0.9, bd: true },
      { inst: 'pluck', min: 0, mode: 'chord', pat: ['R 3 5 8 R 3 5 8 R 3 5 8 R 3 5 9'], oct: 24, vol: 0.38 },
      { inst: 'bell', min: 0, mode: 'melody', pat: [...MOTIF, ...MOTIF], oct: 24, vol: 0.9, solo: true },
      { inst: 'choir', min: 0, mode: 'block', pat: ['C - - - - - - - - - - - - - - -'], oct: 12, vol: 0.8, bd: true },
    ],
  },
};

export const ZONE_SONG = ['subway', 'market', 'roof', 'boss'];

const QUAL: Record<string, number[]> = {
  m: [0, 3, 7],
  M: [0, 4, 7],
  m7: [0, 3, 7, 10],
  M7: [0, 4, 7, 11],
  '7': [0, 4, 7, 10],
  m9: [0, 3, 7, 10, 14],
  sus: [0, 5, 7],
};

interface Ev {
  step: number;
  tok: string;
  len: number;
}
interface ParsedTrack extends TrackDef {
  bars: Ev[][];
  fillBar?: Ev[];
  out: GainNode;
}

function parseBar(src: string, mode: TrackDef['mode']): Ev[] {
  const toks = mode === 'drum' ? src.split('') : src.trim().split(/\s+/);
  const evs: Ev[] = [];
  for (let i = 0; i < toks.length && i < 16; i++) {
    const t = toks[i];
    if (t === '.' || t === '-') {
      if (t === '-' && evs.length && mode !== 'drum') evs[evs.length - 1].len++;
      continue;
    }
    evs.push({ step: i, tok: t, len: 1 });
  }
  // a hold that ends with '.' stops there; otherwise the note runs to its last '-'
  return evs;
}

function chordTones(song: SongDef, bar: number): number[] {
  const spec = song.chords[((bar % song.chords.length) + song.chords.length) % song.chords.length];
  const [r, q] = spec.split(':');
  return QUAL[q].map((iv) => song.root + Number(r) + iv);
}

export class Music {
  song: SongDef | null = null;
  private tracks: ParsedTrack[] = [];
  private nextStep = 0;
  private timer = 0;
  private levels: { bar: number; level: number }[] = [];
  private breakdowns = new Set<number>();
  private clicks: number[] = [];
  private bus: GainNode;
  onBeat: ((beat: number, time: number) => void) | null = null;

  constructor(
    private eng: AudioEngine,
    private v: Voices,
    private clock: BeatClock,
  ) {
    this.bus = eng.ctx.createGain();
    this.bus.connect(eng.musicBus);
  }

  load(id: string, level: number, fromBeat = 0): void {
    this.stop();
    const song = SONGS[id];
    this.song = song;
    for (const t of this.tracks) t.out.disconnect();
    this.tracks = song.tracks.map((t) => {
      const out = this.eng.ctx.createGain();
      out.gain.value = t.vol ?? 1;
      out.connect(this.bus);
      return { ...t, bars: t.pat.map((p) => parseBar(p, t.mode)), fillBar: t.fill ? parseBar(t.fill, t.mode) : undefined, out };
    });
    this.levels = [{ bar: -1e9, level }];
    this.breakdowns.clear();
    this.nextStep = fromBeat * 4;
  }

  /** Replace the solo melody bars from `fromBar` with the given 16-token bars (ending uses the player's line). */
  setSolo(bars: string[], fromBar: number): void {
    for (const t of this.tracks) {
      if (!t.solo) continue;
      const parsed = bars.map((b) => parseBar(b, 'melody'));
      for (let i = 0; i < parsed.length; i++) t.bars[fromBar + i] = parsed[i];
    }
  }

  levelAt(bar: number): number {
    let l = 0;
    for (const e of this.levels) if (e.bar <= bar) l = e.level;
    return l;
  }

  /** New level takes effect at the next bar line after `beat`. */
  setLevel(level: number, beat: number): void {
    const bar = Math.floor(beat / 4) + 1;
    this.levels = this.levels.filter((e) => e.bar < bar);
    this.levels.push({ bar, level });
  }

  setBreakdown(bar: number): void {
    this.breakdowns.add(bar);
  }

  countIn(times: number[]): void {
    this.clicks.push(...times);
  }

  start(): void {
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), 25);
    this.tick();
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
    this.clicks = [];
    this.v.stopAll();
  }

  /** Continue from beat `b` (after a pause). */
  seek(b: number): void {
    this.nextStep = b * 4;
  }

  chordAtBeat(beat: number): number[] {
    if (!this.song) return [57, 60, 64];
    return chordTones(this.song, Math.floor(beat / 4));
  }

  scaleNote(deg: number, oct = 24): number {
    const s = this.song ?? SONGS.subway;
    const d = deg - 1;
    const o = Math.floor(d / 7);
    return s.root + oct + s.scale[((d % 7) + 7) % 7] + 12 * o;
  }

  tick(): void {
    if (!this.song) return;
    const ctx = this.eng.ctx;
    const now = ctx.currentTime;
    const horizon = now + 0.15;
    const dest = this.bus;
    this.clicks = this.clicks.filter((t) => {
      if (t > horizon) return true;
      if (t >= now - 0.02) this.v.rim(dest, Math.max(t, now), 0.9);
      return false;
    });
    for (let guard = 0; guard < 64; guard++) {
      const t = this.clock.timeOf(this.nextStep / 4);
      if (t > horizon) break;
      if (t >= now - 0.02) this.playStep(this.nextStep, Math.max(t, now));
      this.nextStep++;
    }
  }

  private playStep(step: number, t: number): void {
    const song = this.song!;
    const bar = Math.floor(step / 4 / 4);
    const s = step - bar * 16;
    if (s % 4 === 0) this.onBeat?.(step / 4, t);
    const level = this.levelAt(bar);
    const bd = this.breakdowns.has(bar);
    const spb = this.clock.spbAt(step / 4);
    const stepDur = spb / 4;
    const tones = chordTones(song, bar);
    for (const tr of this.tracks) {
      if (tr.min > level) continue;
      if (bd && !tr.bd) continue;
      const evs = bar % 8 === 7 && tr.fillBar ? tr.fillBar : tr.bars[((bar % tr.bars.length) + tr.bars.length) % tr.bars.length];
      for (const e of evs) if (e.step === s) this.voice(tr, e, t, stepDur, tones);
    }
  }

  private voice(tr: ParsedTrack, e: Ev, t: number, stepDur: number, tones: number[]): void {
    const v = this.v;
    const dest = tr.out;
    const dur = e.len * stepDur;
    const song = this.song!;
    const oct = tr.oct ?? 0;
    switch (tr.mode) {
      case 'drum': {
        const acc = e.tok === 'X' ? 1 : 0.72;
        if (tr.inst === 'kick') v.kick(dest, t, acc);
        else if (tr.inst === 'snare') v.snare(dest, t, acc);
        else if (tr.inst === 'clap') v.clap(dest, t, acc);
        else if (tr.inst === 'hat') v.hat(dest, t, acc, e.tok === 'o');
        else if (tr.inst === 'rim') v.rim(dest, t, acc);
        else if (tr.inst === 'tick') v.tick(dest, t, acc, e.tok === 'X' ? 2600 : 1900);
        else if (tr.inst === 'shaker') v.shaker(dest, t, acc);
        else if (tr.inst === 'tom') v.tom(dest, t, song.root + 12 + Number(e.tok) * 3, 0.9);
        return;
      }
      case 'block': {
        const notes = tones.map((n) => n + oct);
        if (tr.inst === 'ep') for (const n of notes) v.ep(dest, t, n, dur, 0.8);
        else if (tr.inst === 'pad') v.pad(dest, t, notes, dur);
        else if (tr.inst === 'choir') v.choir(dest, t, notes.slice(0, 3), dur);
        else if (tr.inst === 'stab') v.stab(dest, t, notes, 0.8);
        return;
      }
      case 'chord': {
        const map: Record<string, number> = {
          R: tones[0],
          '3': tones[1],
          '5': tones[2],
          '7': tones[3] ?? tones[0] + 12,
          '8': tones[0] + 12,
          '9': tones[0] + 14,
          r: tones[0] - 12,
        };
        const n = map[e.tok];
        if (n === undefined) return;
        this.tonal(tr, n + oct, t, dur);
        return;
      }
      case 'melody': {
        const m = /^(\d+)([\^_]?)$/.exec(e.tok);
        if (!m) return;
        const shift = m[2] === '^' ? 12 : m[2] === '_' ? -12 : 0;
        this.tonal(tr, this.scaleNote(Number(m[1]), oct) + shift, t, dur);
      }
    }
  }

  private tonal(tr: ParsedTrack, n: number, t: number, dur: number): void {
    const v = this.v;
    const dest = tr.out;
    if (tr.inst === 'bass') v.bass(dest, t, n, dur, 0.9, (tr.kind as 'sub') ?? 'sub');
    else if (tr.inst === 'pluck') v.pluck(dest, t, n, dur, 0.9, { dly: 0.3 }, (tr.kind as OscillatorType) ?? 'square');
    else if (tr.inst === 'lead') v.lead(dest, t, n, dur, 0.9, (tr.kind as 'saw') ?? 'square');
    else if (tr.inst === 'bell') v.bell(dest, t, n, dur, 0.9);
    else if (tr.inst === 'ep') v.ep(dest, t, n, dur, 0.9);
  }
}
