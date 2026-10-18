/**
 * Plate scenes — the reproduced grammar of the reference lyric film:
 * full-frame paper plates, three inks, silhouettes, big type at the foot,
 * interface as a place the characters live, and code as the only black frame.
 *
 * Each scene is a pure function of `c.t`; params come from project.yaml.
 */

import { clamp, envelope, num, pulse, shotLine, smooth, str, strings, type SceneContext, type SceneFn } from '../../core/scene.js';
import { hashString } from '../../core/prng.js';
import { rgba, type Roles } from '../../core/palette.js';
import { drawKeyword, monoLabel, captionBand } from '../../kit/type.js';
import { drawChat, drawCursor, type ChatMessage, type SettingsRow } from '../../kit/chat.js';
import { Rng } from '../../core/prng.js';
import { brokenPass, figureIn, footer, ground, palFor, slug } from './common.js';

const W = 1920;
const H = 1080;

function keywordFoot(c: SceneContext, text: string, pal: Roles, size = 190, y = H - 130, extra: { misreg?: [number, number]; color?: string } = {}): void {
  drawKeyword(c.s, text.toUpperCase(), {
    x: 92,
    y,
    maxWidth: W - 260,
    size,
    color: extra.color ?? pal.text ?? '#faf9f5',
    shadow: pal.black ?? '#0c0b0a',
    shadowOffset: Math.max(6, size * 0.035),
    misreg: extra.misreg,
    misregColor: pal.me,
    tracking: -0.03,
  });
}

/** 1. Silent preroll: compiler warning, greyscale only, no orange. */
const boot: SceneFn = (c) => {
  const pal = ground(c, { pool: 0, marks: false, grain: 0.6 });
  if (c.t >= 0) return;
  const fade = envelope(c.t, -c.env.plan.song.preroll, -0.05, 0.4, 0.5);
  c.s.ctx.save();
  c.s.ctx.globalAlpha = fade;
  const p = c.shot.params;
  const check = str(p, 'command', 'world.ping(you);');
  monoLabel(c.s, `$ check "${check}"`, 160, 170, pal.sub ?? '#cfc9bc', 18);
  c.s.line(160, 192, W - 160, 192, { color: rgba(pal.line ?? '#4a4a45', 0.8), width: 1 });
  c.s.text('WARNING', 160, 300, { font: 'mono', size: 22, color: pal.text ?? '#faf9f5', tracking: 0.34 });
  c.s.text('this film contains flashing images', 160, 372, { font: 'serif', size: 46, color: pal.text ?? '#faf9f5' });
  const bullets = strings(p, 'bullets', [
    'rapid high-contrast cuts and strong light changes',
    'strobing plate reprints in the last third',
    'contains no real footage; every frame is code',
  ]);
  bullets.forEach((line, i) => {
    c.s.text(`— ${line}`, 160, 440 + i * 34, { font: 'mono', size: 17, color: pal.sub ?? '#cfc9bc', alpha: 0.9 });
  });
  const remaining = Math.ceil(-c.t);
  if (-c.t <= 5.2) {
    c.s.text('starting in', W - 160, 372, { font: 'mono', size: 18, color: pal.mute ?? '#8a857b', align: 'right', tracking: 0.18 });
    c.s.text(String(Math.max(1, remaining)), W - 160, 470, {
      font: 'mono',
      size: 96,
      color: pal.text ?? '#faf9f5',
      align: 'right',
      tracking: 0.02,
    });
  }
  monoLabel(c.s, 'the following film is generated entirely from code and song time', 160, H - 130, pal.mute ?? '#8a857b', 13, 0.75);
  c.s.ctx.restore();
};

