// Pure helpers for creating new project documents. Isolated here so they
// can be imported by node --test without pulling in the store's IO/DOM
// dependencies.

import { createCanvas } from './Canvas.js';
import { createGlyphSet } from './GlyphSet.js';

export const DEFAULT_WIDTH = 16;
export const DEFAULT_HEIGHT = 16;
export const DEFAULT_PALETTE = ['#000000', '#ffffff', '#7f2b2b', '#2b6f39', '#2b4d7f', '#e0b04d'];
export const DEFAULT_INITIAL_CHARSET_PRESET = 'basic-latin';

/** Creates the initial Canvas for a new Draw-mode project with standard defaults. */
export function buildDrawDocument() {
  return createCanvas({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, palette: DEFAULT_PALETTE });
}

/**
 * @param {{ kind?: 'characters'|'icons', familyName?: string, initialPreset?: string }} [options]
 * @returns {{ glyphSet: object, initialPreset: string }}
 */
export function buildGlyphDocument({ kind = 'characters', familyName = 'Untitled', initialPreset = DEFAULT_INITIAL_CHARSET_PRESET } = {}) {
  return {
    glyphSet: createGlyphSet({ kind, meta: { familyName } }),
    initialPreset,
  };
}
