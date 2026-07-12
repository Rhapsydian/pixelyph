import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, paintCell, colorAt, addLayer, addGrid } from '../../src/model/Canvas.js';
import {
  normalizeRect,
  extractRectColors,
  extractRectFromActiveLayer,
  extractRectFromActiveGrid,
  clearRect,
  pasteCells,
  transformSelectionCells,
  liftGridSelection,
  moveGridSelectionBy,
  transformGridSelection,
  finalizeGridSelection,
  buildFloatingGridPreviewDoc,
  buildGridClonesByColor,
  buildGridCloneUnioned,
} from '../../src/model/selection.js';

/** Two independent shapes in one layer: A (flat color, dx 0-2) and B (gradient-object style, dx 5), both painted in row y=0. */
function setUpTwoShapeLayer(canvas) {
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, { name: 'L' });
  paintCell(canvas, 0, 0, '#ff0000');
  paintCell(canvas, 2, 0, '#ff0000'); // shape A grows to cover dx 0 and 2 (and the gap at 1, via growGridToInclude)
  const gridA = layer.frames[0].grids[0];
  canvas.activeGridId = null; // force the next paint to start a separate shape
  paintCell(canvas, 5, 0, '#0000ff');
  const gridB = layer.frames[0].grids[1];
  gridB.style.fill = { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] };
  canvas.activeGridId = gridA.id;
  return { layer, gridA, gridB };
}

test('normalizeRect handles corners given in any order', () => {
  assert.deepEqual(normalizeRect(3, 3, 0, 0), { x0: 0, y0: 0, x1: 3, y1: 3 });
  assert.deepEqual(normalizeRect(0, 3, 3, 0), { x0: 0, y0: 0, x1: 3, y1: 3 });
});

test('a move spanning two colors relocates both shapes correctly (selection/paste across multiple simple-tier Grids)', () => {
  const canvas = createCanvas({ width: 4, height: 4 });
  // a 2x1 selection covering one red cell and one green cell
  paintCell(canvas, 0, 0, '#ff0000');
  paintCell(canvas, 1, 0, '#00ff00');

  const rect = normalizeRect(0, 0, 1, 0);
  const cells = extractRectColors(canvas, rect);
  assert.deepEqual(
    cells.slice().sort((a, b) => a.dx - b.dx),
    [
      { dx: 0, dy: 0, color: '#ff0000' },
      { dx: 1, dy: 0, color: '#00ff00' },
    ],
  );

  clearRect(canvas, rect);
  assert.equal(colorAt(canvas, 0, 0), null);
  assert.equal(colorAt(canvas, 1, 0), null);

  // move it down-right by (2, 2)
  pasteCells(canvas, 2, 2, cells);
  assert.equal(colorAt(canvas, 2, 2), '#ff0000');
  assert.equal(colorAt(canvas, 3, 2), '#00ff00');

  // both source colors' shapes still exist (now relocated), nothing left behind
  const shapeColors = canvas.layers[0].frames[0].grids.map((g) => g.style.fill).sort();
  assert.deepEqual(shapeColors, ['#00ff00', '#ff0000']);
});

test('a non-destructive copy leaves the source untouched', () => {
  const canvas = createCanvas({ width: 4, height: 4 });
  paintCell(canvas, 0, 0, '#ff0000');
  const rect = normalizeRect(0, 0, 0, 0);
  const cells = extractRectColors(canvas, rect);
  pasteCells(canvas, 2, 2, cells);
  assert.equal(colorAt(canvas, 0, 0), '#ff0000'); // still there
  assert.equal(colorAt(canvas, 2, 2), '#ff0000'); // duplicated
});

test('extractRectColors omits empty cells rather than recording them as null', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  paintCell(canvas, 0, 0, '#ff0000');
  const cells = extractRectColors(canvas, { x0: 0, y0: 0, x1: 1, y1: 0 });
  assert.deepEqual(cells, [{ dx: 0, dy: 0, color: '#ff0000' }]);
});

// --- Advanced tier: per-layer selection scoping ---

test('extractRectFromActiveLayer only reads the active layer\'s own shapes, ignoring a non-active layer stacked on top of it', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  canvas.tier = 'advanced';
  const bottom = addLayer(canvas, { name: 'bottom' });
  canvas.activeLayerId = bottom.id;
  paintCell(canvas, 0, 0, '#0000ff');
  addLayer(canvas, { name: 'top' }); // becomes active, covers (1,0)
  paintCell(canvas, 1, 0, '#ff0000');
  canvas.activeLayerId = bottom.id; // scope back to the bottom layer

  const cells = extractRectFromActiveLayer(canvas, { x0: 0, y0: 0, x1: 1, y1: 0 });
  assert.deepEqual(cells, [{ dx: 0, dy: 0, color: '#0000ff' }]); // only the active (bottom) layer's own cell
});

