/**
 * Render driver: Playwright page → WebSocket → ffmpeg stdin.
 *
 * Frames are never written to disk. The browser renders one frame per request,
 * the Node side writes the RGBA buffer into ffmpeg and only then asks for the
 * next frame, so a slow encoder throttles the browser instead of growing an
 * unbounded queue.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Page } from 'playwright-core';
import type { Plan } from '../compiler/schema.js';
import { launchBrowser } from './browser.js';
import { startServer, type StudioServer } from './server.js';

export interface RenderOptions {
  projectDir: string;
  rootDir: string;
  out: string;
  /** Song-time start; defaults to −preroll. */
  start?: number;
  /** Song-time end; defaults to song duration. */
  end?: number;
  width?: number;
  height?: number;
  fps?: number;
  crf?: number;
  preset?: string;
  headed?: boolean;
  noPost?: boolean;
  /** Called after each frame with (index, total). */
  onProgress?: (index: number, total: number) => void;
}

export interface StudioSession {
  server: StudioServer;
  browser: Awaited<ReturnType<typeof launchBrowser>>;
  page: Page;
  plan: Plan;
  width: number;
  height: number;
  close(): Promise<void>;
}

export function ffmpegBin(): string {
  return process.env.AGENT_MV_FFMPEG ?? 'ffmpeg';
}

export function probeBin(): string {
  return process.env.AGENT_MV_FFPROBE ?? 'ffprobe';
}

export function loadPlan(projectDir: string): Plan {
  const file = join(projectDir, 'plan.json');
  if (!existsSync(file)) throw new Error(`plan.json not found in ${projectDir} — run \`agent-mv build\` first`);
  return JSON.parse(readFileSync(file, 'utf8')) as Plan;
}

export async function openStudio(opts: {
  projectDir: string;
  rootDir: string;
  headed?: boolean;
  width?: number;
  height?: number;
  noPost?: boolean;
  mode?: 'export' | 'preview' | 'still';
  t?: number;
}): Promise<StudioSession> {
  const plan = loadPlan(opts.projectDir);
  const width = opts.width ?? plan.meta.width;
  const height = opts.height ?? plan.meta.height;
  const server = await startServer({ projectDir: opts.projectDir, rootDir: opts.rootDir });
  const browser = await launchBrowser(opts.headed);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error' || text.startsWith('preview ready') || text.startsWith('export ready')) {
      console.log(`[browser] ${msg.type()}: ${text}`);
    }
  });
  page.on('pageerror', (err) => console.error('[browser:pageerror]', err));
  const params = new URLSearchParams({
    mode: opts.mode ?? 'export',
    style: plan.meta.style,
    plan: '/project/plan.json',
    w: String(width),
    h: String(height),
  });
  if (opts.noPost) params.set('nopost', '1');
  if (typeof opts.t === 'number') params.set('t', String(opts.t));
  const url = `${server.url}/?${params.toString()}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const api = (window as unknown as { __mv?: { ready?: boolean; error?: string } }).__mv;
    return !!api && (api.ready === true || typeof api.error === 'string');
  }, null, { timeout: 120_000 });
  const info = await page.evaluate(() => {
    const api = (window as unknown as { __mv?: { ready?: boolean; error?: string; fonts?: string[] } }).__mv;
    return { ready: api?.ready === true, error: api?.error ?? '', fonts: api?.fonts ?? [] };
  });
  if (!info.ready) throw new Error(`browser host failed: ${info.error}`);
  for (const line of info.fonts) if (!line.endsWith('ok')) console.warn(`[fonts] ${line}`);
  return {
    server,
    browser,
    page,
    plan,
    width,
    height,
    async close() {
      await browser.close().catch(() => {});
      await server.close().catch(() => {});
    },
  };
}

function ffmpegArgs(o: {
  out: string;
  width: number;
  height: number;
  fps: number;
  audio: string | null;
  audioSeek: number;
  audioDelay: number;
  duration: number;
  crf: number;
  preset: string;
  startTag: number;
}): string[] {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${o.width}x${o.height}`, '-r', String(o.fps), '-i', 'pipe:0'];
  const filters: string[] = [];
  const maps: string[] = [];
  let audioIndex = -1;
  if (o.audio) {
    if (o.audioSeek > 0) args.push('-ss', String(o.audioSeek));
    args.push('-i', o.audio);
    audioIndex = 1;
  }
  filters.push(`[0:v]scale=out_color_matrix=bt709:out_range=limited,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=limited[v]`);
  maps.push('-map', '[v]');
  if (audioIndex === 1) {
    const ms = Math.max(0, Math.round(o.audioDelay * 1000));
    filters.push(`[1:a]adelay=${ms}|${ms},aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a]`);
    maps.push('-map', '[a]');
  }
  args.push('-filter_complex', filters.join(';'), ...maps);
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    o.preset,
    '-crf',
    String(o.crf),
    '-pix_fmt',
    'yuv420p',
    '-colorspace',
    'bt709',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-color_range',
    'tv',
  );
  if (audioIndex === 1) args.push('-c:a', 'aac', '-b:a', '256k');
  args.push(
    '-t',
    String(o.duration),
    '-shortest',
    '-movflags',
    '+faststart',
    '-metadata',
    `comment=mv_start=${o.startTag}`,
    o.out,
  );
  return args;
}

