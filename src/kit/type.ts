/**
 * Type as picture.
 *
 * The plate style uses three type roles: mono for the system, serif for the
 * AI, sans for the user. Keywords are drawn as printed objects: a dark
 * impression under the ink, an optional misregistered second impression, and
 * a caption band whose size never drops below the readability floor.
 */

import { rgba, type FontRole, type Roles } from '../core/palette.js';
import type { Surface } from '../core/surface.js';

export interface KeywordOptions {
  x: number;
  y: number;
  maxWidth: number;
  size: number;
  color: string;
  shadow?: string;
  shadowOffset?: number;
  misreg?: [number, number];
  misregColor?: string;
  align?: 'left' | 'center' | 'right';
  font?: FontRole;
  weight?: number;
  tracking?: number;
  /** Vertical squish, e.g. 0.92 for a heavy display look. */
  squash?: number;
  alpha?: number;
  baseline?: 'top' | 'middle' | 'alphabetic' | 'bottom';
  keyline?: string;
}

/** Draw one big word with ink order: shadow → misregistration → main. */
export function drawKeyword(s: Surface, text: string, o: KeywordOptions): number {
  const size = s.fitSize(text, o.maxWidth, {
    size: o.size,
    font: o.font ?? 'sans',
    weight: o.weight ?? 800,
    tracking: o.tracking ?? -0.02,
    minSize: 12,
  });
  const font = o.font ?? 'sans';
  const weight = o.weight ?? 800;
  const tracking = o.tracking ?? -0.02;
  const base = {
    font,
    size,
    weight,
    color: o.color,
    align: o.align ?? 'left',
    baseline: o.baseline ?? 'alphabetic',
    tracking,
    alpha: o.alpha ?? 1,
  } as const;

  const drawAt = (dx: number, dy: number, color: string, alpha = 1) => {
    s.text(text, o.x + dx, o.y + dy, { ...base, color, alpha: (o.alpha ?? 1) * alpha });
  };

  if (o.shadow) {
    const off = o.shadowOffset ?? Math.max(6, size * 0.045);
    drawAt(off, off, o.shadow, 0.9);
  }
  if (o.misreg) {
    drawAt(o.misreg[0], o.misreg[1], o.misregColor ?? o.color, 0.45);
  }
  drawAt(0, 0, o.color, 1);
  if (o.keyline) {
    s.ctx.save();
    s.ctx.font = `${weight} ${size}px ${font === 'mono' ? '"JetBrains Mono", monospace' : font === 'serif' ? '"Source Serif 4", serif' : '"Inter", sans-serif'}`;
    s.ctx.strokeStyle = o.keyline;
    s.ctx.lineWidth = Math.max(1, size * 0.012);
    s.text(text, o.x, o.y, base);
    s.ctx.restore();
  }
  return s.measure(text, { font, size, weight, tracking });
}

export interface CaptionBandOptions {
  text: string;
  y: number;
  height?: number;
  color: string;
  bg?: string;
  alpha?: number;
  size?: number;
  align?: 'left' | 'center' | 'right';
  x?: number;
  width?: number;
  /** Revealed prefix; when set, draws only this prefix. */
  reveal?: string;
  tracking?: number;
  label?: string;
  labelColor?: string;
}

/**
 * Bottom caption band. The lyric is the only text allowed to use `text(i)`;
 * here it is simply drawn at a size that is readable for its full duration.
 */
export function captionBand(s: Surface, o: CaptionBandOptions): void {
  const h = o.height ?? 96;
  const y = o.y;
  const width = o.width ?? s.designW;
  const x = o.x ?? 0;
  if (o.bg) s.rect(x, y, width, h, rgba(o.bg, o.alpha ?? 0.82));
  const size = o.size ?? 56;
  const text = o.reveal ?? o.text;
  const align = o.align ?? 'left';
  const tx = align === 'left' ? (o.x ?? 0) + 64 : align === 'right' ? (o.x ?? 0) + width - 64 : (o.x ?? 0) + width / 2;
  const ty = y + h / 2;
  s.text(text, tx, ty, {
    font: 'sans',
    size,
    weight: 600,
    color: o.color,
    align,
    baseline: 'middle',
    tracking: o.tracking ?? 0.01,
    maxWidth: width - 128,
  });
  if (o.label) {
    s.text(o.label, tx + (align === 'right' ? -width + 128 : 0), y + 22, {
      font: 'mono',
      size: 15,
      color: o.labelColor ?? o.color,
      alpha: 0.65,
      tracking: 0.08,
    });
  }
}

/** Mono label with optional rule; the workhorse for interface chrome. */
export function monoLabel(
  s: Surface,
  text: string,
  x: number,
  y: number,
  color: string,
  size = 14,
  alpha = 0.8,
  align: 'left' | 'center' | 'right' = 'left',
): void {
  s.text(text.toUpperCase(), x, y, {
    font: 'mono',
    size,
    color,
    alpha,
    tracking: 0.12,
    align,
    baseline: 'middle',
  });
}

/** Draw a string with only `n` characters visible (typewriter). */
export function typeOn(
  s: Surface,
  text: string,
  n: number,
  x: number,
  y: number,
  opts: Parameters<Surface['text']>[3] = {},
): void {
  const chars = Array.from(text);
  const shown = chars.slice(0, Math.max(0, Math.min(chars.length, Math.floor(n)))).join('');
  s.text(shown, x, y, opts);
}

/** A blinking block caret. */
export function caret(
  s: Surface,
  x: number,
  y: number,
  h: number,
  t: number,
  color: string,
  hz = 2.5,
): void {
  const on = Math.floor(t * hz * 2) % 2 === 0;
  if (on) s.rect(x, y, Math.max(2, h * 0.5), h, color);
}

/** Small number plate (chapter / plate index) in the corner. */
export function indexPlate(s: Surface, pal: Roles, text: string, x: number, y: number): void {
  s.text(text, x, y, {
    font: 'mono',
    size: 13,
    color: pal.mute ?? '#8a857b',
    tracking: 0.18,
    baseline: 'middle',
  });
}