test('extractRectFromActiveLayer falls back to a placeholder color for a non-solid (gradient) fill', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: 'grad' });
  paintCell(canvas, 0, 0, '#ffffff');
  const grid = canvas.layers[0].frames[0].grids[0];
  grid.style.fill = { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] };
  const cells = extractRectFromActiveLayer(canvas, { x0: 0, y0: 0, x1: 0, y1: 0 });
  assert.equal(cells.length, 1);
  assert.equal(typeof cells[0].color, 'string');
});

test('extractRectFromActiveLayer returns nothing when there is no active layer', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  assert.deepEqual(extractRectFromActiveLayer(canvas, { x0: 0, y0: 0, x1: 1, y1: 1 }), []);
});

test('extractRectFromActiveGrid only reads the active shape\'s own cells, ignoring a different shape in the same layer', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: 'layer' });
  paintCell(canvas, 0, 0, '#0000ff'); // shape A, becomes active
  const shapeAId = canvas.activeGridId;
  canvas.activeGridId = null; // deselect so the next paint starts a separate shape
  paintCell(canvas, 1, 0, '#ff0000'); // shape B, becomes active, covers (1,0)
  canvas.activeGridId = shapeAId; // re-select shape A explicitly (ShapeRow click)

  const cells = extractRectFromActiveGrid(canvas, { x0: 0, y0: 0, x1: 1, y1: 0 });
  assert.deepEqual(cells, [{ dx: 0, dy: 0, color: '#0000ff' }]); // only shape A's own cell
});

test('extractRectFromActiveGrid falls back to a placeholder color for a non-solid (gradient) fill', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: 'grad' });
  paintCell(canvas, 0, 0, '#ffffff');
  canvas.layers[0].frames[0].grids[0].style.fill = { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] };
  const cells = extractRectFromActiveGrid(canvas, { x0: 0, y0: 0, x1: 0, y1: 0 });
  assert.equal(cells.length, 1);
  assert.equal(typeof cells[0].color, 'string');
});

test('extractRectFromActiveGrid returns nothing when there is no active shape', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  addLayer(canvas);
  canvas.activeGridId = null;
  assert.deepEqual(extractRectFromActiveGrid(canvas, { x0: 0, y0: 0, x1: 1, y1: 1 }), []);
});

// --- transformSelectionCells (Checkpoint 2: Transform menu Selection scope) ---

const SAMPLE_CELLS = [
  { dx: 0, dy: 0, color: 'A' },
  { dx: 2, dy: 0, color: 'B' },
  { dx: 0, dy: 1, color: 'C' },
]; // a 3-wide, 2-tall sparse selection

function byColor(cells) {
  return Object.fromEntries(cells.map((c) => [c.color, { dx: c.dx, dy: c.dy }]));
}

test('transformSelectionCells flipH mirrors dx across width, leaving dy untouched', () => {
  const result = transformSelectionCells(3, 2, SAMPLE_CELLS, 'flipH');
  assert.deepEqual(byColor(result), { A: { dx: 2, dy: 0 }, B: { dx: 0, dy: 0 }, C: { dx: 2, dy: 1 } });
});

test('transformSelectionCells flipV mirrors dy across height, leaving dx untouched', () => {
  const result = transformSelectionCells(3, 2, SAMPLE_CELLS, 'flipV');
  assert.deepEqual(byColor(result), { A: { dx: 0, dy: 1 }, B: { dx: 2, dy: 1 }, C: { dx: 0, dy: 0 } });
});

test('transformSelectionCells rotate90 matches Grid.js\'s rotatePixels90 direction (90deg clockwise)', () => {
  // Same forward remap as Grid.js's buffer-based rotatePixels90, expressed as a point transform:
  // dx' = height - 1 - dy, dy' = dx. Output bounds are height x width (swapped).
  const result = transformSelectionCells(3, 2, SAMPLE_CELLS, 'rotate90');
  assert.deepEqual(byColor(result), { A: { dx: 1, dy: 0 }, B: { dx: 1, dy: 2 }, C: { dx: 0, dy: 0 } });
});

// --- floatingGridSelection: liftGridSelection / moveGridSelectionBy / transformGridSelection / finalizeGridSelection ---

