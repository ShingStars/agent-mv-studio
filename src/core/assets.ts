/**
 * On-demand asset bank (browser side).
 *
 * Figures are decoded once, split into ink masks once, and then drawn with
 * palette colours + registration offsets. The renderer never calls
 * getImageData() per frame.
 */

import type { CompiledFigure, Plan } from '../compiler/schema.js';
import { type Roles, rgba, hexToRgb } from './palette.js';

export interface FigureDrawOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  palette: Roles;
  /** Global ink multiply (0..1) — used for fading a figure in. */
  alpha?: number;
  /** Per-ink extra offset in design units. */
  offsets?: Record<string, [number, number]>;
  /** Only draw these ink roles (e.g. ['me'] for a ghost). */
  only?: string[];
  /** Clip to a rect [x,y,w,h] in design units. */
  clip?: [number, number, number, number];
  /** Horizontal mirror around the figure's own centre. */
  flip?: boolean;
}

export interface FigureSource {
  id: string;
  file: string;
  inks: string[];
  key?: string;
  tolerance?: number;
  reg: number[];
  offsets?: Record<string, [number, number]>;
  crop?: [number, number, number, number];
  flip?: boolean;
  alphaCut?: number;
}

const INK_ORDER = ['me', 'text', 'black'];

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Asset: failed to load ${url}`));
    img.src = url;
  });
}

function parseHex(hex: string): [number, number, number] {
  return hexToRgb(hex);
}

/**
 * A figure split into up to three flat inks.
 *
 * Mask 0 = saturated/mid (the "me" ink), mask 1 = light/cream, mask 2 = dark.
 * The source can be a screen-print scan, a GPT generation on a chroma-key
 * background, or a hand-drawn silhouette.
 */
export class Figure {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly masks: HTMLCanvasElement[];
  readonly roles: string[];
  readonly reg: number[];
  readonly offsets: Record<string, [number, number]>;
  readonly flip: boolean;
  private tintCache = new Map<string, HTMLCanvasElement>();

  constructor(id: string, masks: HTMLCanvasElement[], roles: string[], reg: number[], offsets: Record<string, [number, number]>, flip: boolean) {
    this.id = id;
    this.masks = masks;
    this.width = masks[0]?.width ?? 0;
    this.height = masks[0]?.height ?? 0;
    this.roles = roles;
    this.reg = reg;
    this.offsets = offsets;
    this.flip = flip;
  }

  private tinted(mask: HTMLCanvasElement, color: string): HTMLCanvasElement {
    const cached = this.tintCache.get(color);
    if (cached) return cached;
    const c = document.createElement('canvas');
    c.width = mask.width;
    c.height = mask.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, c.width, c.height);
    this.tintCache.set(color, c);
    return c;
  }

  draw(s: import('../core/surface.js').Surface, o: FigureDrawOptions): void {
    const [globalScale, gx, gy] = [this.reg[0] ?? 1, this.reg[1] ?? 0, this.reg[2] ?? 0];
    const w = o.width;
    const h = o.height;
    const alpha = o.alpha ?? 1;
    if (alpha <= 0.001) return;
    const x = o.x + gx;
    const y = o.y + gy;
    const drawOne = (role: string, mask: HTMLCanvasElement) => {
      const color = o.palette[role] ?? '#ffffff';
      const tinted = this.tinted(mask, color);
      const extra = o.offsets?.[role] ?? this.offsets[role];
      const dx = extra?.[0] ?? 0;
      const dy = extra?.[1] ?? 0;
      s.ctx.save();
      if (o.clip) {
        s.ctx.beginPath();
        s.ctx.rect(...o.clip);
        s.ctx.clip();
      }
      s.ctx.globalAlpha = alpha;
      if (this.flip || o.flip) {
        const cx = x + w / 2;
        s.ctx.translate(cx, 0);
        s.ctx.scale(-1, 1);
        s.ctx.drawImage(tinted, -w / 2 + dx, y + dy, w * globalScale, h * globalScale);
      } else {
        s.ctx.drawImage(tinted, x + dx, y + dy, w * globalScale, h * globalScale);
      }
      s.ctx.restore();
    };
    // dark first so light/mid sit on top, matching print order
    const order = [2, 1, 0];
    for (const idx of order) {
      const role = this.roles[idx] ?? INK_ORDER[idx]!;
      if (o.only && !o.only.includes(role)) continue;
      const mask = this.masks[idx];
      if (mask) drawOne(role, mask);
    }
  }
}

export class AssetBank {
  private figures = new Map<string, Figure>();
  private images = new Map<string, HTMLImageElement>();
  private baseUrl = '/project/';

  async load(plan: Plan, baseUrl = '/project/'): Promise<void> {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    await Promise.all(
      plan.figures.map(async (f) => {
        if (this.figures.has(f.id)) return;
        try {
          const fig = await this.loadFigure(f);
          this.figures.set(f.id, fig);
        } catch (err) {
          console.warn(`[assets] ${(err as Error).message}`);
        }
      }),
    );
  }

  figure(id: string): Figure | undefined {
    return this.figures.get(id);
  }

  requireFigure(id: string): Figure {
    const f = this.figures.get(id);
    if (!f) throw new Error(`AssetBank: figure "${id}" not loaded`);
    return f;
  }

  private async loadFigure(f: CompiledFigure): Promise<Figure> {
    const url = `${this.baseUrl}${f.file.replace(/^\.?\//, '')}`;
    const img = await loadImage(url);
    const [cx, cy, cw, ch] = f.crop ?? [0, 0, img.naturalWidth, img.naturalHeight];
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, cw);
    canvas.height = Math.max(1, ch);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);
    const data = ctx.getImageData(0, 0, cw, ch).data;

    const key = f.key ? parseHex(f.key) : null;
    const tol = f.tolerance ?? 60;
    const cut = f.alphaCut ?? 16;
    const masks = [0, 1, 2].map(() => {
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      return c;
    });
    const maskData = masks.map((c) => {
      const mctx = c.getContext('2d')!;
      const id = mctx.createImageData(cw, ch);
      return { id, ctx: mctx };
    });

    let kept = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      let a = data[i + 3]!;
      if (a < cut) continue;
      if (key) {
        const d = Math.sqrt((r - key[0]) ** 2 + (g - key[1]) ** 2 + (b - key[2]) ** 2);
        if (d < tol) continue;
      }
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      let cls = 0;
      if (lum < 46) cls = 2;
      else if (sat < 0.2 || lum > 205) cls = 1;
      else cls = 0;
      const md = maskData[cls]!;
      md.id.data[i] = 255;
      md.id.data[i + 1] = 255;
      md.id.data[i + 2] = 255;
      md.id.data[i + 3] = a;
      kept++;
    }
    maskData.forEach((m) => m.ctx.putImageData(m.id, 0, 0));
    if (kept === 0) throw new Error(`figure ${f.id}: empty after keying (check key/tolerance)`);

    return new Figure(f.id, masks, f.inks.length ? f.inks : INK_ORDER, f.reg, f.offsets ?? {}, f.flip ?? false);
  }
}

/** Small preview sheet used by docs/tests: figure over a flat colour. */
export function previewFigure(fig: Figure, palette: Roles, w = 240): HTMLCanvasElement {
  const scale = w / fig.width;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = Math.round(fig.height * scale);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = palette.bg ?? '#222';
  ctx.fillRect(0, 0, c.width, c.height);
  const s = {
    ctx,
    designW: c.width,
    designH: c.height,
  } as unknown as import('../core/surface.js').Surface;
  fig.draw(s, { x: 0, y: 0, width: c.width, height: c.height, palette });
  return c;
}

export { rgba };
