/**
 * Compiler: project.yaml + LRC + analysis.json → plan.json.
 *
 * This is the only stage that turns bar/beat/line references into seconds. It
 * also refuses to emit a plan that a scene could not draw: unknown scene names,
 * missing lyric lines, overlapping shots and empty moments are errors, not
 * warnings.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { Lyrics, parseLRC } from '../core/lyrics.js';
import { PLATE_STATES, TUI_STATES } from '../core/palette.js';
import { Clock, resolveTime, type TimeRef, type TimeResolvers } from '../core/time.js';
import type {
  Analysis,
  CompileResult,
  CompiledFigure,
  CompiledShot,
  Plan,
  ProjectConfig,
  ShotConfig,
} from './schema.js';
import { ensureAnalysis } from './analyze.js';

export interface CompileOptions {
  /** Scene names the target style can draw; unknown names are errors. */
  scenes: string[];
  /** Skip re-analysis (use analysis.json if present). */
  forceAnalysis?: boolean;
  /** Do not write plan.json (used by tests). */
  dryRun?: boolean;
}

function readProjectFile(projectDir: string): { config: ProjectConfig; file: string } {
  for (const name of ['project.yaml', 'project.yml', 'project.json']) {
    const file = join(projectDir, name);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const config = name.endsWith('.json') ? (JSON.parse(text) as ProjectConfig) : (parseYaml(text) as ProjectConfig);
    return { config, file };
  }
  throw new Error(`no project.yaml / project.yml / project.json in ${projectDir}`);
}

function isAuto(v: number | 'auto' | undefined): boolean {
  return v === undefined || v === 'auto';
}

function shift(lyrics: Lyrics, offset: number): Lyrics {
  if (!offset) return lyrics;
  const lines = lyrics.lines.map((l) => ({
    ...l,
    start: l.start + offset,
    end: l.end + offset,
    words: l.words.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset })),
  }));
  return new Lyrics(lines, lyrics.meta);
}

function normalizeLines(v: ShotConfig['lines']): number[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v.map(Number) : [Number(v)];
}

const DEFAULT_W: Record<string, [number, number, number]> = {
  plate: [1920, 1080, 30],
  tui: [1280, 720, 24],
};