export async function renderVideo(opts: RenderOptions): Promise<string> {
  const session = await openStudio({
    projectDir: opts.projectDir,
    rootDir: opts.rootDir,
    headed: opts.headed,
    width: opts.width,
    height: opts.height,
    noPost: opts.noPost,
    mode: 'export',
  });
  try {
    const plan = session.plan;
    const fps = opts.fps ?? plan.meta.fps;
    const start = opts.start ?? -plan.song.preroll;
    const end = opts.end ?? plan.song.duration;
    const total = Math.max(1, Math.round((end - start) * fps));
    const audioFile = join(opts.projectDir, plan.song.audio);
    const audio = existsSync(audioFile) ? audioFile : null;
    if (!audio) console.warn(`[render] no audio at ${audioFile}; rendering silent`);
    const out = resolve(opts.out);
    mkdirSync(dirname(out), { recursive: true });
    if (existsSync(out)) rmSync(out);

    const args = ffmpegArgs({
      out,
      width: session.width,
      height: session.height,
      fps,
      audio,
      audioSeek: Math.max(0, start),
      audioDelay: Math.max(0, -start),
      duration: (end - start),
      crf: opts.crf ?? 16,
      preset: opts.preset ?? 'medium',
      startTag: start,
    });
    const ff = spawn(ffmpegBin(), args, { stdio: ['pipe', 'inherit', 'inherit'] }) as unknown as ChildProcessWithoutNullStreams;
    let ffDead: string | null = null;
    let closing = false;
    ff.on('exit', (code, signal) => {
      if (!closing && code !== 0) ffDead = `ffmpeg exited early (${code ?? signal})`;
    });
    ff.stdin.on('error', (err) => {
      ffDead = `ffmpeg stdin: ${err.message}`;
    });
    const started = Date.now();
    const channel = await session.server.channel();
    for (let i = 0; i < total; i++) {
      if (ffDead) throw new Error(ffDead);
      const t = start + i / fps;
      const buf = await channel.request(t);
      const expect = session.width * session.height * 4;
      if (buf.length !== expect) throw new Error(`frame ${i}: expected ${expect} bytes, got ${buf.length}`);
      if (!ff.stdin.write(buf)) await new Promise<void>((ok) => ff.stdin.once('drain', () => ok()));
      opts.onProgress?.(i + 1, total);
      if (i % Math.max(1, Math.round(fps * 2)) === 0) {
        const elapsed = (Date.now() - started) / 1000;
        const rate = (i + 1) / Math.max(0.001, elapsed);
        process.stdout.write(`\r  frames ${i + 1}/${total}  ${rate.toFixed(1)} fps  ${Math.round(elapsed)}s`);
      }
    }
    closing = true;
    ff.stdin.end();
    const code = await new Promise<number>((ok) => ff.once('close', (c) => ok(c ?? 0)));
    process.stdout.write('\n');
    if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
    return out;
  } finally {
    await session.close();
  }
}

/** Render one still to PNG (dataURL from the page). */
export async function renderStill(opts: {
  projectDir: string;
  rootDir: string;
  t: number;
  out: string;
  width?: number;
  height?: number;
  headed?: boolean;
  noPost?: boolean;
}): Promise<string> {
  const session = await openStudio({
    projectDir: opts.projectDir,
    rootDir: opts.rootDir,
    headed: opts.headed,
    width: opts.width,
    height: opts.height,
    noPost: opts.noPost,
    mode: 'still',
    t: opts.t,
  });
  try {
    const dataUrl = (await session.page.evaluate(
      (tt) => (window as unknown as { __mv: { still: (t: number) => string } }).__mv.still(tt),
      opts.t,
    )) as string;
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    mkdirSync(dirname(resolve(opts.out)), { recursive: true });
    writeFileSync(resolve(opts.out), Buffer.from(base64, 'base64'));
    return resolve(opts.out);
  } finally {
    await session.close();
  }
}

