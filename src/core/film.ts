/**
 * The film: one pure function from song time to one frame.
 *
 * There is no timeline editor and no scene state. `renderFrame(t)` looks up the
 * shot that owns `t`, draws it into a scratch surface, hands the outgoing shot
 * to the post stack for the transition, then draws the style's chrome on top.
 */

import { AssetBank } from './assets.js';
import { Lyrics } from './lyrics.js';
import { PostProcessor, type PostOptions } from './post.js';
import { frameRng } from './prng.js';
import { rgba, resolveState, type Roles } from './palette.js';
import { makeSurface, Surface } from './surface.js';
import { Clock } from './time.js';
import type { CompiledShot, Plan } from '../compiler/schema.js';
import type { ChromeContext, SceneEnv, SceneFn, StyleDefinition } from './scene.js';

const ENTER_DURATION: Record<string, number> = {
  cut: 0,
  fade: 0.34,
  pushLeft: 0.4,
  pushUp: 0.4,
  zoom: 0.46,
  scan: 0.3,
  whiteout: 0.36,
};

export interface FilmOptions {
  width?: number;
  height?: number;
  fps?: number;
  baseUrl?: string;
  /** Skip WebGL post (CPU fallback); useful on machines without WebGL2. */
  noPost?: boolean;
}

export class Film {
  readonly plan: Plan;
  readonly style: StyleDefinition;
  readonly env: SceneEnv;
  readonly out: Surface;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly startTime: number;
  readonly endTime: number;

  private readonly scratchA: Surface;
  private readonly scratchB: Surface;
  private readonly post: PostProcessor | null;
  private readonly canvas: HTMLCanvasElement;
  private lastError = '';

  private constructor(
    canvas: HTMLCanvasElement,
    plan: Plan,
    style: StyleDefinition,
    env: SceneEnv,
    post: PostProcessor | null,
  ) {
    this.canvas = canvas;
    this.plan = plan;
    this.style = style;
    this.env = env;
    this.width = plan.meta.width;
    this.height = plan.meta.height;
    this.fps = plan.meta.fps;
    this.startTime = -plan.song.preroll;
    this.endTime = plan.song.duration;
    this.out = new Surface(canvas, style.designW, style.designH);
    const a = makeSurface(canvas.width, canvas.height, style.designW, style.designH);
    const b = makeSurface(canvas.width, canvas.height, style.designW, style.designH);
    this.scratchA = a;
    this.scratchB = b;
    this.post = post;
  }

  static async create(
    canvas: HTMLCanvasElement,
    plan: Plan,
    style: StyleDefinition,
    opts: FilmOptions = {},
  ): Promise<Film> {
    const width = opts.width ?? plan.meta.width;
    const height = opts.height ?? plan.meta.height;
    canvas.width = width;
    canvas.height = height;
    const fps = opts.fps ?? plan.meta.fps;
    const clock = new Clock({
      bpm: plan.clock.bpm,
      firstBeat: plan.clock.firstBeat,
      beatsPerBar: plan.clock.beatsPerBar,
      beatTimes: plan.clock.beatTimes,
    });
    const lyrics = new Lyrics(plan.lyrics, plan.lyricMeta ?? {});
    const assets = new AssetBank();
    await assets.load(plan, opts.baseUrl ?? '/project/');
    const palettes: Record<string, Roles> = {};
    for (const [name, state] of Object.entries(plan.palette.states)) palettes[name] = state;
    const env: SceneEnv = {
      plan,
      clock,
      lyrics,
      analysis: plan.analysis ?? null,      assets,
      palettes,
      width,
      height,
      style: plan.meta.style,
      fps,
      seed: plan.meta.seed,
    };
    let post: PostProcessor | null = null;
    if (!opts.noPost) {
      try {
        const pc = document.createElement('canvas');
        pc.width = width;
        pc.height = height;
        post = new PostProcessor(pc);
        if (!post.ok) post = null;
      } catch {
        post = null;
      }
    }
    return new Film(canvas, plan, style, env, post);
  }

  /** Every shot, sorted, for the storyboard and player scrubber. */
  get shots(): CompiledShot[] {
    return this.env.plan.shots;
  }

