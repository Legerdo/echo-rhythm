import { generateFloor, type FloorDef } from './gen';
import { hashSeed, Rng } from './rng';
import type { ModId, RunStats, World } from './types';

export const FLOORS: FloorDef[] = [
  { id: '1-1', zone: 0, name: '정전된 승강장', kind: 'tutorial', cols: 0, rows: 0, relays: 0, tier: 0, table: [], elite: [] },
  {
    id: '1-2',
    zone: 0,
    name: '폐선 터널',
    kind: 'proc',
    cols: 3,
    rows: 2,
    relays: 2,
    tier: 0,
    pedestal: true,
    table: [
      ['buzz', 4],
      ['clank', 2],
      ['warden', 2],
    ],
    elite: ['warden'],
  },
  {
    id: '2-1',
    zone: 1,
    name: '네온 시장',
    kind: 'proc',
    cols: 3,
    rows: 2,
    relays: 2,
    tier: 0,
    encore: true,
    table: [
      ['buzz', 3],
      ['clank', 1],
      ['warden', 1],
      ['ram', 2],
      ['woofer', 2],
    ],
    elite: ['ram', 'woofer'],
  },
  {
    id: '2-2',
    zone: 1,
    name: '야시장 골목',
    kind: 'proc',
    cols: 4,
    rows: 2,
    relays: 2,
    tier: 1,
    encore: true,
    table: [
      ['buzz', 3],
      ['warden', 2],
      ['ram', 2],
      ['woofer', 2],
    ],
    elite: ['golem', 'ram'],
  },
  {
    id: '3-1',
    zone: 2,
    name: '옥상 변전소',
    kind: 'proc',
    cols: 3,
    rows: 2,
    relays: 2,
    tier: 1,
    encore: true,
    table: [
      ['buzz', 3],
      ['warden', 1],
      ['ram', 1],
      ['conductor', 2],
      ['spotlight', 2],
    ],
    elite: ['golem', 'spotlight'],
  },
  {
    id: '3-2',
    zone: 2,
    name: '송전탑 능선',
    kind: 'proc',
    cols: 4,
    rows: 2,
    relays: 3,
    tier: 1,
    encore: true,
    table: [
      ['buzz', 3],
      ['clank', 1],
      ['warden', 2],
      ['ram', 1],
      ['woofer', 1],
      ['conductor', 2],
      ['spotlight', 1],
    ],
    elite: ['golem', 'ram', 'woofer'],
  },
  { id: 'B', zone: 3, name: '시계탑 꼭대기', kind: 'boss', cols: 0, rows: 0, relays: 0, tier: 0, table: [], elite: [] },
];

export const ZONE_NAMES = ['지하 선로', '네온 시장', '옥상 변전소', '시계탑'];

export const MODS: Record<ModId, { name: string; desc: string }> = {
  reverse: { name: '리버스 테이프', desc: '잔향이 지난 마디를 거꾸로 재생한다. 도망친 길을 되짚으며 뒤쫓던 적을 친다.' },
  reverb: { name: '롱 리버브', desc: '잔향의 타격이 진행 방향으로 한 칸 더 울린다.' },
  bass: { name: '헤비 베이스', desc: '내 공격이 적을 한 칸 밀어낸다. 벽이나 적에 부딪히면 +1 피해.' },
  harmonic: { name: '하모닉 실드', desc: '잔향과 같은 칸에 겹쳐 있는 동안 피해를 받지 않는다.' },
  ghost: { name: '고스트 노트', desc: '그루브 x2 이상일 때 받는 피해를 그루브가 대신 흡수한다.' },
  crescendo: { name: '크레센도', desc: '같은 적을 연속으로 치면 피해가 1씩 늘어난다. (최대 +2)' },
  sidechain: { name: '사이드체인', desc: '공명 타격이 대상 주변 적을 2박 동안 기절시킨다.' },
  feedback: { name: '피드백 루프', desc: '잔향이 적을 처치하면 충전 +1. 최대 충전 +1.' },
  scratch: { name: '스크래치', desc: '되감기로 도착한 칸 주변 4칸의 적에게 1 피해.' },
  pedal: { name: '페달 포인트', desc: '쉬어도 그루브가 떨어지지 않고, 쉰 다음 첫 공격은 +1 피해.' },
};

export const ALL_MODS = Object.keys(MODS) as ModId[];

export type Reward = { k: 'mod'; id: ModId } | { k: 'repair'; n: number } | { k: 'amp' };

export interface RunState {
  v: 1;
  seed: number;
  floor: number;
  hp: number;
  maxHp: number;
  mods: ModId[];
  echo: boolean;
  stats: RunStats;
  /** milliseconds of active play */
  time: number;
  melodies: number[][];
}

