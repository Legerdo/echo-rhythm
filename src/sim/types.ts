// Pure data types for the deterministic simulation. No DOM access in src/sim.

export type Dir = 0 | 1 | 2 | 3; // up, right, down, left
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;
export const opp = (d: Dir): Dir => ((d + 2) & 3) as Dir;
export const DIRS: readonly Dir[] = [0, 1, 2, 3];

export const T = { Void: 0, Floor: 1, Wall: 2, Rail: 3, Vent: 4, Gate: 5, Plate: 6, Exit: 7 } as const;
export type Tile = (typeof T)[keyof typeof T];

export type EnemyKind = 'buzz' | 'clank' | 'warden' | 'ram' | 'woofer' | 'conductor' | 'golem' | 'spotlight';
export type EnemyMode = 'idle' | 'rev' | 'windup' | 'recover';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  facing: Dir;
  /** cadence parity for every-other-beat enemies */
  phase: number;
  stun: number;
  aware: boolean;
  mode: EnemyMode;
  lockDir: Dir;
  alive: boolean;
  buffed: boolean;
  /** -1 = no intent, otherwise the direction it plans to step next beat (display only) */
  intent: number;
  /** will act on the next resolved beat (display only) */
  ready: boolean;
}

export type PropKind = 'relay' | 'chest' | 'pedestal' | 'battery' | 'tape' | 'crate';
export interface Prop {
  id: number;
  kind: PropKind;
  x: number;
  y: number;
  /** relay restored / chest opened / pedestal taken / pickup collected */
  on: boolean;
  /** visual variant for crates */
  v: number;
}

export type ModId =
  | 'reverse'
  | 'reverb'
  | 'bass'
  | 'harmonic'
  | 'ghost'
  | 'crescendo'
  | 'sidechain'
  | 'feedback'
  | 'scratch'
  | 'pedal';

export type EchoKind = 'move' | 'attack' | 'idle' | 'warp';
export interface EchoEntry {
  k: EchoKind;
  d: Dir;
  fx: number;
  fy: number;
  tx: number;
  ty: number;
}

export interface Recording {
  sx: number;
  sy: number;
  entries: EchoEntry[];
}

export interface EchoState {
  x: number;
  y: number;
  sx: number;
  sy: number;
  entries: EchoEntry[];
  faded: boolean;
}

export interface PlayerAction {
  k: 'dir' | 'idle' | 'rewind';
  d: Dir;
  /** false when the input was late/off-beat (still executes, costs groove) */
  onBeat: boolean;
}

export interface PlayerState {
  x: number;
  y: number;
  facing: Dir;
  hp: number;
  maxHp: number;
  charge: number;
  maxCharge: number;
  groove: number;
  streakTarget: number;
  streak: number;
  pedalReady: boolean;
}

export interface Gate {
  x: number;
  y: number;
  open: boolean;
  plates: number[]; // tile indices
}

export interface TrainLane {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  phase: number; // fires when turn % 16 === phase
  d: Dir; // travel direction (render)
}

export interface Vent {
  x: number;
  y: number;
  phase: number; // fires when turn % 8 === phase
}

export interface Danger {
  x: number;
  y: number;
  /** beats until it lands; 1 = on the next beat */
  inn: number;
  dmg: number;
}

export interface BossAttack {
  turn: number;
  kind: 'col' | 'row' | 'stomp' | 'cross' | 'box' | 'rain' | 'land';
  cells: number[];
  reprise: boolean;
  /** station the boss stands on when this lands ('land' = destination) */
  st: number;
}

export interface BossState {
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  phase: 1 | 2 | 3;
  /** turns of retuning left (no attacks, invulnerable) */
  transition: number;
  pendingPhase: number;
  attacks: BossAttack[];
  lastBar: BossAttack[];
  defeated: boolean;
  victoryTurns: number;
  bpm: number;
  hitFlash: number;
  /** current station index */
  station: number;
  /** station it stands on during the current bar after landing (announced a bar ahead) */
  next: number;
}

export interface RunStats {
  kills: number;
  echoKills: number;
  resonances: number;
  hitsTaken: number;
  maxGroove: number;
  beats: number;
  onBeat: number;
  rewinds: number;
  relays: number;
}

export type EvType =
  | 'move'
  | 'bump'
  | 'swing'
  | 'hit'
  | 'block'
  | 'kill'
  | 'reso'
  | 'hurt'
  | 'shielded'
  | 'relayTune'
  | 'relayOn'
  | 'exitOpen'
  | 'pickup'
  | 'rewind'
  | 'fizzle'
  | 'echoSpawn'
  | 'echoFade'
  | 'train'
  | 'vent'
  | 'pulse'
  | 'beam'
  | 'slam'
  | 'dash'
  | 'stun'
  | 'bossAttack'
  | 'bossPhase'
  | 'bpm'
  | 'bossDown'
  | 'summon'
  | 'echoGet'
  | 'chest'
  | 'groove'
  | 'gate'
  | 'clear'
  | 'death';

/** Loose event record consumed by renderer/audio. */
export interface SimEvent {
  t: EvType;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  d?: Dir;
  n?: number;
  s?: string;
  who?: 'player' | 'echo' | 'enemy' | 'boss' | 'hazard';
  cells?: number[];
}

export interface World {
  w: number;
  h: number;
  tiles: Uint8Array;
  /** decorative variant per tile (render only, deterministic) */
  deco: Uint8Array;
  zone: number;
  floorId: string;
  turn: number;
  player: PlayerState;
  enemies: Enemy[];
  props: Prop[];
  gates: Gate[];
  trains: TrainLane[];
  vents: Vent[];
  echoUnlocked: boolean;
  record: Recording;
  echo: EchoState | null;
  exitX: number;
  exitY: number;
  exitOpen: boolean;
  relaysTotal: number;
  relaysOn: number;
  mods: Partial<Record<ModId, number>>;
  boss: BossState | null;
  rng: number;
  nextId: number;
  stats: RunStats;
  melody: number[];
  events: SimEvent[];
  danger: Danger[];
  cleared: boolean;
  dead: boolean;
  pendingChest: number;
  deathCause: string;
  /** tutorial hint markers (render only) */
  hints: { x: number; y: number; n: number }[];
}

export const ENEMY_HP: Record<EnemyKind, number> = {
  buzz: 1,
  clank: 2,
  warden: 2,
  ram: 2,
  woofer: 3,
  conductor: 2,
  golem: 3,
  spotlight: 2,
};

export const grooveLevel = (g: number): 1 | 2 | 3 => (g >= 16 ? 3 : g >= 8 ? 2 : 1);