/** 2. Title: the one card that introduces the film. */
const title: SceneFn = (c) => {
  const pal = ground(c, { pool: 0.8, poolAt: [W * 0.5, H * 0.44], poolRadius: W * 0.6 });
  const p = c.shot.params;
  const words = str(p, 'title', c.env.plan.meta.title);
  const reveal = clamp(c.lt / 0.9);
  const chars = Array.from(words);
  const shown = chars.slice(0, Math.ceil(chars.length * reveal)).join('');
  slug(c, pal, str(p, 'slug', 'PLATE 01 / TITLE'), 'a film by agents');
  const size = c.s.fitSize(words, W - 360, { size: num(p, 'size', 190), font: 'serif', weight: 600, tracking: -0.03 });
  c.s.text(shown, W / 2, H * 0.5, {
    font: 'serif',
    size,
    weight: 600,
    color: pal.text ?? '#faf9f5',
    align: 'center',
    baseline: 'middle',
    tracking: -0.03,
  });
  const lw = c.s.measure(shown, { font: 'serif', size, weight: 600, tracking: -0.03 });
  c.s.rect(W / 2 - lw / 2, H * 0.5 + size * 0.62, lw, 3, pal.me ?? '#d97757');
  const sub = str(p, 'subtitle', 'an agent-made music film');
  c.s.text(sub, W / 2, H * 0.5 + size * 0.62 + 62, {
    font: 'mono',
    size: 18,
    color: pal.sub ?? '#cfc9bc',
    align: 'center',
    tracking: 0.22,
    alpha: smooth(clamp((c.lt - 0.5) / 0.7)),
  });
  footer(c, pal, `${c.env.plan.meta.style} · ${c.env.plan.meta.fps}fps · every frame is code`);
};

/** 3. Interface: the chat window as the room the two live in. */
const interfaceScene: SceneFn = (c) => {
  const pal = ground(c, { pool: 0.45, marks: true });
  const p = c.shot.params;
  const layout = str(p, 'layout', 'thread');
  const win: [number, number, number, number] = [
    num(p, 'x', 300),
    num(p, 'y', 168),
    num(p, 'w', 1320),
    num(p, 'h', 760),
  ];
  const raw = (p.messages as { who?: string; text?: string; line?: number }[] | undefined) ?? [];
  const lines = c.shot.lines.map((id) => c.env.lyrics.byId(id)).filter(Boolean);
  const messages: ChatMessage[] =
    raw.length > 0
      ? raw.map((m) => ({
          who: (m.who as ChatMessage['who']) ?? 'me',
          text: m.text ?? (typeof m.line === 'number' ? c.env.lyrics.byId(m.line)?.text ?? '' : ''),
          line: m.line,
        }))
      : (lines as NonNullable<ReturnType<typeof c.env.lyrics.byId>>[]).map((line, i) => ({
          who: i % 2 === 0 ? 'you' : 'me',
          text: line.text,
          line: line.id,
        }));
  const cur = shotLine(c);
  const typingLine = cur && c.t >= cur.start && c.t < cur.start + Math.max(0.4, (cur.end - cur.start) * 0.8) ? cur : null;
  const typingProgress = typingLine ? clamp((c.t - typingLine.start) / Math.max(0.5, typingLine.end - typingLine.start)) : 1;
  let settings: SettingsRow[] | undefined;
  if (layout === 'settings') {
    settings = [
      { label: 'presence', value: 'online', kind: 'toggle', on: true },
      { label: 'memory', value: 'this conversation', kind: 'text' },
      { label: 'warmth', value: '0.72', kind: 'bar', level: 0.72 },
      { label: 'files shared', value: '281', kind: 'text' },
      { label: 'reply delay', value: '0.40 s', kind: 'text' },
    ];
  }
  const composer = layout === 'settings' ? '' : str(p, 'composer', '');
  const composerHint = str(p, 'hint', 'write to me');
  const cursorX = win[0] + win[2] * (0.42 + 0.1 * Math.sin(c.lt * 0.9));
  const cursorY = win[1] + win[3] - 44;
  const shownComposer = composer
    ? Array.from(composer)
        .slice(0, Math.max(0, Math.floor(clamp((c.lt - 0.4) / 1.2) * Array.from(composer).length)))
        .join('')
    : '';
  drawChat(c.s, {
    x: win[0],
    y: win[1],
    w: win[2],
    h: win[3],
    pal,
    t: c.t,
    ui: num(p, 'ui', 1),
    title: str(p, 'chatTitle', 'dsh — one thread'),
    subtitle: str(p, 'status', 'you · online'),
    messages,
    settings,
    composer: shownComposer || undefined,
    composerHint,
    cursor: true,
    typingProgress,
    lineStart: (id) => c.env.lyrics.byId(id)?.start ?? 0,
  });
  if (!settings) drawCursor(c.s, cursorX, cursorY, '#f3ecdd', 1.25, 1);
  slug(c, pal, str(p, 'slug', 'INTERFACE / THREAD'), `${messages.length} messages`);
  footer(c, pal, 'one conversation, one shot, every frame a function of song time');
};