  shotAt(t: number): CompiledShot {
    const shots = this.env.plan.shots;
    let lo = 0;
    let hi = shots.length - 1;
    let idx = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (shots[mid]!.start <= t) {
        idx = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return shots[idx]!;
  }

  private paletteFor(shot: CompiledShot): Roles {
    const p = this.env.plan.palette;
    return this.env.palettes[shot.palette] ?? this.env.palettes[p.default] ?? Object.values(this.env.palettes)[0]!;
  }

  private drawShot(surface: Surface, shot: CompiledShot, t: number, frame: number): void {
    const scene: SceneFn | undefined = this.style.scenes[shot.scene];
    surface.reset(this.env.palettes[shot.palette]?.bg ?? '#222220');
    if (!scene) {
      surface.fill('#101010');
      surface.text(`missing scene: ${shot.scene}`, 80, 80, { font: 'mono', size: 24, color: '#f5506f' });
      return;
    }
    const lt = t - shot.start;
    const u = Math.max(0, Math.min(1, lt / Math.max(1e-4, shot.end - shot.start)));
    const frameRngLocal = frameRng(this.env.seed, shot.id, frame);
    const ctx = {
      s: surface,
      env: this.env,
      shot,
      t,
      lt,
      u,
      frame,
      rng: frameRngLocal,
      pal: this.paletteFor(shot),
      state: {} as Record<string, unknown>,
    };
    try {
      scene(ctx);
    } catch (err) {
      const message = err instanceof Error ? `${err.message}\n${err.stack?.split('\n')[1] ?? ''}` : String(err);
      if (message !== this.lastError) {
        this.lastError = message;
        console.warn(`[scene ${shot.id}] ${shot.scene} failed:\n${message}`);
      }
      surface.fill('#101010');
      surface.text('SCENE ERROR', 80, 100, {
        font: 'mono',
        size: 30,
        color: '#f5506f',
        tracking: 0.14,
      });
      surface.text(`${shot.id} · ${shot.scene}`, 80, 150, { font: 'mono', size: 18, color: '#faf9f5' });
      surface.text(message.slice(0, 96), 80, 186, { font: 'mono', size: 15, color: '#cfc9bc' });
    }
  }

  private drawErrorCard(t: number): void {
    const s = this.out;
    const rng = frameRng(this.env.seed, 'err', Math.round(t * this.fps));
    s.fill('#120d0c');
    s.ctx.save();
    s.ctx.globalAlpha = 0.5;
    for (let i = 0; i < 22; i++) {
      const y = rng.float(0, s.designH);
      s.rect(0, y, s.designW, rng.float(1, 3), rgba('#f5506f', 0.18));
    }
    s.ctx.restore();
    s.text('ERR', 120, 220, {
      font: 'mono',
      size: 120,
      color: '#f5506f',
      tracking: 0.06,
    });
    s.text('unhandled promise rejection', 124, 292, { font: 'mono', size: 26, color: '#faf9f5' });
    s.text(`${this.plan.errAt ?? ''}`.trim() ? `errAt ${this.plan.errAt}s · the assistant stopped answering` : 'the assistant stopped answering', 124, 336, {
      font: 'serif',
      size: 30,
      color: '#d97757',
    });
    s.text('> retry   > ignore   > restart', 124, 400, { font: 'mono', size: 18, color: '#cfc9bc' });
  }

  renderFrame(t: number): void {
    const frame = Math.round(t * this.fps);
    const shots = this.env.plan.shots;
    if (!shots.length) {
      this.out.fill('#000000');
      return;
    }
    const current = this.shotAt(t);
    const index = shots.indexOf(current);
    const prev = index > 0 ? shots[index - 1]! : null;
    const enter = current.enter || (prev ? 'cut' : 'cut');
    const dur = ENTER_DURATION[enter] ?? 0;
    const p = dur > 0 && prev ? Math.max(0, Math.min(1, (t - current.start) / dur)) : 1;
    const transitioning = p < 1 && prev !== null && dur > 0;

    this.drawShot(this.scratchA, current, t, frame);
    if (transitioning && prev) {
      this.drawShot(this.scratchB, prev, Math.min(t, prev.end - 1e-3), frame);
    }

    this.out.reset('#000000');
    const opts: PostOptions = {
      transition: (enter as PostOptions['transition']) ?? 'cut',
      progress: p,
      time: t,
      seed: Math.round(t * this.fps),
      grain: this.style.post?.grain ?? 0.02,
      vignette: this.style.post?.vignette ?? 0.3,
      scan: this.style.post?.scan ?? 0.02,
    };
    if (this.post) {
      this.post.render(this.scratchA.canvas, transitioning ? this.scratchB.canvas : null, opts);
      this.out.ctx.save();
      this.out.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.out.ctx.drawImage(this.post.canvas, 0, 0);
      this.out.ctx.restore();
    } else if (transitioning) {
      this.out.ctx.save();
      this.out.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.out.ctx.globalAlpha = 1;
      this.out.ctx.drawImage(this.scratchB.canvas, 0, 0);
      this.out.ctx.globalAlpha = p;
      this.out.ctx.drawImage(this.scratchA.canvas, 0, 0);
      this.out.ctx.restore();
    } else {
      this.out.ctx.save();
      this.out.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.out.ctx.drawImage(this.scratchA.canvas, 0, 0);
      this.out.ctx.restore();
    }

    // Chrome is drawn after post: always crisp, never bloomed.
    if (this.style.chrome) {
      const chromeCtx: ChromeContext = {
        s: this.out,
        env: this.env,
        t,
        pal: this.paletteFor(current),
        frame,
      };
      this.style.chrome(chromeCtx);
    }

    if (typeof this.plan.errAt === 'number' && t >= this.plan.errAt) {
      this.drawErrorCard(t);
    }
  }
}
