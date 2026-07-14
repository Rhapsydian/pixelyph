// Phase 5's one store-level test: cross-glyph copy-paste. The extraction/
// clear/paste primitives themselves are already covered against Draw-mode
// canvases by test/model/selection.test.js (same functions) — this test is
// specifically about the store's mode-aware wiring: copying part of one
// glyph and pasting into a *different* glyph after switching the active
// glyph via selectGlyph, per the plan's "Glyph mode selection & copy-paste"
// note. Everything else UI-adjacent is manual-only per this project's
// testing policy; store.js has no DOM/Electron dependency at module scope,
// so it imports cleanly under plain `node --test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useStore } from '../../src/state/store.js';

// Every committed store action schedules a debounced autosave write
// (io/autosave.js), which needs a real IndexedDB — unavailable under plain
// `node --test` (see that file's own header comment and the plan's testing
// policy). Rather than let each committed action in this test fire an
// uncaught-looking "indexedDB is not defined" error ~2s after the test
// finishes (autosave.js catches it, but the timer still holds the process
// open), stub just enough of the IndexedDB surface for writes to resolve
// as harmless no-ops.
globalThis.indexedDB = {
  open: () => {
    const request = { result: { transaction: () => ({ objectStore: () => ({ put() {}, get() {}, delete() {} }) }) } };
    queueMicrotask(() => request.onsuccess?.());
    return request;
  },
};

// newProject()/openAnyProject() confirm before discarding an already-open
// project (see store.js's `requestConfirm`, a Promise-based window.confirm
// replacement) — the real version opens a modal and waits on a user click,
// which nothing drives under plain `node --test`. Each test file's project
// starts fresh in-process, so always confirming is equivalent to a user
// clicking "OK" every time; tests call newProject/openAnyProject without
// awaiting, so this must resolve synchronously rather than via a real
// pending Promise.
useStore.setState({ requestConfirm: () => Promise.resolve(true) });

function paintColumn(x, height, color) {
  for (let y = 0; y < height; y++) useStore.getState().paintCellLive(x, y, color);
  useStore.getState().commitStroke();
}

function columnIsFilled(glyph, x) {
  for (let y = 0; y < glyph.height; y++) {
    if (glyph.pixels[y * glyph.width + x] !== 1) return false;
  }
  return true;
}

function onlyColumnFilled(glyph, expectedX) {
  for (let y = 0; y < glyph.height; y++) {
    for (let x = 0; x < glyph.width; x++) {
      const expected = x === expectedX ? 1 : 0;
      if (glyph.pixels[y * glyph.width + x] !== expected) return false;
    }
  }
  return true;
}

test('cross-glyph copy-paste: selecting in glyph A, switching to glyph B, and pasting only affects B', async () => {
  const store = useStore.getState();
  await store.newProject('glyph', { kind: 'characters', familyName: 'Cross Glyph Test' });

  store.addGlyph({ character: 65 }); // glyph A, active
  paintColumn(0, useStore.getState().glyphSet.meta.pixelsPerEm, '#000000'); // a "stem" at x=0

  store.addGlyph({ character: 66 }); // glyph B, active, blank

  store.selectGlyph(65); // back to A to select its stem
  const height = useStore.getState().glyphSet.meta.pixelsPerEm;
  store.startSelection(0, 0);
  store.updateSelection(0, height - 1);
  store.copySelection();

  const glyphABeforePaste = useStore.getState().glyphSet.glyphs.get(65);
  assert.ok(columnIsFilled(glyphABeforePaste, 0), 'glyph A should still have its stem after a non-destructive copy');

  store.selectGlyph(66); // switch to B — selection/floatingSelection reset, clipboard persists
  assert.equal(useStore.getState().selection, null);
  assert.equal(useStore.getState().floatingSelection, null);
  assert.ok(useStore.getState().clipboard, 'clipboard is an app-level slot independent of the active glyph');

  store.pasteClipboard();
  store.dropFloatingSelection();

  const glyphA = useStore.getState().glyphSet.glyphs.get(65);
  const glyphB = useStore.getState().glyphSet.glyphs.get(66);

  assert.ok(onlyColumnFilled(glyphA, 0), "glyph A's pixels are untouched by the paste into B");
  assert.ok(columnIsFilled(glyphB, 0), 'glyph B received the pasted stem at its original x=0 -- paste-in-place, not centered, since both glyphs are the same size');
});

// --- Checkpoint 2: unified addGlyph / addGlyphsFromPreset / reassignGlyphCodepoint ---

test('addGlyph with a character key uses it as the literal codepoint', async () => {
  const store = useStore.getState();
  await store.newProject('glyph', { familyName: 'addGlyph Test', initialPreset: 'none' });
  store.addGlyph({ character: 65, name: 'Cap A' });
  const { glyphSet, activeCodepoint } = useStore.getState();
  assert.equal(activeCodepoint, 65);
  assert.ok(glyphSet.glyphs.has(65));
  assert.equal(glyphSet.glyphs.get(65).name, 'Cap A');
});

test('addGlyph with no character auto-assigns a PUA codepoint', async () => {
  const store = useStore.getState();
  await store.newProject('glyph', { familyName: 'addGlyph Auto Test', initialPreset: 'none' });
  store.addGlyph({ name: 'star' });
  const { glyphSet, activeCodepoint } = useStore.getState();
  assert.equal(activeCodepoint, 0xe000);
  assert.equal(glyphSet.glyphs.get(0xe000).name, 'star');
});

test('addGlyph with neither character nor name creates a completely bare glyph', async () => {
  const store = useStore.getState();
  await store.newProject('glyph', { familyName: 'addGlyph Bare Test', initialPreset: 'none' });
  store.addGlyph();
  const { glyphSet, activeCodepoint } = useStore.getState();
  assert.equal(activeCodepoint, 0xe000);
  assert.equal(glyphSet.glyphs.get(0xe000).name, '');
});