/** 4. Plate: a whole-frame print. The core unit of the style. */
const plate: SceneFn = (c) => {
  const p = c.shot.params;
  const tone = str(p, 'tone', '');
  const pal = ground(c, { pool: num(p, 'pool', 0.6), pal: palFor(c, tone || null) });
  const word = str(p, 'word', 'PLATE');
  const caption = str(p, 'caption', '');
  const sub = str(p, 'sub', '');
  const numText = str(p, 'num', '07');
  const figureId = str(p, 'figure', '');
  const broken = str(p, 'print', 'clean') === 'broken';
  const misregX = num(p, 'misregX', 10);
  const misregY = num(p, 'misregY', -6);
  slug(c, pal, caption || 'PLATE', numText);
  if (figureId) {
    const box = (p.figureBox as [number, number, number, number] | undefined) ?? [W * 0.52, 110, W * 0.44, H - 300];
    const figAlpha = num(p, 'figureAlpha', 1);
    if (broken) {
      const rng = new Rng((c.env.seed ^ hashString(c.shot.id)) >>> 0);
      for (let i = 0; i < 3; i++) {
        const dx = rng.float(-8, 8) + i * misregX;
        const dy = rng.float(-5, 5) + i * misregY;
        c.s.ctx.save();
        c.s.ctx.translate(dx, dy);
        c.s.ctx.globalAlpha = 0.32;
        figureIn(c, figureId, box, pal, 1);
        c.s.ctx.restore();
      }
    }
    figureIn(c, figureId, box, pal, figAlpha);
  }
  const size = num(p, 'size', 200);
  const fitted = c.s.fitSize(word, W - 320, { size, font: 'sans', weight: 800, tracking: -0.03 });
  const keywordTop = H - 130 - fitted * 0.82;
  if (sub) {
    c.s.text(sub, 92, Math.min(H - 236, keywordTop - 28), {
      font: 'mono',
      size: 20,
      color: pal.sub ?? '#cfc9bc',
      tracking: 0.12,
      alpha: 0.9,
    });
  }
  if (broken) {
    brokenPass(c, [misregX, misregY], pal.me, () => keywordFoot(c, word, pal, size, H - 130), 0.5);
    brokenPass(c, [-misregX, misregY * 1.6], pal.sub ?? '#cfc9bc', () => keywordFoot(c, word, pal, size, H - 130), 0.28);
  }
  if (str(p, 'band', '') === 'dark') {
    c.s.rect(0, H - 210, W, 210, rgba(pal.black ?? '#0c0b0a', 0.72));
  }
  keywordFoot(c, word, pal, size, H - 130, broken ? { misreg: [misregX * 0.5, misregY * 0.5] } : {});
  footer(c, pal, str(p, 'footer', 'plate'));
};

