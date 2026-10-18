/**
 * Paper: the "background is never a flat colour" layer.
 *
 * The texture is generated once per (size, seed) from a deterministic PRNG and
 * cached. It is palette-independent (a grey alpha overlay), so switching
 * palette states does not invalidate it.
 */

import { Rng } from '../core/prng.js';
import { rgba, type Roles } from '../core/palette.js';
import type { Surface } from '../core/surface.js';

const cache = new Map<string, HTMLCanvasElement>();

/** Grey grain + dot screen + fibres, transparent. */
export function paperTexture(w: number, h: number, seed: number): HTMLCanvasElement {
  const key = `${w}x${h}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const rng = new Rng(seed);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const coarse = rng.float(0, 1) * 0.5 + rng.float(0, 1) * 0.5;
      const fine = rng.float(0, 1);
      const dot = x % 4 === 0 && y % 4 === 0 ? 1 : 0;
      const v = coarse * 16 + fine * 6 + dot * 26;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(70, v);
    }
  }
  ctx.putImageData(img, 0, 0);
  // long fibres
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = '#ffffff';
  for (let i = 0; i < 46; i++) {
    const x = rng.float(0, w);
    const y = rng.float(0, h);
    const len = rng.float(20, 120);
    const ang = rng.float(-0.35, 0.35);
    ctx.lineWidth = rng.float(0.4, 1.1);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  cache.set(key, c);
  return c;
}

export interface PaperOptions {
  seed: number;
  /** Strength of the local light pool behind the subject (0 disables). */
  pool?: number;
  /** Pool centre in design units. */
  poolAt?: [number, number];
  poolRadius?: number;
  /** Vignette strength. */
  vignette?: number;
  /** Draw crop/registration marks. */
  marks?: boolean;
  /** Grain multiplier. */
  grain?: number;
  /** Optional extra warm tint over the paper. */
  tint?: number;
}

/** Paint the full-frame paper ground for the plate style. */
export function paperGround(s: Surface, pal: Roles, o: PaperOptions): void {
  s.fill(pal.bg ?? '#222220');
  const tex = paperTexture(Math.round(s.designW / 2), Math.round(s.designH / 2), o.seed);
  s.ctx.save();
  s.ctx.globalAlpha = (o.grain ?? 1) * 0.55;
  s.ctx.drawImage(tex, 0, 0, s.designW, s.designH);
  s.ctx.restore();

  const pool = o.pool ?? 0.55;
  if (pool > 0) {
    const [cx, cy] = o.poolAt ?? [s.designW * 0.5, s.designH * 0.46];
    const r = o.poolRadius ?? s.designW * 0.52;
    s.radial(cx, cy, 0, r, [
      [0, rgba(pal.glow ?? '#ffb37a', 0.1 * pool)],
      [0.45, rgba(pal.bloom ?? '#3a2f28', 0.35 * pool)],
      [1, rgba(pal.bg ?? '#222220', 0)],
    ]);
  }
  if (o.tint) {
    s.rect(0, 0, s.designW, s.designH, rgba(pal.me ?? '#d97757', o.tint * 0.08));
  }
  s.vignette(pal.black ?? '#000000', o.vignette ?? 0.42);
  if (o.marks ?? true) cropMarks(s, pal);
}

/** Small printer's registration/crop ticks in the four corners. */
export function cropMarks(s: Surface, pal: Roles): void {
  const m = 44;
  const len = 18;
  const color = rgba(pal.mute ?? '#8a857b', 0.55);
  const corners: [number, number, number, number][] = [
    [m, m, 1, 1],
    [s.designW - m, m, -1, 1],
    [m, s.designH - m, 1, -1],
    [s.designW - m, s.designH - m, -1, -1],
  ];
  for (const [x, y, sx, sy] of corners) {
    s.line(x, y, x + len * sx, y, { color, width: 1 });
    s.line(x, y, x, y + len * sy, { color, width: 1 });
    s.circle(x, y, 1.6, color);
  }
  // top/bottom centre marks
  for (const [x, y] of [
    [s.designW / 2, m],
    [s.designW / 2, s.designH - m],
  ] as [number, number][]) {
    s.line(x - 8, y, x + 8, y, { color, width: 1 });
  }
}

/** A slightly rotated print "plate edge" shadow, used behind plates/cards. */
export function plateShadow(
  s: Surface,
  x: number,
  y: number,
  w: number,
  h: number,
  pal: Roles,
  offset = 18,
): void {
  s.rect(x + offset, y + offset, w, h, rgba(pal.shade ?? '#000000', 0.5));
}

/** Draw a torn / misregistered second impression of a shape. */
export function offsetPrint(
  s: Surface,
  color: string,
  offset: [number, number],
  draw: () => void,
  alpha = 0.5,
): void {
  s.ctx.save();
  s.ctx.translate(offset[0], offset[1]);
  s.ctx.globalAlpha = alpha;
  s.ctx.globalCompositeOperation = 'multiply';
  s.ctx.fillStyle = color;
  s.ctx.strokeStyle = color;
  draw();
  s.ctx.restore();
}