export function compileProject(projectDir: string, opts: CompileOptions): CompileResult {
  const dir = resolve(projectDir);
  const { config, file: projectFile } = readProjectFile(dir);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.meta?.title) errors.push(`${projectFile}: meta.title is required`);
  if (!config.meta?.style) errors.push(`${projectFile}: meta.style is required (plate | tui)`);
  if (!config.song?.audio) errors.push(`${projectFile}: song.audio is required`);
  if (!Array.isArray(config.sections) || !config.sections.length) errors.push(`${projectFile}: at least one section is required`);
  if (errors.length) throw new Error(errors.join('\n'));

  const style = config.meta.style;
  const [defW, defH, defFps] = DEFAULT_W[style] ?? [1920, 1080, 30];
  const width = config.meta.width ?? defW;
  const height = config.meta.height ?? defH;
  const fps = config.meta.fps ?? defFps;
  const seed = config.meta.seed ?? 20161011;
  const preroll = config.song.preroll ?? 0;

  const audioAbs = isAbsolute(config.song.audio) ? config.song.audio : join(dir, config.song.audio);
  const analysis: Analysis = ensureAnalysis(dir, audioAbs, opts.forceAnalysis);

  let clock: Clock;
  const useBeats = isAuto(config.song.bpm) || isAuto(config.song.firstBeat);
  clock = new Clock({
    bpm: isAuto(config.song.bpm) ? analysis.bpm : Number(config.song.bpm),
    firstBeat: isAuto(config.song.firstBeat) ? analysis.firstBeat : Number(config.song.firstBeat),
    beatsPerBar: config.song.beatsPerBar ?? analysis.beatsPerBar,
    beatTimes: useBeats ? analysis.beatTimes : undefined,
  });

  const lrcAbs = config.song.lrc ? (isAbsolute(config.song.lrc) ? config.song.lrc : join(dir, config.song.lrc)) : '';
  let lyrics = new Lyrics([]);
  if (lrcAbs && existsSync(lrcAbs)) {
    lyrics = parseLRC(readFileSync(lrcAbs, 'utf8'), {
      duration: config.song.duration ?? analysis.duration,
      minHold: 0.8,
      maxHold: 6,
      gap: 0.04,
    });
    lyrics = shift(lyrics, config.song.offset ?? 0);
  } else if (config.song.lrc) {
    warnings.push(`LRC not found: ${lrcAbs} — film will have no lyric lines`);
  }

  const resolvers: TimeResolvers = {
    clock,
    lineStart: (id) => lyrics.require(id).start,
    wordStart: (id, i) => {
      const line = lyrics.require(id);
      const w = line.words[i];
      if (!w) throw new Error(`line ${id} has no word ${i}`);
      return w.start;
    },
  };

  const duration = config.song.duration ?? analysis.duration;
  const sceneSet = new Set(opts.scenes);
  const states = config.palette?.preset
    ? config.palette.preset === 'tui'
      ? TUI_STATES
      : PLATE_STATES
    : style === 'tui'
      ? TUI_STATES
      : PLATE_STATES;
  const palette: Plan['palette'] = {
    preset: config.palette?.preset ?? style,
    states: JSON.parse(JSON.stringify(states)) as Plan['palette']['states'],
    default: config.palette?.default ?? (style === 'tui' ? 'paper' : 'on'),
  };
  for (const [name, roles] of Object.entries(config.palette?.states ?? {})) {
    palette.states[name] = { ...(palette.states[name] ?? palette.states[palette.default]!), ...roles };
  }
  if (!palette.states[palette.default]) errors.push(`palette.default "${palette.default}" is not a state`);

  const shots: CompiledShot[] = [];
  let index = 0;
  let previousSectionStart = -Infinity;
  for (const section of config.sections) {
    if (!section.id) errors.push('a section has no id');
    for (const [i, shot] of section.shots.entries()) {
      const id = `${section.id}-${String(i + 1).padStart(2, '0')}`;
      if (!shot.moment || !shot.moment.trim()) errors.push(`${id}: moment is required (one sentence)`);
      if (!shot.scene) errors.push(`${id}: scene is required`);
      if (shot.scene && !sceneSet.has(shot.scene)) {
        errors.push(`${id}: unknown scene "${shot.scene}" for style ${style} (have ${[...sceneSet].sort().join(', ')})`);
      }
      let start: number;
      try {
        start = resolveTime(shot.at as TimeRef, resolvers).seconds;
      } catch (err) {
        errors.push(`${id}: cannot resolve at=${JSON.stringify(shot.at)} — ${(err as Error).message}`);
        continue;
      }
      let explicitEnd: number | undefined;
      if (shot.until) {
        try {
          explicitEnd = resolveTime(shot.until as TimeRef, resolvers).seconds;
        } catch (err) {
          errors.push(`${id}: cannot resolve until — ${(err as Error).message}`);
        }
      }
      const lines = normalizeLines(shot.lines);
      for (const lineId of lines) {
        if (!lyrics.byId(lineId)) errors.push(`${id}: lyric line ${lineId} does not exist`);
      }
      const paletteName = shot.palette ?? section.palette ?? palette.default;
      if (!palette.states[paletteName]) errors.push(`${id}: palette "${paletteName}" does not exist`);
      shots.push({
        id,
        index: index++,
        label: shot.label ?? shot.scene,
        scene: shot.scene,
        section: section.id,
        start,
        end: explicitEnd ?? Number.NaN,
        lines,
        moment: shot.moment,
        palette: paletteName,
        enter: shot.enter ?? (index === 1 ? 'cut' : 'fade'),
        params: shot.params ?? {},
      });
      if (section.shots[0] === shot) {
        if (start < previousSectionStart) warnings.push(`section ${section.id} starts before the previous section (${start.toFixed(2)}s)`);
        previousSectionStart = start;
      }
    }
  }

  shots.sort((a, b) => a.start - b.start || a.index - b.index);
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i]!;
    if (shot.start > duration + 0.001) {
      errors.push(`${shot.id}: starts at ${shot.start.toFixed(2)}s, after the song ends (${duration.toFixed(2)}s)`);
    }
    if (i + 1 < shots.length && shots[i + 1]!.start < shot.start - 0.001) {
      errors.push(`${shot.id}: starts after the next shot`);
    }
    if (!Number.isFinite(shot.end)) {
      const next = shots[i + 1]?.start;
      shot.end = next ?? duration;
    }
    if (shot.end <= shot.start + 0.02) {
      errors.push(`${shot.id}: length ${(shot.end - shot.start).toFixed(3)}s is too short`);
    }
  }
  if (shots.length && shots[0]!.start > -preroll + 0.001) {
    warnings.push(`film starts at ${shots[0]!.start.toFixed(2)}s but preroll is ${preroll}s (first frame will be black)`);
  }

  const figures: CompiledFigure[] = (config.figures ?? []).map((f) => ({
    id: f.id,
    file: f.file,
    inks: f.inks ?? ['me', 'text', 'black'],
    key: f.key,
    tolerance: f.tolerance,
    reg: f.reg ?? [],
    offsets: f.offsets,
    crop: f.crop,
    flip: f.flip,
    alphaCut: f.alphaCut,
  }));

  let errAt: number | undefined;
  if (config.meta.errAt) {
    try {
      errAt = resolveTime(config.meta.errAt as TimeRef, resolvers).seconds;
    } catch (err) {
      errors.push(`meta.errAt cannot be resolved: ${(err as Error).message}`);
    }
  }
  if (style === 'plate' && errAt === undefined) {
    warnings.push('meta.errAt is not set: the plate style expects error red to be reserved until a specific cue');
  }

  const plan: Plan = {
    version: 1,
    meta: {
      title: config.meta.title,
      style,
      width,
      height,
      fps,
      seed,
      logline: config.meta.logline,
      author: config.meta.author,
    },
    clock: { bpm: clock.bpm, firstBeat: clock.firstBeat, beatsPerBar: clock.beatsPerBar, beatTimes: clock.beatTimes },
    song: {
      audio: config.song.audio,
      lrc: config.song.lrc ?? '',
      duration,
      preroll,
      offset: config.song.offset ?? 0,
    },
    palette,
    lyrics: lyrics.lines,
    lyricMeta: lyrics.meta,
    shots,
    figures,
    cast: config.cast ?? [],
    errAt,
    analysis,
    notes: [
      `compiled ${new Date().toISOString()}`,
      `analysis: bpm=${analysis.bpm} firstBeat=${analysis.firstBeat} confidence=${analysis.confidence}`,
      ...warnings,
    ],
  };

  if (errors.length) throw new Error(`compile failed:\n- ${errors.join('\n- ')}`);
  if (!opts.dryRun) {
    const out = join(dir, 'plan.json');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(plan, null, 2));
  }
  return { plan, errors, warnings };
}