/** 5. Figure: the silhouette print. */
const figure: SceneFn = (c) => {
  const p = c.shot.params;
  const pal = ground(c, { pool: 0.8, poolAt: [W * 0.62, H * 0.46], poolRadius: W * 0.5 });
  const id = str(p, 'figure', '');
  const box = (p.box as [number, number, number, number] | undefined) ?? [W * 0.42, 60, W * 0.56, H - 220];
  if (!id) {
    c.s.text('no figure configured', W / 2, H / 2, { font: 'mono', size: 22, color: pal.err, align: 'center' });
  } else {
    const a = smooth(clamp(c.lt / 0.45));
    figureIn(c, id, box, pal, a);
  }
  const word = str(p, 'word', '');
  const line = shotLine(c);
  const caption = line ? (c.t >= line.start ? c.env.lyrics.revealedText(line.id, c.t) : '') : '';
  if (word) keywordFoot(c, word, pal, num(p, 'size', 170), H - 120, { misreg: [num(p, 'misregX', 0), num(p, 'misregY', 0)] });
  if (caption) {
    captionBand(c.s, {
      text: caption,
      y: H - 210,
      height: 66,
      color: pal.sub ?? '#cfc9bc',
      size: 46,
      align: 'right',
      width: W,
      label: 'SUNG',
      labelColor: pal.mute,
    });
  }
  slug(c, pal, str(p, 'slug', 'FIGURE'), str(p, 'num', ''));
  footer(c, pal, str(p, 'footer', 'one silhouette, three inks, no outline'));
};

/** 6. Code: the only full-black frame. */
const code: SceneFn = (c) => {
  const p = c.shot.params;
  const pal = ground(c, { pool: 0, marks: false, grain: 0.35, pal: palFor(c, str(p, 'tone', 'dead')) });
  c.s.rect(0, 0, W, H, rgba('#0b0a09', 0.88));
  const lines = strings(p, 'lines', [
    '> while (you.presence != "online") {',
    '    love = solve(me, you);',
    '    send(love, you);',
    '    wait(you.reply);',
    '    run++;',
    '  }',
    '> say(love); // unreachable',
  ]);
  const cps = num(p, 'cps', 48);
  const startDelay = num(p, 'delay', 0.1);
  const totalChars = lines.join('\n').length;
  const shown = Math.floor(clamp((c.lt - startDelay) * cps, 0, totalChars));
  let remaining = shown;
  let y = 220;
  for (const line of lines) {
    if (remaining <= 0) break;
    const take = Math.min(line.length, remaining);
    const text = line.slice(0, take);
    const isComment = line.trim().startsWith('//') || line.includes('//');
    c.s.text(text, 160, y, {
      font: 'mono',
      size: 34,
      color: isComment ? pal.mute ?? '#8a857b' : line.startsWith('>') ? pal.me : pal.text ?? '#faf9f5',
      tracking: 0.01,
    });
    remaining -= take + 1;
    y += 48;
  }
  if (shown > 0) {
    c.s.rect(160 + c.s.measure(lines.slice(0, 1).join(''), { font: 'mono', size: 34 }), y - 32, 14, 30, pal.me);
  }
  // Odometer: run count follows the beat grid.
  const count = num(p, 'from', 281) + Math.max(0, Math.floor(c.env.clock.beatOf(c.t) - c.env.clock.beatOf(c.shot.start)) / 2);
  c.s.text(String(count).padStart(4, '0'), W - 160, H - 160, {
    font: 'mono',
    size: 190,
    color: pal.me,
    align: 'right',
    tracking: 0.02,
  });
  monoLabel(c.s, str(p, 'status', 'EXECUTION · run counter'), W - 160, H - 280, pal.mute ?? '#8a857b', 13, 0.8, 'right');
  monoLabel(c.s, 'trace 92.9%  ·  memory 281 files  ·  tools 07', 160, H - 120, pal.mute ?? '#8a857b', 13, 0.75);
  slug(c, pal, str(p, 'slug', 'CODE / EXECUTION'), str(p, 'num', ''));
};

