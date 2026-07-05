import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasAutosaveSnapshot } from '../../src/io/autosave.js';

test('hasAutosaveSnapshot returns false when readFn resolves null', async () => {
  const result = await hasAutosaveSnapshot(() => Promise.resolve(null));
  assert.equal(result, false);
});

test('hasAutosaveSnapshot returns false when readFn resolves undefined', async () => {
  const result = await hasAutosaveSnapshot(() => Promise.resolve(undefined));
  assert.equal(result, false);
});

test('hasAutosaveSnapshot returns true when readFn resolves a draw snapshot', async () => {
  const result = await hasAutosaveSnapshot(() => Promise.resolve({ kind: 'draw', canvas: {} }));
  assert.equal(result, true);
});

test('hasAutosaveSnapshot returns true when readFn resolves a glyph snapshot', async () => {
  const result = await hasAutosaveSnapshot(() => Promise.resolve({ kind: 'glyph', glyphSet: {} }));
  assert.equal(result, true);
});
