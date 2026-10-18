/**
 * Colour = state.
 *
 * A palette is a named state mapping semantic roles (bg / text / me / err …)
 * to hex colours. Scenes never hard-code a colour: they ask the palette for a
 * role, and the palette only changes when the story changes state.
 */

export type Roles = Record<string, string>;
export type PaletteSet = Record<string, Roles>;

export const FONTS = {
  mono: '"JetBrains Mono", "Consolas", "Courier New", monospace',
  serif: '"Source Serif 4", "Noto Serif SC", "Songti SC", Georgia, serif',
  sans: '"Inter", "Noto Sans SC", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif',
} as const;

export type FontRole = keyof typeof FONTS;

const PLATE_BASE: Roles = {
  bg: '#222220',
  panel: '#2a2a27',
  raised: '#333330',
  line: '#4a4a45',
  text: '#faf9f5',
  sub: '#cfc9bc',
  mute: '#8a857b',
  me: '#d97757',
  meHot: '#f0a06a',
  meDim: '#8f4c35',
  err: '#f5506f',
  errDim: '#7c2434',
  bloom: '#3a2f28',
  glow: '#ffb37a',
  paper: '#222220',
  black: '#0c0b0a',
  accent: '#d97757',
  shade: '#000000',
};

/** The six states the plate style actually needs. */
export const PLATE_STATES: PaletteSet = {
  off: {
    ...PLATE_BASE,
    bg: '#1a1a19',
    panel: '#222220',
    raised: '#2a2a27',
    line: '#383835',
    text: '#b8b4a9',
    sub: '#8d8a81',
    mute: '#5c5a54',
    me: '#6d6961',
    meHot: '#8a857b',
    meDim: '#494743',
    err: '#8a4a55',
    errDim: '#3a2529',
    bloom: '#262624',
    glow: '#6d6961',
    paper: '#1a1a19',
    accent: '#b8b4a9',
  },
  on: { ...PLATE_BASE },
  warm: {
    ...PLATE_BASE,
    bg: '#241f1b',
    panel: '#2d2722',
    raised: '#372f29',
    line: '#51463d',
    text: '#fbf3e4',
    sub: '#d8c9b3',
    mute: '#93836f',
    me: '#e08a5f',
    meHot: '#ffb37a',
    meDim: '#94513a',
    bloom: '#4a3529',
    glow: '#ffc48f',
    paper: '#241f1b',
    accent: '#e08a5f',
  },
  error: {
    ...PLATE_BASE,
    bg: '#26191c',
    panel: '#2e1f22',
    raised: '#38262a',
    line: '#4e343a',
    text: '#f7e9ec',
    sub: '#d6bcc2',
    mute: '#8f7379',
    me: '#cd735d',
    meHot: '#f0a06a',
    meDim: '#8a4a3a',
    err: '#f5506f',
    errDim: '#5f1c28',
    bloom: '#4a2028',
    glow: '#ff8aa0',
    paper: '#26191c',
    accent: '#f5506f',
  },
  ash: {
    ...PLATE_BASE,
    bg: '#202020',
    panel: '#282828',
    raised: '#303030',
    line: '#444444',
    text: '#d9d6cd',
    sub: '#b0aca3',
    mute: '#77746c',
    me: '#a09a90',
    meHot: '#bdb6aa',
    meDim: '#6b675f',
    err: '#9a5a64',
    errDim: '#3c2a2e',
    bloom: '#262626',
    glow: '#a09a90',
    paper: '#202020',
    accent: '#a09a90',
  },
  dead: {
    ...PLATE_BASE,
    bg: '#141413',
    panel: '#1a1a19',
    raised: '#202020',
    line: '#2c2c2a',
    text: '#8e8b83',
    sub: '#6f6c65',
    mute: '#4a4843',
    me: '#6b675f',
    meHot: '#8a857b',
    meDim: '#3f3d39',
    err: '#6d4148',
    errDim: '#2a1c1f',
    bloom: '#161615',
    glow: '#4a4843',
    paper: '#141413',
    accent: '#6b675f',
  },
};

