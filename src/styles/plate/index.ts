import type { StyleDefinition } from '../../core/scene.js';
import { plateScenes } from './scenes.js';

/**
 * The plate style: full-frame prints, three inks, one silhouette, big type.
 * Design space is 1920x1080; the renderer scales to any output size.
 */
export const style: StyleDefinition = {
  name: 'plate',
  designW: 1920,
  designH: 1080,
  palettePreset: 'plate',
  scenes: plateScenes,
  defaultTransition: 'cut',
};
