/**
 * Lyrics model + LRC parser.
 *
 * Two levels of timing are supported:
 *  - line level: `[mm:ss.xx]text`
 *  - word level:  `[mm:ss.xx]<mm:ss.xx>word <mm:ss.xx>word`
 *
 * When a line has no word tags, words are spread over the line by syllable
 * weight and flagged `estimated`. The renderer never needs to know which case
 * it is looking at: it only asks for "how much of this line is sung at t".
 */

export interface Word {
  text: string;
  start: number;
  end: number;
  /** True when the time was inferred instead of measured/tagged. */
  estimated?: boolean;
  /** Display index inside the line (0-based). */
  index: number;
}

export interface LyricLine {
  id: number;
  text: string;
  start: number;
  /** Last moment this line is considered current. */
  end: number;
  words: Word[];
}

export interface LrcMeta {
  title?: string;
  artist?: string;
  offset?: number;
}

export interface ParseOptions {
  /** Minimum display time for a line, seconds. */
  minHold?: number;
  /** Maximum display time for a line, seconds. */
  maxHold?: number;
  /** Song duration, used to close the last line. */
  duration?: number;
  /** Seconds subtracted between one line's end and the next line's start. */
  gap?: number;
}

const LINE_TAG = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
const WORD_TAG = /<(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)>/g;
const META_TAG = /^\[(ar|ti|al|by|offset|length|re|ve):(.*)\]$/i;

function toSeconds(mm: string, ss: string): number {
  const sec = Number(ss.replace(':', '.'));
  return Number(mm) * 60 + sec;
}

/** Split a lyric line into tokens, attaching whitespace to the previous token. */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const re = /(\s+)|([\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af])|([\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*)|([^\s\p{L}\p{N}])/gu;
  for (const m of text.matchAll(re)) {
    if (m[1]) {
      if (tokens.length > 0) tokens[tokens.length - 1] += m[1];
      continue;
    }
    tokens.push(m[0]);
  }
  return tokens;
}

function syllableWeight(token: string): number {
  const word = token.replace(/\s+$/, '');
  if (!word) return 0;
  if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(word)) return 1;
  const vowels = word.toLowerCase().match(/[aeiouy]+/g);
  return Math.max(1, vowels ? vowels.length : 1);
}

/** Spread tokens over a line window by syllable weight. */
export function estimateWords(
  tokens: string[],
  start: number,
  end: number,
  maxHold: number,
): Word[] {
  const weights = tokens.map(syllableWeight);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let cursor = start;
  const span = Math.max(0.2, Math.min(end, start + maxHold) - start);
  return tokens.map((text, index) => {
    const dur = (weights[index]! / total) * span;
    const w: Word = { text, start: cursor, end: cursor + dur, estimated: true, index };
    cursor += dur;
    return w;
  });
}

export class Lyrics {
  readonly lines: LyricLine[];
  readonly meta: LrcMeta;

  constructor(lines: LyricLine[], meta: LrcMeta = {}) {
    this.lines = lines;
    this.meta = meta;
  }

  get lastEnd(): number {
    return this.lines.length ? this.lines[this.lines.length - 1]!.end : 0;
  }

  byId(id: number): LyricLine | undefined {
    return this.lines.find((l) => l.id === id);
  }

  require(id: number): LyricLine {
    const line = this.byId(id);
    if (!line) throw new Error(`Lyrics: no line with id ${id} (have ${this.lines.map((l) => l.id).join(', ')})`);
    return line;
  }

  lineAt(t: number): LyricLine | null {
    let found: LyricLine | null = null;
    for (const line of this.lines) {
      if (line.start <= t + 1e-6) found = line;
      else break;
    }
    return found;
  }

  /** Index of the word currently being sung; -1 before the line starts. */
  wordIndexAt(lineId: number, t: number): number {
    const line = this.require(lineId);
    let idx = -1;
    for (const w of line.words) {
      if (w.start <= t + 1e-6) idx = w.index;
      else break;
    }
    return idx;
  }

  /**
   * Word-level progress in [0, line.words.length].
   * Fractional part is the linear progress inside the current word.
   */
  wordProgress(lineId: number, t: number): number {
    const line = this.require(lineId);
    const words = line.words;
    if (words.length === 0) return 0;
    if (t <= words[0]!.start) return 0;
    for (let i = 0; i < words.length; i++) {
      const w = words[i]!;
      if (t < w.end) {
        const span = Math.max(0.001, w.end - w.start);
        return i + Math.min(1, Math.max(0, (t - w.start) / span));
      }
    }
    return words.length;
  }

  /** Character-level karaoke progress across the whole line, in [0,1]. */
  lineProgress(lineId: number, t: number): number {
    const line = this.require(lineId);
    if (line.words.length === 0) return 0;
    const wp = this.wordProgress(lineId, t);
    const chars = line.words.map((w) => Array.from(w.text).length);
    const total = chars.reduce((a, b) => a + b, 0) || 1;
    const whole = Math.floor(wp);
    let count = 0;
    for (let i = 0; i < whole && i < chars.length; i++) count += chars[i]!;
    if (whole < chars.length) count += chars[whole]! * (wp - whole);
    return Math.min(1, count / total);
  }

