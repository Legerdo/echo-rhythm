import { BeatClock } from '../audio/clock';
import { AudioEngine } from '../audio/engine';
import { Music, ZONE_SONG } from '../audio/music';
import { Sfx } from '../audio/sfx';
import { Voices } from '../audio/synth';
import { Atlas } from '../render/atlas';
import { Fx } from '../render/fx';
import { drawHud } from '../render/hud';
import { bigText, text, wrap } from '../render/text';
import { View, VH, VW } from '../render/view';
import { PHASE_BPM } from '../sim/boss';
import { actionKey, Bot } from '../sim/bot';
import { applyReward, finishFloor, FLOORS, MODS, newRun, rewardLabel, rollChest, rollRewards, startFloor, ZONE_NAMES, type Reward, type RunState } from '../sim/run';
import { grooveLevel, type ModId, type PlayerAction, type SimEvent, type World } from '../sim/types';
import { applyChestMod, nextTrainTurn, step } from '../sim/world';
import { City } from './city';
import { Conductor, type Grade } from './conductor';
import { Ending, melodyBars } from './ending';
import { bindInput, type Intent } from './input';
import * as Save from './save';

export const FLOOR_BPM: Record<string, number> = { '1-1': 100, '1-2': 104, '2-1': 112, '2-2': 116, '3-1': 120, '3-2': 124, B: PHASE_BPM[1] };

type Screen = 'loading' | 'press' | 'title' | 'options' | 'calib' | 'play' | 'pause' | 'reward' | 'chest' | 'zone' | 'clear' | 'gameover' | 'ending' | 'error';

const CAUSE: Record<string, string> = {
  buzz: '윙윙이',
  clank: '깡통',
  warden: '방패봇',
  ram: '돌진 트램',
  woofer: '우퍼',
  conductor: '지휘봇',
  golem: '베이스 골렘',
  spotlight: '탐조등',
  train: '열차',
  vent: '증기 배출구',
  boss: '마에스트로 허시',
};

const ENEMY_HINT: Record<string, string> = {
  buzz: '윙윙이 — 두 박마다 한 칸 다가온다. 머리 위 !가 뜨면 다음 박에 움직인다.',
  clank: '깡통 — 매 박 정해진 줄을 왕복한다. 화살표 방향을 보고 줄을 비켜 서라.',
  warden: '방패봇 — 항상 나를 향해 방패를 든다. 정면 공격은 막힌다. 잔향으로 옆을 쳐라.',
  ram: '돌진 트램 — 같은 줄에 서면 한 박 경고 후 끝까지 돌진한다. 옆으로 비키면 벽에 박혀 기절한다.',
  woofer: '우퍼 — 마디의 4번째 박에 주변 8칸을 울린다. 1~3박에 치고 빠져라. 잔향은 맞아도 괜찮다.',
  conductor: '지휘봇 — 주변 2칸의 적을 매 박 움직이게 만든다. 도망치는 지휘봇부터 잡아라.',
  golem: '베이스 골렘 — 보통 공격은 안 통한다. 나와 잔향이 같은 박에 치는 공명만 통한다.',
  spotlight: '탐조등 — 마디의 2번째 박에 빛줄기를 쏘고, 마디가 끝날 때 방향을 바꾼다.',
};

const TUTORIAL_HINT: Record<number, string> = {
  1: '방향키 / WASD — 아래 박자 막대가 가운데에 닿을 때 한 칸씩 움직인다.',
  2: '적이 있는 칸으로 움직이면 공격한다. 적은 정해진 박자에만 움직인다.',
  3: '깡통은 정해진 줄을 왕복한다. 줄을 비켜서 지나가거나, 다가올 때 먼저 쳐라.',
  4: '선로가 붉게 깜빡이면 숫자만큼의 박 뒤에 열차가 지나간다.',
};

const ZONE_GIFT = ['다음 구역부터 코드 반주가 처음부터 깔린다.', '다음 구역부터 아르페지오가 처음부터 깔린다.', '마지막 무대에는 지금까지 되찾은 모든 소리가 함께한다.'];

interface MenuItem {
  label: string;
  value?: () => string;
  act?: () => void;
  adj?: (d: number) => void;
}

export class Game {
  private g: CanvasRenderingContext2D;
  private atlas = new Atlas();
  private fx = new Fx();
  private view: View;
  private city = new City(3, 330, 366);
  private eng: AudioEngine | null = null;
  private voices!: Voices;
  private music!: Music;
  private sfx!: Sfx;
  private cond!: Conductor;
  settings = Save.loadSettings();
  records = Save.loadRecords();
  run: RunState | null = null;
  world: World | null = null;
  screen: Screen = 'loading';
  private sel = 0;
  private menuFrom: Screen = 'title';
  private rewards: Reward[] = [];
  private chestMods: ModId[] = [];
  private judge = '';
  private judgeAt = 0;
  private hint = '';
  private hintUntil = 0;
  private hintsShown = new Set<string>();
  private last = performance.now();
  private stateAt = 0;
  private floorStats = { kills: 0, reso: 0, beats: 0 };
  private bot: Bot | null = null;
  private autoTurn = -1;
  private ending: Ending | null = null;
  private endingStats: string[] = [];
  private calib: { clicks: number[]; errs: number[]; done: boolean; result: number } | null = null;
  private error = '';
  private pausedForStall = false;
  private lastLevel = -1;
  /** floor index being played/shown; run.floor advances as soon as a floor is cleared */
  private curFloor = 0;

  constructor(canvas: HTMLCanvasElement) {
    const g = canvas.getContext('2d', { alpha: false });
    if (!g) throw new Error('Canvas 2D를 사용할 수 없습니다.');
    this.g = g;
    g.imageSmoothingEnabled = false;
    this.view = new View(this.atlas, this.fx);
    this.applyVisualSettings();
    const q = new URLSearchParams(location.search);
    if (q.get('autoplay') === '1') this.bot = new Bot();
  }

