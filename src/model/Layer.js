// A Layer is pure identity/z-order bookkeeping — no style, offset, or size
// of its own. The actual pixel content lives one level down, in each
// frame's `grids` (Shapes — see Grid.js) — see docs/data-model.md for why
// this split exists (a Layer used to also be "the" styled pixel content,
// which forced a dense per-frame buffer to be pre-allocated the first time
// any color was used anywhere in the animation).

let nextId = 1;
/** @returns {string} a fresh `layer-${n}` id — also used directly by io/projectFile.js's v3 migration, which mints a brand new collapsed Layer for Simple-tier saves rather than reusing any single old layer's id. */
export function makeId() {
  return `layer-${nextId++}`;
}

/**
 * @typedef {{ visible: boolean, grids: import('./Grid.js').Grid[] }} Frame
 * @typedef {{
 *   id: string, name: string, locked: boolean, opacity: number,
 *   frames: Frame[],
 * }} Layer
 */
// Visibility is per-*frame* (Frame.visible), not a single per-Layer
// boolean — different frames of the same animation can show or hide the
// same layer independently. `locked` and `opacity` stay layer-level; only
// visibility varies frame to frame. See Canvas.js's paintCell for the
// "hidden in the active frame behaves as locked" enforcement this enables.
// `frames.length` is always `canvas.frameCount`, kept in lockstep across
// every layer by Canvas.js's addFrame/duplicateFrame/removeFrame.

/**
 * @param {{ name?: string, frameCount?: number }} options
 * @returns {Layer}
 */
export function createLayer({ name = 'Layer', frameCount = 1 } = {}) {
  return {
    id: makeId(),
    name,
    locked: false,
    opacity: 1,
    frames: Array.from({ length: frameCount }, () => ({ visible: true, grids: [] })),
  };
}
