import { parseRun, type RunState } from '../sim/run';

// localStorage persistence. Every read is validated; corrupt data falls back to defaults
// instead of breaking the boot. Writes are best-effort (private mode / quota).

export interface Settings {
  music: number;
  sfx: number;
  offsetMs: number;
  shake: boolean;
  reduceFlash: boolean;
  preview: boolean;
}

export interface Records {
  runs: number;
  clears: number;
  deaths: number;
  bestTimeMs: number;
  bestFloor: number;
  totalResonances: number;
  seenHints: string[];
}

const K_SET = 'afterbeat.settings.v1';
const K_REC = 'afterbeat.records.v1';
const K_RUN = 'afterbeat.run.v1';

export const DEFAULT_SETTINGS: Settings = { music: 0.8, sfx: 0.8, offsetMs: 0, shake: true, reduceFlash: false, preview: true };
const DEFAULT_RECORDS: Records = { runs: 0, clears: 0, deaths: 0, bestTimeMs: 0, bestFloor: 0, totalResonances: 0, seenHints: [] };

function read(key: string): unknown {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function write(key: string, v: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

export function loadSettings(): Settings {
  const r = (read(K_SET) ?? {}) as Partial<Settings>;
  const d = DEFAULT_SETTINGS;
  return {
    music: num(r.music, 0, 1, d.music),
    sfx: num(r.sfx, 0, 1, d.sfx),
    offsetMs: Math.round(num(r.offsetMs, -250, 250, d.offsetMs)),
    shake: bool(r.shake, d.shake),
    reduceFlash: bool(r.reduceFlash, d.reduceFlash),
    preview: bool(r.preview, d.preview),
  };
}
export const saveSettings = (s: Settings) => write(K_SET, s);

export function loadRecords(): Records {
  const r = (read(K_REC) ?? {}) as Partial<Records>;
  const d = DEFAULT_RECORDS;
  return {
    runs: Math.floor(num(r.runs, 0, 1e9, d.runs)),
    clears: Math.floor(num(r.clears, 0, 1e9, d.clears)),
    deaths: Math.floor(num(r.deaths, 0, 1e9, d.deaths)),
    bestTimeMs: num(r.bestTimeMs, 0, 1e10, d.bestTimeMs),
    bestFloor: Math.floor(num(r.bestFloor, 0, 99, d.bestFloor)),
    totalResonances: Math.floor(num(r.totalResonances, 0, 1e9, d.totalResonances)),
    seenHints: Array.isArray(r.seenHints) ? r.seenHints.filter((h) => typeof h === 'string').slice(0, 64) : [],
  };
}
export const saveRecords = (r: Records) => write(K_REC, r);

export const loadRun = (): RunState | null => parseRun(read(K_RUN));
export const saveRun = (r: RunState) => write(K_RUN, r);
export function clearRun(): void {
  try {
    localStorage.removeItem(K_RUN);
  } catch {
    /* ignore */
  }
}
