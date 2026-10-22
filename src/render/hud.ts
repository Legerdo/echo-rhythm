import { BOSS_HP, PHASE_FLOOR } from '../sim/boss';
import { FLOORS } from '../sim/run';
import { grooveLevel, type World } from '../sim/types';
import type { Atlas } from './atlas';
import { text, wrap } from './text';
import { VH, VW } from './view';

export interface BeatInfo {
  /** fractional beat index the player is hearing now (floor turns) */
  beat: number;
  spb: number;
  /** last judgement and when (ms) */
  judge: string;
  judgeAt: number;
  countIn: number;
}

const ATTACK_ICON: Record<string, string> = { col: '│', row: '─', stomp: '◇', cross: '+', box: '■', rain: '∴', land: '▼' };

export function drawHud(g: CanvasRenderingContext2D, a: Atlas, w: World, b: BeatInfo, now: number, hint: string, floorIdx: number): void {
  const p = w.player;
  // top strip
  g.fillStyle = '#0b0a14';
  g.globalAlpha = 0.72;
  g.fillRect(0, 0, VW, 17);
  g.globalAlpha = 1;
  g.fillStyle = '#3a3355';
  g.fillRect(0, 17, VW, 1);
  for (let i = 0; i < p.maxHp; i++) a.draw(g, i < p.hp ? 'ui_heart' : 'ui_heart_empty', 3 + i * 9, 3);
  const cx = 6 + p.maxHp * 9;
  for (let i = 0; i < p.maxCharge; i++) a.draw(g, i < p.charge ? 'ui_charge' : 'ui_charge_empty', cx + i * 11, 3);
  text(g, 'SPACE', cx + p.maxCharge * 11 + 1, 4, { font: 'tiny', color: '#6f6a94' });

  const def = FLOORS[floorIdx];
  const label = def.kind === 'boss' ? def.name : `${def.id}  ${def.name}`;
  text(g, label, VW / 2, 3, { font: 'small', color: '#d6d4ea', align: 'center' });
  if (w.relaysTotal > 0) {
    const rx = VW / 2 + 52;
    for (let i = 0; i < w.relaysTotal; i++) a.draw(g, i < w.relaysOn ? 'ui_relay_on' : 'ui_relay', rx + i * 11, 4);
    if (w.exitOpen) text(g, '출구 열림', rx + w.relaysTotal * 11 + 2, 4, { font: 'tiny', color: '#b6e85a' });
  }

  // groove meter
  const gl = grooveLevel(p.groove);
  const prog = gl === 3 ? 1 : gl === 2 ? (p.groove - 8) / 8 : p.groove / 8;
  const gx = VW - 92;
  text(g, '그루브', gx, 5, { font: 'tiny', color: '#6f6a94', shadow: null });
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i < Math.round(prog * 8) ? (gl === 3 ? '#7fe3ff' : '#ffd27a') : '#2a2440';
    g.fillRect(gx + 26 + i * 4, 6, 3, 5);
  }
  text(g, `x${gl}`, VW - 20, 2, { font: 'big', color: gl === 3 ? '#7fe3ff' : gl === 2 ? '#ffd27a' : '#9e9bbd' });

  if (w.boss) drawBossBar(g, w);

  // beat bar
  drawBeatBar(g, w, b, now);

  // hint
  if (hint) {
    const lines = wrap(g, hint, 220, 'small');
    const h = lines.length * 11 + 6;
    g.fillStyle = '#0b0a14';
    g.globalAlpha = 0.78;
    g.fillRect(4, VH - 34 - h, 228, h);
    g.globalAlpha = 1;
    g.fillStyle = '#7fe3ff';
    g.fillRect(4, VH - 34 - h, 2, h);
    lines.forEach((ln, i) => text(g, ln, 10, VH - 31 - h + i * 11, { font: 'small', color: '#d6d4ea' }));
  }
}

const ATTACK_NAME: Record<string, string> = { col: '세로줄', row: '가로줄', stomp: '주변', cross: '십자', box: '3x3', rain: '흩뿌림', land: '착지' };

