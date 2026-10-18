/**
 * Shared drawing parts of the TUI style: a light desktop, a dark terminal,
 * windows with a title bar, and the lyric band that runs under everything.
 */

import { rgba, type Roles } from '../../core/palette.js';
import { clamp, smooth, type SceneContext } from '../../core/scene.js';
import type { Surface } from '../../core/surface.js';

export const UI = { w: 1280, h: 720 };

export interface TuiGroundOptions {
  pal?: Roles;
  grid?: boolean;
  vignette?: number;
}

/** Paper desktop with a faint 8 px grid, the way terminals are screenshotted. */
export function tuiGround(c: SceneContext, o: TuiGroundOptions = {}): Roles {
  const pal = o.pal ?? c.pal;
  c.s.fill(pal.paper);
  if (o.grid !== false) {
    c.s.ctx.save();
    c.s.ctx.globalAlpha = 0.16;
    for (let x = 0; x < UI.w; x += 40) c.s.line(x, 0, x, UI.h, { color: pal.line, width: 0.5 });
    for (let y = 0; y < UI.h; y += 40) c.s.line(0, y, UI.w, y, { color: pal.line, width: 0.5 });
    c.s.ctx.restore();
  }
  if (o.vignette) c.s.vignette(pal.ink, o.vignette);
  return pal;
}

/** Top status bar: an app name on the left, a right-aligned fact. */
export function tuiTopBar(c: SceneContext, pal: Roles, left: string, right: string): void {
  c.s.text(left, 32, 30, { font: 'mono', size: 11, color: pal.dim, tracking: 0.18 });
  c.s.text(right, UI.w - 32, 30, { font: 'mono', size: 11, color: pal.dim, align: 'right', tracking: 0.12 });
  c.s.line(32, 42, UI.w - 32, 42, { color: rgba(pal.line, 0.9), width: 1 });
}

/** A cream window with a title bar, traffic-light dots and a soft shadow. */
export function windowFrame(
  s: Surface,
  pal: Roles,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  opts: { status?: string; radius?: number; titleSize?: number } = {},
): void {
  const r = opts.radius ?? 10;
  s.rrect(x + 3, y + 5, w, h, r, rgba(pal.shade, 0.14));
  s.rrect(x, y, w, h, r, pal.cream, { color: rgba(pal.ink, 0.16), width: 1 });
  s.rect(x, y + 26, w, 1, rgba(pal.ink, 0.12));
  for (let i = 0; i < 3; i++) s.circle(x + 14 + i * 11, y + 13, 3.2, rgba(pal.ink, 0.24));
  s.text(title, x + 58, y + 17, { font: 'mono', size: 11, color: pal.ink, tracking: 0.04 });
  if (opts.status) {
    s.text(opts.status, x + w - 12, y + 17, { font: 'mono', size: 10, color: pal.mute, align: 'right', tracking: 0.1 });
  }
}