/** Contact sheet: N stills tiled with ffmpeg. */
export async function renderSheet(opts: {
  projectDir: string;
  rootDir: string;
  times: number[];
  out: string;
  cols?: number;
  width?: number;
  height?: number;
  headed?: boolean;
}): Promise<string> {
  const cols = Math.max(1, opts.cols ?? 4);
  const rows = Math.ceil(opts.times.length / cols);
  const tmp = join(opts.projectDir, 'out', '_sheet');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  for (let i = 0; i < opts.times.length; i++) {
    await renderStill({
      projectDir: opts.projectDir,
      rootDir: opts.rootDir,
      t: opts.times[i]!,
      out: join(tmp, `${String(i).padStart(3, '0')}.png`),
      width: opts.width,
      height: opts.height,
      headed: opts.headed,
    });
    process.stdout.write(`\r  stills ${i + 1}/${opts.times.length}`);
  }
  process.stdout.write('\n');
  const out = resolve(opts.out);
  mkdirSync(dirname(out), { recursive: true });
  const filter = `scale=480:-1,tile=${cols}x${rows}:padding=6:margin=6:color=0x141412`;
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', '1', '-i', join(tmp, '%03d.png'), '-vf', filter, '-frames:v', '1', out];
  await new Promise<void>((ok, bad) => {
    const p = spawn(ffmpegBin(), args, { stdio: 'inherit' });
    p.on('close', (c) => (c === 0 ? ok() : bad(new Error(`ffmpeg tile failed (${c})`))));
  });
  return out;
}

/** 15-frame strip at 12 fps around t, tiled 5x3. */
export async function renderStrip(opts: {
  projectDir: string;
  rootDir: string;
  t: number;
  out: string;
  frames?: number;
  fps?: number;
  cols?: number;
  headed?: boolean;
}): Promise<string> {
  const frames = opts.frames ?? 15;
  const fps = opts.fps ?? 12;
  const cols = opts.cols ?? 5;
  const rows = Math.ceil(frames / cols);
  const start = opts.t - (frames / 2) * (1 / fps);
  const times = Array.from({ length: frames }, (_, i) => start + i / fps);
  const tmp = join(opts.projectDir, 'out', '_strip');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const session = await openStudio({
    projectDir: opts.projectDir,
    rootDir: opts.rootDir,
    headed: opts.headed,
    mode: 'still',
    t: times[0],
  });
  try {
    for (let i = 0; i < times.length; i++) {
      const dataUrl = (await session.page.evaluate(
        (tt) => (window as unknown as { __mv: { still: (t: number) => string } }).__mv.still(tt),
        times[i],
      )) as string;
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      writeFileSync(join(tmp, `${String(i).padStart(3, '0')}.png`), Buffer.from(base64, 'base64'));
    }
  } finally {
    await session.close();
  }
  const out = resolve(opts.out);
  mkdirSync(dirname(out), { recursive: true });
  const filter = `scale=384:-1,tile=${cols}x${rows}:padding=4:margin=4:color=0x141412`;
  await new Promise<void>((ok, bad) => {
    const p = spawn(
      ffmpegBin(),
      ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', '1', '-i', join(tmp, '%03d.png'), '-vf', filter, '-frames:v', '1', out],
      { stdio: 'inherit' },
    );
    p.on('close', (c) => (c === 0 ? ok() : bad(new Error(`ffmpeg tile failed (${c})`))));
  });
  return out;
}

/** Open the live preview in a headed browser and keep the server alive. */
export async function openPreview(opts: { projectDir: string; rootDir: string; headed?: boolean; width?: number; height?: number }): Promise<void> {
  const session = await openStudio({
    projectDir: opts.projectDir,
    rootDir: opts.rootDir,
    headed: opts.headed ?? true,
    width: opts.width,
    height: opts.height,
    mode: 'preview',
  });
  console.log(`\npreview: ${session.server.url}/?mode=preview&style=${session.plan.meta.style}`);
  console.log('space = play/pause · ←/→ = ±5s · D = debug · Ctrl+C to quit');
  await new Promise<void>((ok) => {
    process.once('SIGINT', () => ok());
    process.once('SIGTERM', () => ok());
  });
  await session.close();
}
