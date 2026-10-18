/**
 * The chat client (plate style): a code-drawn interface where the film's
 * "me" and "you" actually talk.
 *
 * Everything is drawn from the palette; no screenshots, no UI kit. The window
 * is deliberately matte and low-glow so full-frame plates can out-shout it.
 */

import { rgba, type Roles } from '../core/palette.js';
import type { Surface } from '../core/surface.js';

export interface ChatMessage {
  who: 'you' | 'me' | 'sys';
  text: string;
  /** Absolute song time at which the message appears. */
  at?: number;
  /** Alternatively: lyric line id; message appears when that line starts. */
  line?: number;
  /** Draw a typing indicator instead of the text until `at + typing`. */
  typing?: boolean;
}

export interface ChatOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  pal: Roles;
  t: number;
  title?: string;
  subtitle?: string;
  messages: ChatMessage[];
  composer?: string;
  composerHint?: string;
  cursor?: boolean;
  sidebar?: boolean;
  /** Show the settings drawer instead of the thread. */
  settings?: SettingsRow[];
  /** Scale factor for text (1 = design size). */
  ui?: number;
  /** Reveal progress for the last AI message, 0..1. */
  typingProgress?: number;
  /** Resolution of line id → start time (for `line` messages). */
  lineStart?: (id: number) => number;
  /** Dim the whole window (used when a plate is entering). */
  alpha?: number;
  /** Remove the window chrome for extreme close-ups. */
  bare?: boolean;
}

export interface SettingsRow {
  label: string;
  value: string;
  kind?: 'toggle' | 'text' | 'bar';
  on?: boolean;
  /** 0..1 fill for bars. */
  level?: number;
  at?: number;
}

const SIDEBAR_W = 264;
const HEADER_H = 52;

function wrapLines(s: Surface, text: string, maxWidth: number, size: number, font: 'serif' | 'sans'): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (s.measure(test, { font, size }) > maxWidth && current) {
      out.push(current);
      current = word;
    } else current = test;
  }
  if (current) out.push(current);
  return out.length ? out : [''];
}

function msgTime(m: ChatMessage, o: ChatOptions): number {
  if (typeof m.at === 'number') return m.at;
  if (typeof m.line === 'number' && o.lineStart) return o.lineStart(m.line);
  return 0;
}

/** Draw the whole window. Returns the y of the composer (for overlays). */
export function drawChat(s: Surface, o: ChatOptions): number {
  const { pal } = o;
  const ui = o.ui ?? 1;
  const alpha = o.alpha ?? 1;
  const { x, y, w, h } = o;
  const sidebarW = o.sidebar === false ? 0 : SIDEBAR_W;
  const ctx = s.ctx;
  ctx.save();
  ctx.globalAlpha = alpha;

  // seat
  s.rect(x + 18, y + 20, w, h, rgba(pal.shade ?? '#000000', 0.55));
  s.rrect(x, y, w, h, 10, pal.panel ?? '#2a2a27', { color: pal.line ?? '#4a4a45', width: 1 });

  if (!o.bare) {
    // header
    s.rect(x, y, w, HEADER_H, rgba(pal.raised ?? '#333330', 0.65));
    s.line(x, y + HEADER_H, x + w, y + HEADER_H, { color: pal.line ?? '#4a4a45', width: 1 });
    for (let i = 0; i < 3; i++) {
      s.circle(x + 22 + i * 16, y + HEADER_H / 2, 4.2, i === 0 ? pal.me : pal.mute, { color: pal.line, width: 0.8 });
    }
    s.text(o.title ?? 'dsh — thread', x + 86, y + HEADER_H / 2 + 1, {
      font: 'mono',
      size: 14 * ui,
      color: pal.sub ?? '#cfc9bc',
      baseline: 'middle',
      tracking: 0.04,
    });
    if (o.subtitle) {
      s.text(o.subtitle, x + w - 22, y + HEADER_H / 2 + 1, {
        font: 'mono',
        size: 12 * ui,
        color: pal.mute,
        align: 'right',
        baseline: 'middle',
        tracking: 0.1,
      });
    }
  }

  const bodyY = y + (o.bare ? 0 : HEADER_H);
  const bodyH = h - (o.bare ? 0 : HEADER_H);

  if (sidebarW && !o.bare) drawSidebar(s, x, bodyY, sidebarW, bodyH, pal, ui);

  const threadX = x + sidebarW + 34 * ui;
  const threadW = w - sidebarW - 68 * ui;
  if (o.settings) {
    drawSettings(s, threadX, bodyY + 28, threadW, bodyH - 56, pal, o.settings, o.t, ui);
  } else {
    drawThread(s, {
      x: threadX,
      y: bodyY,
      w: threadW,
      h: bodyH,
      pal,
      t: o.t,
      ui,
      messages: o.messages,
      lineStart: o.lineStart,
      typingProgress: o.typingProgress ?? 1,
      composer: o.composer,
      composerHint: o.composerHint,
      cursor: o.cursor ?? true,
    });
  }

  ctx.restore();
  return y + h;
}

