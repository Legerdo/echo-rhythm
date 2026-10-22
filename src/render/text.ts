import g11 from 'galmuri/dist/Galmuri11.woff2';
import g11b from 'galmuri/dist/Galmuri11-Bold.woff2';
import g9 from 'galmuri/dist/Galmuri9.woff2';
import g7 from 'galmuri/dist/Galmuri7.woff2';

// Galmuri (SIL OFL 1.1) pixel fonts at their native sizes so glyphs land on whole pixels.
export const FONT = {
  big: '12px Galmuri11Bold',
  body: '12px Galmuri11',
  small: '10px Galmuri9',
  tiny: '8px Galmuri7',
} as const;
export type FontKey = keyof typeof FONT;

export async function loadFonts(): Promise<void> {
  const faces = [
    new FontFace('Galmuri11', `url(${g11})`),
    new FontFace('Galmuri11Bold', `url(${g11b})`),
    new FontFace('Galmuri9', `url(${g9})`),
    new FontFace('Galmuri7', `url(${g7})`),
  ];
  await Promise.all(
    faces.map(async (f) => {
      await f.load();
      document.fonts.add(f);
    }),
  );
}

export interface TextOpts {
  font?: FontKey;
  color?: string;
  align?: CanvasTextAlign;
  shadow?: string | null;
  alpha?: number;
}

export function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, o: TextOpts = {}): number {
  g.font = FONT[o.font ?? 'body'];
  g.textAlign = o.align ?? 'left';
  g.textBaseline = 'top';
  const a = g.globalAlpha;
  if (o.alpha !== undefined) g.globalAlpha = a * o.alpha;
  const sh = o.shadow === undefined ? '#0b0a14' : o.shadow;
  const X = Math.round(x);
  const Y = Math.round(y);
  if (sh) {
    g.fillStyle = sh;
    g.fillText(s, X + 1, Y + 1);
  }
  g.fillStyle = o.color ?? '#d6d4ea';
  g.fillText(s, X, Y);
  const w = g.measureText(s).width;
  g.globalAlpha = a;
  return w;
}

export function measure(g: CanvasRenderingContext2D, s: string, font: FontKey = 'body'): number {
  g.font = FONT[font];
  return g.measureText(s).width;
}

/** Greedy wrap that also breaks inside long Korean words. */
export function wrap(g: CanvasRenderingContext2D, s: string, width: number, font: FontKey = 'body'): string[] {
  g.font = FONT[font];
  const out: string[] = [];
  for (const para of s.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const cand = line ? line + ' ' + word : word;
      if (g.measureText(cand).width <= width) {
        line = cand;
        continue;
      }
      if (line) out.push(line);
      line = '';
      let chunk = '';
      for (const ch of word) {
        if (g.measureText(chunk + ch).width > width && chunk) {
          out.push(chunk);
          chunk = '';
        }
        chunk += ch;
      }
      line = chunk;
    }
    out.push(line);
  }
  return out;
}

/** Chunky title text: render at native size then scale up with nearest-neighbour. */
export function bigText(g: CanvasRenderingContext2D, s: string, cx: number, y: number, scale: number, color: string, shadow = '#0b0a14'): void {
  const c = document.createElement('canvas');
  const cg = c.getContext('2d')!;
  cg.font = FONT.big;
  const w = Math.ceil(cg.measureText(s).width) + 2;
  // Hangul glyphs rise above the em top: render with headroom so no stroke is clipped
  const PAD = 3;
  c.width = w;
  c.height = 14 + PAD * 2;
  cg.font = FONT.big;
  cg.textBaseline = 'top';
  cg.fillStyle = color;
  cg.fillText(s, 0, PAD);
  // hard alpha so scaling never blurs
  const d = cg.getImageData(0, 0, c.width, c.height);
  for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] >= 128 ? 255 : 0;
  cg.putImageData(d, 0, 0);
  y -= PAD * scale;
  const x = Math.round(cx - (w * scale) / 2);
  g.imageSmoothingEnabled = false;
  if (shadow) {
    const sc = document.createElement('canvas');
    sc.width = c.width;
    sc.height = c.height;
    const sg = sc.getContext('2d')!;
    sg.drawImage(c, 0, 0);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = shadow;
    sg.fillRect(0, 0, sc.width, sc.height);
    g.drawImage(sc, x + scale, y + scale, w * scale, c.height * scale);
  }
  g.drawImage(c, x, y, w * scale, c.height * scale);
}