test('addGlyphsFromPreset creates one empty glyph per codepoint, skipping ones that already exist', async () => {
  const store = useStore.getState();
  await store.newProject('glyph', { familyName: 'Preset Test', initialPreset: 'none' });
  store.addGlyph({ character: 65, name: 'already here' });
  store.addGlyphsFromPreset([65, 66, 67]);
  const { glyphSet } = useStore.getState();
  assert.equal(glyphSet.glyphs.size, 3);
  assert.equal(glyphSet.glyphs.get(65).name, 'already here', 'existing glyph at 65 is not overwritten');
  assert.equal(glyphSet.glyphs.get(66).name, '');
  assert.equal(glyphSet.glyphs.get(67).name, '');
});

test('addGlyphsFromPreset is a no-op when every codepoint already exists', async () => {
  const store = useStore.getState();
  await store.newProject('glyph', { familyName: 'Preset Noop Test', initialPreset: 'none' });
  store.addGlyph({ character: 65 });
  const canUndoBefore = useStore.getState().canUndo;
  store.addGlyphsFromPreset([65]);
  assert.equal(useStore.getState().canUndo, canUndoBefore, 'no new history entry pushed when nothing was created');
});

test('reassignGlyphCodepoint moves the Map entry and follows activeCodepoint', async () => {
  const store = useStore.getState();
  await store.newProject('glyph', { familyName: 'Reassign Test' });
  store.addGlyph({ character: 65, name: 'Cap A' });
  store.reassignGlyphCodepoint(65, 66);
  const { glyphSet, activeCodepoint } = useStore.getState();
  assert.equal(glyphSet.glyphs.has(65), false);
  assert.ok(glyphSet.glyphs.has(66));
  assert.equal(glyphSet.glyphs.get(66).name, 'Cap A');
  assert.equal(activeCodepoint, 66, 'activeCodepoint follows the glyph to its new key');
});

test('palette actions (add/remove/reorder/clear) are undo-tracked, same as any other structural edit', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.clearPaletteGroup('colors'); // newProject seeds the standard default palette; start from a known-empty state

  store.addPaletteColor('#ff0000');
  store.addPaletteColor('#00ff00');
  assert.deepEqual(useStore.getState().canvas.palette.colors, ['#ff0000', '#00ff00']);

  store.reorderPaletteEntry('colors', '#ff0000', 1);
  assert.deepEqual(useStore.getState().canvas.palette.colors, ['#00ff00', '#ff0000']);

  store.removePaletteEntry('colors', '#00ff00');
  assert.deepEqual(useStore.getState().canvas.palette.colors, ['#ff0000']);

  useStore.getState().undo();
  assert.deepEqual(useStore.getState().canvas.palette.colors, ['#00ff00', '#ff0000'], 'removePaletteEntry is undo-tracked');

  store.clearPaletteGroup('colors');
  assert.deepEqual(useStore.getState().canvas.palette.colors, []);
});

test('renamePaletteEntry sets a name on a fills entry, undo-tracked', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.addPaletteFill({ type: 'linear-gradient', angle: 0, stops: [] });
  const fill = useStore.getState().canvas.palette.fills.at(-1);

  store.renamePaletteEntry('fills', fill.id, 'Sunset');
  assert.equal(useStore.getState().canvas.palette.fills.find((f) => f.id === fill.id).name, 'Sunset');

  useStore.getState().undo();
  assert.equal(useStore.getState().canvas.palette.fills.find((f) => f.id === fill.id).name, undefined);
});

test('applyPaletteEntryToActiveGrid: a saved fill (gradient) clones onto the active shape\'s fill, independent of the palette entry afterward', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.setTier('advanced');
  const layer = useStore.getState().canvas.layers[0];
  store.addGrid(layer.id);
  const gridId = useStore.getState().canvas.activeGridId;

  store.addPaletteFill({ type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] });
  const fillEntry = useStore.getState().canvas.palette.fills.at(-1);

  store.applyPaletteEntryToActiveGrid('fills', fillEntry.id);
  const appliedFill = useStore.getState().canvas.layers.find((l) => l.id === layer.id).frames[0].grids.find((g) => g.id === gridId).style.fill;
  assert.equal(appliedFill.type, 'linear-gradient');
  assert.equal(appliedFill.stops.length, 2);

  appliedFill.stops.push({ offset: 0.5, color: '#888' });
  assert.equal(fillEntry.stops.length, 2, 'mutating the applied fill must not affect the palette entry it came from');
});

test('setGridPropsLive mutates a shape\'s offset without growing undo history; commitStroke afterward is exactly one undo step', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.setTier('advanced');
  const layer = useStore.getState().canvas.layers[0];
  store.addGrid(layer.id); // addGridModel centers a new empty shape on the canvas, not at (0,0)
  const gridId = useStore.getState().canvas.activeGridId;
  const gridBeforeDrag = useStore.getState().canvas.layers[0].frames[0].grids.find((g) => g.id === gridId);
  const { offsetX: originalOffsetX, offsetY: originalOffsetY } = gridBeforeDrag;
  const stackLengthBeforeDrag = useStore.getState().history.stack.length;

  store.setGridPropsLive(layer.id, gridId, { offsetX: originalOffsetX + 3, offsetY: originalOffsetY });
  store.setGridPropsLive(layer.id, gridId, { offsetX: originalOffsetX + 5, offsetY: originalOffsetY + 2 });
  assert.equal(useStore.getState().history.stack.length, stackLengthBeforeDrag, 'live updates during a drag must not push undo snapshots');
  const gridDuringDrag = () => useStore.getState().canvas.layers.find((l) => l.id === layer.id).frames[0].grids.find((g) => g.id === gridId);
  assert.equal(gridDuringDrag().offsetX, originalOffsetX + 5);
  assert.equal(gridDuringDrag().offsetY, originalOffsetY + 2);

  store.commitStroke();
  assert.equal(useStore.getState().history.stack.length, stackLengthBeforeDrag + 1, 'pointer-up commits exactly one undo step for the whole drag');

  useStore.getState().undo();
  const gridAfterUndo = useStore.getState().canvas.layers.find((l) => l.id === layer.id).frames[0].grids.find((g) => g.id === gridId);
  assert.equal(gridAfterUndo.offsetX, originalOffsetX, 'undo reverts to the pre-drag offset, not a mid-drag one');
});