/** 7. Count: a number struck on the beat. */
const count: SceneFn = (c) => {
  const p = c.shot.params;
  const pal = ground(c, { pool: 0.7, marks: true, pal: palFor(c, str(p, 'tone', '')) });
  const from = num(p, 'from', 1);
  const beats = c.env.clock.beatOf(c.t) - c.env.clock.beatOf(c.shot.start);
  const n = from + Math.max(0, Math.floor(beats));
  const beatPulse = pulse(c.t, c.env.clock.snap(c.t, 1), 0.24);
  const size = num(p, 'size', 520) * (1 + beatPulse * 0.03);
  const text = String(n).padStart(num(p, 'pad', 2), '0');
  c.s.text(text, W / 2, H * 0.52, {
    font: 'mono',
    size,
    color: pal.text ?? '#faf9f5',
    align: 'center',
    baseline: 'middle',
    tracking: -0.02,
  });
  const word = str(p, 'word', '');
  if (word) {
    c.s.text(word.toUpperCase(), W / 2, H - 150, {
      font: 'sans',
      size: num(p, 'wordSize', 86),
      weight: 800,
      color: pal.me,
      align: 'center',
      tracking: 0.02,
    });
  }
  slug(c, pal, str(p, 'slug', 'COUNT'), `bar ${c.env.clock.barOf(c.t).bar}`);
  footer(c, pal, str(p, 'footer', 'one number per beat'));
};

/** 8. Climax: broken reprints, ratchet light, dropped frames. */
const climax: SceneFn = (c) => {
  const p = c.shot.params;
  const pal = ground(c, { pool: 1.1, poolAt: [W * 0.5, H * 0.5], poolRadius: W * 0.65 });
  // One-way dropped-frame look: quantise time down to 12 fps.
  const step = num(p, 'drop', 12);
  const qt = Math.floor(c.t * step) / step;
  const localT = qt - c.shot.start;
  const word = str(p, 'word', 'LOOP');
  const ratchet = clamp(0.55 + (localT / Math.max(0.5, c.shot.end - c.shot.start)) * 0.6);
  const rng = new Rng((c.env.seed ^ hashString(c.shot.id) ^ Math.floor(qt * 10)) >>> 0);
  const figId = str(p, 'figure', '');
  const jitter = () => rng.float(-6, 6);
  for (let i = 0; i < 3; i++) {
    const off = [10 + i * 4 + jitter(), -18 + i * 3 + jitter()] as [number, number];
    c.s.ctx.save();
    c.s.ctx.translate(off[0], off[1]);
    c.s.ctx.globalAlpha = 0.22 + i * 0.08;
    keywordFoot(c, word, pal, num(p, 'size', 230), H - 130, { color: i === 1 ? pal.me : pal.text });
    if (figId) figureIn(c, figId, [W * 0.34, 40, W * 0.62, H - 240], pal, 0.2);
    c.s.ctx.restore();
  }
  c.s.ctx.save();
  c.s.ctx.globalAlpha = 0.92;
  keywordFoot(c, word, pal, num(p, 'size', 230), H - 130);
  if (figId) figureIn(c, figId, [W * 0.34, 40, W * 0.62, H - 240], pal, 0.95);
  c.s.ctx.restore();
  // Ratchet light: rises inside the shot, never falls on a beat.
  c.s.rect(0, 0, W, H, rgba(pal.glow ?? '#ffb37a', 0.05 * ratchet));
  // Scatter of print marks.
  for (let i = 0; i < 18; i++) {
    const x = rng.float(0, W);
    const y = rng.float(0, H);
    c.s.rect(x, y, rng.float(20, 180), rng.float(1, 3), rgba(pal.me, 0.18));
  }
  slug(c, pal, str(p, 'slug', 'CLIMAX / BROKEN PRINT'), str(p, 'num', ''));
  footer(c, pal, 'misregistration is the emotion');
};

