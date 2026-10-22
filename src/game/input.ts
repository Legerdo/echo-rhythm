// Keyboard only. Auto-repeat is ignored; each physical press is one intent with its own timestamp.

export type Intent =
  | { k: 'dir'; d: 0 | 1 | 2 | 3 }
  | { k: 'special' }
  | { k: 'pause' }
  | { k: 'ok' }
  | { k: 'back' };

const MAP: Record<string, Intent> = {
  ArrowUp: { k: 'dir', d: 0 },
  KeyW: { k: 'dir', d: 0 },
  ArrowRight: { k: 'dir', d: 1 },
  KeyD: { k: 'dir', d: 1 },
  ArrowDown: { k: 'dir', d: 2 },
  KeyS: { k: 'dir', d: 2 },
  ArrowLeft: { k: 'dir', d: 3 },
  KeyA: { k: 'dir', d: 3 },
  Space: { k: 'special' },
  ShiftLeft: { k: 'special' },
  ShiftRight: { k: 'special' },
  Escape: { k: 'pause' },
  KeyP: { k: 'pause' },
  Enter: { k: 'ok' },
  NumpadEnter: { k: 'ok' },
  KeyZ: { k: 'ok' },
  Backspace: { k: 'back' },
  KeyX: { k: 'back' },
};

export function bindInput(target: Window, onIntent: (i: Intent, timeStamp: number) => void): () => void {
  const down = (e: KeyboardEvent) => {
    const i = MAP[e.code];
    if (!i) return;
    e.preventDefault();
    if (e.repeat) return;
    onIntent(i, e.timeStamp || performance.now());
  };
  target.addEventListener('keydown', down);
  return () => target.removeEventListener('keydown', down);
}