test('nudgeLayerFrameLive shifts a layer\'s active-frame content without growing undo history; commitStroke afterward is exactly one undo step', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.paintCellLive(0, 0, '#0000ff');
  store.commitStroke();
  const layer = useStore.getState().canvas.layers[0];
  const stackLengthBeforeDrag = useStore.getState().history.stack.length;

  store.nudgeLayerFrameLive(layer.id, 0, 1, 0);
  store.nudgeLayerFrameLive(layer.id, 0, 1, 0);
  assert.equal(useStore.getState().history.stack.length, stackLengthBeforeDrag, 'live updates during a drag must not push undo snapshots');
  assert.equal(useStore.getState().colorAt(2, 0), '#0000ff', 'content already moved live, ahead of any commit');

  store.commitStroke();
  assert.equal(useStore.getState().history.stack.length, stackLengthBeforeDrag + 1, 'pointer-up commits exactly one undo step for the whole drag');

  useStore.getState().undo();
  assert.equal(useStore.getState().colorAt(0, 0), '#0000ff', 'undo reverts to the pre-drag position, not a mid-drag one');
});

test('flipSelectionH transforms an already-floating selection without committing; dropFloatingSelection afterward is exactly one undo step', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.paintCellLive(0, 0, '#ff0000'); // 'A'
  store.paintCellLive(2, 0, '#00ff00'); // 'B'
  store.commitStroke();

  store.startSelection(0, 0);
  store.updateSelection(2, 0);
  store.liftSelection(true); // destructive lift, matching an ordinary drag-move
  const stackLengthBeforeTransform = useStore.getState().history.stack.length;

  store.flipSelectionH();
  assert.equal(useStore.getState().history.stack.length, stackLengthBeforeTransform, 'a still-floating transform must not push an undo snapshot');
  const cellsByColor = Object.fromEntries(useStore.getState().floatingSelection.cells.map((c) => [c.color, c.dx]));
  assert.deepEqual(cellsByColor, { '#ff0000': 2, '#00ff00': 0 }, 'flipH mirrors dx across the selection\'s own width (3 wide: dx 0..2)');

  store.dropFloatingSelection();
  assert.equal(useStore.getState().history.stack.length, stackLengthBeforeTransform + 1, 'drop commits exactly one undo step for the whole gesture');
  assert.equal(useStore.getState().colorAt(0, 0), '#00ff00');
  assert.equal(useStore.getState().colorAt(2, 0), '#ff0000');
});

test('rotateSelection90 auto-lifts a raw (not-yet-floating) selection first, destructively clearing the source', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.paintCellLive(0, 0, '#ff0000');
  store.commitStroke();

  store.startSelection(0, 0);
  store.updateSelection(0, 0); // a raw 1x1 selection rect, never explicitly lifted
  assert.equal(useStore.getState().floatingSelection, null);

  store.rotateSelection90();
  assert.ok(useStore.getState().floatingSelection, 'rotate auto-lifts the raw selection into a floating one');
  assert.equal(useStore.getState().colorAt(0, 0), null, 'auto-lift is destructive, same as an ordinary drag-move lift');
  assert.deepEqual(useStore.getState().floatingSelection.cells, [{ dx: 0, dy: 0, color: '#ff0000' }]);
});

test('rotateSelection180 swaps width/height twice, landing back on the original bounds', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.paintCellLive(0, 0, '#ff0000');
  store.paintCellLive(2, 0, '#00ff00');
  store.commitStroke();
  store.startSelection(0, 0);
  store.updateSelection(2, 0);
  store.liftSelection(true);
  assert.equal(useStore.getState().floatingSelection.width, 3);
  assert.equal(useStore.getState().floatingSelection.height, 1);

  store.rotateSelection180();
  const fs = useStore.getState().floatingSelection;
  assert.equal(fs.width, 3, '180 = rotate90 applied twice, so the swap undoes itself');
  assert.equal(fs.height, 1);
  const cellsByColor = Object.fromEntries(fs.cells.map((c) => [c.color, c.dx]));
  assert.deepEqual(cellsByColor, { '#ff0000': 2, '#00ff00': 0 }, '180deg is still a real transform, not a no-op');
});

/** Full geometry + style snapshot of a grid, for deep before/after/undo/redo comparison -- not just offsetX, per checkpoint 6's strengthened round-trip requirement. */
function snapshotGrid(grid) {
  return {
    offsetX: grid.offsetX,
    offsetY: grid.offsetY,
    width: grid.width,
    height: grid.height,
    pixels: Array.from(grid.pixels),
    style: JSON.parse(JSON.stringify(grid.style)),
  };
}

