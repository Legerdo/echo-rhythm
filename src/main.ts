import { Game } from './game/game';
import { VH, VW } from './render/view';
import { loadFonts } from './render/text';
import './style.css';

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.width = VW;
canvas.height = VH;

// Integer scaling keeps every pixel square; fall back to fractional only when the window is tiny.
function fit(): void {
  const s = Math.max(1, Math.floor(Math.min(window.innerWidth / VW, window.innerHeight / VH)));
  const scale = Math.min(window.innerWidth / VW, window.innerHeight / VH) < 1 ? Math.min(window.innerWidth / VW, window.innerHeight / VH) : s;
  canvas.style.width = `${Math.floor(VW * scale)}px`;
  canvas.style.height = `${Math.floor(VH * scale)}px`;
}
window.addEventListener('resize', fit);
fit();

const game = new Game(canvas);
void game.boot(loadFonts);
canvas.focus();