function drawSidebar(s: Surface, x: number, y: number, w: number, h: number, pal: Roles, ui: number): void {
  s.rect(x, y, w, h, rgba(pal.bg ?? '#222220', 0.5));
  s.line(x + w, y, x + w, y + h, { color: pal.line ?? '#4a4a45', width: 1 });
  const pad = 22 * ui;
  s.text('dsh', x + pad, y + 46 * ui, {
    font: 'serif',
    size: 30 * ui,
    weight: 600,
    color: pal.text ?? '#faf9f5',
    tracking: -0.02,
  });
  s.text('desktop shell', x + pad, y + 66 * ui, {
    font: 'mono',
    size: 10 * ui,
    color: pal.mute,
    tracking: 0.14,
  });
  const items: [string, string, boolean][] = [
    ['THREADS', '12', true],
    ['FILES', '281', false],
    ['TOOLS', '07', false],
    ['MEMORY', 'USER.md', false],
    ['TRACE', '92.9%', false],
  ];
  let iy = y + 116 * ui;
  for (const [label, count, active] of items) {
    if (active) s.rect(x + 10 * ui, iy - 13 * ui, w - 20 * ui, 26 * ui, rgba(pal.me ?? '#d97757', 0.12));
    if (active) s.rect(x + 10 * ui, iy - 13 * ui, 3, 26 * ui, pal.me ?? '#d97757');
    s.text(label, x + pad, iy, {
      font: 'mono',
      size: 12 * ui,
      color: active ? pal.text : pal.mute,
      baseline: 'middle',
      tracking: 0.1,
    });
    s.text(count, x + w - pad, iy, {
      font: 'mono',
      size: 11 * ui,
      color: active ? pal.me : pal.mute,
      align: 'right',
      baseline: 'middle',
    });
    iy += 34 * ui;
  }
  // footer
  s.line(x + pad, y + h - 74 * ui, x + w - pad, y + h - 74 * ui, { color: pal.line, width: 1, alpha: 0.6 });
  s.circle(x + pad + 10 * ui, y + h - 44 * ui, 12 * ui, pal.me);
  s.text('you', x + pad + 30 * ui, y + h - 44 * ui, {
    font: 'sans',
    size: 13 * ui,
    weight: 600,
    color: pal.text,
    baseline: 'middle',
  });
  s.text('online', x + w - pad, y + h - 44 * ui, {
    font: 'mono',
    size: 10 * ui,
    color: pal.me,
    align: 'right',
    baseline: 'middle',
  });
}

interface ThreadOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  pal: Roles;
  t: number;
  ui: number;
  messages: ChatMessage[];
  lineStart?: (id: number) => number;
  typingProgress: number;
  composer?: string;
  composerHint?: string;
  cursor: boolean;
}