/** Write a human storyboard (markdown) next to plan.json. */
export function writeStoryboard(projectDir: string, plan: Plan): string {
  const secs = new Map<string, { start: number; end: number; count: number; palette: string }>();
  for (const shot of plan.shots) {
    const s = secs.get(shot.section) ?? { start: shot.start, end: shot.end, count: 0, palette: shot.palette };
    s.start = Math.min(s.start, shot.start);
    s.end = Math.max(s.end, shot.end);
    s.count += 1;
    secs.set(shot.section, s);
  }
  const fmt = (t: number) => {
    const sign = t < 0 ? '-' : '';
    const a = Math.abs(t);
    return `${sign}${Math.floor(a / 60)}:${(a % 60).toFixed(2).padStart(5, '0')}`;
  };
  const lines: string[] = [];
  lines.push(`# Storyboard — ${plan.meta.title}`);
  lines.push('');
  if (plan.meta.logline) lines.push(`> ${plan.meta.logline}`);
  lines.push('');
  lines.push(`Style: **${plan.meta.style}** · ${plan.meta.width}×${plan.meta.height} @ ${plan.meta.fps} fps · ${plan.shots.length} shots`);
  lines.push('');
  lines.push(`Tempo: **${plan.clock.bpm} BPM**, first beat ${plan.clock.firstBeat.toFixed(3)}s, preroll ${plan.song.preroll}s.`);
  lines.push('');
  lines.push('| Time | Section | Shots | Avg | Palette |');
  lines.push('| --- | --- | ---: | ---: | --- |');
  for (const [id, s] of secs) {
    lines.push(`| ${fmt(s.start)}–${fmt(s.end)} | ${id} | ${s.count} | ${((s.end - s.start) / s.count).toFixed(2)}s | ${s.palette} |`);
  }
  lines.push('');
  lines.push('| Time | Bar:beat | Shot | Scene | Lines | Moment | Palette | Enter |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  const clock = new Clock({ bpm: plan.clock.bpm, firstBeat: plan.clock.firstBeat, beatsPerBar: plan.clock.beatsPerBar, beatTimes: plan.clock.beatTimes });
  for (const shot of plan.shots) {
    const { bar, beat } = clock.barOf(shot.start);
    lines.push(
      `| ${fmt(shot.start)}–${fmt(shot.end)} | ${bar}:${beat.toFixed(1)} | \`${shot.id}\` | ${shot.scene} | ${shot.lines.join(', ') || '—'} | ${shot.moment.replace(/\|/g, '\\|')} | ${shot.palette} | ${shot.enter} |`,
    );
  }
  lines.push('');
  const file = join(projectDir, 'STORYBOARD.md');
  writeFileSync(file, lines.join('\n'));
  return file;
}