/** 9. Outro: the plate becomes a picture message. */
const outro: SceneFn = (c) => {
  const p = c.shot.params;
  const pal = ground(c, { pool: 0.5, marks: true, pal: palFor(c, str(p, 'tone', 'ash')) });
  const word = str(p, 'word', 'UNSENT');
  const shrink = smooth(clamp(c.lt / num(p, 'shrink', 1.8)));
  const fullW = W * 0.92;
  const fullH = H * 0.78;
  const msgW = 760;
  const msgH = 520;
  const w = fullW + (msgW - fullW) * shrink;
  const h = fullH + (msgH - fullH) * shrink;
  const x = (W - w) / 2;
  const y = 120 + (H - msgH - 240 - 120) * shrink;
  // Chat behind the card, fading in as the plate shrinks.
  if (shrink > 0.2) {
    c.s.ctx.save();
    c.s.ctx.globalAlpha = (shrink - 0.2) / 0.8;
    drawChat(c.s, {
      x: 300,
      y: 120,
      w: 1320,
      h: 840,
      pal,
      t: c.t,
      title: 'dsh — last message',
      subtitle: 'you · offline',
      messages: [{ who: 'me', text: str(p, 'message', 'i left the window open.'), at: -10 }],
      composerHint: 'write to me',
      typingProgress: 1,
    });
    c.s.ctx.restore();
  }
  // Card
  c.s.rrect(x + 14, y + 18, w, h, 18, rgba('#000000', 0.55));
  c.s.rrect(x, y, w, h, 18, pal.panel ?? '#2a2a27', { color: pal.line, width: 1 });
  const innerX = x + 24;
  const innerY = y + 24;
  const innerW = w - 48;
  const innerH = h - 48;
  c.s.rect(innerX, innerY, innerW, innerH, pal.paper ?? '#222220');
  const k = Math.min(innerW / W, innerH / H);
  c.s.clipRect(innerX, innerY, innerW, innerH, () => {
    c.s.ctx.save();
    c.s.ctx.translate(innerX + (innerW - W * k) / 2, innerY + (innerH - H * k) / 2);
    c.s.ctx.scale(k, k);
    c.s.fill(pal.paper ?? '#222220');
    c.s.text(word.toUpperCase(), 92, H - 130, {
      font: 'sans',
      size: 230,
      weight: 800,
      color: pal.text ?? '#faf9f5',
      tracking: -0.03,
    });
    c.s.ctx.restore();
  });
  c.s.text('> last message: unread', innerX + 18, innerY + innerH - 20, {
    font: 'mono',
    size: 15,
    color: pal.err ?? '#f5506f',
    tracking: 0.08,
  });
  slug(c, pal, str(p, 'slug', 'OUTRO / UNSENT'), 'delivered 1 · read 0');
  footer(c, pal, 'the only clean still is the last one');
};

/** 10. Red error card, used when a scene wants the error state without errAt. */
const error: SceneFn = (c) => {
  const pal = ground(c, { pool: 0, marks: false, grain: 0.4, pal: palFor(c, 'error') });
  c.s.rect(0, 0, W, H, rgba('#120d0c', 0.86));
  const rng = new Rng((c.env.seed ^ hashString(c.shot.id)) >>> 0);
  for (let i = 0; i < 26; i++) {
    const y = rng.float(0, H);
    c.s.rect(0, y, W, rng.float(1, 3), rgba(pal.err, 0.16));
  }
  c.s.text('ERR', 160, 260, { font: 'mono', size: 150, color: pal.err, tracking: 0.04 });
  c.s.text(str(c.shot.params, 'title', 'unhandled promise rejection'), 166, 330, {
    font: 'mono',
    size: 30,
    color: pal.text,
  });
  const lines = strings(c.shot.params, 'lines', ['the assistant stopped answering', '> retry   > ignore   > restart']);
  lines.forEach((line, i) => {
    c.s.text(line, 166, 400 + i * 44, { font: 'mono', size: 20, color: i === 0 ? pal.me : pal.sub });
  });
  slug(c, pal, 'ERROR / RECOVERABLE', String(Math.round(c.t)));
};

export const plateScenes: Record<string, SceneFn> = {
  boot,
  title,
  interface: interfaceScene,
  plate,
  figure,
  code,
  count,
  climax,
  outro,
  error,
};
