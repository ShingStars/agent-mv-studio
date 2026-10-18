/**
 * A thin, design-space drawing surface on top of Canvas2D.
 *
 * Scenes draw in a fixed design coordinate system (1920×1080 for `plate`,
 * 1280×720 for `tui`). The surface scales to the actual render resolution, so
 * the same scene code produces 720p, 1080p or 4K stills.
 */

import { FONTS, type FontRole, rgba } from './palette.js';

export interface TextOptions {
  font?: FontRole;
  size?: number;
  weight?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  baseline?: 'top' | 'middle' | 'alphabetic' | 'bottom';
  tracking?: number;
  alpha?: number;
  maxWidth?: number;
  lineHeight?: number;
}

export interface StrokeOptions {
  color?: string;
  width?: number;
  dash?: number[];
  alpha?: number;
  cap?: CanvasLineCap;
}

export class Surface {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly designW: number;
  readonly designH: number;
  readonly scale: number;

  constructor(canvas: HTMLCanvasElement, designW: number, designH: number) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Surface: 2D context unavailable');
    this.canvas = canvas;
    this.ctx = ctx;
    this.designW = designW;
    this.designH = designH;
    this.scale = canvas.width / designW;
    this.reset();
  }

  /** Reset the transform, clear the canvas and set sane defaults. */
  reset(bg?: string): void {
    const { ctx, scale } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (bg) this.fill(bg);
  }

  clear(): void {
    const { ctx } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
  }

  fill(color: string): void {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.designW, this.designH);
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  strokeRect(x: number, y: number, w: number, h: number, o: StrokeOptions = {}): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = o.color ?? '#ffffff';
    ctx.lineWidth = o.width ?? 1;
    ctx.globalAlpha = o.alpha ?? 1;
    if (o.dash && o.dash.length) ctx.setLineDash(o.dash);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  rrect(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fill?: string,
    stroke?: StrokeOptions,
  ): void {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    this.roundRectPath(x, y, w, h, r);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke.color ?? '#ffffff';
      ctx.lineWidth = stroke.width ?? 1;
      ctx.globalAlpha = stroke.alpha ?? 1;
      if (stroke.dash && stroke.dash.length) ctx.setLineDash(stroke.dash);
      ctx.stroke();
    }
    ctx.restore();
  }

  roundRectPath(x: number, y: number, w: number, h: number, r: number): void {
    const { ctx } = this;
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  line(x1: number, y1: number, x2: number, y2: number, o: StrokeOptions = {}): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = o.color ?? '#ffffff';
    ctx.lineWidth = o.width ?? 1;
    ctx.globalAlpha = o.alpha ?? 1;
    ctx.lineCap = o.cap ?? 'butt';
    if (o.dash && o.dash.length) ctx.setLineDash(o.dash);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  circle(cx: number, cy: number, r: number, fill?: string, stroke?: StrokeOptions): void {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(0, r), 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke.color ?? '#ffffff';
      ctx.lineWidth = stroke.width ?? 1;
      ctx.globalAlpha = stroke.alpha ?? 1;
      if (stroke.dash && stroke.dash.length) ctx.setLineDash(stroke.dash);
      ctx.stroke();
    }
    ctx.restore();
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, fill?: string, rotation = 0): void {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rotation, 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.restore();
  }

  polygon(points: [number, number][], fill?: string, stroke?: StrokeOptions): void {
    if (points.length < 2) return;
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0]![0], points[0]![1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]![0], points[i]![1]);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke.color ?? '#ffffff';
      ctx.lineWidth = stroke.width ?? 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Path built by a callback (call ctx.beginPath yourself inside). */
  path(draw: (ctx: CanvasRenderingContext2D) => void, fill?: string, stroke?: StrokeOptions): void {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    draw(ctx);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke.color ?? '#ffffff';
      ctx.lineWidth = stroke.width ?? 1;
      if (stroke.dash && stroke.dash.length) ctx.setLineDash(stroke.dash);
      ctx.stroke();
    }
    ctx.restore();
  }

  text(str: string, x: number, y: number, o: TextOptions = {}): number {
    const { ctx } = this;
    const size = o.size ?? 24;
    const weight = o.weight ?? 400;
    ctx.save();
    ctx.font = `${weight} ${size}px ${FONTS[o.font ?? 'sans']}`;
    ctx.fillStyle = o.color ?? '#ffffff';
    ctx.textAlign = o.align ?? 'left';
    ctx.textBaseline = o.baseline ?? 'alphabetic';
    ctx.globalAlpha = o.alpha ?? 1;
    const ls = o.tracking ?? 0;
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${ls}px`;
    const width = ctx.measureText(str).width;
    if (o.maxWidth && width > o.maxWidth) {
      ctx.fillText(str, x, y, o.maxWidth);
    } else {
      ctx.fillText(str, x, y);
    }
    ctx.restore();
    return width;
  }

  /** Multi-line block with fixed line height. */
  paragraph(
    lines: string[],
    x: number,
    y: number,
    o: TextOptions & { lineHeight?: number } = {},
  ): void {
    const lh = o.lineHeight ?? (o.size ?? 24) * 1.35;
    lines.forEach((line, i) => this.text(line, x, y + i * lh, o));
  }

  /** Word-wrapped paragraph, returns the number of lines drawn. */
  wrap(
    str: string,
    x: number,
    y: number,
    maxWidth: number,
    o: TextOptions & { lineHeight?: number } = {},
  ): number {
    const words = str.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (this.measure(test, o) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    this.paragraph(lines, x, y, o);
    return lines.length;
  }

  measure(str: string, o: TextOptions = {}): number {
    const { ctx } = this;
    const size = o.size ?? 24;
    const weight = o.weight ?? 400;
    const prevFont = ctx.font;
    ctx.font = `${weight} ${size}px ${FONTS[o.font ?? 'sans']}`;
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${o.tracking ?? 0}px`;
    const w = ctx.measureText(str).width;
    ctx.font = prevFont;
    return w;
  }

  /** Largest font size ≤ `size` that fits `str` into `maxWidth`. */
  fitSize(
    str: string,
    maxWidth: number,
    o: TextOptions & { size: number; minSize?: number },
  ): number {
    let size = o.size;
    const min = o.minSize ?? 8;
    while (size > min && this.measure(str, { ...o, size }) > maxWidth) size -= 2;
    return size;
  }

  clipRect(x: number, y: number, w: number, h: number, draw: () => void): void {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    draw();
    ctx.restore();
  }

  /** Draw with a group alpha. */
  withAlpha(alpha: number, draw: () => void): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    draw();
    ctx.restore();
  }

  radial(cx: number, cy: number, r0: number, r1: number, stops: [number, string][]): void {
    const { ctx } = this;
    const g = ctx.createRadialGradient(cx, cy, Math.max(0, r0), cx, cy, Math.max(r0 + 0.01, r1));
    for (const [at, color] of stops) g.addColorStop(Math.max(0, Math.min(1, at)), color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.designW, this.designH);
  }

  linear(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    stops: [number, string][],
    rect: [number, number, number, number],
  ): void {
    const { ctx } = this;
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [at, color] of stops) g.addColorStop(Math.max(0, Math.min(1, at)), color);
    ctx.fillStyle = g;
    ctx.fillRect(rect[0], rect[1], rect[2], rect[3]);
  }

  image(img: CanvasImageSource, x: number, y: number, w?: number, h?: number, alpha = 1): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (w === undefined || h === undefined) ctx.drawImage(img, x, y);
    else ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  }

  /** Subtle translucent scrim rectangle, used to seat text on busy art. */
  scrim(x: number, y: number, w: number, h: number, color: string, alpha = 0.72): void {
    this.rect(x, y, w, h, rgba(color, alpha));
  }

  /** A soft vignette (draws nothing outside `strength` 0..1). */
  vignette(color: string, strength = 0.4): void {
    const { ctx } = this;
    const grd = ctx.createRadialGradient(
      this.designW / 2,
      this.designH / 2,
      Math.min(this.designW, this.designH) * 0.35,
      this.designW / 2,
      this.designH / 2,
      Math.max(this.designW, this.designH) * 0.72,
    );
    grd.addColorStop(0, rgba(color, 0));
    grd.addColorStop(1, rgba(color, strength));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, this.designW, this.designH);
  }
}

/** Create an offscreen surface (for layers, textures, masks). */
export function makeSurface(w: number, h: number, designW = w, designH = h): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return new Surface(canvas, designW, designH);
}