test('flipSelectionH on Shape tier lifts into a floatingGridSelection (pending until finalize), single commit on drop, styles preserved on both shapes', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.setTier('advanced');
  const layer = useStore.getState().canvas.layers[0];

  store.paintCellLive(0, 0, '#ff0000');
  store.commitStroke(); // shape A
  const gridAId = useStore.getState().canvas.activeGridId;

  store.addGrid(layer.id); // shape B, active, empty
  store.paintCellLive(5, 0, '#0000ff');
  store.commitStroke();
  const gridBId = useStore.getState().canvas.activeGridId;
  // Give shape B a non-solid style -- the whole point of the grid-preserving path is that this must survive.
  store.updateGridStyle(layer.id, gridBId, { fill: { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] } });

  store.setSelectionScope('activeLayer');
  store.startSelection(0, 0);
  store.updateSelection(6, 0); // spans both shapes
  const stackLengthBefore = useStore.getState().history.stack.length;
  const gridsBeforeFlip = useStore.getState().canvas.layers[0].frames[0].grids;
  const preFlipA = snapshotGrid(gridsBeforeFlip.find((g) => g.id === gridAId));
  const preFlipB = snapshotGrid(gridsBeforeFlip.find((g) => g.id === gridBId));

  store.flipSelectionH();

  const fgs = useStore.getState().floatingGridSelection;
  assert.ok(fgs, 'Shape tier lifts into a floatingGridSelection instead of committing instantly');
  assert.equal(fgs.clones.length, 2, 'both shapes were lifted');
  assert.equal(useStore.getState().history.stack.length, stackLengthBefore, 'nothing commits yet -- still pending, same as a marquee drag-move');
  // The real document is untouched until finalize -- both original grids still sit exactly where they started.
  const preFinalizeGrids = useStore.getState().canvas.layers[0].frames[0].grids;
  assert.equal(preFinalizeGrids.find((g) => g.id === gridAId).offsetX, 0);
  assert.equal(preFinalizeGrids.find((g) => g.id === gridBId).offsetX, 5);

  store.dropFloatingSelection(); // finalize

  assert.equal(useStore.getState().floatingGridSelection, null);
  assert.equal(useStore.getState().history.stack.length, stackLengthBefore + 1, 'exactly one commit for the whole transform, not per-shape');

  const grids = useStore.getState().canvas.layers[0].frames[0].grids;
  assert.equal(grids.length, 2, 'still exactly two independent shapes');
  const gridA = grids.find((g) => g.id === gridAId);
  const gridB = grids.find((g) => g.id === gridBId);
  assert.ok(gridA && gridB, 'both original shapes survive by their original id -- neither got deleted-and-recreated nor merged');
  assert.equal(gridA.style.fill, '#ff0000', "shape A's flat color is untouched");
  assert.equal(typeof gridB.style.fill, 'object', "shape B's gradient style survived -- never flattened to a solid color");
  assert.notEqual(gridA.offsetX, 0, 'shape A actually moved');
  assert.notEqual(gridB.offsetX, 5, 'shape B actually moved too');
  const postFlipA = snapshotGrid(gridA);
  const postFlipB = snapshotGrid(gridB);

  // Checkpoint 6: formally re-verify the undo-atomicity bug (session 28/29's
  // "Undo only reverted one of two shapes") is actually gone -- full
  // geometry + style round-trip for BOTH shapes, not just offsetX, across
  // undo, redo, and a second undo, confirming the fix is stable rather than
  // a one-off coincidence.
  useStore.getState().undo();
  let g = useStore.getState().canvas.layers[0].frames[0].grids;
  assert.deepEqual(snapshotGrid(g.find((x) => x.id === gridAId)), preFlipA, "undo fully reverts shape A's geometry and style");
  assert.deepEqual(snapshotGrid(g.find((x) => x.id === gridBId)), preFlipB, "undo fully reverts shape B's geometry and style -- the originally-reported bug (only one of two shapes reverting) is gone");
  assert.equal(useStore.getState().canRedo, true);
  assert.equal(useStore.getState().canUndo, true, 'earlier commits (painting both shapes, styling shape B) are still further back in history -- undo is not exhausted after just the one flip step');

  useStore.getState().redo();
  g = useStore.getState().canvas.layers[0].frames[0].grids;
  assert.deepEqual(snapshotGrid(g.find((x) => x.id === gridAId)), postFlipA, 'redo re-applies the flip to shape A exactly');
  assert.deepEqual(snapshotGrid(g.find((x) => x.id === gridBId)), postFlipB, 'redo re-applies the flip to shape B exactly, gradient style intact');

  // A second undo, after the redo -- the exact scenario the original bug report hit ("clicking Undo only reverted the flat-color shape... a second Undo click ... canUndo reading false").
  useStore.getState().undo();
  g = useStore.getState().canvas.layers[0].frames[0].grids;
  assert.deepEqual(snapshotGrid(g.find((x) => x.id === gridAId)), preFlipA, 'second undo (after redo) still reverts shape A fully');
  assert.deepEqual(snapshotGrid(g.find((x) => x.id === gridBId)), preFlipB, 'second undo (after redo) still reverts shape B fully, not stuck/partial');
  assert.equal(useStore.getState().canUndo, true, 'still more history behind the flip -- not incorrectly exhausted');

  store.setSelectionScope('activeShape'); // selectionScope is working-session state, not reset by newProject -- restore the default so later tests aren't affected
});

test('undo/redo keeps the same active shape selected when it still exists on the same layer, instead of jumping to the layer\'s first shape', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.setTier('advanced');
  const layer = useStore.getState().canvas.layers[0];

  store.paintCellLive(0, 0, '#ff0000');
  store.commitStroke(); // shape A, active
  const gridAId = useStore.getState().canvas.activeGridId;

  store.addGrid(layer.id); // shape B, active -- NOT the layer's first shape
  const gridBId = useStore.getState().canvas.activeGridId;
  assert.notEqual(gridAId, gridBId);

  store.paintCellLive(5, 0, '#0000ff');
  store.commitStroke(); // paints into shape B, still active
  assert.equal(useStore.getState().canvas.activeGridId, gridBId, 'sanity check: shape B is active before undo');

  useStore.getState().undo();
  assert.equal(
    useStore.getState().canvas.activeGridId,
    gridBId,
    "undo must keep shape B active since it still exists on the same layer -- it must not silently fall back to shape A (the layer's first shape) just because activeLayerId wasn't passed through to the sticky-selection check",
  );

  useStore.getState().redo();
  assert.equal(useStore.getState().canvas.activeGridId, gridBId, 'redo keeps shape B active too');
});