test('liftGridSelection "activeShape" lifts only the active shape, ignoring a different overlapping shape', () => {
  const canvas = createCanvas({ width: 8, height: 2 });
  const { gridA, gridB } = setUpTwoShapeLayer(canvas);
  const gridAOffsetXBefore = gridA.offsetX;

  const fgs = liftGridSelection(canvas, 'activeShape', { x0: 0, y0: 0, x1: 6, y1: 0 }, true);

  assert.equal(fgs.clones.length, 1);
  assert.equal(fgs.clones[0].originGridId, gridA.id);
  // Nothing in `canvas` is mutated by lift itself -- clearing is deferred to finalize.
  assert.equal(gridA.offsetX, gridAOffsetXBefore);
  assert.equal(canvas.layers[0].frames[0].grids.length, 2, 'shape B is untouched, still present');
});

test('liftGridSelection "activeLayer" lifts every unlocked/visible shape in the layer that overlaps rect, independently, preserving each one\'s own style', () => {
  const canvas = createCanvas({ width: 8, height: 2 });
  const { gridA, gridB } = setUpTwoShapeLayer(canvas);

  const fgs = liftGridSelection(canvas, 'activeLayer', { x0: 0, y0: 0, x1: 6, y1: 0 }, true);

  assert.equal(fgs.clones.length, 2, 'both shapes overlap the rect');
  const cloneA = fgs.clones.find((c) => c.originGridId === gridA.id);
  const cloneB = fgs.clones.find((c) => c.originGridId === gridB.id);
  assert.ok(cloneA && cloneB);
  assert.equal(cloneA.grid.style, gridA.style, "clone A keeps shape A's own style object reference");
  assert.equal(typeof cloneB.grid.style.fill, 'object', "clone B's gradient style survived -- never flattened to a solid color");
});

test('liftGridSelection excludes a locked shape from "activeLayer" scope', () => {
  const canvas = createCanvas({ width: 8, height: 2 });
  const { gridB } = setUpTwoShapeLayer(canvas);
  gridB.locked = true;

  const fgs = liftGridSelection(canvas, 'activeLayer', { x0: 0, y0: 0, x1: 6, y1: 0 }, true);

  assert.equal(fgs.clones.length, 1, 'the locked shape is skipped entirely');
  assert.notEqual(fgs.clones[0].originGridId, gridB.id);
});

test('liftGridSelection excludes a locked or hidden shape from "activeShape" scope too -- lock/hidden immunity applies uniformly', () => {
  const canvas = createCanvas({ width: 8, height: 2 });
  const { gridA } = setUpTwoShapeLayer(canvas);
  gridA.locked = true;

  assert.equal(liftGridSelection(canvas, 'activeShape', { x0: 0, y0: 0, x1: 6, y1: 0 }, true), null, 'the active shape is locked -- nothing to lift, not silent access to protected content');

  gridA.locked = false;
  gridA.visible = false;
  assert.equal(liftGridSelection(canvas, 'activeShape', { x0: 0, y0: 0, x1: 6, y1: 0 }, true), null, 'hidden gets the same treatment as locked');
});

test('liftGridSelection returns null when nothing in scope overlaps rect', () => {
  const canvas = createCanvas({ width: 8, height: 2 });
  setUpTwoShapeLayer(canvas);
  assert.equal(liftGridSelection(canvas, 'activeLayer', { x0: 7, y0: 1, x1: 7, y1: 1 }, true), null);
});

test('liftGridSelection non-destructive (Copy/shift-drag) strips originGridId -- a duplicate, never linked back to the source', () => {
  const canvas = createCanvas({ width: 8, height: 2 });
  const { gridA } = setUpTwoShapeLayer(canvas);

  const fgs = liftGridSelection(canvas, 'activeShape', { x0: 0, y0: 0, x1: 6, y1: 0 }, false);

  assert.equal(fgs.clones[0].originGridId, null);
  assert.equal(fgs.clones[0].originSnapshot, null);
  assert.notEqual(fgs.clones[0].grid.id, gridA.id, 'a fresh id, not the source shape\'s own');
});

test('moveGridSelectionBy translates the rect and every clone\'s grid together', () => {
  const canvas = createCanvas({ width: 8, height: 2 });
  setUpTwoShapeLayer(canvas);
  const fgs = liftGridSelection(canvas, 'activeLayer', { x0: 0, y0: 0, x1: 6, y1: 0 }, true);
  const beforeOffsets = fgs.clones.map((c) => c.grid.offsetX);

  moveGridSelectionBy(fgs, 3, 1);

  assert.deepEqual(fgs.rect, { x0: 3, y0: 1, x1: 9, y1: 1 });
  fgs.clones.forEach((c, i) => assert.equal(c.grid.offsetX, beforeOffsets[i] + 3));
});

