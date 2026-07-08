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
// project (see store.js) — a `window.confirm` call, unavailable under plain
// `node --test`. Each test file's project starts fresh in-process, so always
// confirming is equivalent to a user clicking "OK" every time.
globalThis.window = { confirm: () => true };

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

test('cross-glyph copy-paste: selecting in glyph A, switching to glyph B, and pasting only affects B', () => {
  const store = useStore.getState();
  store.newProject('glyph', { kind: 'characters', familyName: 'Cross Glyph Test' });

  store.assignCodepoint(65, {}); // glyph A, active
  paintColumn(0, useStore.getState().glyphSet.meta.pixelsPerEm, '#000000'); // a "stem" at x=0

  store.assignCodepoint(66, {}); // glyph B, active, blank

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
  assert.ok(columnIsFilled(glyphB, 5), "glyph B received the pasted stem (centered paste at x=floor((12-1)/2)=5)");
});

// Session 3: store.js's applyContentSnapshot still writes
// canvas.simpleTier.colorToLayerId directly, a field retired in the
// Layer/Frame/Grid redesign (see BACKLOG.md) — store.js itself isn't
// rewritten until the UI/store-wiring session.
test.skip('palette actions (add/remove/reorder/clear) are undo-tracked, same as any other structural edit', () => {
  const store = useStore.getState();
  store.newProject('draw');
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

// Session 3: see the comment on the palette-actions test above.
test.skip('renamePaletteEntry sets a name on a fills entry, undo-tracked', () => {
  const store = useStore.getState();
  store.newProject('draw');
  store.addPaletteFill({ type: 'linear-gradient', angle: 0, stops: [] });
  const fill = useStore.getState().canvas.palette.fills.at(-1);

  store.renamePaletteEntry('fills', fill.id, 'Sunset');
  assert.equal(useStore.getState().canvas.palette.fills.find((f) => f.id === fill.id).name, 'Sunset');

  useStore.getState().undo();
  assert.equal(useStore.getState().canvas.palette.fills.find((f) => f.id === fill.id).name, undefined);
});

test('applyPaletteEntryToActiveLayer: a saved fill (gradient) clones onto the active layer\'s fill, independent of the palette entry afterward', () => {
  const store = useStore.getState();
  store.newProject('draw');
  store.setTier('advanced');
  const layer = useStore.getState().canvas.layers[0];

  store.addPaletteFill({ type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] });
  const fillEntry = useStore.getState().canvas.palette.fills.at(-1);

  store.applyPaletteEntryToActiveLayer('fills', fillEntry.id);
  const appliedFill = useStore.getState().canvas.layers.find((l) => l.id === layer.id).style.fill;
  assert.equal(appliedFill.type, 'linear-gradient');
  assert.equal(appliedFill.stops.length, 2);

  appliedFill.stops.push({ offset: 0.5, color: '#888' });
  assert.equal(fillEntry.stops.length, 2, 'mutating the applied fill must not affect the palette entry it came from');
});

test('applyPaletteEntryToActiveLayer: a saved style replaces fill+stroke+effects wholesale', () => {
  const store = useStore.getState();
  store.newProject('draw');
  store.setTier('advanced');
  const layer = useStore.getState().canvas.layers[0];
  store.updateLayerStyle(layer.id, { fill: '#111111' });

  store.addPaletteStyle({ fill: '#abcdef', stroke: { color: '#000000', width: 0.2 }, effects: [{ type: 'blur', stdDeviation: 0.3 }] });
  const styleEntry = useStore.getState().canvas.palette.styles.at(-1);

  store.applyPaletteEntryToActiveLayer('styles', styleEntry.id);
  const appliedStyle = useStore.getState().canvas.layers.find((l) => l.id === layer.id).style;
  assert.equal(appliedStyle.fill, '#abcdef');
  assert.equal(appliedStyle.stroke.width, 0.2);
  assert.equal(appliedStyle.effects.length, 1);
});

test('applyPaletteEntryToActiveLayer: every default palette style (projectFactory.js\'s DEFAULT_STYLES) applies without throwing', () => {
  // Regression test: DEFAULT_STYLES's "Outlined" entry originally omitted
  // `effects`, which cloneLayerStyle (Canvas.js) requires as an array (it
  // calls .map() on it unconditionally) — applying that style silently threw
  // and never reached the layer at all.
  const store = useStore.getState();
  store.newProject('draw');
  store.setTier('advanced');
  const layer = useStore.getState().canvas.layers[0];

  for (const styleEntry of useStore.getState().canvas.palette.styles) {
    assert.doesNotThrow(() => store.applyPaletteEntryToActiveLayer('styles', styleEntry.id));
    const appliedStyle = useStore.getState().canvas.layers.find((l) => l.id === layer.id).style;
    assert.equal(appliedStyle.fill, styleEntry.fill, `${styleEntry.name} should actually apply its fill`);
  }
});

test('importPixelyphPalette replaces the whole palette (colors + fills + styles); importLospecPalette only replaces colors', () => {
  const store = useStore.getState();
  store.newProject('draw');
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

test('importPixelyphPalette returns false and leaves the palette untouched for invalid/non-palette JSON', () => {
  const store = useStore.getState();
  store.newProject('draw');
  store.addPaletteColor('#ff0000');
  const before = useStore.getState().canvas.palette;
  const ok = store.importPixelyphPalette('not json');
  assert.equal(ok, false);
  assert.equal(useStore.getState().canvas.palette, before, 'palette reference is unchanged on a failed import');
});

// Session 3: see the comment on the palette-actions test above.
test.skip('addFrame/duplicateFrame/removeFrame are undo-tracked; setActiveFrame is a working-session pointer move that isn\'t', () => {
  const store = useStore.getState();
  store.newProject('draw');
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

// Session 3: see the comment on the palette-actions test above.
test.skip('setFrameDuration is undo-tracked, like any other structural edit', () => {
  const store = useStore.getState();
  store.newProject('draw');
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

test('playAnimation is a no-op for a single-frame canvas (nothing to animate)', () => {
  const store = useStore.getState();
  store.newProject('draw');
  assert.equal(useStore.getState().canvas.frameCount, 1);
  store.playAnimation();
  assert.equal(useStore.getState().isPlaying, false);
});

test('playAnimation advances activeFrame on a timer using each frame\'s own duration, looping; pauseAnimation stops it', async () => {
  const store = useStore.getState();
  store.newProject('draw');
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

test('manually navigating to a frame during playback pauses it (scrubbing takes back control)', () => {
  const store = useStore.getState();
  store.newProject('draw');
  store.addFrame();
  store.setFrameDuration(0, 5);
  store.setFrameDuration(1, 5);

  useStore.getState().playAnimation();
  assert.equal(useStore.getState().isPlaying, true);

  useStore.getState().setActiveFrame(0);
  assert.equal(useStore.getState().isPlaying, false);
});

test('closeProject stops any running playback', () => {
  const store = useStore.getState();
  store.newProject('draw');
  store.addFrame();
  store.setFrameDuration(0, 5);
  store.setFrameDuration(1, 5);

  useStore.getState().playAnimation();
  assert.equal(useStore.getState().isPlaying, true);

  useStore.getState().closeProject();
  assert.equal(useStore.getState().isPlaying, false);
});
