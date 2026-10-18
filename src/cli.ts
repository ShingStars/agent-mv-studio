#!/usr/bin/env node
/**
 * agent-mv — one film, one command at a time.
 *
 *   agent-mv doctor
 *   agent-mv init my-film --style plate
 *   agent-mv analyze my-film
 *   agent-mv build my-film
 *   agent-mv storyboard my-film
 *   agent-mv preview my-film
 *   agent-mv still my-film --t 12.5 --out out/still.png
 *   agent-mv sheet my-film --times 0,10,20,30 --out out/sheet.png
 *   agent-mv strip my-film --t 12.5 --out out/strip.png
 *   agent-mv render my-film --out out/film.mp4 [--start 0 --end 24] [--width 1920 --height 1080]
 *   agent-mv check my-film
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileProject, writeStoryboard } from './compiler/compile.js';
import { ensureAnalysis } from './compiler/analyze.js';
import { findBrowser } from './render/browser.js';
import { ffmpegBin, loadPlan, openPreview, renderSheet, renderStill, renderStrip, renderVideo } from './render/render.js';
import { plateScenes } from './styles/plate/scenes.js';
import { tuiScenes } from './styles/tui/scenes.js';
import type { SceneRegistry } from './core/scene.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCENES: Record<string, SceneRegistry> = { plate: plateScenes, tui: tuiScenes };

function help(): void {
  console.log(`agent-mv-studio — agent-made music films

usage: agent-mv <command> <project-dir> [options]

commands
  doctor                       check node, ffmpeg, browser, fonts
  init <dir> [--style plate]   scaffold a new film project
  analyze <project> [--force]  measure bpm, first beat, onsets
  build <project>              compile project.yaml → plan.json + STORYBOARD.md
  storyboard <project>         rewrite STORYBOARD.md from project.yaml
  preview <project>            open the live preview (audio is the clock)
  still <project> --t 12.5     render one PNG
  sheet <project> --times ...  render a contact sheet
  strip <project> --t 12.5     render 15 frames around t as a strip
  render <project> --out ...   render the film to MP4
  check <project>              compile + doctor + one sample still

options
  --start s  --end s  --fps n  --width n  --height n  --crf n
  --no-post  --headed  --force  --cols n  --frames n  --out path
`);
}

interface Args {
  cmd: string;
  project: string;
  flags: Record<string, string | boolean>;
  rest: string[];
}

function parseArgs(argv: string[]): Args {
  const [cmd = 'help', ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else {
        flags[key] = next;
        i++;
      }
    } else positional.push(a);
  }
  return { cmd, project: positional[0] ?? '.', flags, rest: positional.slice(1) };
}

function fnum(flags: Record<string, string | boolean>, key: string): number | undefined {
  const v = flags[key];
  if (typeof v !== 'string') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${key} expects a number, got "${v}"`);
  return n;
}

function fstr(flags: Record<string, string | boolean>, key: string): string | undefined {
  const v = flags[key];
  return typeof v === 'string' ? v : undefined;
}

function step(msg: string): void {
  console.log(`\x1b[38;5;209m▸\x1b[0m ${msg}`);
}

function ok(msg: string): void {
  console.log(`\x1b[38;5;114m✓\x1b[0m ${msg}`);
}

function fail(msg: string): never {
  console.error(`\x1b[38;5;203m✗\x1b[0m ${msg}`);
  process.exit(1);
}

function scenesFor(style: string): SceneRegistry {
  const reg = SCENES[style];
  if (!reg) fail(`unknown style "${style}" (known: ${Object.keys(SCENES).join(', ')})`);
  return reg;
}

function projectDirOf(args: Args): string {
  const dir = resolve(args.project);
  if (!existsSync(dir)) fail(`project not found: ${dir}`);
  return dir;
}

function doctor(): void {
  const node = process.versions.node;
  step(`node ${node}`);
  const ff = spawnSync(ffmpegBin(), ['-version'], { encoding: 'utf8' });
  if (ff.status === 0) ok(`ffmpeg ${(ff.stdout.split('\n')[0] ?? '').replace('ffmpeg version ', '').slice(0, 48)}`);
  else console.log('  \x1b[38;5;203m✗\x1b[0m ffmpeg not found (set AGENT_MV_FFMPEG)');
  try {
    ok(`browser ${findBrowser()}`);
  } catch (err) {
    console.log(`  \x1b[38;5;203m✗\x1b[0m ${(err as Error).message}`);
  }
  for (const slug of ['inter', 'jetbrains-mono', 'source-serif-4']) {
    const file = join(ROOT, 'node_modules', '@fontsource', slug, 'files', `${slug}-latin-400-normal.woff2`);
    if (existsSync(file)) ok(`font ${slug}`);
    else console.log(`  \x1b[38;5;203m✗\x1b[0m font ${slug} missing — run pnpm install`);
  }
  ok(`styles ${Object.keys(SCENES).join(', ')}`);
}

const TEMPLATE_PROJECT = (title: string, style: string): string => `meta:
  title: "${title}"
  style: ${style}
  fps: ${style === 'tui' ? 24 : 30}
  seed: 7
  logline: "what the film says in one sentence"

song:
  audio: audio.wav
  lrc: lyrics.lrc
  bpm: auto
  firstBeat: auto
  beatsPerBar: 4
  preroll: 0

cast: []

palette:
  preset: ${style}

sections:
  - id: A
    palette: off
    shots:
      - at: { time: 0, why: "the first sung line" }
        until: { time: 8, why: "end of the first phrase" }
        scene: title
        moment: "the film introduces itself"
        params:
          title: "${title}"
          subtitle: "an agent-made music film"
      - at: { line: 2, offset: -0.5 }
        scene: interface
        moment: "the two meet in a window"
        params:
          chatTitle: "one thread"
          status: "you · online"
`;

const TEMPLATE_LRC = `[ar: your name]
[ti: ${'untitled'}]
[00:00.00]the first line of the song
[00:04.00]the second line
[00:08.00]the third line
[00:12.00]the last line
`;

function init(dir: string, style: string): void {
  if (existsSync(dir) && readFileSync(join(dir, 'project.yaml'), 'utf8').length > 0) fail(`${dir} already has a project.yaml`);
  mkdirSync(join(dir, 'assets', 'figures'), { recursive: true });
  const title = dir.split(/[\\/]/).filter(Boolean).pop() ?? 'untitled';
  writeFileSync(join(dir, 'project.yaml'), TEMPLATE_PROJECT(title, style));
  writeFileSync(join(dir, 'lyrics.lrc'), TEMPLATE_LRC);
  writeFileSync(
    join(dir, 'README.md'),
    `# ${title}

A film project for agent-mv-studio.

1. put the song at \`audio.wav\` (44.1k or 48k, stereo or mono)
2. write the timed lyrics in \`lyrics.lrc\` (one line per lyric, \`[mm:ss.xx]\` per line)
3. \`agent-mv analyze .\`   — measures bpm, first beat and onsets
4. \`agent-mv build .\`     — compiles project.yaml into plan.json + STORYBOARD.md
5. \`agent-mv preview .\`   — audio is the clock; every frame is a function of song time
6. \`agent-mv render . --out out/film.mp4\`

Style: \`${style}\`. Scenes available: \`${Object.keys(scenesFor(style)).join(', ')}\`.
`,
  );
  ok(`scaffolded ${dir}`);
  console.log(`  next: copy a song to ${join(dir, 'audio.wav')}, then edit lyrics.lrc and project.yaml`);
}

function analyzeProject(dir: string, force: boolean): void {
  const cfgPath = join(dir, 'project.yaml');
  if (!existsSync(cfgPath)) fail(`no project.yaml in ${dir}`);
  step('measuring the song');
  const analysis = ensureAnalysis(dir, 'audio.wav', force);
  ok(`bpm ${analysis.bpm.toFixed(2)} · first beat ${analysis.firstBeat.toFixed(3)}s · confidence ${(analysis.confidence * 100).toFixed(0)}%`);
  console.log(`  ${analysis.beatTimes.length} beats · ${analysis.onsets.length} onsets · ${analysis.duration.toFixed(2)}s`);
}

function build(dir: string, force: boolean): void {
  const cfg = loadConfigStyle(dir);
  const result = compileProject(dir, { scenes: Object.keys(scenesFor(cfg)), forceAnalysis: force });
  for (const w of result.warnings) console.log(`  \x1b[38;5;221m!\x1b[0m ${w}`);
  if (result.errors.length > 0) {
    for (const e of result.errors) console.log(`  \x1b[38;5;203m✗\x1b[0m ${e}`);
    fail(`${result.errors.length} problem(s) in project.yaml`);
  }
  writeStoryboard(dir, result.plan);
  ok(`${result.plan.shots.length} shots · ${result.plan.meta.width}x${result.plan.meta.height}@${result.plan.meta.fps} · ${result.plan.song.duration.toFixed(2)}s`);
  console.log(`  plan.json + STORYBOARD.md written to ${dir}`);
}

function loadConfigStyle(dir: string): string {
  const yamlPath = join(dir, 'project.yaml');
  const jsonPath = join(dir, 'project.json');
  const src = existsSync(yamlPath) ? readFileSync(yamlPath, 'utf8') : existsSync(jsonPath) ? readFileSync(jsonPath, 'utf8') : null;
  if (src === null) fail(`no project.yaml in ${dir}`);
  const m = /^\s*style:\s*['"]?([a-z-]+)['"]?\s*$/m.exec(src);
  return m?.[1] ?? 'plate';
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  switch (args.cmd) {
    case 'help':
    case '--help':
    case '-h':
      help();
      return;
    case 'doctor': {
      doctor();
      return;
    }
    case 'init': {
      init(resolve(args.project), fstr(args.flags, 'style') ?? 'plate');
      return;
    }
    case 'analyze': {
      analyzeProject(projectDirOf(args), Boolean(args.flags.force));
      return;
    }
    case 'build': {
      build(projectDirOf(args), Boolean(args.flags.force));
      return;
    }
    case 'storyboard': {
      const dir = projectDirOf(args);
      const plan = loadPlan(dir);
      writeStoryboard(dir, plan);
      ok(`STORYBOARD.md rewritten (${plan.shots.length} shots)`);
      return;
    }
    case 'preview': {
      const dir = projectDirOf(args);
      await openPreview({ projectDir: dir, rootDir: ROOT, headed: true, width: fnum(args.flags, 'width'), height: fnum(args.flags, 'height') });
      return;
    }
    case 'still': {
      const dir = projectDirOf(args);
      const t = fnum(args.flags, 't') ?? 1;
      const out = fstr(args.flags, 'out') ?? join(ROOT, 'out', `still-${t.toFixed(2)}.png`);
      await renderStill({ projectDir: dir, rootDir: ROOT, t, out, headed: Boolean(args.flags.headed), noPost: Boolean(args.flags['no-post']), width: fnum(args.flags, 'width'), height: fnum(args.flags, 'height') });
      ok(out);
      return;
    }
    case 'sheet': {
      const dir = projectDirOf(args);
      const times = (fstr(args.flags, 'times') ?? '0,4,8,12,16,20').split(',').map(Number);
      const out = fstr(args.flags, 'out') ?? join(ROOT, 'out', 'sheet.png');
      await renderSheet({
        projectDir: dir,
        rootDir: ROOT,
        times,
        out,
        cols: fnum(args.flags, 'cols') ?? 3,
        width: fnum(args.flags, 'width'),
        height: fnum(args.flags, 'height'),
        headed: Boolean(args.flags.headed),
      });
      ok(out);
      return;
    }
    case 'strip': {
      const dir = projectDirOf(args);
      const t = fnum(args.flags, 't') ?? 1;
      const out = fstr(args.flags, 'out') ?? join(ROOT, 'out', `strip-${t.toFixed(2)}.png`);
      await renderStrip({
        projectDir: dir,
        rootDir: ROOT,
        t,
        out,
        frames: fnum(args.flags, 'frames') ?? 15,
        fps: fnum(args.flags, 'fps') ?? 12,
        cols: fnum(args.flags, 'cols') ?? 5,
      });
      ok(out);
      return;
    }
    case 'render': {
      const dir = projectDirOf(args);
      const out = fstr(args.flags, 'out') ?? join(ROOT, 'out', 'film.mp4');
      mkdirSync(dirname(resolve(out)), { recursive: true });
      const started = Date.now();
      await renderVideo({
        projectDir: dir,
        rootDir: ROOT,
        out: resolve(out),
        start: fnum(args.flags, 'start'),
        end: fnum(args.flags, 'end'),
        width: fnum(args.flags, 'width'),
        height: fnum(args.flags, 'height'),
        fps: fnum(args.flags, 'fps'),
        crf: fnum(args.flags, 'crf'),
        headed: Boolean(args.flags.headed),
        noPost: Boolean(args.flags['no-post']),
        onProgress: (done, total) => {
          if (done % 30 === 0 || done === total) {
            const el = (Date.now() - started) / 1000;
            process.stdout.write(`\r  frame ${done}/${total}  ${el.toFixed(0)}s  ${(done / Math.max(el, 0.001)).toFixed(1)} fps`);
          }
        },
      });
      process.stdout.write('\n');
      ok(`rendered ${out}`);
      return;
    }
    case 'check': {
      const dir = projectDirOf(args);
      doctor();
      step('compiling');
      const style = loadConfigStyle(dir);
      const result = compileProject(dir, { scenes: Object.keys(scenesFor(style)) });
      if (result.errors.length > 0) fail(result.errors.join('\n'));
      ok(`${result.plan.shots.length} shots compile cleanly`);
      const t = fnum(args.flags, 't') ?? result.plan.song.duration * 0.5;
      const out = join(ROOT, 'out', 'check.png');
      step(`rendering one frame at t=${t.toFixed(2)}s`);
      await renderStill({ projectDir: dir, rootDir: ROOT, t, out, noPost: false });
      ok(`sample frame: ${out}`);
      return;
    }
    default:
      help();
      fail(`unknown command "${args.cmd}"`);
  }
}

main().catch((err: unknown) => {
  const e = err as Error;
  console.error(`\x1b[38;5;203m✗\x1b[0m ${e.stack ?? e.message}`);
  process.exit(1);
});