test('selectionScope defaults to "activeShape"; copy honors it, excluding a different shape in the same layer', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.setTier('advanced');
  assert.equal(useStore.getState().selectionScope, 'activeShape');

  const layer = useStore.getState().canvas.layers[0];
  store.paintCellLive(0, 0, '#0000ff');
  store.commitStroke(); // shape A, active, covers (0,0)
  const shapeAId = useStore.getState().canvas.activeGridId;

  store.addGrid(layer.id); // shape B, active, empty
  store.paintCellLive(1, 0, '#ff0000');
  store.commitStroke(); // grows shape B to cover (1,0)

  store.setActiveGridId(layer.id, shapeAId); // re-select shape A (ShapeRow click)
  store.startSelection(0, 0);
  store.updateSelection(1, 0); // spans both shapes' cells
  store.copySelection();

  // Shape tier's copy produces a style-preserving 'grid' clipboard (one
  // clone per lifted shape), not the flat {dx,dy,color} cells Pixel
  // tier/Glyph mode use.
  const clipboard = useStore.getState().clipboard;
  assert.equal(clipboard.kind, 'grid');
  assert.equal(clipboard.clones.length, 1, "only shape A's own clone, not shape B's, despite both being in the rect and the same layer");
  assert.equal(clipboard.clones[0].offsetX, 0);
  assert.equal(clipboard.clones[0].offsetY, 0);
  assert.equal(clipboard.clones[0].style.fill, '#0000ff');

  // Copy also leaves a floating duplicate at the original position (same
  // convention as Pixel tier/Glyph mode's copySelection) -- the original
  // shape A is untouched, and the floating clone is a fresh copy, not
  // linked back to it.
  const fgs = useStore.getState().floatingGridSelection;
  assert.ok(fgs);
  assert.equal(fgs.clones[0].originGridId, null, 'a copy never writes back into the source shape');
  assert.equal(useStore.getState().canvas.layers[0].frames[0].grids.find((g) => g.id === shapeAId)?.offsetX, 0, 'the original shape A is untouched by copy');
});

test('paste-in-place, Shape tier: copy then paste lands the new floating selection at the original position, not centered', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.setTier('advanced');
  const canvas = useStore.getState().canvas;
  store.paintCellLive(3, 4, '#00ff00');
  store.commitStroke();

  store.startSelection(3, 4);
  store.updateSelection(3, 4);
  store.copySelection();
  store.dropFloatingSelection(); // finalize the floating duplicate copy left behind, back where it started

  store.pasteClipboard();
  const fgs = useStore.getState().floatingGridSelection;
  assert.ok(fgs);
  assert.equal(fgs.rect.x0, 3, "lands at the shape's original x, not canvas-centered");
  assert.equal(fgs.rect.y0, 4, "lands at the shape's original y, not canvas-centered");
  assert.notEqual(fgs.rect.x0, Math.floor((canvas.width - 1) / 2), 'sanity check: original position genuinely differs from what centering would have produced');
});

test('paste-in-place, Shape tier: cut then paste lands back at the original position', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.setTier('advanced');
  store.paintCellLive(2, 5, '#ff00ff');
  store.commitStroke();

  store.startSelection(2, 5);
  store.updateSelection(2, 5);
  store.cutSelection();
  assert.equal(useStore.getState().canvas.layers[0].frames[0].grids.length, 0, 'the shape is really gone after cut, not just pending');

  store.pasteClipboard();
  const fgs = useStore.getState().floatingGridSelection;
  assert.ok(fgs);
  assert.equal(fgs.rect.x0, 2);
  assert.equal(fgs.rect.y0, 5);
});

test('paste-in-place, Pixel tier: copy then paste lands the flat floating selection at the original position', async () => {
  const store = useStore.getState();
  await store.newProject('draw'); // starts in Pixel tier
  const canvas = useStore.getState().canvas;
  store.paintCellLive(1, 2, '#0000ff');
  store.commitStroke();

  store.startSelection(1, 2);
  store.updateSelection(1, 2);
  store.copySelection();
  store.dropFloatingSelection();

  store.pasteClipboard();
  const fs = useStore.getState().floatingSelection;
  assert.ok(fs);
  assert.equal(fs.x, 1);
  assert.equal(fs.y, 2);
  assert.notEqual(fs.x, Math.floor((canvas.width - 1) / 2), 'sanity check: original position genuinely differs from what centering would have produced');
});

test('setPasteColorMode regenerates a pending, untouched, paste-sourced floatingGridSelection in place; leaves clones alone once touched or when there is nothing to regenerate from', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.setTier('advanced');
  const layer = useStore.getState().canvas.layers[0];
  store.setActiveColor('#123456');

  // No pending selection at all -- just updates the persisted default.
  store.setPasteColorMode('single');
  assert.equal(useStore.getState().pasteColorMode, 'single');
  assert.equal(useStore.getState().floatingGridSelection, null);
  store.setPasteColorMode('multiple');

  // A pending selection with no pasteRaw (e.g. an ordinary marquee lift, not an external paste) -- nothing to regenerate from, so clones are left alone.
  const ordinaryFgs = { layerId: layer.id, rect: { x0: 0, y0: 0, x1: 0, y1: 0 }, clones: ['unchanged'] };
  useStore.setState({ floatingGridSelection: ordinaryFgs });
  store.setPasteColorMode('single');
  assert.equal(useStore.getState().floatingGridSelection.clones, ordinaryFgs.clones);

  // A pending, untouched, paste-sourced selection (2+ distinct colors) -- the toggle regenerates its clones from the raw pasted cells.
  const cells = [
    { dx: 0, dy: 0, color: '#ff0000' },
    { dx: 1, dy: 0, color: '#00ff00' },
  ];
  useStore.setState({
    floatingGridSelection: { layerId: layer.id, rect: { x0: 0, y0: 0, x1: 1, y1: 0 }, clones: [], pasteRaw: { x: 0, y: 0, cells }, touched: false },
  });

  store.setPasteColorMode('single');
  let fgs = useStore.getState().floatingGridSelection;
  assert.equal(fgs.clones.length, 1, 'regenerated to one unioned clone');
  assert.equal(fgs.clones[0].grid.style.fill, '#123456', 'painted with the active color, not any pasted color');
  assert.equal(fgs.rect.x0, 0, 'rect/layerId are untouched by the toggle');

  store.setPasteColorMode('multiple');
  fgs = useStore.getState().floatingGridSelection;
  assert.equal(fgs.clones.length, 2, 'regenerated back to one clone per distinct pasted color');

  // Once touched (moved/transformed), the pending clones are left alone -- only the persisted default updates.
  useStore.setState((s) => ({ floatingGridSelection: { ...s.floatingGridSelection, touched: true } }));
  const clonesBeforeToggle = useStore.getState().floatingGridSelection.clones;
  store.setPasteColorMode('single');
  assert.equal(useStore.getState().pasteColorMode, 'single', 'the persisted default still updates');
  assert.equal(useStore.getState().floatingGridSelection.clones, clonesBeforeToggle, 'a touched pending selection is left untouched');

  store.setPasteColorMode('multiple'); // pasteColorMode is working-session state, not reset by newProject -- restore the default so later tests aren't affected
});

