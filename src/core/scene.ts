/**
 * Scene contract + small helpers every style shares.
 *
 * A scene is a pure function of the context: no module-level mutable state,
 * no wall-clock time, no Math.random(). All randomness comes from `c.rng`,
 * which is seeded by (project seed, shot id, frame).
 */

import type { Analysis, CompiledShot, Plan, StyleName } from '../compiler/schema.js';
import type { AssetBank } from './assets.js';
import type { Lyrics, LyricLine } from './lyrics.js';
import type { Roles } from './palette.js';
import type { Rng } from './prng.js';
import type { Surface } from './surface.js';
import type { Clock } from './time.js';

export interface SceneEnv {
  plan: Plan;
  clock: Clock;
  lyrics: Lyrics;
  analysis: Analysis | null;
  assets: AssetBank;
  palettes: Record<string, Roles>;
  width: number;
  height: number;
  style: StyleName;
  fps: number;
  seed: number;
}

export interface SceneContext {
  s: Surface;
  env: SceneEnv;
  shot: CompiledShot;
  /** Song time in seconds (can be negative for the preroll). */
  t: number;
  /** Local time inside the shot. */
  lt: number;
  /** Normalised shot progress 0..1. */
  u: number;
  frame: number;
  rng: Rng;
  pal: Roles;
  /** Per-shot scratch space. Cleared for every shot render. */
  state: Record<string, unknown>;
}

export type SceneFn = (c: SceneContext) => void;
export type SceneRegistry = Record<string, SceneFn>;

export interface ChromeContext {
  s: Surface;
  env: SceneEnv;
  t: number;
  pal: Roles;
  frame: number;
}

export interface StyleDefinition {
  name: StyleName;
  designW: number;
  designH: number;
  palettePreset: string;
  scenes: SceneRegistry;
  /** Drawn above the post stack, always sharp (HUD, lyric band, film frame). */
  chrome?: (c: ChromeContext) => void;
  defaultTransition: string;
  /** Soft post defaults; a light page needs a lighter touch than a dark plate. */
  post?: { grain?: number; vignette?: number; scan?: number };
}

/** The lyric line this shot is currently responsible for. */
export function shotLine(c: SceneContext): LyricLine | null {
  const ids = c.shot.lines;
  if (!ids.length) return null;
  let current: LyricLine | null = null;
  for (const id of ids) {
    const line = c.env.lyrics.byId(id);
    if (!line) continue;
    if (line.start <= c.t + 1e-6) {
      if (!current || line.start > current.start) current = line;
    }
  }
  if (current) return current;
  // Before the first line: return the earliest one so scenes can show "empty".
  const first = ids.map((id) => c.env.lyrics.byId(id)).filter(Boolean) as LyricLine[];
  first.sort((a, b) => a.start - b.start);
  return first[0] ?? null;
}

export function lineProgress(c: SceneContext, line: LyricLine): number {
  return c.env.lyrics.wordProgress(line.id, c.t);
}

export function lineRevealed(c: SceneContext, line: LyricLine): string {
  return c.env.lyrics.revealedText(line.id, c.t);
}

/** 0..1 fade in/out helper with `edges` seconds. */
export function envelope(t: number, start: number, end: number, inSec = 0.2, outSec = 0.2): number {
  if (t < start || t > end) return 0;
  const a = Math.min(1, (t - start) / Math.max(1e-4, inSec));
  const b = Math.min(1, (end - t) / Math.max(1e-4, outSec));
  return Math.max(0, Math.min(a, b));
}

/** Smoothstep. */
export function smooth(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

/** Exponential decay pulse at `at`. */
export function pulse(t: number, at: number, half = 0.14): number {
  if (t < at) return 0;
  const x = (t - at) / half;
  return Math.exp(-x * x * 4);
}

/** Clamp helper. */
export function clamp(x: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Read a numeric param with a default. */
export function num(p: Record<string, unknown>, key: string, fallback: number): number {
  const v = p[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Read a string param with a default. */
export function str(p: Record<string, unknown>, key: string, fallback = ''): string {
  const v = p[key];
  return typeof v === 'string' ? v : fallback;
}

/** Read a boolean param with a default. */
export function bool(p: Record<string, unknown>, key: string, fallback = false): boolean {
  const v = p[key];
  return typeof v === 'boolean' ? v : fallback;
}

/** Read an array-of-strings param. */
export function strings(p: Record<string, unknown>, key: string, fallback: string[] = []): string[] {
  const v = p[key];
  return Array.isArray(v) ? v.map((x) => String(x)) : fallback;
}

/** Read a palette state name from params, falling back to the shot palette. */
export function stateName(p: Record<string, unknown>, key = 'palette'): string | null {
  const v = p[key];
  return typeof v === 'string' ? v : null;
}
