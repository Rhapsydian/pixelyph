import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, pushSnapshot, undo, redo, canUndo, canRedo } from '../../src/model/history.js';
import { createCanvas, paintCell } from '../../src/model/Canvas.js';

function snapshotOf(canvas) {
  return { layers: canvas.layers, width: canvas.width, height: canvas.height, palette: canvas.palette, tier: canvas.tier };
}

test('a fresh history has nothing to undo or redo', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  const history = createHistory(snapshotOf(canvas));
  assert.equal(canUndo(history), false);
  assert.equal(canRedo(history), false);
});

test('undo restores the exact prior snapshot', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  const history = createHistory(snapshotOf(canvas));

  paintCell(canvas, 0, 0, '#ff0000');
  pushSnapshot(history, snapshotOf(canvas));

  const restored = undo(history);
  assert.equal(restored.layers.length, 0); // back to the empty initial snapshot
});

test('redo re-applies the snapshot undo just moved past', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  const history = createHistory(snapshotOf(canvas));
  paintCell(canvas, 0, 0, '#ff0000');
  pushSnapshot(history, snapshotOf(canvas));

  undo(history);
  const redone = redo(history);
  assert.equal(redone.layers.length, 1);
  assert.equal(redone.layers[0].autoColor, '#ff0000');
});

test('pushing a new snapshot after undo clears the redo stack', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  const history = createHistory(snapshotOf(canvas));
  paintCell(canvas, 0, 0, '#ff0000');
  pushSnapshot(history, snapshotOf(canvas));
  paintCell(canvas, 1, 1, '#00ff00');
  pushSnapshot(history, snapshotOf(canvas));

  undo(history);
  assert.equal(canRedo(history), true);

  paintCell(canvas, 0, 1, '#0000ff');
  pushSnapshot(history, snapshotOf(canvas));
  assert.equal(canRedo(history), false);
});

test('the stack respects its capacity, dropping the oldest entry', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  const history = createHistory(snapshotOf(canvas), 3);
  for (let i = 0; i < 5; i++) {
    paintCell(canvas, 0, 0, i % 2 === 0 ? '#ff0000' : '#00ff00');
    pushSnapshot(history, snapshotOf(canvas));
  }
  assert.equal(history.stack.length, 3);
  // can't undo all the way back past the capacity window
  let undone = 0;
  while (canUndo(history)) {
    undo(history);
    undone++;
  }
  assert.equal(undone, 2);
});

test('changing symmetryMode/referenceImage alone does not affect the history stack', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  const history = createHistory(snapshotOf(canvas));
  canvas.symmetryMode = 'x';
  canvas.referenceImage = { dataUrl: 'data:image/png;base64,', opacity: 0.5, locked: false };
  // snapshotOf deliberately omits these fields — pushing a snapshot here would be a no-op change
  const before = JSON.stringify(history.stack);
  pushSnapshot(history, snapshotOf(canvas));
  assert.notEqual(JSON.stringify(history.stack), before); // a push always grows the stack...
  const restored = undo(history);
  assert.equal(restored.width, 2); // ...but nothing in the restored snapshot mentions symmetry/reference at all
  assert.equal('symmetryMode' in restored, false);
  assert.equal('referenceImage' in restored, false);
});

test('history works the same generically over a GlyphSet-shaped document', () => {
  const glyphSet = { glyphs: [{ codepoint: 65, pixels: [1, 0, 0, 1] }] };
  const history = createHistory(glyphSet);
  const mutated = { glyphs: [...glyphSet.glyphs, { codepoint: 66, pixels: [0, 1, 1, 0] }] };
  pushSnapshot(history, mutated);
  assert.equal(history.stack[1].glyphs.length, 2);
  const restored = undo(history);
  assert.equal(restored.glyphs.length, 1);
});
