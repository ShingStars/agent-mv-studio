import type { StyleDefinition } from '../../core/scene.js';
import { tuiScenes } from './scenes.js';

/**
 * The TUI style: a light desktop, a dark terminal, a cream chat window,
 * and a lyric band — the sequel grammar of the reference PV.
 * Design space is 1280x720; the renderer scales to any output size.
 */
export const style: StyleDefinition = {
  name: 'tui',
  designW: 1280,
  designH: 720,
  palettePreset: 'tui',
  scenes: tuiScenes,
  defaultTransition: 'fade',
  post: { grain: 0.006, vignette: 0.08, scan: 0 },
};