  async boot(loadFonts: () => Promise<void>): Promise<void> {
    try {
      await loadFonts();
      await this.atlas.load();
      this.screen = 'press';
    } catch (e) {
      this.fail(e);
    }
    bindInput(window, (i, ts) => this.onIntent(i, ts));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.screen === 'play') this.pause();
    });
    window.setInterval(() => this.tickTiming(), 15);
    const frame = () => {
      this.frame();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    this.exposeDebug();
  }

  private fail(e: unknown): void {
    this.error = e instanceof Error ? e.message : String(e);
    this.screen = 'error';
    console.error(e);
  }

  private applyVisualSettings(): void {
    this.fx.shakeOn = this.settings.shake;
    this.fx.reduce = this.settings.reduceFlash;
  }

  // ================================================================ audio

  private async ensureAudio(): Promise<boolean> {
    if (this.eng) {
      await this.eng.resume().catch(() => undefined);
      return true;
    }
    try {
      this.eng = new AudioEngine();
      this.voices = new Voices(this.eng);
      const clock = new BeatClock();
      this.music = new Music(this.eng, this.voices, clock);
      this.cond = new Conductor(this.eng, this.music, clock);
      this.sfx = new Sfx(this.eng, this.voices, this.music);
      this.cond.onResolve = (a, gr) => this.onResolve(a, gr);
      this.cond.onStall = () => {
        this.pausedForStall = true;
        this.pause();
      };
      this.cond.offset = this.settings.offsetMs / 1000;
      this.eng.setVolumes(this.settings.music, this.settings.sfx);
      this.eng.ctx.onstatechange = () => {
        if (this.eng && this.eng.ctx.state !== 'running' && this.screen === 'play') this.pause();
      };
      await this.eng.resume();
      return true;
    } catch (e) {
      this.fail(new Error('오디오를 시작할 수 없습니다: ' + (e instanceof Error ? e.message : String(e))));
      return false;
    }
  }

  private playMenuMusic(): void {
    if (!this.eng) return;
    this.cond.stop();
    this.music.load('title', 0);
    this.cond.clock.reset(this.eng.ctx.currentTime + 0.1, 0, 90);
    this.music.start();
  }

  // ================================================================ input

  private onIntent(i: Intent, ts: number): void {
    if (this.screen === 'loading' || this.screen === 'error') return;
    if (this.screen === 'press') {
      void this.ensureAudio().then((ok) => {
        if (!ok) return;
        this.playMenuMusic();
        this.go('title');
      });
      return;
    }
    if (this.screen === 'play') return this.playIntent(i, ts);
    if (this.screen === 'calib') return this.calibIntent(i, ts);
    if (this.screen === 'ending') {
      if ((i.k === 'ok' || i.k === 'pause') && this.endingBeat() > 64) this.toTitle();
      return;
    }
    if (this.screen === 'clear') return;
    const items = this.menuItems();
    if (!items.length) {
      if (i.k === 'ok' || i.k === 'back' || i.k === 'pause') this.menuBack();
      return;
    }
    if (i.k === 'dir') {
      if (i.d === 0 || i.d === 2) {
        this.sel = (this.sel + (i.d === 2 ? 1 : items.length - 1)) % items.length;
        this.sfx?.menu('move');
      } else if (this.screen === 'reward' || this.screen === 'chest') {
        this.sel = (this.sel + (i.d === 1 ? 1 : items.length - 1)) % items.length;
        this.sfx?.menu('move');
      } else {
        const it = items[this.sel];
        if (it.adj) {
          it.adj(i.d === 1 ? 1 : -1);
          this.sfx?.menu('move');
        }
      }
    } else if (i.k === 'ok' || i.k === 'special') {
      const it = items[this.sel];
      if (it.act) {
        this.sfx?.menu('ok');
        it.act();
      } else if (it.adj) it.adj(1);
    } else if (i.k === 'back' || i.k === 'pause') {
      this.sfx?.menu('back');
      this.menuBack();
    }
  }

  private menuBack(): void {
    if (this.screen === 'options') this.go(this.menuFrom === 'pause' ? 'pause' : 'title');
    else if (this.screen === 'pause') this.resume();
    else if (this.screen === 'zone') this.toReward();
  }

  private playIntent(i: Intent, ts: number): void {
    if (i.k === 'pause') return this.pause();
    if (!this.cond.running || !this.world) return;
    let a: PlayerAction | null = null;
    if (i.k === 'dir') a = { k: 'dir', d: i.d, onBeat: true };
    else if (i.k === 'special') a = { k: 'rewind', d: 0, onBeat: true };
    if (!a) return;
    const r = this.cond.press(a, ts);
    if (r === 'early') {
      this.setJudge('빠름');
      this.sfx.offbeat();
    }
  }

  private setJudge(s: string): void {
    this.judge = s;
    this.judgeAt = performance.now();
  }

  // ================================================================ flow

  private go(s: Screen): void {
    this.screen = s;
    this.sel = 0;
    this.stateAt = performance.now();
  }

  private toTitle(): void {
    this.cond?.stop();
    this.world = null;
    this.ending = null;
    this.playMenuMusic();
    this.go('title');
  }

  private newRunFlow(seed?: number): void {
    const q = new URLSearchParams(location.search);
    const s = seed ?? (q.get('seed') ? Number(q.get('seed')) >>> 0 : (Math.random() * 2 ** 32) >>> 0);
    this.run = newRun(s);
    const f = Number(q.get('floor'));
    if (q.get('debug') === '1' && f >= 1 && f < FLOORS.length) {
      this.run.floor = f;
      this.run.echo = true;
    }
    this.records.runs++;
    Save.saveRecords(this.records);
    this.hintsShown.clear();
    this.enterFloor();
  }

  private continueFlow(): void {
    const r = Save.loadRun();
    if (!r) return;
    this.run = r;
    this.enterFloor();
  }

  private enterFloor(): void {
    const run = this.run!;
    try {
      this.world = startFloor(run);
    } catch (e) {
      this.fail(e);
      return;
    }
    Save.saveRun(run);
    const w = this.world;
    this.curFloor = run.floor;
    const q = new URLSearchParams(location.search);
    const dbgHp = Number(q.get('hp'));
    if (q.get('debug') === '1' && dbgHp >= 1) w.player.hp = Math.min(w.player.maxHp, dbgHp);
    const def = FLOORS[run.floor];
    const now = performance.now();
    this.view.reset(w, now);
    this.fx.parts = [];
    this.floorStats = { kills: 0, reso: 0, beats: 0 };
    this.lastLevel = -1;
    this.music.load(ZONE_SONG[def.zone], this.musicLevel());
    this.lastLevel = this.musicLevel();
    this.cond.startAt(0, FLOOR_BPM[def.id] ?? 110, 4);
    this.autoTurn = -1;
    this.go('play');
    if (def.kind === 'tutorial') this.showHint('t1', TUTORIAL_HINT[1]);
    if (def.kind === 'boss') this.showHint('boss', '허시는 직접 공격을 막는다. 점선 칸은 마디 끝에 허시가 내려앉을 자리. 미리 그 칸을 밟고 지나가면, 다음 마디의 잔향이 허시를 관통한다.');
    if (def.pedestal) this.showHint('ped', '앞에 놓인 소리굽쇠로 이동해 집어라.');
  }

  private musicLevel(): number {
    const w = this.world;
    const run = this.run;
    if (!w || !run) return 0;
    const def = FLOORS[run.floor];
    if (def.kind === 'boss') {
      const b = w.boss;
      if (!b || b.defeated) return 4;
      return b.phase + 1;
    }
    if (def.kind === 'tutorial') return 0;
    const carry = Math.min(2, def.zone);
    return Math.min(4, carry + w.relaysOn + (w.exitOpen && w.relaysTotal > 0 ? 1 : 0));
  }

  pause(): void {
    if (this.screen !== 'play' || !this.world || this.world.dead || this.world.cleared) return;
    this.cond.stop();
    void this.eng?.ctx.suspend().catch(() => undefined);
    this.go('pause');
  }

  private resume(): void {
    if (!this.world || !this.eng) return;
    const bpm = this.cond.clock.bpmAt(this.cond.next);
    void this.eng.resume().then(() => {
      this.cond.startAt(this.cond.next, bpm, 4);
      this.pausedForStall = false;
      this.go('play');
    });
  }

  private toReward(): void {
    const run = this.run!;
    this.rewards = rollRewards(run, 'floor');
    this.go('reward');
  }

  // ================================================================ beat resolution

  private onResolve(a: PlayerAction, grade: Grade): void {
    const w = this.world;
    if (!w || this.screen !== 'play') return;
    const resolvedTurn = w.turn;
    const before = { kills: w.stats.kills, reso: w.stats.resonances };
    step(w, a);
    const now = performance.now();
    if (grade === 'miss') this.setJudge('놓침');
    else if (grade === 'late') this.setJudge('늦음');
    else if (a.k !== 'idle') this.setJudge('♪');
    this.floorStats.kills += w.stats.kills - before.kills;
    this.floorStats.reso += w.stats.resonances - before.reso;
    this.view.onEvents(w, w.events, now);
    this.sfx.events(w.events, resolvedTurn);
    this.handleEvents(w, w.events, resolvedTurn);
    // a committed attack is aimed at the player's tile for the next beat
    if (w.danger.some((d) => d.inn === 1 && d.x === w.player.x && d.y === w.player.y)) this.sfx.warn();
    for (const lane of w.trains) {
      const m = nextTrainTurn(lane, w.turn);
      if (m - w.turn < 4 && Math.abs(lane.y0 - w.player.y) + Math.abs(lane.x0 - w.player.x) < 26) {
        this.sfx.warnBell();
        break;
      }
    }
    const lvl = this.musicLevel();
    if (lvl !== this.lastLevel) {
      this.music.setLevel(lvl, resolvedTurn);
      this.lastLevel = lvl;
    }
    this.hintsFor(w);
    if (w.dead) {
      this.cond.stop();
      this.go('clear');
      this.stateAt = now;
      this.records.deaths++;
      this.records.bestFloor = Math.max(this.records.bestFloor, this.run!.floor);
      Save.saveRecords(this.records);
      Save.clearRun();
      window.setTimeout(() => this.go('gameover'), 1500);
      return;
    }
    if (w.pendingChest) {
      this.cond.stop();
      this.chestMods = rollChest(Object.keys(w.mods) as ModId[], this.run!.seed, this.run!.floor * 31 + w.pendingChest);
      this.go('chest');
      return;
    }
    if (w.cleared) this.onFloorClear();
  }

  private handleEvents(w: World, evs: SimEvent[], turn: number): void {
    for (const e of evs) {
      if (e.t === 'bpm') this.cond.changeBpm(e.x2!, e.n!);
      if (e.t === 'bossPhase') this.music.setBreakdown(Math.floor(w.turn / 4));
      if (e.t === 'echoGet') this.showHint('echo', '잔향을 얻었다. 지난 마디(4박) 동안의 내 움직임을, 다음 마디에 잔향이 같은 자리에서 그대로 반복한다.', true);
      if (e.t === 'relayTune' && e.who === 'player') this.showHint('relay', '중계기는 나와 잔향이 같은 박에 쳐야 복구된다. 한 번 치고, 정확히 4박 뒤에 같은 자리에서 다시 쳐라.');
      if (e.t === 'block' && e.s === 'shield') this.showHint('shield', ENEMY_HINT.warden);
      if (e.t === 'block' && e.s === 'mute') this.showHint('mute', '직접 공격은 허시에게 통하지 않는다. 다음 착지 지점(점선)을 미리 밟아 잔향이 관통하게 하라.');
      if (e.t === 'reso') this.showHint('reso', '공명! 나와 잔향이 같은 박에 같은 대상을 치면 3배 피해, 방패와 장갑도 뚫는다. 충전 +1.');
      if (e.t === 'exitOpen') this.showHint('exit', '모든 중계기 복구 — 출구(승강기)가 열렸다.');
      if (e.t === 'gate') this.showHint('gate', '발판을 누르는 동안만 문이 열린다. 발판 위에 서 있었다면, 다음 마디에는 잔향이 대신 눌러 준다.');
    }
    void turn;
  }

  private hintsFor(w: World): void {
    const p = w.player;
    for (const h of w.hints) {
      if (Math.abs(h.x - p.x) + Math.abs(h.y - p.y) <= 2) this.showHint('t' + h.n, TUTORIAL_HINT[h.n]);
    }
    for (const e of w.enemies) {
      if (Math.abs(e.x - p.x) + Math.abs(e.y - p.y) <= 6) this.showHint('e_' + e.kind, ENEMY_HINT[e.kind]);
    }
    if (w.echo && w.player.charge > 0 && w.floorId !== '1-1') this.showHint('rewind', 'SPACE — 되감기: 충전 1을 써서 지금 잔향이 서 있는 칸으로 순간이동한다.');
    if (w.trains.length && w.danger.some((d) => d.dmg === 2 && d.inn <= 4 && Math.abs(d.x - p.x) + Math.abs(d.y - p.y) <= 6)) this.showHint('train', TUTORIAL_HINT[4]);
  }

  private showHint(key: string, msg: string, force = false): void {
    if (!msg || this.hintsShown.has(key)) return;
    const now = performance.now();
    if (!force && this.hint && now < this.hintUntil - 3500) return;
    this.hintsShown.add(key);
    this.hint = msg;
    this.hintUntil = now + 7000;
  }

  private onFloorClear(): void {
    const run = this.run!;
    const w = this.world!;
    const def = FLOORS[run.floor];
    window.setTimeout(() => this.cond.stop(), 900);
    this.go('clear');
    const done = finishFloor(run, w);
    this.records.totalResonances += w.stats.resonances;
    this.records.bestFloor = Math.max(this.records.bestFloor, run.floor);
    Save.saveRecords(this.records);
    if (done) {
      this.records.clears++;
      if (!this.records.bestTimeMs || run.time < this.records.bestTimeMs) this.records.bestTimeMs = run.time;
      Save.saveRecords(this.records);
      Save.clearRun();
      window.setTimeout(() => this.startEnding(), 2400);
      return;
    }
    Save.saveRun(run);
    const zoneDone = FLOORS[run.floor].zone !== def.zone;
    window.setTimeout(() => {
      if (zoneDone) this.go('zone');
      else this.toReward();
      this.playMenuMusic();
    }, 1700);
  }

  private startEnding(): void {
    const run = this.run!;
    this.ending = new Ending(this.atlas, run);
    this.music.load('ending', 5);
    this.music.setSolo(melodyBars(run.melodies[run.melodies.length - 1] ?? []), 8);
    this.cond.clock.reset(this.eng!.ctx.currentTime + 0.2, 0, 112);
    this.music.start();
    const s = run.stats;
    const mm = Math.floor(run.time / 60000);
    const ss = Math.floor((run.time % 60000) / 1000);
    this.endingStats = [
      `플레이 시간 ${mm}:${String(ss).padStart(2, '0')}`,
      `복구한 중계기 ${s.relays}개 · 공명 ${s.resonances}회`,
      `처치 ${s.kills} (잔향 처치 ${s.echoKills}) · 최고 그루브 x${s.maxGroove}`,
      `정박 입력 ${s.beats ? Math.round((s.onBeat / s.beats) * 100) : 0}% · 시드 ${run.seed}`,
    ];
    this.go('ending');
  }

  private endingBeat(): number {
    return this.eng ? this.cond.clock.beatAt(this.eng.heardTime()) : 0;
  }

  // ================================================================ menus

  private menuItems(): MenuItem[] {
    const s = this.settings;
    const bar = (v: number) => '■'.repeat(Math.round(v * 10)) + '□'.repeat(10 - Math.round(v * 10));
    const saveS = () => {
      Save.saveSettings(s);
      this.eng?.setVolumes(s.music, s.sfx);
      if (this.cond) this.cond.offset = s.offsetMs / 1000;
      this.applyVisualSettings();
    };
    switch (this.screen) {
      case 'title': {
        const items: MenuItem[] = [];
        const saved = Save.loadRun();
        if (saved) items.push({ label: `이어하기  (${FLOORS[saved.floor].id} ${FLOORS[saved.floor].name})`, act: () => this.continueFlow() });
        items.push({ label: '새 런 시작', act: () => this.newRunFlow() });
        items.push({
          label: '옵션',
          act: () => {
            this.menuFrom = 'title';
            this.go('options');
          },
        });
        return items;
      }
      case 'options':
        return [
          { label: '배경음', value: () => bar(s.music), adj: (d) => ((s.music = Math.round(Math.min(1, Math.max(0, s.music + d * 0.1)) * 10) / 10), saveS()) },
          { label: '효과음', value: () => bar(s.sfx), adj: (d) => ((s.sfx = Math.round(Math.min(1, Math.max(0, s.sfx + d * 0.1)) * 10) / 10), saveS()) },
          { label: '입력 보정', value: () => `${s.offsetMs > 0 ? '+' : ''}${s.offsetMs}ms`, adj: (d) => ((s.offsetMs = Math.max(-250, Math.min(250, s.offsetMs + d * 10))), saveS()) },
          { label: '입력 보정 측정하기', act: () => this.startCalib() },
          { label: '화면 흔들림', value: () => (s.shake ? '켬' : '끔'), adj: () => ((s.shake = !s.shake), saveS()) },
          { label: '섬광 줄이기', value: () => (s.reduceFlash ? '켬' : '끔'), adj: () => ((s.reduceFlash = !s.reduceFlash), saveS()) },
          { label: '잔향 경로 표시', value: () => (s.preview ? '켬' : '끔'), adj: () => ((s.preview = !s.preview), saveS()) },
          { label: '돌아가기', act: () => this.menuBack() },
        ];
      case 'pause':
        return [
          { label: '계속하기', act: () => this.resume() },
          {
            label: '옵션',
            act: () => {
              this.menuFrom = 'pause';
              this.go('options');
            },
          },
          { label: '타이틀로 (이 층의 시작부터 이어하기 가능)', act: () => this.toTitle() },
        ];
      case 'reward':
        return this.rewards.map((r) => ({
          label: rewardLabel(r).name,
          act: () => {
            applyReward(this.run!, r);
            Save.saveRun(this.run!);
            this.enterFloor();
          },
        }));
      case 'chest':
        return [
          ...this.chestMods.map((m) => ({ label: MODS[m].name, act: () => this.takeChest(m) })),
          { label: '그냥 닫기', act: () => this.takeChest(null) },
        ];
      case 'zone':
        return [{ label: '계속', act: () => this.toReward() }];
      case 'gameover': {
        const seed = this.run?.seed;
        return [
          { label: '같은 시드로 다시', act: () => this.newRunFlow(seed) },
          { label: '새 시드로 다시', act: () => this.newRunFlow((Math.random() * 2 ** 32) >>> 0) },
          { label: '타이틀로', act: () => this.toTitle() },
        ];
      }
      default:
        return [];
    }
  }

  private takeChest(m: ModId | null): void {
    const w = this.world!;
    if (m) applyChestMod(w, m);
    else w.pendingChest = 0;
    const bpm = this.cond.clock.bpmAt(this.cond.next);
    this.cond.startAt(this.cond.next, bpm, 4);
    this.go('play');
  }

  // ================================================================ calibration

  private startCalib(): void {
    if (!this.eng) return;
    this.music.stop();
    const t0 = this.eng.ctx.currentTime + 1.0;
    const clicks: number[] = [];
    for (let i = 0; i < 16; i++) {
      const t = t0 + i * 0.6;
      clicks.push(t);
      this.voices.rim(this.eng.sfxBus, t, 1);
      if (i % 4 === 0) this.voices.kick(this.eng.sfxBus, t, 0.6);
    }
    this.calib = { clicks, errs: [], done: false, result: 0 };
    this.go('calib');
  }

  private calibIntent(i: Intent, ts: number): void {
    const c = this.calib;
    if (!c || !this.eng) return;
    if (i.k === 'back' || i.k === 'pause' || (c.done && i.k === 'ok')) {
      this.voices.stopAll();
      this.calib = null;
      this.playMenuMusic();
      this.go('options');
      this.sel = 3;
      return;
    }
    if (c.done || (i.k !== 'special' && i.k !== 'ok' && i.k !== 'dir')) return;
    const t = this.eng.heardTime(ts);
    let best = Infinity;
    for (const k of c.clicks) if (Math.abs(t - k) < Math.abs(best)) best = t - k;
    if (Math.abs(best) < 0.3) c.errs.push(best);
    if (c.errs.length >= 12) this.finishCalib();
  }

  private finishCalib(): void {
    const c = this.calib!;
    const sorted = [...c.errs].sort((a, b) => a - b);
    const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    c.result = Math.round(Math.max(-250, Math.min(250, med * 1000)) / 5) * 5;
    c.done = true;
    this.settings.offsetMs = c.result;
    Save.saveSettings(this.settings);
    this.cond.offset = c.result / 1000;
  }

  // ================================================================ frame

  private tickTiming(): void {
    if (this.screen === 'play' && this.cond?.running) this.cond.update();
    if (this.screen === 'calib' && this.calib && !this.calib.done && this.eng) {
      const last = this.calib.clicks[this.calib.clicks.length - 1];
      if (this.eng.ctx.currentTime > last + 0.6) this.finishCalib();
    }
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(100, now - this.last);
    this.last = now;
    this.tickTiming();
    this.autoplay();
    this.fx.update(dt);
    if (this.screen === 'play' && this.cond?.running && this.run) this.run.time += dt;
    try {
      this.render(now, dt);
    } catch (e) {
      this.fail(e);
    }
  }

  private autoplay(): void {
    if (!this.bot || !this.eng) return;
    if (this.screen === 'play' && this.cond.running && this.world) {
      const N = this.cond.next;
      if (this.autoTurn === N) return;
      const tN = this.cond.clock.timeOf(N);
      if (this.eng.heardTime() - this.cond.offset < tN - 0.04) return;
      this.autoTurn = N;
      const a = this.bot.choose(this.world);
      const code = actionKey(a);
      if (code) window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
      return;
    }
    const age = performance.now() - this.stateAt;
    if ((this.screen === 'reward' || this.screen === 'chest' || this.screen === 'zone') && age > 700) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }));
      this.stateAt = performance.now();
    }
  }

  // ================================================================ render

  private render(now: number, dt: number): void {
    const g = this.g;
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 1;
    switch (this.screen) {
      case 'loading':
        g.fillStyle = '#0b0a14';
        g.fillRect(0, 0, VW, VH);
        g.fillStyle = '#7fe3ff';
        g.fillRect(VW / 2 - 30 + ((now / 8) % 60), VH / 2, 4, 4);
        return;
      case 'error':
        g.fillStyle = '#1a0610';
        g.fillRect(0, 0, VW, VH);
        g.fillStyle = '#ff7a6a';
        g.font = '12px sans-serif';
        g.fillText('오류: ' + this.error, 10, 40);
        g.fillText('새로고침(F5)으로 다시 시도해 주세요.', 10, 60);
        return;
      case 'press':
      case 'title':
      case 'options':
      case 'calib':
        return this.renderTitle(now);
      case 'ending':
        this.ending?.draw(g, this.endingBeat(), now, this.endingStats);
        return;
      default:
        break;
    }
    // play-based screens
    const w = this.world;
    if (!w) {
      this.renderTitle(now);
      return this.renderPanel(now);
    }
    const playing = this.screen === 'play' && this.cond.running;
    const hb = this.cond.heardBeat();
    this.view.phase = playing || this.screen === 'clear' ? ((hb % 1) + 1) % 1 : 0;
    this.view.beat = Math.floor(hb);
    this.view.draw(g, w, now, dt, { preview: this.settings.preview });
    if (now > this.hintUntil) this.hint = '';
    drawHud(
      g,
      this.atlas,
      w,
      { beat: hb, spb: this.cond.clock.spbAt(this.cond.next), judge: this.judge, judgeAt: this.judgeAt, countIn: playing ? this.cond.countInLeft() : 0 },
      now,
      this.screen === 'play' ? this.hint : '',
      this.curFloor,
    );
    if (this.cond.countInLeft() > 0 && this.screen === 'play') {
      const def = FLOORS[this.curFloor];
      bigText(g, def.kind === 'boss' ? def.name : `${def.id} ${def.name}`, VW / 2, 54, 2, '#fff3c4');
      text(g, ZONE_NAMES[def.zone], VW / 2, 84, { font: 'small', color: '#9e9bbd', align: 'center' });
    }
    this.fx.drawFlash(g, VW, VH);
    if (this.screen === 'clear') {
      const age = now - this.stateAt;
      g.globalAlpha = Math.min(0.6, age / 600);
      g.fillStyle = '#0b0a14';
      g.fillRect(0, 70, VW, 64);
      g.globalAlpha = 1;
      if (w.dead) {
        bigText(g, '신호 끊김', VW / 2, 82, 3, '#ff7a6a');
      } else {
        bigText(g, w.boss ? '허시 침묵' : '통과', VW / 2, 80, 3, '#b6e85a');
        text(g, `처치 ${this.floorStats.kills} · 공명 ${this.floorStats.reso} · 체력 ${w.player.hp}/${w.player.maxHp}`, VW / 2, 116, { font: 'small', color: '#d6d4ea', align: 'center' });
      }
    }
    if (this.screen !== 'play' && this.screen !== 'clear') this.renderPanel(now);
  }

  private renderTitle(now: number): void {
    const g = this.g;
    const hb = this.eng ? this.cond.clock.beatAt(this.eng.heardTime()) : now / 600;
    const phase = ((hb % 1) + 1) % 1;
    this.city.draw(g, now, [0.35, 0.3, 0.3, 0.6], phase);
    // the concept in one loop: Kit dances a bar, the echo repeats it one bar later
    const dance = [0, 1, 2, 1, 0, -1, -2, -1];
    const ib = Math.floor(hb);
    const gy = this.city.ground;
    const posAt = (b: number) => dance[((b % 8) + 8) % 8];
    const hop = Math.sin(Math.min(1, phase * 4) * Math.PI) * 3;
    const kx = VW / 2 - 8 + posAt(ib) * 14;
    const ex = VW / 2 - 8 + posAt(ib - 4) * 14;
    g.globalAlpha = 0.65 + 0.3 * (1 - phase);
    this.atlas.draw(g, phase < 0.5 ? 'echo_idle1' : 'echo_idle0', ex, gy - 17 - hop, posAt(ib - 4) < posAt(ib - 5));
    g.globalAlpha = 1;
    this.atlas.draw(g, phase < 0.5 ? 'kit_idle1' : 'kit_idle0', kx, gy - 17 - hop, posAt(ib) < posAt(ib - 1));
    bigText(g, 'AFTERBEAT', VW / 2 - 12, 26, 4, '#fff3c4');
    text(g, '잔향 도시 — 지난 마디의 내가 다음 마디를 함께 싸운다', VW / 2 - 12, 86, { font: 'small', color: '#7fe3ff', align: 'center' });
    if (this.screen === 'press') {
      if (Math.floor(now / 500) % 2 === 0) text(g, '아무 키나 눌러 시작 (소리가 납니다)', VW / 2, 124, { font: 'body', color: '#d6d4ea', align: 'center' });
      text(g, '이동/공격: 방향키·WASD   되감기: SPACE   일시정지: ESC', VW / 2, VH - 14, { font: 'tiny', color: '#6f6a94', align: 'center' });
      return;
    }
    if (this.screen === 'calib') return this.renderCalib(now);
    this.renderPanel(now);
    const r = this.records;
    if (this.screen === 'title')
      text(g, `런 ${r.runs} · 클리어 ${r.clears} · 최고 ${r.bestFloor + 1}층${r.bestTimeMs ? ` · 최단 ${Math.floor(r.bestTimeMs / 60000)}분` : ''}`, VW / 2, VH - 14, { font: 'tiny', color: '#6f6a94', align: 'center' });
  }

  private renderCalib(now: number): void {
    const g = this.g;
    const c = this.calib;
    g.fillStyle = '#0b0a14';
    g.globalAlpha = 0.85;
    g.fillRect(60, 104, VW - 120, 92);
    g.globalAlpha = 1;
    text(g, '입력 보정 측정', VW / 2, 110, { font: 'big', color: '#fff3c4', align: 'center' });
    if (!c) return;
    if (!c.done) {
      text(g, '딸깍 소리에 맞춰 SPACE를 눌러 주세요. (12회)', VW / 2, 128, { font: 'small', color: '#d6d4ea', align: 'center' });
      const t = this.eng!.ctx.currentTime;
      const next = c.clicks.find((k) => k > t);
      if (next !== undefined && next - t < 0.12) {
        g.fillStyle = '#fff3c4';
        g.fillRect(VW / 2 - 6, 146, 12, 12);
      }
    } else {
      text(g, `측정값 ${c.result > 0 ? '+' : ''}${c.result}ms — 입력 보정에 적용했습니다.`, VW / 2, 128, { font: 'small', color: '#b6e85a', align: 'center' });
      text(g, 'Enter: 돌아가기', VW / 2, 178, { font: 'tiny', color: '#9e9bbd', align: 'center' });
    }
    g.fillStyle = '#3a3355';
    g.fillRect(VW / 2 - 100, 166, 200, 1);
    g.fillStyle = '#7fe3ff';
    g.fillRect(VW / 2, 162, 1, 9);
    for (const e of c.errs) {
      g.fillStyle = '#ffd27a';
      g.fillRect(Math.round(VW / 2 + e * 400) - 1, 164, 3, 5);
    }
    void now;
  }

  private renderPanel(now: number): void {
    const g = this.g;
    const items = this.menuItems();
    if (this.screen === 'reward' || this.screen === 'chest') return this.renderCards(now);
    if (this.screen === 'zone') {
      const run = this.run!;
      const z = FLOORS[run.floor - 1]?.zone ?? 0;
      g.fillStyle = '#0b0a14';
      g.globalAlpha = 0.86;
      g.fillRect(0, 0, VW, VH);
      g.globalAlpha = 1;
      bigText(g, `${ZONE_NAMES[z]} 복구`, VW / 2, 60, 3, ['#5fd0b4', '#ff5fb8', '#ffb347'][z] ?? '#f2d266');
      text(g, ZONE_GIFT[z] ?? '', VW / 2, 110, { font: 'body', color: '#d6d4ea', align: 'center' });
      text(g, `다음 구역: ${ZONE_NAMES[z + 1] ?? ''}`, VW / 2, 130, { font: 'small', color: '#9e9bbd', align: 'center' });
      text(g, 'Enter — 계속', VW / 2, 170, { font: 'small', color: '#7fe3ff', align: 'center' });
      return;
    }
    if (this.screen === 'gameover') {
      g.fillStyle = '#0b0a14';
      g.globalAlpha = 0.88;
      g.fillRect(0, 0, VW, VH);
      g.globalAlpha = 1;
      const w = this.world;
      const run = this.run;
      bigText(g, '신호 끊김', VW / 2, 26, 3, '#ff7a6a');
      if (w && run) {
        text(g, `원인: ${CAUSE[w.deathCause] ?? w.deathCause}`, VW / 2, 66, { font: 'body', color: '#d6d4ea', align: 'center' });
        const fd = FLOORS[this.curFloor];
        text(g, `${fd.id} ${fd.name}에서 · 시드 ${run.seed}`, VW / 2, 82, { font: 'small', color: '#9e9bbd', align: 'center' });
        const s = run.stats;
        text(g, `처치 ${s.kills + w.stats.kills} · 공명 ${s.resonances + w.stats.resonances} · 최고 그루브 x${Math.max(s.maxGroove, w.stats.maxGroove)}`, VW / 2, 96, { font: 'small', color: '#9e9bbd', align: 'center' });
      }
    }
    if (!items.length) return;
    const isTitle = this.screen === 'title';
    const top = isTitle ? 112 : this.screen === 'gameover' ? 118 : 60;
    const width = this.screen === 'options' ? 236 : 220;
    const x = (VW - width) / 2;
    const h = items.length * 14 + 10;
    if (this.screen === 'pause' || this.screen === 'options') {
      g.fillStyle = '#0b0a14';
      g.globalAlpha = this.screen === 'pause' ? 0.7 : 0.85;
      g.fillRect(0, 0, VW, VH);
      g.globalAlpha = 1;
      bigText(g, this.screen === 'pause' ? '일시정지' : '옵션', VW / 2, 22, 2, '#fff3c4');
      if (this.screen === 'pause' && this.pausedForStall) text(g, '박자 재동기화를 위해 멈췄습니다', VW / 2, 46, { font: 'tiny', color: '#ffd27a', align: 'center' });
      if (this.screen === 'pause' && this.run) {
        const mods = this.world ? Object.keys(this.world.mods) : this.run.mods;
        text(g, `시드 ${this.run.seed} · 모듈: ${mods.length ? mods.map((m) => MODS[m as ModId].name).join(', ') : '없음'}`, VW / 2, VH - 46, { font: 'tiny', color: '#9e9bbd', align: 'center' });
      }
    }
    g.fillStyle = '#0b0a14';
    g.globalAlpha = 0.75;
    g.fillRect(x, top - 5, width, h);
    g.globalAlpha = 1;
    g.fillStyle = '#3a3355';
    g.fillRect(x, top - 5, width, 1);
    items.forEach((it, i) => {
      const y = top + i * 14;
      const on = i === this.sel;
      if (on) {
        g.fillStyle = '#1f6fa3';
        g.globalAlpha = 0.45;
        g.fillRect(x + 2, y - 2, width - 4, 13);
        g.globalAlpha = 1;
        text(g, '▶', x + 6, y, { font: 'small', color: '#7fe3ff' });
      }
      text(g, it.label, x + 18, y, { font: 'small', color: on ? '#ffffff' : '#9e9bbd' });
      if (it.value) text(g, it.value(), x + width - 8, y, { font: 'small', color: on ? '#7fe3ff' : '#6f6a94', align: 'right' });
    });
    if (this.screen === 'options') text(g, '←/→ 조절 · Enter 선택 · ESC 뒤로', VW / 2, top + h + 4, { font: 'tiny', color: '#6f6a94', align: 'center' });
  }

  private renderCards(now: number): void {
    const g = this.g;
    const chest = this.screen === 'chest';
    const items = this.menuItems();
    g.fillStyle = '#0b0a14';
    g.globalAlpha = 0.86;
    g.fillRect(0, 0, VW, VH);
    g.globalAlpha = 1;
    bigText(g, chest ? '보급 상자' : '정비 시간', VW / 2, 10, 2, '#fff3c4');
    text(g, chest ? '하나를 고르면 바로 장착된다' : '다음 층으로 가져갈 것을 하나 고른다', VW / 2, 34, { font: 'small', color: '#9e9bbd', align: 'center' });
    const cards = chest ? this.chestMods.map((m) => ({ name: MODS[m].name, desc: MODS[m].desc, icon: m as string })) : this.rewards.map((r) => ({ ...rewardLabel(r), icon: r.k === 'mod' ? r.id : r.k }));
    const n = cards.length;
    const cw = 112;
    const gap = 8;
    const x0 = (VW - (n * cw + (n - 1) * gap)) / 2;
    cards.forEach((c, i) => {
      const x = x0 + i * (cw + gap);
      const y = 50;
      const on = i === this.sel;
      g.fillStyle = on ? '#1f1b2e' : '#141022';
      g.fillRect(x, y, cw, 128);
      g.fillStyle = on ? '#7fe3ff' : '#3a3355';
      g.fillRect(x, y, cw, 1);
      g.fillRect(x, y + 127, cw, 1);
      g.fillRect(x, y, 1, 128);
      g.fillRect(x + cw - 1, y, 1, 128);
      const bob = on ? Math.round(Math.sin(now / 200) * 1) : 0;
      this.drawModIcon(c.icon, x + cw / 2, y + 22 + bob);
      text(g, c.name, x + cw / 2, y + 40, { font: 'body', color: on ? '#fff3c4' : '#d6d4ea', align: 'center' });
      wrap(g, c.desc, cw - 12, 'small').forEach((ln, k) => text(g, ln, x + 6, y + 58 + k * 11, { font: 'small', color: '#9e9bbd' }));
    });
    if (chest) {
      const on = this.sel === items.length - 1;
      text(g, on ? '▶ 그냥 닫기' : '그냥 닫기', VW / 2, 186, { font: 'small', color: on ? '#ffffff' : '#6f6a94', align: 'center' });
    } else if (this.run) {
      const owned = this.run.mods.map((m) => MODS[m].name).join(', ');
      text(g, `보유: ${owned || '없음'} · 체력 ${this.run.hp}/${this.run.maxHp}`, VW / 2, 186, { font: 'tiny', color: '#6f6a94', align: 'center' });
    }
    text(g, '←/→ 선택 · Enter 결정', VW / 2, 200, { font: 'tiny', color: '#514a72', align: 'center' });
  }

  private drawModIcon(id: string, cx: number, cy: number): void {
    const a = this.atlas;
    const icon: Record<string, [string, boolean?]> = {
      reverse: ['echo_idle0', true],
      reverb: ['echo_attack'],
      bass: ['kit_attack'],
      harmonic: ['echo_idle1'],
      ghost: ['ui_note'],
      crescendo: ['kit_attack'],
      sidechain: ['fx_spark1'],
      feedback: ['ui_charge'],
      scratch: ['fx_spark0'],
      pedal: ['kit_idle0'],
      repair: ['battery'],
      amp: ['ui_heart'],
    };
    const [name, flip] = icon[id] ?? ['ui_note'];
    const f = a.size(name);
    if (id === 'harmonic') a.draw(this.g, 'kit_idle1', cx - f.w / 2 + 3, cy - f.h / 2);
    a.draw(this.g, name, cx - f.w / 2, cy - f.h / 2, !!flip);
  }

  // ================================================================ debug / test hooks

  private exposeDebug(): void {
    const self = this;
    (window as unknown as { __AB: unknown }).__AB = {
      get screen() {
        return self.screen;
      },
      state() {
        const w = self.world;
        return {
          screen: self.screen,
          floor: self.run?.floor ?? -1,
          floorId: FLOORS[self.curFloor]?.id ?? null,
          turn: w?.turn ?? -1,
          hp: w?.player.hp ?? -1,
          px: w?.player.x ?? -1,
          py: w?.player.y ?? -1,
          beats: w?.stats.beats ?? 0,
          dead: !!w?.dead,
          saved: !!Save.loadRun(),
          groove: w ? grooveLevel(w.player.groove) : 0,
          echo: !!w?.echo,
          relays: w ? `${w.relaysOn}/${w.relaysTotal}` : '',
          boss: w?.boss ? { hp: w.boss.hp, phase: w.boss.phase } : null,
          bpm: self.cond?.running ? self.cond.bpm() : 0,
          running: !!self.cond?.running,
          seed: self.run?.seed ?? 0,
          ctxState: self.eng?.ctx.state ?? 'none',
          next: self.cond?.next ?? -1,
        };
      },
      /** ms until the next beat is heard (for test drivers) */
      msToNextBeat() {
        if (!self.eng || !self.cond.running) return -1;
        return (self.cond.clock.timeOf(self.cond.next) - self.eng.heardTime() + self.cond.offset) * 1000;
      },
      drift() {
        if (!self.eng || !self.cond.running) return null;
        const heard = self.cond.heardBeat();
        return { heard, next: self.cond.next, lag: heard - self.cond.next };
      },
      /** RMS of the master output right now (0 = silence); proves the graph makes sound, not that it sounds good */
      audioLevel() {
        return self.eng ? self.eng.level() : 0;
      },
    };
  }
}