/** Boss info lives in the side margins so the arena stays clear: HP on the left, the score on the right. */
function drawBossBar(g: CanvasRenderingContext2D, w: World): void {
  const b = w.boss!;
  const lx = 6;
  const panel = (x: number, y: number, pw: number, ph: number) => {
    g.fillStyle = '#0b0a14';
    g.globalAlpha = 0.8;
    g.fillRect(x, y, pw, ph);
    g.globalAlpha = 1;
    g.fillStyle = '#3a2a10';
    g.fillRect(x, y, pw, 1);
  };
  panel(lx - 3, 22, 72, 62);
  text(g, 'MAESTRO', lx, 25, { font: 'tiny', color: '#f2d266' });
  text(g, 'HUSH', lx, 34, { font: 'tiny', color: '#f2d266' });
  const bw = 64;
  g.fillStyle = '#3a2a10';
  g.fillRect(lx, 45, bw, 5);
  g.fillStyle = b.transition > 0 || b.pendingPhase > b.phase ? '#9a2c86' : '#e0343c';
  g.fillRect(lx, 45, Math.round((bw * b.hp) / BOSS_HP), 5);
  g.fillStyle = '#f2d266';
  for (const f of PHASE_FLOOR.slice(1, 3)) g.fillRect(lx + Math.round((bw * f) / BOSS_HP), 44, 1, 7);
  text(g, `악장 ${b.phase}/3`, lx, 53, { font: 'tiny', color: '#d6d4ea' });
  text(g, b.transition > 0 || b.pendingPhase > b.phase ? '조율 중: 무적' : '잔향만 통한다', lx, 63, { font: 'tiny', color: b.transition > 0 ? '#ff9ad6' : '#7fe3ff' });
  text(g, `${Math.round(b.bpm)} BPM`, lx, 73, { font: 'tiny', color: '#6f6a94' });

  // the score: what lands on each beat of this bar and the next
  const rx = VW - 74;
  panel(rx - 3, 22, 74, 112);
  text(g, '악보', rx, 25, { font: 'tiny', color: '#f2d266' });
  const n = w.turn;
  const bar0 = n - (n & 3);
  for (let k = 0; k < 8; k++) {
    const turn = bar0 + k;
    const y = 36 + k * 12 + (k >= 4 ? 4 : 0);
    const past = turn < n;
    const cur = turn === n;
    if (k === 4) {
      g.fillStyle = '#3a3355';
      g.fillRect(rx, y - 3, 66, 1);
    }
    g.globalAlpha = past ? 0.35 : 1;
    if (cur) {
      g.fillStyle = '#3a3355';
      g.fillRect(rx - 1, y - 1, 68, 11);
    }
    text(g, `${(k % 4) + 1}`, rx + 1, y, { font: 'tiny', color: k < 4 ? '#ffd27a' : '#6f6a94', shadow: null });
    const atks = b.attacks.filter((q) => q.turn === turn);
    const s = atks.map((q) => ATTACK_NAME[q.kind] ?? '?').join(' ');
    text(g, s || '—', rx + 10, y, { font: 'tiny', color: atks.some((q) => q.kind === 'land') ? '#f2d266' : atks.some((q) => q.reprise) ? '#ff9ad6' : atks.length ? '#ff7a6a' : '#514a72', shadow: null });
    g.globalAlpha = 1;
  }
  void ATTACK_ICON;
}

function drawBeatBar(g: CanvasRenderingContext2D, w: World, b: BeatInfo, now: number): void {
  const cy = VH - 15;
  const cx = VW / 2;
  g.fillStyle = '#0b0a14';
  g.globalAlpha = 0.72;
  g.fillRect(cx - 120, cy - 11, 240, 24);
  g.globalAlpha = 1;
  g.fillStyle = '#2a2440';
  g.fillRect(cx - 116, cy, 232, 1);
  const frac = b.beat - Math.floor(b.beat);
  const base = Math.floor(b.beat);
  const SPAN = 28;
  for (let k = 0; k <= 4; k++) {
    const beatIdx = base + k;
    const dist = (beatIdx - b.beat) * SPAN;
    if (dist < -2 || dist > 112) continue;
    const down = (((beatIdx % 4) + 4) % 4) === 0;
    const c = down ? '#7fe3ff' : '#ffd27a';
    const h = down ? 11 : 8;
    g.globalAlpha = Math.min(1, (112 - dist) / 30);
    g.fillStyle = c;
    g.fillRect(Math.round(cx - 12 - dist) - 1, cy - h / 2, 3, h);
    g.fillRect(Math.round(cx + 12 + dist) - 1, cy - h / 2, 3, h);
    g.globalAlpha = 1;
  }
  // centre: tuning fork that rings on the beat
  const ring = Math.max(0, 1 - frac * 3);
  g.fillStyle = '#1f1b2e';
  g.fillRect(cx - 9, cy - 10, 18, 21);
  g.fillStyle = ring > 0.05 ? '#fff3c4' : '#ffd27a';
  g.fillRect(cx - 5, cy - 8, 2, 9);
  g.fillRect(cx + 3, cy - 8, 2, 9);
  g.fillRect(cx - 4, cy + 1, 8, 2);
  g.fillRect(cx - 1, cy + 3, 2, 6);
  if (ring > 0) {
    g.globalAlpha = ring;
    g.strokeStyle = '#fff3c4';
    g.strokeRect(cx - 11.5, cy - 12.5, 23, 25);
    g.globalAlpha = 1;
  }
  // bar position: 4 pips, beat 1 is the echo hand-off
  const bb = ((w.turn % 4) + 4) % 4;
  for (let i = 0; i < 4; i++) {
    const px = cx + 26 + i * 7;
    g.fillStyle = i === bb ? (i === 0 ? '#7fe3ff' : '#ffd27a') : '#3a3355';
    g.fillRect(px, cy + 6, 5, 3);
  }
  text(g, '마디', cx + 26, cy - 9, { font: 'tiny', color: '#514a72', shadow: null });
  // judgement
  const age = now - b.judgeAt;
  if (b.judge && age < 450) {
    const col = b.judge === '♪' ? '#b6e85a' : b.judge === '늦음' ? '#ffd27a' : '#ff7a6a';
    text(g, b.judge, cx - 40, cy - 6 - Math.min(4, age / 60), { font: 'small', color: col, align: 'center', alpha: 1 - age / 450 });
  }
  if (b.countIn > 0) text(g, `${b.countIn}`, cx, VH / 2 - 30, { font: 'big', color: '#fff3c4', align: 'center' });
}
