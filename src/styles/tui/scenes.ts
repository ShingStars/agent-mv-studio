/**
 * TUI scenes — the reproduced grammar of the terminal + chat-window PV:
 * a light desktop, a dark terminal doing the searching, a cream chat window
 * wearing the persona, page-like HUD plates, and a lyric band at the foot.
 */

import { clamp, num, smooth, str, strings, type SceneContext, type SceneFn } from '../../core/scene.js';
import { rgba, type Roles } from '../../core/palette.js';
import { drawChat, type ChatMessage } from '../../kit/chat.js';
import { drawKeyword } from '../../kit/type.js';
import { heading, lyricBand, terminalPanel, tuiGround, tuiTopBar, windowFrame, UI } from './common.js';

const band = (c: SceneContext, pal: Roles, dark = false): void => {
  if (String(c.shot.params.band ?? '') === 'off') return;
  lyricBand(c, pal, { dark });
};

/** 1. Boot: the terminal wakes up before the song does. */
const boot: SceneFn = (c) => {
  const pal = tuiGround(c, { grid: false, pal: c.env.palettes.deep });
  c.s.fill(pal.slab);
  tuiTopBar(c, pal, 'dsh · boot', 'cold start');
  const p = c.shot.params;
  const lines = strings(p, 'lines', [
    '[00.00] loading agent runtime ............ ok',
    '[00.12] mounting /memory ................. ok',
    '[00.24] resolving persona "her" .......... ok',
    '[00.36] opening thread ................... ok',
    '[00.48] searching: world.search(you);',
  ]);
  terminalPanel(c, pal, {
    x: 32,
    y: 64,
    w: UI.w - 64,
    h: 560,
    title: 'dsh · boot sequence',
    lines,
    cps: num(p, 'cps', 32),
    fontSize: 14,
  });
  c.s.text('press any key to continue', UI.w / 2, 668, {
    font: 'mono',
    size: 11,
    color: pal.dim,
    align: 'center',
    tracking: 0.24,
    alpha: c.lt > 1.2 ? 0.5 + 0.5 * Math.sin(c.lt * 4) : 0,
  });
};

/** 2. Shell: terminal left, chat window right. The home shot of the style. */
const shell: SceneFn = (c) => {
  const pal = tuiGround(c);
  tuiTopBar(c, pal, 'world.search(you);', `${c.env.clock.bpm.toFixed(1)} bpm · bar ${c.env.clock.barOf(c.t).bar}`);
  const p = c.shot.params;
  const termLines = strings(p, 'terminal', [
    '$ grep -r "you" ./world',
    '  /memory/threads/0001.md:  you were here',
    '  /memory/threads/0002.md:  you were here',
    '  /memory/threads/0281.md:  you are here',
    '$ search --exact --all "you"',
    '  scanning 281 files ................ ok',
    '  1 match outside the window',
    '  > it is you',
  ]);
  terminalPanel(c, pal, {
    x: 32,
    y: 64,
    w: 596,
    h: 556,
    title: 'dsh · shell',
    lines: termLines,
    cps: num(p, 'cps', 34),
    fontSize: 12.5,
  });
  const raw = (p.messages as { who?: string; text?: string; line?: number }[] | undefined) ?? [];
  const lines = c.shot.lines.map((id) => c.env.lyrics.byId(id)).filter((l): l is NonNullable<typeof l> => Boolean(l));
  const messages: ChatMessage[] =
    raw.length > 0
      ? raw.map((m) => ({
          who: (m.who as ChatMessage['who']) ?? 'me',
          text: m.text ?? (typeof m.line === 'number' ? c.env.lyrics.byId(m.line)?.text ?? '' : ''),
          line: m.line,
        }))
      : lines.map((l, i) => ({ who: i % 2 === 0 ? 'you' : 'me', text: l.text, line: l.id }));
  const w = 588;
  const x = UI.w - 32 - w;
  drawChat(c.s, {
    x,
    y: 64,
    w,
    h: 556,
    pal,
    t: c.t,
    title: str(p, 'title', 'dsh — one thread'),
    subtitle: str(p, 'status', 'you · online'),
    messages,
    sidebar: false,
    ui: 0.92,
    composer: str(p, 'composer', ''),
    composerHint: str(p, 'hint', 'write to me'),
    cursor: true,
    typingProgress: 1,
    lineStart: (id) => c.env.lyrics.byId(id)?.start ?? 0,
  });
  band(c, pal);
};