export const emptyStats = (): RunStats => ({
  kills: 0,
  echoKills: 0,
  resonances: 0,
  hitsTaken: 0,
  maxGroove: 1,
  beats: 0,
  onBeat: 0,
  rewinds: 0,
  relays: 0,
});

export function newRun(seed: number): RunState {
  return { v: 1, seed: seed >>> 0, floor: 0, hp: 5, maxHp: 5, mods: [], echo: false, stats: emptyStats(), time: 0, melodies: [] };
}

export function floorSeed(run: RunState): number {
  return hashSeed(run.seed, 'floor', run.floor);
}

export function startFloor(run: RunState): World {
  const def = FLOORS[run.floor];
  return generateFloor(def, floorSeed(run), { hp: run.hp, maxHp: run.maxHp, mods: run.mods, echoUnlocked: run.echo });
}

/** Fold a cleared floor back into the run. Returns true when the run is complete. */
export function finishFloor(run: RunState, w: World): boolean {
  run.hp = w.player.hp;
  run.maxHp = w.player.maxHp;
  run.echo = w.echoUnlocked;
  const mods: ModId[] = [];
  for (const [k, n] of Object.entries(w.mods)) for (let i = 0; i < (n ?? 0); i++) mods.push(k as ModId);
  run.mods = mods;
  mergeStats(run.stats, w.stats);
  run.melodies.push(w.melody.slice(-32));
  run.floor++;
  return run.floor >= FLOORS.length;
}

export function mergeStats(into: RunStats, s: RunStats): void {
  into.kills += s.kills;
  into.echoKills += s.echoKills;
  into.resonances += s.resonances;
  into.hitsTaken += s.hitsTaken;
  into.maxGroove = Math.max(into.maxGroove, s.maxGroove);
  into.beats += s.beats;
  into.onBeat += s.onBeat;
  into.rewinds += s.rewinds;
  into.relays += s.relays;
}

export function rollRewards(run: RunState, salt: string): Reward[] {
  const rng = new Rng(hashSeed(run.seed, 'reward', run.floor, salt));
  const owned = new Set(run.mods);
  const pool = rng.shuffle(ALL_MODS.filter((m) => !owned.has(m)));
  const out: Reward[] = pool.slice(0, 2).map((id) => ({ k: 'mod', id }));
  out.push(run.hp <= run.maxHp - 2 ? { k: 'repair', n: 3 } : { k: 'amp' });
  return out;
}

export function rollChest(mods: ModId[], seed: number, floor: number): ModId[] {
  const rng = new Rng(hashSeed(seed, 'chest', floor));
  const owned = new Set(mods);
  return rng.shuffle(ALL_MODS.filter((m) => !owned.has(m))).slice(0, 2);
}

export function applyReward(run: RunState, r: Reward): void {
  if (r.k === 'mod') run.mods.push(r.id);
  else if (r.k === 'repair') run.hp = Math.min(run.maxHp, run.hp + r.n);
  else {
    run.maxHp += 1;
    run.hp = Math.min(run.maxHp, run.hp + 1);
  }
}

export function rewardLabel(r: Reward): { name: string; desc: string } {
  if (r.k === 'mod') return MODS[r.id];
  if (r.k === 'repair') return { name: '배터리 교체', desc: `체력을 ${r.n} 회복한다.` };
  return { name: '증폭기', desc: '최대 체력 +1, 체력 1 회복.' };
}

/** Defensive parse for persisted runs: returns null when the data is unusable. */
export function parseRun(raw: unknown): RunState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<RunState>;
  const okNum = (n: unknown, lo: number, hi: number) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
  if (r.v !== 1 || !okNum(r.seed, 0, 2 ** 32) || !okNum(r.floor, 0, FLOORS.length - 1)) return null;
  if (!okNum(r.hp, 1, 99) || !okNum(r.maxHp, 1, 99) || (r.hp as number) > (r.maxHp as number)) return null;
  if (!Array.isArray(r.mods) || !r.mods.every((m) => typeof m === 'string' && m in MODS)) return null;
  if (typeof r.echo !== 'boolean' || !r.stats || typeof r.stats !== 'object') return null;
  const base = emptyStats();
  const stats = { ...base };
  for (const k of Object.keys(base) as (keyof RunStats)[]) {
    const v = (r.stats as Partial<RunStats>)[k];
    stats[k] = okNum(v, 0, 1e9) ? (v as number) : base[k];
  }
  const melodies = Array.isArray(r.melodies) ? r.melodies.filter((m) => Array.isArray(m) && m.every((x) => okNum(x, 0, 9))).slice(0, 16) : [];
  return {
    v: 1,
    seed: r.seed as number,
    floor: r.floor as number,
    hp: r.hp as number,
    maxHp: r.maxHp as number,
    mods: r.mods as ModId[],
    echo: r.echo,
    stats,
    time: okNum(r.time, 0, 1e10) ? (r.time as number) : 0,
    melodies,
  };
}
