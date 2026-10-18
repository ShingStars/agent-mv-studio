#!/usr/bin/env node
/**
 * Tiny QC helper. No dependencies beyond FFmpeg.
 *
 *   node tools/qc.mjs flash <video> [--threshold 0.12] [--fps 30]
 *   node tools/qc.mjs luma  <video> [--at 12.5]
 *   node tools/qc.mjs info  <video>
 *
 * flash: measures large-area luminance round trips per second. A "round trip"
 * is a rise followed by a fall (or vice versa); the photosensitivity budget in
 * the docs is <= 3 per second including cuts.
 */

import { spawn, spawnSync } from 'node:child_process';

const [, , cmd, file, ...rest] = process.argv;

function arg(name, fallback) {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fallback;
}

function run(args, { capture = false } = {}) {
  return spawnSync('ffmpeg', args, { encoding: capture ? 'buffer' : 'utf8', maxBuffer: 1 << 30 });
}

function fail(message) {
  console.error(`qc: ${message}`);
  process.exit(1);
}

if (!cmd || !file) {
  console.log('usage: node tools/qc.mjs flash|luma|info <video> [options]');
  process.exit(1);
}

if (cmd === 'info') {
  const r = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries',
    'format=duration,size:stream=codec_name,width,height,r_frame_rate,color_space',
    '-of', 'json', file,
  ], { encoding: 'utf8' });
  if (r.status !== 0) fail(r.stderr || 'ffprobe failed');
  console.log(r.stdout.trim());
  process.exit(0);
}

if (cmd === 'luma') {
  const at = Number(arg('at', '0'));
  const r = run([
    '-v', 'error', '-ss', String(at), '-i', file,
    '-frames:v', '1', '-vf', 'scale=160:90,format=gray', '-f', 'rawvideo', '-',
  ], { capture: true });
  if (r.status !== 0) fail(String(r.stderr || 'ffmpeg failed'));
  const buf = r.stdout;
  let sum = 0;
  for (const v of buf) sum += v;
  console.log(`t=${at.toFixed(2)}s  luma=${(sum / buf.length / 255).toFixed(4)}`);
  process.exit(0);
}

if (cmd !== 'flash') fail(`unknown command ${cmd}`);

const threshold = Number(arg('threshold', '0.12'));
const w = 160;
const h = 90;
const frameBytes = w * h;

console.log(`qc: measuring ${file} (${w}x${h} gray, threshold ${threshold})`);

const ff = spawn('ffmpeg', [
  '-v', 'error', '-i', file,
  '-vf', `scale=${w}:${h},format=gray`, '-f', 'rawvideo', '-',
], { stdio: ['ignore', 'pipe', 'inherit'] });

let pending = Buffer.alloc(0);
const lumas = [];

ff.stdout.on('data', (chunk) => {
  pending = Buffer.concat([pending, chunk]);
  while (pending.length >= frameBytes) {
    const frame = pending.subarray(0, frameBytes);
    pending = pending.subarray(frameBytes);
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i];
    lumas.push(sum / frameBytes / 255);
  }
});

ff.on('close', (code) => {
  if (code !== 0) fail(`ffmpeg exited ${code}`);
  if (lumas.length < 3) fail('too few frames');

  // Delta and direction, ignoring single-frame noise below 0.02.
  const deltas = [];
  for (let i = 1; i < lumas.length; i++) deltas.push(lumas[i] - lumas[i - 1]);

  const fps = Number(arg('fps', '0')) || estimateFps();
  const perSecond = new Array(Math.ceil(lumas.length / fps)).fill(0);
  let trips = 0;
  let dir = 0; // 1 rising, -1 falling
  for (let i = 1; i < deltas.length; i++) {
    const d = deltas[i];
    if (Math.abs(d) < threshold) continue;
    const nextDir = d > 0 ? 1 : -1;
    if (dir !== 0 && nextDir !== dir) {
      trips++;
      perSecond[Math.floor(i / fps)]++;
    }
    dir = nextDir;
  }

  const max = Math.max(...perSecond);
  const worst = perSecond.indexOf(max);
  let biggest = 0;
  let biggestAt = 0;
  for (let i = 0; i < deltas.length; i++) {
    if (Math.abs(deltas[i]) > biggest) {
      biggest = Math.abs(deltas[i]);
      biggestAt = (i + 1) / fps;
    }
  }

  console.log(`frames ${lumas.length}  ·  ${(lumas.length / fps).toFixed(2)}s  ·  ${fps.toFixed(2)}fps`);
  console.log(`max round-trips/s: ${max}  (at ${worst.toFixed(2)}s)`);
  console.log(`max single-frame change: ${biggest.toFixed(3)}  (at ${biggestAt.toFixed(2)}s)`);
  const violations = perSecond.filter((n) => n > 3).length;
  console.log(`violations (>3/s): ${violations}`);
  if (violations > 0 || biggest > 0.6) {
    console.error('qc: FAIL — reduce flash/cuts in the flagged seconds');
    process.exit(1);
  }
  console.log('qc: PASS');
});

function estimateFps() {
  const r = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=r_frame_rate', '-of', 'default=nw=1:nk=1', file,
  ], { encoding: 'utf8' });
  const [a, b] = String(r.stdout).trim().split('/').map(Number);
  return a && b ? a / b : 30;
}