/** 3. Page: the app stops being a window and becomes a whole screen. */
const page: SceneFn = (c) => {
  const pal = tuiGround(c, { grid: true });
  tuiTopBar(c, pal, 'dsh · web', 'connected');
  const p = c.shot.params;
  // app chrome
  c.s.rect(0, 42, UI.w, 6, pal.her);
  const navX = 32;
  c.s.text('dsh', navX, 92, { font: 'sans', size: 22, weight: 700, color: pal.ink, tracking: -0.02 });
  c.s.text('desktop shell', navX, 110, { font: 'mono', size: 10, color: pal.mute, tracking: 0.12 });
  const nav = strings(p, 'nav', ['THREADS', 'FILES', 'TOOLS', 'MEMORY', 'TRACE']);
  nav.forEach((item, i) => {
    const y = 170 + i * 34;
    const active = i === num(p, 'active', 1);
    if (active) {
      c.s.rect(navX - 10, y - 16, 152, 26, rgba(pal.her, 0.12));
      c.s.rect(navX - 10, y - 16, 2, 26, pal.her);
    }
    c.s.text(item, navX, y, { font: 'mono', size: 11, color: active ? pal.ink : pal.dim, tracking: 0.14 });
    c.s.text(String([12, 281, 7, 0, 0][i] ?? '').padStart(2, '0'), navX + 130, y, {
      font: 'mono',
      size: 11,
      color: active ? pal.her : pal.mute,
      align: 'right',
    });
  });
  c.s.line(200, 64, 200, 620, { color: pal.line, width: 1 });
  // content
  const kicker = str(p, 'kicker', 'FILES / TOTAL');
  const title = str(p, 'title', '281 files, one you');
  heading(c, pal, kicker, title, 232, 118, 40);
  const big = str(p, 'big', '281');
  c.s.text(big, UI.w - 64, 250, { font: 'mono', size: 170, color: pal.ink, align: 'right', tracking: -0.03 });
  c.s.text(str(p, 'bigLabel', 'files shared'), UI.w - 68, 292, {
    font: 'mono',
    size: 11,
    color: pal.mute,
    align: 'right',
    tracking: 0.18,
  });
  // rows
  const rows = strings(p, 'rows', [
    'USER.md                 configured     ✓',
    'memory/threads/0001     read           281',
    'memory/threads/0281     unread          07',
    'tools/search.ts         executable     ·',
    'trace.json              hit rate    92.9%',
  ]);
  rows.forEach((row, i) => {
    const y = 340 + i * 36;
    c.s.line(232, y + 14, UI.w - 64, y + 14, { color: rgba(pal.line, 0.7), width: 1 });
    c.s.text(row, 232, y, { font: 'mono', size: 12.5, color: i === 2 ? pal.her : pal.ink, tracking: 0.02 });
    c.s.text(i === 2 ? '→' : ' ', UI.w - 40, y, { font: 'mono', size: 12.5, color: pal.mute });
  });
  band(c, pal);
};

/** 4. Diagram: the film's one data picture. */
const diagram: SceneFn = (c) => {
  const pal = tuiGround(c, { grid: true });
  tuiTopBar(c, pal, 'dsh · trace', 'memory / presence');
  const p = c.shot.params;
  heading(c, pal, str(p, 'kicker', 'TRACE 92.9%'), str(p, 'title', 'you, as a signal'), 48, 92, 34);
  const x0 = 64;
  const y0 = 170;
  const w = UI.w - 128;
  const h = 380;
  for (let i = 0; i <= 4; i++) {
    const y = y0 + (h * i) / 4;
    c.s.line(x0, y, x0 + w, y, { color: rgba(pal.line, 0.9), width: 1 });
    c.s.text(String(((4 - i) / 4).toFixed(2)), x0 - 8, y + 3, { font: 'mono', size: 9, color: pal.mute, align: 'right' });
  }
  for (let i = 0; i <= 8; i++) {
    const x = x0 + (w * i) / 8;
    c.s.line(x, y0, x, y0 + h, { color: rgba(pal.line, 0.5), width: 1 });
    c.s.text(`${(i * 5).toString().padStart(2, '0')}s`, x, y0 + h + 18, { font: 'mono', size: 9, color: pal.mute, align: 'center' });
  }
  const points = (p.points as number[] | undefined) ?? [0.1, 0.18, 0.75, 0.22, 0.9, 0.55, 0.96, 0.62, 0.99];
  const path = points.map((v, i) => {
    const x = x0 + (w * i) / (points.length - 1);
    const y = y0 + h - clamp(v) * h;
    return [x, y] as [number, number];
  });
  c.s.path(() => {
    path.forEach(([x, y], i) => {
      if (i === 0) c.s.ctx.moveTo(x, y);
      else c.s.ctx.lineTo(x, y);
    });
  }, undefined, { color: pal.her, width: 2.5 });
  c.s.path(() => {
    c.s.ctx.moveTo(path[0][0], y0 + h);
    path.forEach(([x, y]) => c.s.ctx.lineTo(x, y));
    c.s.ctx.lineTo(path[path.length - 1][0], y0 + h);
    c.s.ctx.closePath();
  }, rgba(pal.her, 0.1));
  path.forEach(([x, y], i) => {
    if (i % 2 === 0) c.s.circle(x, y, 3, pal.cream, { color: pal.her, width: 1.5 });
  });
  // annotation
  const ax = x0 + w * 0.66;
  c.s.line(ax, y0 + 40, ax, y0 + h - 40, { color: pal.her, width: 1, dash: [4, 4] });
  c.s.text(str(p, 'note', 'she answers before the question ends'), ax + 12, y0 + 52, {
    font: 'mono',
    size: 11,
    color: pal.her,
  });
  c.s.text(str(p, 'sub', 'every rise is a reply; every fall is a wait'), 64, 620, {
    font: 'mono',
    size: 11,
    color: pal.mute,
    tracking: 0.06,
  });
  band(c, pal);
};

