/**
 * Project schema (what a human/agent writes) and plan schema (what the
 * renderer executes). The compiler is the only place that turns refs into
 * seconds; scenes never see `bar`/`line`/`beat`, only absolute time.
 */

import type { TimeRef } from '../core/time.js';
import type { LrcMeta, LyricLine } from '../core/lyrics.js';

export type StyleName = 'plate' | 'tui';

export interface MetaConfig {
  title: string;
  style: StyleName;
  width?: number;
  height?: number;
  fps?: number;
  seed?: number;
  /** First absolute time at which error (red) is allowed. */
  errAt?: TimeRef;
  /** One-line logline, shown in the storyboard header. */
  logline?: string;
  /** Author / credit line for the storyboard. */
  author?: string;
}

export interface SongConfig {
  audio: string;
  lrc: string;
  /** `auto` or a manual value. */
  bpm?: number | 'auto';
  firstBeat?: number | 'auto';
  beatsPerBar?: number;
  firstDownbeat?: number | 'auto';
  /** Song duration in seconds; if omitted it is taken from analysis. */
  duration?: number;
  /** Global lyric offset in seconds (positive = later). */
  offset?: number;
  /** Seconds of silent preroll before song time 0 (plate warning page). */
  preroll?: number;
}

export interface CastConfig {
  name: string;
  role: 'me' | 'you' | 'system';
  ink: string;
  face?: 'serif' | 'sans' | 'mono';
}

export interface FigureConfig {
  id: string;
  file: string;
  /** Ink role names in priority order: light/mid/dark. */
  inks?: string[];
  /** Chroma-key background colour to remove. */
  key?: string;
  tolerance?: number;
  /** Per-ink registration: [scale, dx, dy] or [dx, dy]. */
  reg?: number[];
  /** Extra per-ink offsets, e.g. { cream: [8, -6] }. */
  offsets?: Record<string, [number, number]>;
  /** Crop box in source pixels [x, y, w, h]. */
  crop?: [number, number, number, number];
  flip?: boolean;
  /** Drawn alpha threshold (0–255). */
  alphaCut?: number;
}

export interface PaletteConfig {
  preset?: string;
  /** Overrides merged on top of the preset. */
  states?: Record<string, Record<string, string>>;
  default?: string;
}

export interface SectionConfig {
  id: string;
  palette?: string;
  shots: ShotConfig[];
}

export interface ShotConfig {
  at: TimeRef;
  /** Optional explicit end. Defaults to the next shot's start. */
  until?: TimeRef;
  scene: string;
  /** One sentence: where the story is at this moment. Required. */
  moment: string;
  /** Lyric line ids this shot is responsible for. */
  lines?: number[] | number;
  palette?: string;
  /** Transition into this shot: cut | fade | pushLeft | pushUp | zoom | scan | whiteout. */
  enter?: string;
  /** Human label, defaults to scene + index. */
  label?: string;
  params?: Record<string, unknown>;
}

export interface ProjectConfig {
  meta: MetaConfig;
  song: SongConfig;
  cast?: CastConfig[];
  palette?: PaletteConfig;
  figures?: FigureConfig[];
  sections: SectionConfig[];
}

export interface Analysis {
  version: 1;
  duration: number;
  sampleRate: number;
  bpm: number;
  firstBeat: number;
  beatsPerBar: number;
  firstDownbeat: number;
  confidence: number;
  beatTimes: number[];
  downbeats: number[];
  onsets: number[];
  envelope: {
    hop: number;
    rms: number[];
    low: number[];
    mid: number[];
    high: number[];
    vocal: number[];
  };
  source: string;
  sourceHash?: string;
}

export interface CompiledShot {
  id: string;
  index: number;
  label: string;
  scene: string;
  section: string;
  start: number;
  end: number;
  lines: number[];
  moment: string;
  palette: string;
  enter: string;
  params: Record<string, unknown>;
}

export interface CompiledFigure {
  id: string;
  file: string;
  inks: string[];
  key?: string;
  tolerance?: number;
  reg: number[];
  offsets?: Record<string, [number, number]>;
  crop?: [number, number, number, number];
  flip?: boolean;
  alphaCut?: number;
}

export interface Plan {
  version: 1;
  meta: {
    title: string;
    style: StyleName;
    width: number;
    height: number;
    fps: number;
    seed: number;
    logline?: string;
    author?: string;
  };
  clock: {
    bpm: number;
    firstBeat: number;
    beatsPerBar: number;
    beatTimes?: number[];
  };
  song: {
    audio: string;
    lrc: string;
    duration: number;
    preroll: number;
    offset: number;
  };
  palette: {
    preset: string;
    states: Record<string, Record<string, string>>;
    default: string;
  };
  lyrics: LyricLine[];
  lyricMeta?: LrcMeta;
  shots: CompiledShot[];
  figures: CompiledFigure[];
  cast: CastConfig[];
  errAt?: number;
  analysis?: Analysis;
  notes: string[];
}

export interface CompileResult {
  plan: Plan;
  errors: string[];
  warnings: string[];
}