test('transformGridSelection flips every clone within the selection\'s current rect, independently, preserving style', () => {
  const canvas = createCanvas({ width: 8, height: 2 });
  const { gridA, gridB } = setUpTwoShapeLayer(canvas);
  const fgs = liftGridSelection(canvas, 'activeLayer', { x0: 0, y0: 0, x1: 6, y1: 0 }, true);
  const cloneA = fgs.clones.find((c) => c.originGridId === gridA.id);
  const cloneB = fgs.clones.find((c) => c.originGridId === gridB.id);
  const styleA = cloneA.grid.style;
  const styleB = cloneB.grid.style;

  transformGridSelection(fgs, 'flipH');

  assert.notEqual(cloneA.grid.offsetX, gridA.offsetX, 'shape A actually moved');
  assert.notEqual(cloneB.grid.offsetX, gridB.offsetX, 'shape B actually moved too -- not just the topmost cell per position');
  assert.equal(cloneA.grid.style, styleA, "clone A keeps its own style object, unmerged with clone B's");
  assert.equal(cloneB.grid.style, styleB, "clone B's gradient style survives exactly -- never flattened to a solid color");
});

test('Move and Transform compose: move-then-flip-then-move produces the same result as computing it directly', () => {
  const canvas = createCanvas({ width: 8, height: 2 });
  setUpTwoShapeLayer(canvas);

  // Path 1: interleaved move/transform/move, as a real drag+flip+drag gesture would produce.
  const fgs1 = liftGridSelection(canvas, 'activeLayer', { x0: 0, y0: 0, x1: 6, y1: 0 }, true);
  moveGridSelectionBy(fgs1, 2, 0);
  transformGridSelection(fgs1, 'flipH');
  moveGridSelectionBy(fgs1, 1, 0);

  // Path 2: same net operations, computed by moving the full distance first and transforming last.
  const fgs2 = liftGridSelection(canvas, 'activeLayer', { x0: 0, y0: 0, x1: 6, y1: 0 }, true);
  moveGridSelectionBy(fgs2, 2, 0);
  transformGridSelection(fgs2, 'flipH');
  moveGridSelectionBy(fgs2, 1, 0);

  assert.deepEqual(fgs1.rect, fgs2.rect);
  for (let i = 0; i < fgs1.clones.length; i++) {
    assert.equal(fgs1.clones[i].grid.offsetX, fgs2.clones[i].grid.offsetX);
    assert.equal(fgs1.clones[i].grid.offsetY, fgs2.clones[i].grid.offsetY);
    assert.deepEqual(Array.from(fgs1.clones[i].grid.pixels), Array.from(fgs2.clones[i].grid.pixels));
  }
});

test('finalizeGridSelection: per-shape paste-back -- grid count/ids unchanged, only in-scope grids\' geometry changes, style intact', () => {
  const canvas = createCanvas({ width: 8, height: 2 });
  const { gridA, gridB } = setUpTwoShapeLayer(canvas);
  const gridAId = gridA.id;
  const gridBId = gridB.id;
  const fgs = liftGridSelection(canvas, 'activeLayer', { x0: 0, y0: 0, x1: 6, y1: 0 }, true);
  transformGridSelection(fgs, 'flipH');

  finalizeGridSelection(canvas, fgs);

  const grids = canvas.layers[0].frames[0].grids;
  assert.equal(grids.length, 2, 'still exactly two shapes -- no merge, no new grid');
  const finalA = grids.find((g) => g.id === gridAId);
  const finalB = grids.find((g) => g.id === gridBId);
  assert.ok(finalA && finalB, 'both shapes survive by their original id');
  assert.equal(finalA.style.fill, '#ff0000', "shape A's flat color is untouched");
  assert.equal(typeof finalB.style.fill, 'object', "shape B's gradient style survived");
  assert.notEqual(finalA.offsetX, 0, 'shape A actually moved');
  assert.notEqual(finalB.offsetX, 5, 'shape B actually moved too');
});