test('moveGridSelectionBy and flipSelectionH/rotateSelection90 both mark a pending floatingGridSelection as touched, closing the door on regenerating its paste color mode', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.setTier('advanced');
  const layer = useStore.getState().canvas.layers[0];
  const cells = [
    { dx: 0, dy: 0, color: '#ff0000' },
    { dx: 1, dy: 0, color: '#00ff00' },
  ];
  const makeFgs = () => ({ layerId: layer.id, rect: { x0: 0, y0: 0, x1: 1, y1: 0 }, clones: [], pasteRaw: { x: 0, y: 0, cells }, touched: false });

  useStore.setState({ floatingGridSelection: makeFgs() });
  store.moveGridSelectionBy(1, 0);
  assert.equal(useStore.getState().floatingGridSelection.touched, true, 'a drag-move touches the pending selection');

  useStore.setState({ floatingGridSelection: makeFgs() });
  store.flipSelectionH();
  assert.equal(useStore.getState().floatingGridSelection.touched, true, 'a Transform-menu flip touches the pending selection too');
});

test('applyPaletteEntryToActiveGrid: a saved style replaces fill+stroke+effects wholesale', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.setTier('advanced');
  const layer = useStore.getState().canvas.layers[0];
  store.addGrid(layer.id);
  const gridId = useStore.getState().canvas.activeGridId;
  store.updateGridStyle(layer.id, gridId, { fill: '#111111' });

  store.addPaletteStyle({ fill: '#abcdef', stroke: { color: '#000000', width: 0.2 }, effects: [{ type: 'blur', stdDeviation: 0.3 }] });
  const styleEntry = useStore.getState().canvas.palette.styles.at(-1);

  store.applyPaletteEntryToActiveGrid('styles', styleEntry.id);
  const appliedStyle = useStore.getState().canvas.layers.find((l) => l.id === layer.id).frames[0].grids.find((g) => g.id === gridId).style;
  assert.equal(appliedStyle.fill, '#abcdef');
  assert.equal(appliedStyle.stroke.width, 0.2);
  assert.equal(appliedStyle.effects.length, 1);
});

test('applyPaletteEntryToActiveGrid: every default palette style (projectFactory.js\'s DEFAULT_STYLES) applies without throwing', async () => {
  // Regression test: DEFAULT_STYLES's "Outlined" entry originally omitted
  // `effects`, which cloneLayerStyle (Canvas.js) requires as an array (it
  // calls .map() on it unconditionally) — applying that style silently threw
  // and never reached the shape at all.
  const store = useStore.getState();
  await store.newProject('draw');
  store.setTier('advanced');
  const layer = useStore.getState().canvas.layers[0];
  store.addGrid(layer.id);
  const gridId = useStore.getState().canvas.activeGridId;

  for (const styleEntry of useStore.getState().canvas.palette.styles) {
    assert.doesNotThrow(() => store.applyPaletteEntryToActiveGrid('styles', styleEntry.id));
    const appliedStyle = useStore.getState().canvas.layers.find((l) => l.id === layer.id).frames[0].grids.find((g) => g.id === gridId).style;
    assert.equal(appliedStyle.fill, styleEntry.fill, `${styleEntry.name} should actually apply its fill`);
  }
});

test('importPixelyphPalette replaces the whole palette (colors + fills + styles); importLospecPalette only replaces colors', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.addPaletteFill({ type: 'radial-gradient', cx: 0.5, cy: 0.5, r: 0.5, stops: [] });
  store.addPaletteStyle({ fill: '#000000', effects: [] });

  const ok = store.importPixelyphPalette(JSON.stringify({ pixelyphPalette: 1, colors: ['#123456'], fills: [], styles: [] }));
  assert.equal(ok, true);
  assert.deepEqual(useStore.getState().canvas.palette, { colors: ['#123456'], fills: [], styles: [] });

  store.addPaletteFill({ type: 'radial-gradient', cx: 0.5, cy: 0.5, r: 0.5, stops: [] });
  store.importLospecPalette('#aabbcc\n#ddeeff');
  const palette = useStore.getState().canvas.palette;
  assert.deepEqual(palette.colors, ['#aabbcc', '#ddeeff']);
  assert.equal(palette.fills.length, 1, 'importLospecPalette must not touch the fills group');
});

test('importPixelyphPalette returns false and leaves the palette untouched for invalid/non-palette JSON', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.addPaletteColor('#ff0000');
  const before = useStore.getState().canvas.palette;
  const ok = store.importPixelyphPalette('not json');
  assert.equal(ok, false);
  assert.equal(useStore.getState().canvas.palette, before, 'palette reference is unchanged on a failed import');
});

test('addFrame/duplicateFrame/removeFrame are undo-tracked; setActiveFrame is a working-session pointer move that isn\'t', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  useStore.getState().paintCellLive(0, 0, '#ff0000');
  useStore.getState().commitStroke();

  store.addFrame();
  assert.equal(useStore.getState().canvas.frameCount, 2);
  assert.equal(useStore.getState().canvas.activeFrame, 1);

  useStore.getState().undo();
  assert.equal(useStore.getState().canvas.frameCount, 1, 'addFrame is undo-tracked, like a resize or style change');

  useStore.getState().redo();
  assert.equal(useStore.getState().canvas.frameCount, 2);

  useStore.getState().duplicateFrame(0);
  assert.equal(useStore.getState().canvas.frameCount, 3);

  // setActiveFrame doesn't push a snapshot, so undo still reverts the last
  // *committed* action (duplicateFrame) regardless of which frame is active.
  useStore.getState().setActiveFrame(0);
  assert.equal(useStore.getState().canvas.activeFrame, 0);
  useStore.getState().undo();
  assert.equal(useStore.getState().canvas.frameCount, 2, 'undo reverted duplicateFrame, unaffected by the intervening setActiveFrame');

  useStore.getState().removeFrame(0);
  assert.equal(useStore.getState().canvas.frameCount, 1);
});