function drawThread(s: Surface, o: ThreadOptions): void {
  const pad = 8;
  const composerH = 58 * o.ui;
  const composerY = o.y + o.h - composerH - 26 * o.ui;
  const maxY = composerY - 24 * o.ui;

  // Collect visible messages with heights.
  const blocks: { m: ChatMessage; lines: string[]; size: number; font: 'serif' | 'sans'; h: number; at: number }[] = [];
  for (const m of o.messages) {
    const at = msgTime(m, { ...o, x: 0, y: 0, w: 0, h: 0 } as ChatOptions);
    if (at > o.t + 1e-4) continue;
    const isMe = m.who === 'me';
    const size = (isMe ? 25 : 22) * o.ui;
    const font: 'serif' | 'sans' = isMe ? 'serif' : 'sans';
    const maxW = isMe ? o.w * 0.82 : o.w * 0.7;
    const lines = wrapLines(s, m.text, maxW, size, font);
    const lineH = size * 1.32;
    const h = m.who === 'sys' ? 34 * o.ui : lines.length * lineH + 30 * o.ui;
    blocks.push({ m, lines, size, font, h, at });
  }

  // Keep the last blocks that fit; scroll up when overflowing.
  let total = 0;
  let first = 0;
  for (let i = blocks.length - 1; i >= 0; i--) {
    total += blocks[i]!.h;
    if (total > maxY - o.y - 30 * o.ui) {
      first = i + 1;
      break;
    }
  }
  let cy = o.y + 34 * o.ui;
  for (let i = first; i < blocks.length; i++) {
    const b = blocks[i]!;
    const recent = i === blocks.length - 1;
    if (b.m.who === 'sys') {
      s.text(b.m.text, o.x + o.w / 2, cy + 12 * o.ui, {
        font: 'mono',
        size: 11 * o.ui,
        color: o.pal.mute,
        align: 'center',
        baseline: 'middle',
        tracking: 0.12,
      });
      cy += b.h;
      continue;
    }
    if (b.m.who === 'me') {
      s.circle(o.x + 10 * o.ui, cy + 14 * o.ui, 11 * o.ui, o.pal.me, {
        color: o.pal.bg,
        width: 2,
      });
      s.text('me', o.x + 30 * o.ui, cy + 10 * o.ui, {
        font: 'mono',
        size: 10 * o.ui,
        color: o.pal.me,
        tracking: 0.16,
        baseline: 'middle',
      });
      const textX = o.x + 30 * o.ui;
      let shown = b.lines;
      if (recent && b.m.typing) {
        const r = Math.max(0, Math.min(1, o.typingProgress));
        const all = b.lines.join(' ');
        const n = Math.ceil(all.length * r);
        shown = wrapLines(s, all.slice(0, n), o.w * 0.82, b.size, b.font);
      }
      shown.forEach((line, li) => {
        s.text(line, textX, cy + 38 * o.ui + li * b.size * 1.32, {
          font: 'serif',
          size: b.size,
          color: o.pal.text,
          weight: 400,
        });
      });
      if (recent && b.m.typing) {
        const lastLine = shown[shown.length - 1] ?? '';
        const lw = s.measure(lastLine, { font: 'serif', size: b.size });
        s.rect(textX + lw + 4, cy + 38 * o.ui + (shown.length - 1) * b.size * 1.32 - b.size * 0.85, b.size * 0.45, b.size, o.pal.me);
      }
    } else {
      // user: right-aligned cream bubble with dark text
      const bubbleX = o.x + o.w - 30 * o.ui;
      const bw = Math.min(o.w * 0.7, Math.max(...b.lines.map((l) => s.measure(l, { font: b.font, size: b.size }))) + 34 * o.ui);
      const bh = b.lines.length * b.size * 1.32 + 26 * o.ui;
      const bx = bubbleX - bw;
      s.rrect(bx, cy, bw, bh, 10 * o.ui, o.pal.bubble ?? o.pal.text, { color: rgba(o.pal.bg, 0.9), width: 1 });
      b.lines.forEach((line, li) => {
        s.text(line, bx + 17 * o.ui, cy + 16 * o.ui + li * b.size * 1.32, {
          font: 'sans',
          size: b.size,
          color: o.pal.bubbleInk ?? o.pal.bg,
          weight: 500,
        });
      });
      s.text('you', bubbleX, cy - 8 * o.ui, {
        font: 'mono',
        size: 10 * o.ui,
        color: o.pal.sub,
        align: 'right',
        tracking: 0.16,
      });
    }
    cy += b.h;
  }

  // composer
  s.rrect(o.x, composerY, o.w, composerH, 8 * o.ui, rgba(o.pal.bg ?? '#222220', 0.6), {
    color: o.pal.line,
    width: 1,
  });
  s.text('›', o.x + 16 * o.ui, composerY + composerH / 2, {
    font: 'mono',
    size: 20 * o.ui,
    color: o.pal.me,
    baseline: 'middle',
  });
  const draft = o.composer ?? o.composerHint ?? '';
  s.text(draft, o.x + 42 * o.ui, composerY + composerH / 2, {
    font: 'mono',
    size: 17 * o.ui,
    color: o.composer ? o.pal.text : o.pal.mute,
    baseline: 'middle',
    alpha: o.composer ? 1 : 0.75,
  });
  if (o.cursor) {
    const cw = o.composer ? s.measure(draft, { font: 'mono', size: 17 * o.ui }) : 0;
    s.rect(o.x + 44 * o.ui + cw, composerY + composerH / 2 - 10 * o.ui, 8 * o.ui, 20 * o.ui, o.pal.me);
  }
  s.text('enter to send   ·   / for commands', o.x + o.w, composerY + composerH + 16 * o.ui, {
    font: 'mono',
    size: 10 * o.ui,
    color: o.pal.mute,
    align: 'right',
    tracking: 0.08,
    alpha: 0.8,
  });
}