  /** Text of line `id` with only the words sung by `t` (whole words). */
  revealedText(lineId: number, t: number): string {
    const line = this.require(lineId);
    const idx = this.wordIndexAt(lineId, t);
    if (idx < 0) return '';
    return line.words
      .slice(0, idx + 1)
      .map((w) => w.text)
      .join('');
  }

  /** Whole line duration (for progress bars). */
  duration(lineId: number): number {
    const line = this.require(lineId);
    return Math.max(0.001, line.end - line.start);
  }
}

interface RawLine {
  time: number;
  text: string;
  words: { time: number; text: string }[];
}

export function parseLRC(source: string, opts: ParseOptions = {}): Lyrics {
  const gap = opts.gap ?? 0.04;
  const minHold = opts.minHold ?? 0.8;
  const maxHold = opts.maxHold ?? 6;
  const meta: LrcMeta = {};
  const raws: RawLine[] = [];
  let offset = 0;

  const rows = source.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (const raw of rows) {
    const row = raw.trim();
    if (!row) continue;
    const metaMatch = row.match(META_TAG);
    if (metaMatch) {
      const key = metaMatch[1]!.toLowerCase();
      const value = metaMatch[2]!.trim();
      if (key === 'offset') offset = (Number(value) || 0) / 1000;
      else if (key === 'ar') meta.artist = value;
      else if (key === 'ti') meta.title = value;
      continue;
    }
    const times: number[] = [];
    let lastIndex = 0;
    for (const m of row.matchAll(LINE_TAG)) {
      if (m.index !== lastIndex) break; // tags must be a prefix
      times.push(toSeconds(m[1]!, m[2]!));
      lastIndex = m.index + m[0].length;
    }
    if (times.length === 0) continue;
    const rest = row.slice(lastIndex).trimStart();
    if (!rest) continue;
    for (const t of times) raws.push({ time: t, text: rest, words: [] });
  }

  raws.sort((a, b) => a.time - b.time);
  // Deduplicate identical (time, text) rows.
  const dedup: RawLine[] = [];
  for (const r of raws) {
    const prev = dedup[dedup.length - 1];
    if (prev && Math.abs(prev.time - r.time) < 1e-4 && prev.text === r.text) continue;
    dedup.push(r);
  }

  const lines: LyricLine[] = [];
  for (let i = 0; i < dedup.length; i++) {
    const raw = dedup[i]!;
    const start = raw.time - offset;
    let end = opts.duration ?? raw.time - offset + maxHold;
    if (i + 1 < dedup.length) {
      const next = dedup[i + 1]!.time - offset;
      end = Math.min(next - gap, start + maxHold);
    }
    end = Math.max(start + minHold, end);

    const words: Word[] = [];
    let m: RegExpExecArray | null;
    WORD_TAG.lastIndex = 0;
    const tagged: { time: number; text: string }[] = [];
    let cursor = 0;
    while ((m = WORD_TAG.exec(raw.text))) {
      if (m.index > cursor) {
        const chunk = raw.text.slice(cursor, m.index);
        if (chunk) tagged.push({ time: toSeconds(m[1]!, m[2]!), text: chunk });
      }
      tagged.push({ time: toSeconds(m[1]!, m[2]!), text: '' });
      cursor = m.index + m[0].length;
    }
    if (cursor < raw.text.length) tagged.push({ time: NaN, text: raw.text.slice(cursor) });
    // Merge: each tag starts a segment whose text is everything until the next tag.
    const segments: { time: number; text: string }[] = [];
    for (const part of tagged) {
      if (!Number.isNaN(part.time)) segments.push({ time: part.time - offset, text: '' });
      if (part.text && segments.length > 0) segments[segments.length - 1]!.text += part.text;
    }

    if (segments.length > 0 && segments.some((s) => s.text.trim())) {
      for (let s = 0; s < segments.length; s++) {
        const seg = segments[s]!;
        const text = seg.text;
        if (!text) continue;
        const segEndRaw = s + 1 < segments.length ? segments[s + 1]!.time : end;
        const segEnd = Math.max(seg.time + 0.05, Math.min(segEndRaw, end));
        const inner = tokenize(text);
        if (inner.length === 1) {
          words.push({ text, start: seg.time, end: segEnd, index: words.length });
        } else {
          const spread = estimateWords(inner, seg.time, segEnd, 99);
          for (const w of spread) {
            w.estimated = false;
            w.index = words.length;
            words.push(w);
          }
        }
      }
    } else {
      const tokens = tokenize(raw.text);
      const est = estimateWords(tokens, start, end, maxHold);
      for (const w of est) {
        w.index = words.length;
        words.push(w);
      }
    }

    if (words.length === 0) {
      words.push({ text: raw.text, start, end, estimated: true, index: 0 });
    }
    words[words.length - 1]!.end = Math.max(words[words.length - 1]!.end, end);

    lines.push({
      id: i + 1,
      text: words.map((w) => w.text).join(''),
      start,
      end,
      words,
    });
  }

  if (lines.length === 0) throw new Error('parseLRC: no timed lines found');
  return new Lyrics(lines, meta);
}

/** Sample a smooth "is she singing" envelope for a line (0..1). */
export function lineEnergy(lyrics: Lyrics, lineId: number, t: number, attack = 0.06): number {
  const line = lyrics.require(lineId);
  if (t < line.start) return 0;
  if (t > line.end) return 0;
  const inA = Math.min(1, (t - line.start) / attack);
  return inA;
}
