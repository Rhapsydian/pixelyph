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