function drawSettings(
  s: Surface,
  x: number,
  y: number,
  w: number,
  h: number,
  pal: Roles,
  rows: SettingsRow[],
  t: number,
  ui: number,
): void {
  s.text('SETTINGS', x, y, {
    font: 'mono',
    size: 12 * ui,
    color: pal.mute,
    tracking: 0.2,
  });
  s.line(x, y + 12 * ui, x + w, y + 12 * ui, { color: pal.line, width: 1, alpha: 0.6 });
  let ry = y + 54 * ui;
  for (const row of rows) {
    if (typeof row.at === 'number' && t < row.at) break;
    s.text(row.label, x, ry, {
      font: 'sans',
      size: 20 * ui,
      color: pal.text,
      baseline: 'middle',
    });
    if (row.kind === 'toggle' || row.kind === undefined) {
      const on = row.on ?? true;
      s.rrect(x + w - 54 * ui, ry - 12 * ui, 44 * ui, 24 * ui, 12 * ui, on ? pal.me : pal.raised, {
        color: pal.line,
        width: 1,
      });
      s.circle(x + w - (on ? 32 : 54) * ui, ry, 9 * ui, on ? pal.bg : pal.mute);
    } else if (row.kind === 'bar') {
      const bw = 220 * ui;
      s.rect(x + w - bw, ry - 4 * ui, bw, 8 * ui, rgba(pal.mute, 0.35));
      s.rect(x + w - bw, ry - 4 * ui, bw * Math.max(0, Math.min(1, row.level ?? 0.5)), 8 * ui, pal.me);
    }
    s.text(row.value, x + w, ry, {
      font: 'mono',
      size: 13 * ui,
      color: pal.sub,
      align: 'right',
      baseline: 'middle',
      tracking: 0.06,
    });
    // value on the left of the control for text rows
    if (row.kind === 'text') {
      s.text(row.value, x + w - 210 * ui, ry, {
        font: 'mono',
        size: 14 * ui,
        color: pal.me,
        align: 'right',
        baseline: 'middle',
      });
      s.text('', x + w, ry, { font: 'mono', size: 1, color: pal.sub });
    }
    s.line(x, ry + 26 * ui, x + w, ry + 26 * ui, { color: pal.line, width: 1, alpha: 0.35 });
    ry += 62 * ui;
  }
  s.text('changes apply immediately', x, ry + 6 * ui, {
    font: 'mono',
    size: 10 * ui,
    color: pal.mute,
    tracking: 0.1,
    alpha: 0.7,
  });
}

/** Classic arrow cursor, size in design units. */
export function drawCursor(s: Surface, x: number, y: number, color: string, scale = 1, alpha = 1): void {
  const p: [number, number][] = [
    [0, 0],
    [0, 24],
    [6.5, 18],
    [10.5, 27],
    [14, 25.5],
    [10, 16.5],
    [17, 15.5],
  ];
  s.polygon(
    p.map(([px, py]) => [x + px * scale, y + py * scale]),
    color,
    { color: rgba('#000000', 0.5 * alpha), width: 1 },
  );
}

/** A chat-style "picture message" card (used by the outro). */
export function drawPictureMessage(
  s: Surface,
  x: number,
  y: number,
  w: number,
  h: number,
  pal: Roles,
  inner: (ix: number, iy: number, iw: number, ih: number) => void,
): void {
  s.rrect(x + 12, y + 14, w, h, 14, rgba(pal.shade ?? '#000000', 0.5));
  s.rrect(x, y, w, h, 14, pal.raised, { color: pal.line, width: 1 });
  s.clipRect(x + 8, y + 8, w - 16, h - 16, () => inner(x + 8, y + 8, w - 16, h - 16));
}
