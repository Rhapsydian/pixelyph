// The shared swatch library (`Canvas.palette`) — three independent groups:
// plain hex colors, reusable fill values (gradients/patterns), and full
// saved layer styles (fill+stroke+effects). Colors are addressed by their
// own string value (like the old flat-array palette always was); fills and
// styles are addressed by a stamped `id`, since two entries can otherwise
// be identical or hard to tell apart (two gradients, two saved styles).
//
// `normalizePalette` is the one migration touch point for every pre-Phase-9
// save/default that still hands this a bare `string[]` (Canvas.js's
// createCanvas, io/projectFile.js's deserializeProject) — everything past
// that point only ever sees the `{ colors, fills, styles }` shape.

let nextId = 1;
function makeId(prefix) {
  return `${prefix}-${nextId++}`;
}

/** @returns {{ colors: string[], fills: object[], styles: object[] }} */
export function createPalette() {
  return { colors: [], fills: [], styles: [] };
}

/**
 * @param {string[]|{colors?:string[],fills?:object[],styles?:object[]}} [input]
 * @returns {{ colors: string[], fills: object[], styles: object[] }}
 */
export function normalizePalette(input) {
  if (!input) return createPalette();
  // Copies the array rather than aliasing it — callers like
  // projectFactory.js's buildDrawDocument pass the same shared
  // DEFAULT_PALETTE constant to every new canvas; without a copy here,
  // reordering/clearing one canvas's colors would mutate every other
  // canvas (and the constant itself) sharing that reference.
  if (Array.isArray(input)) return { colors: [...input], fills: [], styles: [] };
  return { colors: input.colors ?? [], fills: input.fills ?? [], styles: input.styles ?? [] };
}

/**
 * Reassigns `palette.colors` to a new array rather than pushing onto the
 * existing one in place — state.js's commit() only swaps the top-level
 * `canvas` reference, so a nested array mutated in place (same reference,
 * just longer) would leave any Zustand selector reading `palette.colors`
 * directly (e.g. PalettePanel.jsx's ColorsGroup) unable to tell anything
 * changed, and the swatch grid would silently never re-render. Same
 * reasoning applies to addFill/addStyle below.
 *
 * @param {object} palette
 * @param {string} hex
 */
export function addColor(palette, hex) {
  if (palette.colors.includes(hex)) return;
  palette.colors = [...palette.colors, hex];
}

/**
 * @param {object} palette
 * @param {object} fillValue a Layer.style.fill-shaped gradient/pattern value
 * @returns {object} the stamped entry
 */
export function addFill(palette, fillValue) {
  const entry = { ...fillValue, id: makeId('fill') };
  palette.fills = [...palette.fills, entry];
  return entry;
}

/**
 * @param {object} palette
 * @param {{ fill: string|object|null, stroke?: object, effects: object[] }} styleValue
 * @returns {object} the stamped entry
 */
export function addStyle(palette, styleValue) {
  const entry = { ...styleValue, id: makeId('style') };
  palette.styles = [...palette.styles, entry];
  return entry;
}

function groupArray(palette, group) {
  if (group === 'colors') return palette.colors;
  if (group === 'fills') return palette.fills;
  if (group === 'styles') return palette.styles;
  throw new Error(`Palette: unknown group '${group}'`);
}

function keyOf(entry, group) {
  return group === 'colors' ? entry : entry.id;
}

/**
 * @param {object} palette
 * @param {'colors'|'fills'|'styles'} group
 * @param {string} key a color string (colors) or entry id (fills/styles)
 */
export function removeEntry(palette, group, key) {
  const arr = groupArray(palette, group);
  const filtered = arr.filter((entry) => keyOf(entry, group) !== key);
  if (group === 'colors') palette.colors = filtered;
  else if (group === 'fills') palette.fills = filtered;
  else palette.styles = filtered;
}

/**
 * Swaps an entry with its neighbor one step towards the front (+1) or back
 * (-1). No-ops at either end — same shape as Canvas.js's reorderLayer.
 *
 * @param {object} palette
 * @param {'colors'|'fills'|'styles'} group
 * @param {string} key
 * @param {1|-1} direction
 */
export function reorderEntry(palette, group, key, direction) {
  const arr = groupArray(palette, group);
  const i = arr.findIndex((entry) => keyOf(entry, group) === key);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= arr.length) return;
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  if (group === 'colors') palette.colors = next;
  else if (group === 'fills') palette.fills = next;
  else palette.styles = next;
}

/**
 * @param {object} palette
 * @param {'colors'|'fills'|'styles'} group
 */
export function clearGroup(palette, group) {
  if (group === 'colors') palette.colors = [];
  else if (group === 'fills') palette.fills = [];
  else if (group === 'styles') palette.styles = [];
  else throw new Error(`Palette: unknown group '${group}'`);
}

/** @returns {string} pretty-printed JSON, ready to write to a `.pixelyph-palette.json` file */
export function serializePaletteFile(palette) {
  return JSON.stringify({ pixelyphPalette: 1, colors: palette.colors, fills: palette.fills, styles: palette.styles }, null, 2);
}

/**
 * @param {string} text
 * @returns {{ colors: string[], fills: object[], styles: object[] }|null} null if `text` isn't valid JSON in the expected shape
 */
export function parsePaletteFile(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== 'object' || doc.pixelyphPalette == null) return null;
  return normalizePalette(doc);
}
