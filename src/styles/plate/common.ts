/**
 * Shared plate-style helpers: paper ground, figure placement, caption bands.
 */

import { hashString } from '../../core/prng.js';
import { rgba, type Roles } from '../../core/palette.js';
import { paperGround, plateShadow, offsetPrint } from '../../kit/paper.js';
import { captionBand, monoLabel } from '../../kit/type.js';
import type { SceneContext } from '../../core/scene.js';

export function palFor(c: SceneContext, name?: string | null): Roles {
  if (name && c.env.palettes[name]) return c.env.palettes[name]!;
  return c.pal;
}

export interface GroundOptions {
  pool?: number;
  poolAt?: [number, number];
  poolRadius?: number;
  marks?: boolean;
  tint?: number;
  vignette?: number;
  grain?: number;
  pal?: Roles;
}

/** Paper ground with a per-shot seed, so grain never repeats between shots. */
export function ground(c: SceneContext, o: GroundOptions = {}): Roles {
  const pal = o.pal ?? c.pal;
  paperGround(c.s, pal, {
    seed: (c.env.seed ^ hashString(c.shot.id)) >>> 0,
    pool: o.pool ?? 0.55,
    poolAt: o.poolAt,
    poolRadius: o.poolRadius,
    marks: o.marks ?? true,
    tint: o.tint,
    vignette: o.vignette ?? 0.42,
    grain: o.grain ?? 1,
  });
  return pal;
}

/** Draw a configured figure into a design-space box. */
export function figureIn(c: SceneContext, id: string, box: [number, number, number, number], pal: Roles, alpha = 1): boolean {
  const fig = c.env.assets.figure(id);
  if (!fig) return false;
  const [x, y, w, h] = box;
  const k = Math.min(w / fig.width, h / fig.height);
  const fw = fig.width * k;
  const fh = fig.height * k;
  fig.draw(c.s, {
    x: x + (w - fw) / 2,
    y: y + (h - fh) / 2,
    width: fw,
    height: fh,
    palette: pal,
    alpha,
  });
  return true;
}

/** Big caption band at the foot of the frame; returns nothing. */
export function footBand(c: SceneContext, text: string, pal: Roles, y = c.env.height - 150, size = 64): void {
  captionBand(c.s, {
    text,
    y,
    height: 150,
    color: pal.text ?? '#faf9f5',
    bg: undefined,
    size,
    label: 'LYRIC',
    labelColor: pal.mute,
    width: c.env.width,
  });
}

/** Small mono header: index + title, like a printed plate slug. */
export function slug(c: SceneContext, pal: Roles, left: string, right?: string): void {
  monoLabel(c.s, left, 64, 62, pal.sub ?? '#cfc9bc', 13, 0.75);
  if (right) monoLabel(c.s, right, c.env.width - 64, 62, pal.mute ?? '#8a857b', 12, 0.9, 'right');
  c.s.line(64, 84, c.env.width - 64, 84, { color: rgba(pal.line ?? '#4a4a45', 0.6), width: 1 });
}

/** Two-impression "broken print": the same drawing offset twice. */
export function brokenPass(c: SceneContext, offset: [number, number], color: string, draw: () => void, alpha = 0.4): void {
  offsetPrint(c.s, color, offset, draw, alpha);
}

/** Plate card edge shadow, used behind picture-message cards. */
export function cardShadow(c: SceneContext, x: number, y: number, w: number, h: number, pal: Roles, k = 16): void {
  plateShadow(c.s, x, y, w, h, pal, k);
}

/** The film's own small print, bottom-right. */
export function footer(c: SceneContext, pal: Roles, text: string): void {
  c.s.text(text, c.env.width - 64, c.env.height - 42, {
    font: 'mono',
    size: 11,
    color: pal.mute ?? '#8a857b',
    align: 'right',
    tracking: 0.12,
    alpha: 0.7,
  });
}
