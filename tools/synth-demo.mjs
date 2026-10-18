#!/usr/bin/env node
/**
 * Generates the original demo song used by examples/plate-demo and examples/tui-demo.
 * No samples, no copyrighted material: every sound is synthesised here.
 *
 *   node tools/synth-demo.mjs examples/plate-demo/audio.wav
 *
 * 98 BPM, 12 bars, 44.1 kHz stereo, exactly 29.3878 s. The film's lyric file
 * puts one line on each downbeat, so every cut can land on the grid.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const out = process.argv[2] ?? 'examples/plate-demo/audio.wav';
const SR = 44100;
const BPM = 98;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const BARS = 12;
const DUR = BAR * BARS;
const N = Math.round(DUR * SR);

const left = new Float32Array(N);
const right = new Float32Array(N);

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const freq = (name) => {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note "${name}"`);
  const n = NOTE[m[1]] + (Number(m[2]) + 1) * 12;
  return 440 * Math.pow(2, (n - 69) / 12);
};

function add(t0, dur, fn, gain = 1, pan = 0) {
  const i0 = Math.max(0, Math.floor(t0 * SR));
  const i1 = Math.min(N, Math.ceil((t0 + dur) * SR));
  const l = Math.cos(((pan + 1) * Math.PI) / 4);
  const r = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = i0; i < i1; i++) {
    const t = (i - i0) / SR;
    const v = fn(t) * gain;
    left[i] += v * l;
    right[i] += v * r;
  }
}

function env(t, attack, decay, sustain = 0.6, release = 0.25, dur = 1) {
  if (t < attack) return t / attack;
  if (t < attack + decay) return 1 - (1 - sustain) * ((t - attack) / decay);
  if (t < dur - release) return sustain;
  return Math.max(0, sustain * (1 - (t - (dur - release)) / release));
}

const chords = [
  ['A2', 'C3', 'E3'],
  ['F2', 'A2', 'C3'],
  ['C3', 'E3', 'G3'],
  ['G2', 'B2', 'D3'],
];
const lead = [
  [
    ['E5', 0.5], ['C5', 0.5], ['A4', 1], ['G4', 0.5], ['A4', 0.5], ['C5', 1],
    ['D5', 0.5], ['C5', 0.5], ['A4', 1], ['G4', 2],
  ],
  [
    ['E5', 0.5], ['D5', 0.5], ['C5', 0.5], ['D5', 0.5], ['E5', 1], ['G5', 1],
    ['A5', 0.5], ['G5', 0.5], ['E5', 0.5], ['D5', 0.5], ['C5', 2],
  ],
];

for (let bar = 0; bar < BARS; bar++) {
  const t0 = bar * BAR;
  const ch = chords[bar % 4];
  const root = ch[0];
  // pad: three detuned sines, slow attack
  ch.forEach((n, k) => {
    const f = freq(n);
    add(
      t0,
      BAR * 0.98,
      (t) =>
        (Math.sin(2 * Math.PI * f * t) * 0.6 + Math.sin(2 * Math.PI * f * 1.006 * t) * 0.4) *
        env(t, 0.18, 0.5, 0.55, 0.5, BAR * 0.98),
      0.055,
      (k - 1) * 0.25,
    );
  });
  // bass: eighth notes on the root, octave on the and
  for (let e = 0; e < 8; e++) {
    const t = t0 + e * BEAT * 0.5;
    const f = freq(e % 2 === 0 ? root : root.replace(/\d/, (d) => String(Number(d) + 1)));
    add(t, BEAT * 0.46, (x) => Math.sin(2 * Math.PI * f * x) * Math.exp(-x * 5) * 0.8, 0.16, 0);
  }
  // drums
  for (let b = 0; b < 4; b++) {
    const t = t0 + b * BEAT;
    if (b === 0 || b === 2) {
      add(t, 0.22, (x) => Math.sin(2 * Math.PI * (120 - 75 * Math.min(1, x * 8)) * x) * Math.exp(-x * 14), 0.5);
    }
    if (b === 1 || b === 3) {
      add(t, 0.18, (x) => (Math.random() * 2 - 1) * Math.exp(-x * 26) * 0.6, 0.3, 0.1);
    }
    for (let h = 0; h < 2; h++) {
      add(t + h * BEAT * 0.5, 0.045, (x) => (Math.random() * 2 - 1) * Math.exp(-x * 90), 0.075, -0.2);
    }
  }
}

// lead melody: enters at bar 2, one phrase per two bars
for (let bar = 2; bar < BARS; bar++) {
  const phrase = lead[(bar - 2) % lead.length];
  let t = bar * BAR;
  for (const [name, len] of phrase) {
    const f = freq(name);
    add(
      t,
      len * BEAT * 0.95,
      (x) =>
        (Math.sin(2 * Math.PI * f * x) + 0.28 * Math.sin(4 * Math.PI * f * x) + 0.12 * Math.sin(6 * Math.PI * f * x)) *
        env(x, 0.012, 0.12, 0.55, 0.18, len * BEAT * 0.95),
      0.085,
      0.15,
    );
    t += len * BEAT;
  }
}

// gentle tape-ish stereo widen + fade in/out + limiter
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fadeIn = Math.min(1, t / 1.2);
  const fadeOut = Math.min(1, (DUR - t) / 1.8);
  const g = fadeIn * fadeOut;
  left[i] *= g;
  right[i] *= g;
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
}
const norm = peak > 0.9 ? 0.9 / peak : 1;

const data = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i] * norm)) * 32767), i * 4);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i] * norm)) * 32767), i * 4 + 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([header, data]));
console.log(`wrote ${out} — ${DUR.toFixed(4)}s, ${BPM} BPM, ${BARS} bars`);