test('finalizeGridSelection: a non-destructive (copy) clone inserts as a brand-new grid, leaving the original untouched', () => {
  const canvas = createCanvas({ width: 8, height: 2 });
  const { gridA } = setUpTwoShapeLayer(canvas);
  const fgs = liftGridSelection(canvas, 'activeShape', { x0: 0, y0: 0, x1: 6, y1: 0 }, false);
  moveGridSelectionBy(fgs, 0, 1);

  finalizeGridSelection(canvas, fgs);

  const grids = canvas.layers[0].frames[0].grids;
  assert.equal(grids.length, 3, 'a new grid was inserted alongside the two originals');
  assert.equal(gridA.offsetX, 0, 'the original shape A is completely untouched by a copy');
  const newGrid = grids.find((g) => g.id === fgs.clones[0].grid.id);
  assert.ok(newGrid);
  assert.equal(newGrid.offsetY, 1, 'the new grid reflects the move applied before finalize');
});

test('buildFloatingGridPreviewDoc excludes a destructively-lifted clone\'s real grid from render (so it isn\'t shown twice) and includes the clone instead', () => {
  const canvas = createCanvas({ width: 8, height: 2 });
  const { gridA, gridB } = setUpTwoShapeLayer(canvas);
  const fgs = liftGridSelection(canvas, 'activeShape', { x0: 0, y0: 0, x1: 6, y1: 0 }, true);

  const previewDoc = buildFloatingGridPreviewDoc(canvas, fgs);

  const previewGrids = previewDoc.layers[0].frames[0].grids;
  assert.equal(previewGrids.some((g) => g.id === gridA.id && g === gridA), false, "the real, un-transformed shape A object isn't in the preview's grid list");
  assert.equal(previewGrids.some((g) => g.id === gridB.id), true, 'an unrelated shape not part of the floating selection still renders normally');
  assert.equal(previewGrids.some((g) => g.id === fgs.clones[0].grid.id), true, "the clone itself is in the preview's grid list");
  // The real canvas itself is never mutated by building a preview.
  assert.equal(canvas.layers[0].frames[0].grids.length, 2);
});

test('buildFloatingGridPreviewDoc returns the doc unchanged when nothing is floating', () => {
  const canvas = createCanvas({ width: 8, height: 2 });
  setUpTwoShapeLayer(canvas);
  assert.equal(buildFloatingGridPreviewDoc(canvas, null), canvas);
});

test('buildGridClonesByColor groups pasted cells into one clone per distinct color, each cropped to its own bounds', () => {
  const cells = [
    { dx: 0, dy: 0, color: '#ff0000' },
    { dx: 1, dy: 0, color: '#ff0000' },
    { dx: 3, dy: 2, color: '#00ff00' },
  ];
  const clones = buildGridClonesByColor(10, 20, cells);

  assert.equal(clones.length, 2);
  const red = clones.find((c) => c.grid.style.fill === '#ff0000');
  const green = clones.find((c) => c.grid.style.fill === '#00ff00');
  assert.equal(red.originGridId, null);
  assert.equal(red.grid.offsetX, 10);
  assert.equal(red.grid.offsetY, 20);
  assert.equal(red.grid.width, 2);
  assert.equal(red.grid.height, 1);
  assert.deepEqual(Array.from(red.grid.pixels), [1, 1]);
  assert.equal(green.grid.offsetX, 13);
  assert.equal(green.grid.offsetY, 22);
  assert.equal(green.grid.width, 1);
  assert.equal(green.grid.height, 1);
});

test('buildGridCloneUnioned collapses multi-color pasted cells into a single clone, unioning pixels and using the passed style instead of any pasted color', () => {
  const cells = [
    { dx: 0, dy: 0, color: '#ff0000' },
    { dx: 1, dy: 0, color: '#ff0000' },
    { dx: 3, dy: 2, color: '#00ff00' },
  ];
  const style = { fill: '#123456', effects: [] };
  const clones = buildGridCloneUnioned(10, 20, cells, style);

  assert.equal(clones.length, 1);
  const clone = clones[0];
  assert.equal(clone.originGridId, null);
  assert.equal(clone.originSnapshot, null);
  assert.equal(clone.grid.style, style, 'the passed-in style is used verbatim, not derived from any pasted color');
  // Bounding box spans all three cells (dx 0..3, dy 0..2), not per-color sub-boxes.
  assert.equal(clone.grid.offsetX, 10);
  assert.equal(clone.grid.offsetY, 20);
  assert.equal(clone.grid.width, 4);
  assert.equal(clone.grid.height, 3);
  // Every originally-non-empty pixel is set to 1 regardless of its original color; everything else stays 0.
  assert.deepEqual(Array.from(clone.grid.pixels), [
    1, 1, 0, 0, // y=0: dx 0, 1 painted
    0, 0, 0, 0, // y=1: nothing painted
    0, 0, 0, 1, // y=2: dx 3 painted
  ]);
});

