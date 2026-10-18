/**
 * Audio analysis: tempo, beat grid, onset envelope.
 *
 * Decoding is delegated to ffmpeg (mono, 22050 Hz, float32), so any format the
 * user can hear can be analysed. The beat tracker is intentionally simple and
 * inspectable: onset strength → autocorrelation → phase, then a small local
 * snap to the strongest onset near each predicted beat.
 *
 * The output is a plan-independent `analysis.json`; a storyboard can quote
 * `{ bar: 12 }` because this file fixes where beats are.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import type { Analysis } from '../compiler/schema.js';
import { ffmpegBin } from '../render/render.js';

export interface Decoded {
  samples: Float32Array;
  sampleRate: number;
  duration: number;
}

export function decodeAudio(file: string, sampleRate = 22050): Decoded {
  const r = spawnSync(
    ffmpegBin(),
    ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', '-'],
    { maxBuffer: 1024 * 1024 * 512 },
  );
  if (r.status !== 0) throw new Error(`ffmpeg decode failed for ${file}: ${r.stderr.toString().slice(0, 400)}`);
  const buf = r.stdout;
  const samples = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
  return { samples, sampleRate, duration: samples.length / sampleRate };
}

export function wavHash(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16);
}

function rmsFrames(samples: Float32Array, hop: number): Float32Array {
  const n = Math.floor(samples.length / hop);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const start = i * hop;
    for (let j = 0; j < hop; j++) {
      const v = samples[start + j] ?? 0;
      sum += v * v;
    }
    out[i] = Math.sqrt(sum / hop);
  }
  return out;
}

function spectralBands(samples: Float32Array, hop: number, sampleRate: number): { low: Float32Array; mid: Float32Array; high: Float32Array } {
  // Cheap band split by one-pole filters; good enough for visual pulses.
  const n = Math.floor(samples.length / hop);
  const low = new Float32Array(n);
  const mid = new Float32Array(n);
  const high = new Float32Array(n);
  let lp = 0;
  let hpPrev = 0;
  const aLow = Math.exp((-2 * Math.PI * 180) / sampleRate);
  const aMidHigh = Math.exp((-2 * Math.PI * 1800) / sampleRate);
  for (let i = 0; i < n; i++) {
    let l = 0;
    let m = 0;
    let h = 0;
    for (let j = 0; j < hop; j++) {
      const x = samples[i * hop + j] ?? 0;
      lp = aLow * lp + (1 - aLow) * x;
      const bp = aMidHigh * (lp - hpPrev) + (1 - aMidHigh) * 0;
      const bandMid = lp - hpPrev;
      hpPrev = lp;
      l += lp * lp;
      m += bandMid * bandMid;
      void bp;
      const highPass = x - lp;
      h += highPass * highPass;
    }
    low[i] = Math.sqrt(l / hop);
    mid[i] = Math.sqrt(m / hop);
    high[i] = Math.sqrt(h / hop);
  }
  return { low, mid, high };
}

function normalize(a: Float32Array): Float32Array {
  let max = 0;
  for (const v of a) if (v > max) max = v;
  if (max <= 1e-9) return a;
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i]! / max;
  return out;
}

function onsetEnvelope(rms: Float32Array): Float32Array {
  const out = new Float32Array(rms.length);
  for (let i = 1; i < rms.length; i++) {
    const rise = rms[i]! - rms[i - 1]!;
    out[i] = rise > 0 ? Math.log1p(rise * 12) : 0;
  }
  return out;
}

export function analyze(file: string, opts: { hop?: number; bpmHint?: number } = {}): Analysis {
  const decoded = decodeAudio(file);
  const hop = opts.hop ?? 512;
  const hopSec = hop / decoded.sampleRate;
  const rms = normalize(rmsFrames(decoded.samples, hop));
  const bands = spectralBands(decoded.samples, hop, decoded.sampleRate);
  const n = rms.length;

  // Onset strength: positive half-wave rectified spectral flux across bands.
  const flux = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    const dl = Math.max(0, bands.low[i]! - bands.low[i - 1]!) / (bands.low[i - 1]! + 0.02);
    const dm = Math.max(0, bands.mid[i]! - bands.mid[i - 1]!) / (bands.mid[i - 1]! + 0.02);
    const dh = Math.max(0, bands.high[i]! - bands.high[i - 1]!) / (bands.high[i - 1]! + 0.02);
    flux[i] = dl * 0.55 + dm * 0.2 + dh * 0.25;
  }
  const onset = normalize(flux);

  /**
   * Comb filter: a tempo is right when a pulse train at that period lands on
   * onset peaks. Scoring every phase (at quarter-frame resolution) is more
   * robust than raw autocorrelation, which locks onto subdivisions.
   */
  const comb = (bpm: number): { score: number; phase: number; period: number } => {
    const period = 60 / bpm / hopSec;
    let best = { score: 0, phase: 0, period };
    for (let ph = 0; ph < period; ph += 0.25) {
      let sum = 0;
      let count = 0;
      for (let k = 0; ; k++) {
        const idx = Math.round(ph + k * period);
        if (idx >= n - 1) break;
        // Later beats matter slightly less: the intro may not be on the grid.
        sum += onset[idx]! * (k < 8 ? 1 : 0.92);
        count++;
      }
      const score = sum / Math.max(1, count);
      if (score > best.score) best = { score, phase: ph, period };
    }
    return best;
  };

  let bestBpm = 120;
  let best = { score: -1, phase: 0, period: 0 };
  let scoreSum = 0;
  let scoreCount = 0;
  for (let bpm = 60; bpm <= 190; bpm += 0.25) {
    const c = comb(bpm);
    const octave = Math.abs(Math.log2(bpm / 120));
    const prior = Math.exp(-(octave * octave) / 0.5);
    const weighted = c.score * (0.7 + 0.3 * prior);
    scoreSum += weighted;
    scoreCount++;
    if (weighted > best.score) {
      best = c;
      bestBpm = bpm;
    }
  }
  const bpm = Math.round(bestBpm * 100) / 100;
  const mean = scoreSum / Math.max(1, scoreCount);
  const contrast = mean > 1e-9 ? best.score / mean : 1;
  const bestOffset = best.phase;
  const bestLag = best.period;
  const bestScore = best.score;
  const bestPhase = best.score;

  // Build the grid, snapping each prediction to a nearby onset peak (< 70 ms).
  const times: number[] = [];
  const maxT = decoded.duration;
  const snapWin = Math.round(0.07 / hopSec);
  for (let k = 0; ; k++) {
    const pred = bestOffset + k * bestLag;
    if (pred * hopSec > maxT) break;
    let bestI = pred;
    let bestV = onset[pred] ?? 0;
    for (let j = Math.max(0, pred - snapWin); j <= Math.min(n - 1, pred + snapWin); j++) {
      if (onset[j]! > bestV) {
        bestV = onset[j]!;
        bestI = j;
      }
    }
    const t = bestI * hopSec;
    if (!times.length || t - times[times.length - 1]! > 0.12) times.push(t);
  }
  let firstBeat = times[0] ?? 0;
  // If the track starts on a beat that the fade-in hid, the detected grid can
  // begin one beat late; prepend it when the low band agrees.
  if (times.length > 1) {
    const period = 60 / bpm;
    const earlier = times[0]! - period;
    if (earlier >= -0.03) {
      const e = Math.max(0, earlier);
      const li = Math.round(times[0]! / hopSec);
      const ei = Math.round(e / hopSec);
      if ((bands.low[ei] ?? 0) >= 0.35 * (bands.low[li] ?? 0)) {
        times.unshift(e);
        firstBeat = e;
      }
    }
  }
  // Downbeat phase: the 4-beat offset whose low-band energy is strongest.
  let bestD = 0;
  let bestDScore = -1;
  for (let d = 0; d < 4; d++) {
    let s = 0;
    for (let i = d; i < times.length; i += 4) s += bands.low[Math.round(times[i]! / hopSec)] ?? 0;
    if (s > bestDScore) {
      bestDScore = s;
      bestD = d;
    }
  }
  const downbeats = times.filter((_, i) => (i + bestD) % 4 === 0);
  const onsets: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (onset[i]! > 0.18 && onset[i]! >= onset[i - 1]! && onset[i]! > onset[i + 1]!) {
      if (!onsets.length || i * hopSec - onsets[onsets.length - 1]! > 0.09) onsets.push(i * hopSec);
    }
  }

  const confidence = Math.max(0.05, Math.min(1, (contrast - 1) / 0.6));
  return {
    version: 1,
    duration: decoded.duration,
    sampleRate: decoded.sampleRate,
    bpm: Math.round(bpm * 100) / 100,
    firstBeat: Math.round(firstBeat * 1000) / 1000,
    beatsPerBar: 4,
    firstDownbeat: Math.round((downbeats[0] ?? firstBeat) * 1000) / 1000,
    confidence: Math.round(confidence * 1000) / 1000,
    beatTimes: times.map((t) => Math.round(t * 1000) / 1000),
    downbeats: downbeats.map((t) => Math.round(t * 1000) / 1000),
    onsets: onsets.map((t) => Math.round(t * 1000) / 1000),
    envelope: {
      hop,
      rms: Array.from(rms, (v) => Math.round(v * 1000) / 1000),
      low: Array.from(normalize(bands.low), (v) => Math.round(v * 1000) / 1000),
      mid: Array.from(normalize(bands.mid), (v) => Math.round(v * 1000) / 1000),
      high: Array.from(normalize(bands.high), (v) => Math.round(v * 1000) / 1000),
      vocal: Array.from(onset, (v) => Math.round(v * 1000) / 1000),
    },
    source: file,
  };
}

/** Analyze and cache to `<project>/analysis.json` (re-run when the audio changes). */
export function ensureAnalysis(projectDir: string, audioRel: string, force = false): Analysis {
  const audio = isAbsolute(audioRel) ? audioRel : join(projectDir, audioRel);
  if (!existsSync(audio)) throw new Error(`audio not found: ${audio}`);
  const cacheFile = join(projectDir, 'analysis.json');
  const hash = wavHash(audio);
  if (!force && existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, 'utf8')) as Analysis & { sourceHash?: string };
    if (cached.sourceHash === hash) return cached;
  }
  const analysis = analyze(audio);
  analysis.sourceHash = hash;
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(analysis, null, 2));
  return analysis;
}
