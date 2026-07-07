import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPalette,
  normalizePalette,
  addColor,
  addFill,
  addStyle,
  removeEntry,
  reorderEntry,
  renameEntry,
  clearGroup,
  serializePaletteFile,
  parsePaletteFile,
} from '../../src/model/Palette.js';

test('createPalette starts with three empty groups', () => {
  assert.deepEqual(createPalette(), { colors: [], fills: [], styles: [] });
});

test('normalizePalette migrates a bare array (pre-Phase-9 shape) into colors, leaving fills/styles empty', () => {
  assert.deepEqual(normalizePalette(['#000000', '#ffffff']), { colors: ['#000000', '#ffffff'], fills: [], styles: [] });
});

test('normalizePalette passes an already-object palette through, defaulting any missing group', () => {
  assert.deepEqual(normalizePalette({ colors: ['#111111'] }), { colors: ['#111111'], fills: [], styles: [] });
  assert.deepEqual(normalizePalette({ colors: ['#111111'], fills: [{ id: 'fill-1', type: 'linear-gradient' }], styles: [] }), {
    colors: ['#111111'],
    fills: [{ id: 'fill-1', type: 'linear-gradient' }],
    styles: [],
  });
});

test('normalizePalette handles a missing/undefined palette', () => {
  assert.deepEqual(normalizePalette(undefined), { colors: [], fills: [], styles: [] });
});

test('addColor dedupes by exact string value', () => {
  const palette = createPalette();
  addColor(palette, '#ff0000');
  addColor(palette, '#ff0000');
  addColor(palette, '#00ff00');
  assert.deepEqual(palette.colors, ['#ff0000', '#00ff00']);
});

test('addFill stamps a fresh id and returns the stamped entry', () => {
  const palette = createPalette();
  const entry = addFill(palette, { type: 'linear-gradient', angle: 0, stops: [] });
  assert.equal(palette.fills.length, 1);
  assert.equal(palette.fills[0], entry);
  assert.ok(entry.id);
  assert.equal(entry.type, 'linear-gradient');
});

test('addStyle stamps a fresh id and clones the fill/stroke/effects fields onto the entry', () => {
  const palette = createPalette();
  const style = { fill: '#0000ff', stroke: { color: '#000000', width: 0.1 }, effects: [] };
  const entry = addStyle(palette, style);
  assert.equal(palette.styles.length, 1);
  assert.ok(entry.id);
  assert.equal(entry.fill, '#0000ff');
});

test('removeEntry drops a color by value, and a fill/style entry by id', () => {
  const palette = createPalette();
  addColor(palette, '#ff0000');
  addColor(palette, '#00ff00');
  removeEntry(palette, 'colors', '#ff0000');
  assert.deepEqual(palette.colors, ['#00ff00']);

  const fill = addFill(palette, { type: 'radial-gradient', cx: 0.5, cy: 0.5, r: 0.5, stops: [] });
  removeEntry(palette, 'fills', fill.id);
  assert.deepEqual(palette.fills, []);
});

test('reorderEntry swaps a color with its neighbor and no-ops past either end', () => {
  const palette = createPalette();
  addColor(palette, '#111111');
  addColor(palette, '#222222');
  addColor(palette, '#333333');
  reorderEntry(palette, 'colors', '#111111', 1);
  assert.deepEqual(palette.colors, ['#222222', '#111111', '#333333']);
  reorderEntry(palette, 'colors', '#222222', -1); // already at the front; no-op
  assert.deepEqual(palette.colors, ['#222222', '#111111', '#333333']);
  reorderEntry(palette, 'colors', '#333333', 1); // already at the back; no-op
  assert.deepEqual(palette.colors, ['#222222', '#111111', '#333333']);
});

test('reorderEntry works on fills/styles by id, same neighbor-swap shape', () => {
  const palette = createPalette();
  const a = addFill(palette, { type: 'linear-gradient', angle: 0, stops: [] });
  const b = addFill(palette, { type: 'linear-gradient', angle: 90, stops: [] });
  reorderEntry(palette, 'fills', a.id, 1);
  assert.deepEqual(palette.fills.map((f) => f.id), [b.id, a.id]);
});

test('renameEntry sets a name on a fills/styles entry, and is a no-op on colors (a color has no separate name from its hex value)', () => {
  const palette = createPalette();
  const fill = addFill(palette, { type: 'linear-gradient', angle: 0, stops: [] });
  renameEntry(palette, 'fills', fill.id, 'Sunset');
  assert.equal(palette.fills[0].name, 'Sunset');

  addColor(palette, '#ff0000');
  renameEntry(palette, 'colors', '#ff0000', 'Red');
  assert.deepEqual(palette.colors, ['#ff0000']);
});

test('clearGroup empties only the targeted group', () => {
  const palette = createPalette();
  addColor(palette, '#ff0000');
  addFill(palette, { type: 'linear-gradient', angle: 0, stops: [] });
  addStyle(palette, { fill: '#000000', effects: [] });
  clearGroup(palette, 'colors');
  assert.deepEqual(palette.colors, []);
  assert.equal(palette.fills.length, 1);
  assert.equal(palette.styles.length, 1);
});

test('serializePaletteFile/parsePaletteFile round-trip all three groups', () => {
  const palette = createPalette();
  addColor(palette, '#abcdef');
  addFill(palette, { type: 'pattern', content: '<rect width="1" height="1"/>', width: 2, height: 2 });
  addStyle(palette, { fill: '#123456', effects: [] });
  const text = serializePaletteFile(palette);
  const parsed = parsePaletteFile(text);
  assert.deepEqual(parsed, palette);
});

test('parsePaletteFile returns null for plain non-palette JSON or invalid text', () => {
  assert.equal(parsePaletteFile('not json'), null);
  assert.equal(parsePaletteFile('{"foo": "bar"}'), null);
  assert.equal(parsePaletteFile('[1,2,3]'), null);
});
