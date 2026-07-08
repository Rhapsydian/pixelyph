// Pure helpers for creating new project documents. Isolated here so they
// can be imported by node --test without pulling in the store's IO/DOM
// dependencies.

import { createCanvas } from './Canvas.js';
import { createGlyphSet } from './GlyphSet.js';

export const DEFAULT_WIDTH = 16;
export const DEFAULT_HEIGHT = 16;
// The PICO-8 fantasy-console palette — a well-known, deliberately limited
// 16-color set that's a reasonable default starting point for pixel art
// regardless of what the final piece needs — plus a true white right after
// black, since PICO-8's own palette has no pure #FFFFFF (its lightest tone,
// #FFF1E8, is an off-white cream).
export const DEFAULT_PALETTE = [
  '#000000', '#FFFFFF', '#1D2B53', '#7E2553', '#008751',
  '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8',
  '#FF004D', '#FFA300', '#FFEC27', '#00E436',
  '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA',
];
export const DEFAULT_INITIAL_CHARSET_PRESET = 'basic-latin';

// A few starter gradients/styles so the Palette panel isn't empty in those
// groups on a fresh project — fixed string ids (not Palette.js's makeId()
// counter) since these are static constants, not runtime-created entries.
export const DEFAULT_FILLS = [
  {
    id: 'default-fill-sunset', type: 'linear-gradient', angle: 90, name: 'Sunset',
    stops: [{ offset: 0, color: '#FFA300' }, { offset: 0.5, color: '#FF004D' }, { offset: 1, color: '#7E2553' }],
  },
  {
    id: 'default-fill-ocean', type: 'linear-gradient', angle: 90, name: 'Ocean',
    stops: [{ offset: 0, color: '#83E8FF' }, { offset: 0.5, color: '#29ADFF' }, { offset: 1, color: '#1D2B53' }],
  },
  {
    id: 'default-fill-glow-radial', type: 'radial-gradient', cx: 0.5, cy: 0.5, r: 0.5, name: 'Radial Glow',
    stops: [{ offset: 0, color: '#FFF1E8' }, { offset: 1, color: '#FFEC27' }],
  },
];
// Every fill here is non-null since applying a style replaces a shape's
// fill+stroke+effects wholesale (state/store.js's applyPaletteEntryToActiveGrid)
// — a null fill would clear whatever the user already had.
export const DEFAULT_STYLES = [
  {
    id: 'default-style-outlined', name: 'Outlined', fill: '#FFFFFF',
    stroke: { color: '#000000', width: 0.15, linejoin: 'round' }, effects: [],
  },
  {
    id: 'default-style-drop-shadow', name: 'Drop Shadow', fill: '#FFFFFF',
    effects: [{ type: 'drop-shadow', dx: 0.3, dy: 0.3, blur: 0.2, color: '#000000', opacity: 0.6 }],
  },
  {
    id: 'default-style-glow', name: 'Glow', fill: '#FFEC27',
    effects: [{ type: 'drop-shadow', dx: 0, dy: 0, blur: 0.4, color: '#FFEE88', opacity: 0.9 }],
  },
];

/** Creates the initial Canvas for a new Draw-mode project with standard defaults. */
export function buildDrawDocument() {
  return createCanvas({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    palette: { colors: DEFAULT_PALETTE, fills: DEFAULT_FILLS, styles: DEFAULT_STYLES },
  });
}

/**
 * @param {{ kind?: 'characters'|'icons', familyName?: string, initialPreset?: string,
 *           pixelsPerEm?: number, defaultGlyphWidth?: number|null }} [options]
 * @returns {{ glyphSet: object, initialPreset: string }}
 */
export function buildGlyphDocument({
  kind = 'characters',
  familyName = 'Untitled',
  initialPreset = DEFAULT_INITIAL_CHARSET_PRESET,
  pixelsPerEm = 16,
  defaultGlyphWidth = null,
} = {}) {
  // baselineRow tracks the 75%-of-height convention so it stays correct
  // when pixelsPerEm is set upfront in the wizard rather than left at the
  // createFontMeta default (which assumes pixelsPerEm === 16).
  const baselineRow = Math.max(1, Math.round(pixelsPerEm * 0.75));
  return {
    glyphSet: createGlyphSet({ kind, meta: { familyName, pixelsPerEm, baselineRow, defaultGlyphWidth } }),
    initialPreset,
  };
}