/** A dark terminal panel: title bar, prompt lines, typed output, caret. */
export function terminalPanel(
  c: SceneContext,
  pal: Roles,
  o: {
    x: number;
    y: number;
    w: number;
    h: number;
    title?: string;
    lines: string[];
    cps?: number;
    delay?: number;
    prompt?: string;
    accent?: string;
    fontSize?: number;
    scroll?: number;
  },
): void {
  const s = c.s;
  const fs = o.fontSize ?? 13;
  const pad = 16;
  const x = o.x;
  const y = o.y;
  s.rrect(x + 3, y + 5, o.w, o.h, 8, rgba(pal.shade, 0.35));
  s.rrect(x, y, o.w, o.h, 8, pal.slab, { color: rgba(pal.slabLine, 1), width: 1 });
  s.rect(x, y + 28, o.w, 1, pal.slabLine);
  s.text(o.title ?? 'terminal', x + 14, y + 18, { font: 'mono', size: 10, color: pal.dim, tracking: 0.14 });
  s.text('bash', x + o.w - 14, y + 18, { font: 'mono', size: 10, color: pal.dim, align: 'right' });
  const all = o.lines.join('\n');
  const cps = o.cps ?? 46;
  const shown = Math.floor(clamp((c.lt - (o.delay ?? 0.1)) * cps, 0, all.length));
  let left = shown;
  let cy = y + 52 - (o.scroll ?? 0);
  for (let i = 0; i < o.lines.length; i++) {
    const line = o.lines[i];
    if (left <= 0) break;
    const take = Math.min(line.length, left);
    const text = line.slice(0, take);
    const isPrompt = line.startsWith('$ ') || line.startsWith('> ');
    const isDim = line.startsWith('#') || line.startsWith('//');
    const isOk = / ok$/.test(line);
    s.text(text, x + pad, cy, {
      font: 'mono',
      size: fs,
      color: isPrompt ? pal.cream : isDim ? pal.dim : isOk ? pal.model7 : o.accent ?? pal.cream,
      tracking: 0.01,
    });
    if (isPrompt && take > 2) {
      const wpx = s.measure(text, { font: 'mono', size: fs });
      s.rect(x + pad + wpx + 3, cy - fs * 0.82, fs * 0.52, fs, pal.her);
    }
    left -= take + 1;
    cy += fs * 1.62;
    if (cy > y + o.h - 18) break;
  }
  if (shown >= all.length) {
    const lastY = Math.min(cy, y + o.h - 24);
    s.rect(x + pad, lastY - fs * 0.82, fs * 0.52, fs, pal.her);
  }
  // scrollbar
  s.rect(x + o.w - 5, y + 34, 2, o.h - 40, rgba(pal.slabLine, 0.9));
  s.rect(x + o.w - 5, y + 34 + (o.h - 60) * clamp((o.scroll ?? 0) / 400), 2, 36, pal.dim);
}

/** The lyric band: revealed line, karaoke rule, translation/meta line. */
export function lyricBand(c: SceneContext, pal: Roles, opts: { y?: number; height?: number; dark?: boolean } = {}): void {
  const y = opts.y ?? UI.h - 92;
  const h = opts.height ?? 92;
  const line = c.env.lyrics.lineAt(c.t);
  const dark = opts.dark ?? false;
  c.s.rect(0, y, UI.w, h, dark ? rgba('#14161c', 0.92) : rgba(pal.cream, 0.97));
  c.s.line(0, y, UI.w, y, { color: rgba(dark ? pal.cream : pal.ink, dark ? 0.12 : 0.2), width: 1 });
  if (!line) return;
  const prog = c.env.lyrics.lineProgress(line.id, c.t);
  const text = line.text;
  const shown = Array.from(text).slice(0, Math.ceil(text.length * prog)).join('');
  c.s.text(shown, 40, y + 38, { font: 'mono', size: 25, color: dark ? pal.cream : pal.ink, tracking: 0.01 });
  const ruleY = y + 58;
  const full = c.env.lyrics.duration(line.id);
  const w = clamp(full > 0 ? (c.t - line.start) / full : 0) * (UI.w - 80);
  c.s.rect(40, ruleY, UI.w - 80, 1, rgba(dark ? pal.cream : pal.ink, 0.16));
  c.s.rect(40, ruleY, Math.max(0, w), 2, pal.her);
  const meta = `${line.id.toString().padStart(2, '0')} · ${line.start.toFixed(2)}s`;
  c.s.text(meta, UI.w - 40, y + 38, { font: 'mono', size: 10, color: dark ? pal.dim : pal.mute, align: 'right', tracking: 0.1 });
}

/** Tiny caret for terminals. */
export function tuiCaret(s: Surface, x: number, y: number, color: string, size = 14, alpha = 1): void {
  s.withAlpha(alpha, () => s.rect(x, y - size * 0.8, size * 0.52, size, color));
}

/** A page heading: big sans title plus a mono kicker. */
export function heading(c: SceneContext, pal: Roles, kicker: string, title: string, x: number, y: number, size = 46): void {
  c.s.text(kicker, x, y, { font: 'mono', size: 11, color: pal.mute, tracking: 0.2 });
  c.s.text(title, x, y + size * 0.86, { font: 'sans', size, weight: 600, color: pal.ink, tracking: -0.02 });
}

/** Fade a page in by drawing a paper veil over it. */
export function veil(c: SceneContext, pal: Roles, amount: number): void {
  if (amount <= 0) return;
  c.s.rect(0, 0, UI.w, UI.h, rgba(pal.paper, smooth(clamp(amount))));
}