test('reorderFrame is undo-tracked (content only — activeFrame is excluded from snapshots, same as activeLayerId) and keeps whichever frame was active following the move', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.addFrame(); // frame 1
  store.addFrame(); // frame 2, active
  store.setFrameDuration(0, 100);
  store.setFrameDuration(1, 200);
  store.setFrameDuration(2, 300);
  assert.equal(useStore.getState().canvas.frameCount, 3);
  assert.equal(useStore.getState().canvas.activeFrame, 2);

  // Branch 1: moving the active frame itself — activeFrame follows it.
  useStore.getState().reorderFrame(2, -1);
  assert.equal(useStore.getState().canvas.activeFrame, 1, 'activeFrame follows the frame it was pointing at');
  assert.deepEqual(useStore.getState().canvas.frameDurations, [100, 300, 200]);

  useStore.getState().undo();
  // activeFrame is a working-session pointer excluded from undo snapshots
  // (see contentSnapshot's comment) — only the swapped content reverts.
  assert.deepEqual(useStore.getState().canvas.frameDurations, [100, 200, 300], 'undo reverts the frame/frameDurations swap');

  // Branch 2: moving a frame adjacent to a different active frame — the
  // active frame stays selected at its new index, not the one that moved.
  useStore.getState().setActiveFrame(0);
  useStore.getState().reorderFrame(1, -1); // swaps frames 0 and 1; frame 0 (active) moves to index 1
  assert.equal(useStore.getState().canvas.activeFrame, 1, 'active frame (not the one that moved by explicit index) stays selected at its new position');
  assert.deepEqual(useStore.getState().canvas.frameDurations, [200, 100, 300]);

  useStore.getState().undo();
  assert.deepEqual(useStore.getState().canvas.frameDurations, [100, 200, 300], 'undo reverts this swap too');
});

test('setFrameDuration is undo-tracked, like any other structural edit', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.addFrame();
  assert.equal(useStore.getState().canvas.frameDurations.length, 2);

  const before = useStore.getState().canvas.frameDurations.slice();
  store.setFrameDuration(1, 500);
  assert.equal(useStore.getState().canvas.frameDurations[1], 500);

  useStore.getState().undo();
  assert.deepEqual(useStore.getState().canvas.frameDurations, before, 'undo reverted the duration change');

  useStore.getState().redo();
  assert.equal(useStore.getState().canvas.frameDurations[1], 500);
});

test('playAnimation is a no-op for a single-frame canvas (nothing to animate)', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  assert.equal(useStore.getState().canvas.frameCount, 1);
  store.playAnimation();
  assert.equal(useStore.getState().isPlaying, false);
});

test('playAnimation advances activeFrame on a timer using each frame\'s own duration, looping; pauseAnimation stops it', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.addFrame(); // 2 frames, activeFrame now 1
  store.setFrameDuration(0, 5);
  store.setFrameDuration(1, 5);
  useStore.getState().setActiveFrame(0);

  useStore.getState().playAnimation();
  assert.equal(useStore.getState().isPlaying, true);

  await new Promise((resolve) => setTimeout(resolve, 40)); // several 5ms ticks
  assert.equal(useStore.getState().isPlaying, true, 'still looping — a two-frame animation never runs out on its own');

  useStore.getState().pauseAnimation();
  assert.equal(useStore.getState().isPlaying, false);

  const frameAfterPause = useStore.getState().canvas.activeFrame;
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(useStore.getState().canvas.activeFrame, frameAfterPause, 'paused — no further advancement');
});

test('manually navigating to a frame during playback pauses it (scrubbing takes back control)', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.addFrame();
  store.setFrameDuration(0, 5);
  store.setFrameDuration(1, 5);

  useStore.getState().playAnimation();
  assert.equal(useStore.getState().isPlaying, true);

  useStore.getState().setActiveFrame(0);
  assert.equal(useStore.getState().isPlaying, false);
});

test('closeProject stops any running playback', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.addFrame();
  store.setFrameDuration(0, 5);
  store.setFrameDuration(1, 5);

  useStore.getState().playAnimation();
  assert.equal(useStore.getState().isPlaying, true);

  useStore.getState().closeProject();
  assert.equal(useStore.getState().isPlaying, false);
});

test('updateGridStyleLive mutates fill without committing; the one trailing updateGridStyle collapses a whole drag into a single undo step', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.setTier('advanced');
  const layerId = useStore.getState().canvas.layers[0].id;
  store.addGrid(layerId);
  const gridId = useStore.getState().canvas.activeGridId;
  const gradient = (angle) => ({ type: 'linear-gradient', angle, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] });
  store.updateGridStyle(layerId, gridId, { fill: gradient(0) });

  const styleFill = () => {
    const canvas = useStore.getState().canvas;
    const layer = canvas.layers.find((l) => l.id === layerId);
    const grid = layer.frames[0].grids.find((g) => g.id === gridId);
    return grid.style.fill;
  };

  store.updateGridStyleLive(layerId, gridId, { fill: gradient(45) });
  store.updateGridStyleLive(layerId, gridId, { fill: gradient(90) });
  assert.equal(styleFill().angle, 90, 'live updates apply immediately');

  store.updateGridStyle(layerId, gridId, { fill: gradient(90) }); // pointer-up commit
  assert.equal(styleFill().angle, 90);

  store.undo();
  assert.equal(styleFill().angle, 0, 'the two live calls must not have created separate undo steps');
});