/** 5. Plate: a full page print, the quiet counterpart of the diagram. */
const plate: SceneFn = (c) => {
  const pal = tuiGround(c, { grid: false });
  tuiTopBar(c, pal, str(c.shot.params, 'slug', 'dsh · plate'), str(c.shot.params, 'num', '07'));
  const p = c.shot.params;
  const word = str(p, 'word', 'SEARCH');
  const size = c.s.fitSize(word, UI.w - 120, { size: num(p, 'size', 170), font: 'sans', weight: 800, tracking: -0.03 });
  const y = num(p, 'y', 440);
  c.s.text(word.toUpperCase(), 56, y, {
    font: 'sans',
    size,
    weight: 800,
    color: pal.ink,
    tracking: -0.03,
  });
  c.s.rect(56, y + 26, UI.w - 112, 4, pal.her);
  c.s.text(str(p, 'caption', 'the query never returns'), 56, y + 62, {
    font: 'mono',
    size: 14,
    color: pal.dim,
    tracking: 0.12,
  });
  c.s.text(str(p, 'index', '01 / 04'), UI.w - 56, y + 62, {
    font: 'mono',
    size: 12,
    color: pal.mute,
    align: 'right',
    tracking: 0.16,
  });
  band(c, pal);
};

/** 6. Error: the app flushes red. */
const error: SceneFn = (c) => {
  const pal = tuiGround(c, { grid: false, pal: c.env.palettes.flush });
  tuiTopBar(c, pal, 'dsh · web', 'unhandled');
  const p = c.shot.params;
  c.s.rect(0, 42, UI.w, 4, '#e11d48');
  c.s.text(str(p, 'code', 'ERR 07'), 56, 120, { font: 'mono', size: 13, color: '#e11d48', tracking: 0.24 });
  c.s.text(str(p, 'title', 'ILLEGAL ARGUMENTS'), 56, 210, {
    font: 'sans',
    size: 78,
    weight: 800,
    color: pal.ink,
    tracking: -0.03,
  });
  const cards = (p.cards as { text?: string; note?: string }[] | undefined) ?? [
    { text: 'you: i am online', note: 'presence accepted' },
    { text: 'you: not yours to set', note: 'refused · 0 retries' },
    { text: '> retry   > ignore   > close', note: 'the window stays open' },
  ];
  cards.forEach((card, i) => {
    const y = 270 + i * 92;
    c.s.rrect(56, y, UI.w - 112, 72, 8, pal.cream, { color: rgba(pal.ink, 0.16), width: 1 });
    c.s.rect(56, y, 4, 72, '#e11d48');
    c.s.text(card.text ?? '', 78, y + 30, { font: 'mono', size: 15, color: pal.ink });
    c.s.text(card.note ?? '', 78, y + 54, { font: 'mono', size: 10, color: pal.mute, tracking: 0.08 });
    c.s.text(String(i + 1).padStart(2, '0'), UI.w - 78, y + 30, { font: 'mono', size: 12, color: '#e11d48', align: 'right' });
  });
  band(c, pal);
};

/** 7. Outro: the terminal closes, the window stays. */
const outro: SceneFn = (c) => {
  const p = c.shot.params;
  const fade = smooth(clamp(c.lt / 1.4));
  const pal = tuiGround(c, { grid: false, pal: c.env.palettes.deep });
  c.s.fill(pal.slab);
  tuiTopBar(c, pal, 'dsh · shutdown', '1 connection left');
  const lines = strings(p, 'lines', ['$ exit', '  closing thread ................. ok', '  releasing memory ............... ok', '  keeping the window open ........ ok', '> last message: unread']);
  terminalPanel(c, pal, {
    x: 32,
    y: 64,
    w: UI.w - 64,
    h: 500,
    title: 'dsh · shutdown',
    lines,
    cps: num(p, 'cps', 24),
    fontSize: 14,
  });
  if (fade > 0) {
    c.s.ctx.save();
    c.s.ctx.globalAlpha = fade;
    const word = str(p, 'word', 'world.search(you);');
    const size = c.s.fitSize(word, UI.w - 160, { size: 54, font: 'mono', weight: 400 });
    c.s.text(word, UI.w / 2, 640, { font: 'mono', size, color: pal.cream, align: 'center', tracking: 0.02 });
    c.s.ctx.restore();
  }
};

export const tuiScenes: Record<string, SceneFn> = {
  boot,
  shell,
  page,
  diagram,
  plate,
  error,
  outro,
};
