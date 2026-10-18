/**
 * Time model.
 *
 * The whole studio speaks in beats and bars first, seconds second. A `Clock`
 * can either be purely metronomic (bpm + first beat) or follow a measured beat
 * table extracted from the audio (piecewise linear between measured beats).
 *
 * `TimeRef` is the only vocabulary a storyboard is allowed to use for time.
 */

export interface ClockOptions {
  /** Tempo in beats per minute. */
  bpm: number;
  /** Song time (seconds) of beat 0. */
  firstBeat: number;
  beatsPerBar?: number;
  /** Optional measured beat positions (seconds), index = beat number. */
  beatTimes?: number[];
}

export class Clock {
  readonly bpm: number;
  readonly firstBeat: number;
  readonly beatsPerBar: number;
  readonly beatTimes?: number[];

  constructor(opts: ClockOptions) {
    if (!(opts.bpm > 0)) throw new Error(`Clock: invalid bpm ${opts.bpm}`);
    this.bpm = opts.bpm;
    this.firstBeat = opts.firstBeat;
    this.beatsPerBar = opts.beatsPerBar ?? 4;
    this.beatTimes = opts.beatTimes && opts.beatTimes.length > 1 ? opts.beatTimes.slice() : undefined;
  }

  /** Seconds per beat (nominal). */
  get spb(): number {
    return 60 / this.bpm;
  }

  /** Song time of beat `n` (fractional beats allowed). */
  beat(n: number): number {
    const bt = this.beatTimes;
    if (!bt) return this.firstBeat + n * this.spb;
    if (n <= 0) return bt[0]! + n * (bt[1]! - bt[0]!);
    const last = bt.length - 1;
    if (n >= last) return bt[last]! + (n - last) * (bt[last]! - bt[last - 1]!);
    const i = Math.floor(n);
    const frac = n - i;
    return bt[i]! + (bt[i + 1]! - bt[i]!) * frac;
  }

  /** Song time of bar `bar`, beat `beat` (both zero-based; beat may be fractional). */
  bar(bar: number, beat = 0): number {
    return this.beat(bar * this.beatsPerBar + beat);
  }

  /** Fractional beat position of song time `t`. */
  beatOf(t: number): number {
    const bt = this.beatTimes;
    if (!bt) return (t - this.firstBeat) / this.spb;
    if (t <= bt[0]!) return (t - bt[0]!) / (bt[1]! - bt[0]!);
    const last = bt.length - 1;
    if (t >= bt[last]!) return last + (t - bt[last]!) / (bt[last]! - bt[last - 1]!);
    let lo = 0;
    let hi = last;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (bt[mid]! <= t) lo = mid;
      else hi = mid;
    }
    return lo + (t - bt[lo]!) / (bt[hi]! - bt[lo]!);
  }

  /** Zero-based bar and beat of `t`. */
  barOf(t: number): { bar: number; beat: number } {
    const n = this.beatOf(t);
    const bar = Math.floor(n / this.beatsPerBar);
    return { bar, beat: n - bar * this.beatsPerBar };
  }

  /** Snap `t` onto the nearest `1/div` of a beat. */
  snap(t: number, div = 4): number {
    const n = this.beatOf(t);
    return this.beat(Math.round(n * div) / div);
  }

  /** Nearest beat-grid line at or before `t`. */
  gridBefore(t: number, div = 4): number {
    const n = this.beatOf(t);
    return this.beat(Math.floor(n * div) / div);
  }

  /** Is `t` within `tol` seconds of a `1/div` beat grid line? */
  onGrid(t: number, div = 4, tol = 0.02): boolean {
    return Math.abs(t - this.snap(t, div)) <= tol;
  }

  /** Frame index (round) for song time `t` at `fps`. */
  frame(t: number, fps: number): number {
    return Math.round(t * fps);
  }

  /** Exponential pulse after `at` (1 at `at`, decays to ~0 at `half`). */
  pulse(t: number, at: number, half = 0.14): number {
    if (t < at) return 0;
    const x = (t - at) / half;
    return Math.exp(-x * x * 4);
  }
}

/** Time reference accepted in storyboards. */
export type TimeRef =
  | { bar: number; beat?: number }
  | { beat: number }
  | { time: number; why?: string }
  | { line: number; offset?: number }
  | { word: [lineId: number, wordIndex: number]; offset?: number };

export interface TimeResolvers {
  clock: Clock;
  /** Returns line start time for a line id. */
  lineStart(lineId: number): number;
  /** Returns word start time for (line id, 0-based word index). */
  wordStart(lineId: number, wordIndex: number): number;
}

export type ResolvedTime = { seconds: number; ref: TimeRef };

export function resolveTime(ref: TimeRef, r: TimeResolvers): ResolvedTime {
  if ('bar' in ref) return { seconds: r.clock.bar(ref.bar, ref.beat ?? 0), ref };
  if ('beat' in ref) return { seconds: r.clock.beat(ref.beat), ref };
  if ('time' in ref) return { seconds: ref.time, ref };
  if ('line' in ref) return { seconds: r.lineStart(ref.line) + (ref.offset ?? 0), ref };
  if ('word' in ref) {
    const [lineId, wordIndex] = ref.word;
    return { seconds: r.wordStart(lineId, wordIndex) + (ref.offset ?? 0), ref };
  }
  throw new Error(`resolveTime: unknown ref ${JSON.stringify(ref)}`);
}

/** Human-readable bar:beat label for a time. */
export function barLabel(clock: Clock, t: number): string {
  const { bar, beat } = clock.barOf(t);
  return `${bar}:${beat.toFixed(2).replace(/\.?0+$/, '')}`;
}