test('rotateCanvas180 leaves canvas dimensions unchanged and is its own inverse', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.resizeCanvas(10, 16, 'top-left');
  paintColumn(2, 3, '#000000'); // asymmetric mark, not centered, not full-height

  const original = structuredClone(useStore.getState().canvas.layers);
  const { width: originalWidth, height: originalHeight } = useStore.getState().canvas;

  store.rotateCanvas180();
  assert.equal(useStore.getState().canvas.width, originalWidth, '180 degrees never swaps width/height');
  assert.equal(useStore.getState().canvas.height, originalHeight);
  assert.notDeepEqual(useStore.getState().canvas.layers, original, 'content actually moved');

  store.rotateCanvas180(); // a second 180 should return to the exact original layout
  assert.deepEqual(useStore.getState().canvas.layers, original);
  assert.equal(useStore.getState().canvas.width, originalWidth);
  assert.equal(useStore.getState().canvas.height, originalHeight);
});

test('rotateCanvasCCW90 is the exact inverse of rotateCanvas90', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.resizeCanvas(10, 16, 'top-left');
  paintColumn(2, 3, '#000000');

  const original = structuredClone(useStore.getState().canvas.layers);
  const { width: originalWidth, height: originalHeight } = useStore.getState().canvas;

  store.rotateCanvas90();
  assert.equal(useStore.getState().canvas.width, originalHeight);
  assert.equal(useStore.getState().canvas.height, originalWidth);

  store.rotateCanvasCCW90();
  assert.deepEqual(useStore.getState().canvas.layers, original, 'CW then CCW returns to the exact original content');
  assert.equal(useStore.getState().canvas.width, originalWidth);
  assert.equal(useStore.getState().canvas.height, originalHeight);
});

test('rotateActiveGlyph180/CCW90 round-trip exactly on a square (non-lossy) glyph', async () => {
  const store = useStore.getState();
  await store.newProject('glyph', { kind: 'characters', familyName: 'Rotate N Times Test' });
  store.addGlyph({ character: 65 });
  const pixelsPerEm = useStore.getState().glyphSet.meta.pixelsPerEm;
  store.resizeActiveGlyph(pixelsPerEm); // force width === pixelsPerEm === height — a new glyph's default advance width isn't necessarily square
  paintColumn(1, pixelsPerEm, '#000000'); // no recrop ever triggers on a genuinely square glyph

  const original = structuredClone(Array.from(useStore.getState().glyphSet.glyphs.entries()));

  await store.rotateActiveGlyph180();
  await store.rotateActiveGlyph180();
  assert.deepEqual(Array.from(useStore.getState().glyphSet.glyphs.entries()), original, 'two 180s round-trip on a square glyph');

  await store.rotateActiveGlyph90();
  await store.rotateActiveGlyphCCW90();
  assert.deepEqual(Array.from(useStore.getState().glyphSet.glyphs.entries()), original, 'CW then CCW round-trips on a square glyph');
});

test('rotateActiveGlyphCCW90 only prompts requestConfirm once for the whole multi-step rotation, not once per internal 90-degree pass', async () => {
  const store = useStore.getState();
  await store.newProject('glyph', { kind: 'characters', familyName: 'Confirm Count Test' });
  store.addGlyph({ character: 65 });
  const pixelsPerEm = useStore.getState().glyphSet.meta.pixelsPerEm;
  store.resizeActiveGlyph(pixelsPerEm + 4); // non-square — the first internal rotation needs a lossy recrop, so this should confirm
  paintColumn(1, pixelsPerEm, '#000000');

  let confirmCalls = 0;
  useStore.setState({ requestConfirm: () => { confirmCalls++; return Promise.resolve(true); } });

  await store.rotateActiveGlyphCCW90();
  assert.equal(confirmCalls, 1, 'one confirm for the whole CCW90 call, not one per internal 90-degree pass');

  useStore.setState({ requestConfirm: () => Promise.resolve(true) }); // restore the plain always-confirm stub for later tests
});

test('rotateActiveShape180/CCW90 round-trip and compose correctly', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  store.setTier('advanced');
  const layerId = useStore.getState().canvas.layers[0].id;
  store.addGrid(layerId);
  const gridId = useStore.getState().canvas.activeGridId;
  // paint an asymmetric L onto the shape so rotation direction is checkable
  useStore.getState().paintCellLive(2, 2, '#000000');
  useStore.getState().paintCellLive(3, 2, '#000000');
  useStore.getState().paintCellLive(2, 3, '#000000');
  useStore.getState().commitStroke();

  const snapshot = () => structuredClone(useStore.getState().canvas.layers.find((l) => l.id === layerId).frames[0].grids.find((g) => g.id === gridId));
  const original = snapshot();

  store.rotateActiveShape180();
  store.rotateActiveShape180();
  assert.deepEqual(snapshot(), original, 'two 180s round-trip on a shape');

  store.rotateActiveShape90();
  store.rotateActiveShapeCCW90();
  assert.deepEqual(snapshot(), original, 'CW then CCW round-trips on a shape');
});

test('rotateActiveLayer180/CCW90 round-trip and compose correctly, honoring flipRotateAllFrames', async () => {
  const store = useStore.getState();
  await store.newProject('draw');
  paintColumn(2, 3, '#000000'); // frame 0 — Pixel tier lazily creates the layer on this first paint
  const layerId = useStore.getState().canvas.layers[0].id;
  store.addFrame();
  paintColumn(5, 4, '#000000'); // frame 1, distinct content

  const snapshotLayer = () => structuredClone(useStore.getState().canvas.layers.find((l) => l.id === layerId));

  // default flipRotateAllFrames is false — only the active (frame 1) frame should round-trip-affect
  const original = snapshotLayer();
  store.rotateActiveLayer180();
  store.rotateActiveLayer180();
  assert.deepEqual(snapshotLayer(), original, 'two 180s round-trip the active frame only');

  store.setFlipRotateAllFrames(true);
  store.rotateActiveLayer90();
  store.rotateActiveLayerCCW90();
  assert.deepEqual(snapshotLayer(), original, 'CW then CCW round-trips every frame when allFrames is on');
  store.setFlipRotateAllFrames(false);
});