const TUI_BASE: Roles = {
  paper: '#ece8de',
  bg: '#ece8de',
  ink: '#1d2029',
  slab: '#1b1d24',
  slabLine: '#2e3140',
  dim: '#7d796f',
  her: '#4d6bfe',
  cream: '#f7f3e8',
  panel: '#e4e0d5',
  raised: '#dcd8cc',
  bubble: '#fbf7ec',
  bubbleInk: '#1d2029',
  text: '#1d2029',
  mute: '#8d897f',
  warn: '#c2410c',
  line: '#c9c4b8',
  model1: '#8b5cf6',
  model2: '#0ea5e9',
  model3: '#f59e0b',
  model4: '#10b981',
  model5: '#ef4444',
  model6: '#e879f9',
  model7: '#14b8a6',
  shade: '#000000',
};

export const TUI_STATES: PaletteSet = {
  paper: { ...TUI_BASE },
  cool: {
    ...TUI_BASE,
    paper: '#e6e7e2',
    panel: '#dcded8',
    line: '#c2c5c0',
    ink: '#1c2027',
    dim: '#767a76',
  },
  deep: {
    ...TUI_BASE,
    paper: '#0f1a24',
    panel: '#13212d',
    line: '#24384a',
    ink: '#d8e6ee',
    text: '#d8e6ee',
    cream: '#eef6fa',
    dim: '#6f8798',
    her: '#5b8cff',
    mute: '#5c7180',
  },
  night: {
    ...TUI_BASE,
    paper: '#1a1a1f',
    panel: '#202027',
    line: '#33333d',
    ink: '#e8e6df',
    text: '#e8e6df',
    cream: '#f4f2ea',
    dim: '#8b8a86',
  },
  flush: {
    ...TUI_BASE,
    paper: '#f4f1e8',
    panel: '#ebe7db',
    line: '#d6d0c1',
    ink: '#171a21',
    her: '#3f5ef5',
  },
};

export const PRESET_STATES: Record<string, PaletteSet> = {
  plate: PLATE_STATES,
  tui: TUI_STATES,
};

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = Number.parseInt(h, 16);
  if (!Number.isFinite(n)) return [1, 1, 1];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Gamma-correct mix of two hex colours; k=0 → a, k=1 → b. */
export function mixHex(a: string, b: string, k: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const t = Math.max(0, Math.min(1, k));
  const lin = (v: number) => (v / 255) ** 2.2;
  const out = (v: number) => (v ** (1 / 2.2)) * 255;
  return rgbToHex(
    out(lin(r1) * (1 - t) + lin(r2) * t),
    out(lin(g1) * (1 - t) + lin(g2) * t),
    out(lin(b1) * (1 - t) + lin(b2) * t),
  );
}

/** Convert a hex colour into an rgba() string. */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(4)})`;
}

/** Linear blend of two role sets (missing roles fall back to the other side). */
export function mixPalettes(a: Roles, b: Roles, k: number): Roles {
  const out: Roles = {};
  for (const key of Object.keys(a)) out[key] = a[key]!;
  for (const key of Object.keys(b)) {
    if (!(key in out)) out[key] = b[key]!;
    else out[key] = mixHex(out[key]!, b[key]!, k);
  }
  return out;
}

/** Resolve a shot's palette state, falling back to the first state. */
export function resolveState(set: PaletteSet, name: string | undefined): Roles {
  if (name && set[name]) return set[name]!;
  const first = Object.keys(set)[0];
  if (!first) throw new Error('Palette: empty palette set');
  return set[name ?? first]!;
}

/** Relative luminance 0..1 (used by the flash checker and contrast guards). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Pick ink (black or cream) for text on a background. */
export function contrastInk(bg: string, dark = '#111111', light = '#faf9f5'): string {
  return luminance(bg) > 0.42 ? dark : light;
}
