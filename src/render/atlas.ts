import atlasJson from '../assets/atlas.json';
import atlasUrl from '../assets/atlas.png';

interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Atlas {
  img!: HTMLCanvasElement;
  white!: HTMLCanvasElement;
  red!: HTMLCanvasElement;
  frames = new Map<string, FrameRect>();

  async load(): Promise<void> {
    const img = new Image();
    img.decoding = 'async';
    img.src = atlasUrl;
    await img.decode().catch(() => {
      throw new Error('스프라이트 아틀라스를 불러오지 못했습니다.');
    });
    const raw = (atlasJson as { frames: Record<string, { frame: FrameRect }> }).frames;
    for (const [name, f] of Object.entries(raw)) this.frames.set(name, f.frame);
    this.img = this.copy(img);
    this.white = this.tint(img, '#ffffff');
    this.red = this.tint(img, '#e0343c');
  }

  private copy(img: HTMLImageElement): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d')!.drawImage(img, 0, 0);
    return c;
  }

  private tint(img: HTMLImageElement, color: string): HTMLCanvasElement {
    const c = this.copy(img);
    const g = c.getContext('2d')!;
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  has(name: string): boolean {
    return this.frames.has(name);
  }

  size(name: string): FrameRect {
    return this.frames.get(name) ?? { x: 0, y: 0, w: 0, h: 0 };
  }

  /** Draw a frame with its top-left at (x, y). */
  draw(g: CanvasRenderingContext2D, name: string, x: number, y: number, flip = false, src: 'img' | 'white' | 'red' = 'img'): void {
    const f = this.frames.get(name);
    if (!f) return;
    const sheet = this[src];
    const dx = Math.round(x);
    const dy = Math.round(y);
    if (!flip) {
      g.drawImage(sheet, f.x, f.y, f.w, f.h, dx, dy, f.w, f.h);
      return;
    }
    g.save();
    g.translate(dx + f.w, dy);
    g.scale(-1, 1);
    g.drawImage(sheet, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    g.restore();
  }

  /** Draw a frame bottom-centred on a tile: feet sit `lift` px above the tile's bottom edge. */
  onTile(g: CanvasRenderingContext2D, name: string, tx: number, ty: number, flip = false, src: 'img' | 'white' | 'red' = 'img', lift = 1): void {
    const f = this.frames.get(name);
    if (!f) return;
    this.draw(g, name, tx + 8 - Math.floor(f.w / 2), ty + 16 - f.h - lift, flip, src);
  }
}
