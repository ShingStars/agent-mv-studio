/**
 * Deterministic pseudo-random numbers.
 *
 * Every visual decision that needs "randomness" must derive from a seed and a
 * coordinate (shot name, frame, element index). Nothing in the renderer is
 * allowed to call Math.random(): the same frame must be reproducible on any
 * machine, in any order, at any time.
 */

/** 32-bit FNV-1a hash of a string. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mix several integers into one 32-bit seed. */
export function mixSeed(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const p of parts) {
    h ^= p | 0;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

/** Mulberry32: small, fast, good enough for visual noise. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A tiny deterministic RNG object with the helpers scenes actually use. */
export class Rng {
  private next: () => number;

  constructor(seed: number | string) {
    this.next = mulberry32(typeof seed === 'string' ? hashString(seed) : seed >>> 0);
  }

  float(min = 0, max = 1): number {
    return min + this.next() * (max - min);
  }

  int(min: number, maxExclusive: number): number {
    return Math.floor(this.float(min, maxExclusive));
  }

  bool(p = 0.5): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty array');
    return items[this.int(0, items.length)]!;
  }

  /** Symmetric jitter, e.g. jitter(2) → [-2, 2). */
  jitter(amount: number): number {
    return this.float(-amount, amount);
  }

  /** Deterministic shuffle (Fisher–Yates) returning a new array. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i + 1);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }
}

/** Stable per-frame RNG: same shot + frame → same stream. */
export function frameRng(seed: number, shotId: string, frame: number): Rng {
  return new Rng(mixSeed(seed, hashString(shotId), frame));
}
