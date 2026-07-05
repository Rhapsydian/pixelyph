import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARSET_PRESETS, presetCodepoints, mergedPresetCodepoints } from '../../src/model/charsetPresets.js';

test('basic-latin preset yields the ASCII printable range', () => {
  const codepoints = presetCodepoints('basic-latin');
  assert.equal(codepoints[0], 0x20);
  assert.equal(codepoints[codepoints.length - 1], 0x7e);
  assert.equal(codepoints.length, 0x7e - 0x20 + 1);
});

test('digits preset yields exactly 0-9', () => {
  const codepoints = presetCodepoints('digits');
  assert.deepEqual(codepoints, [0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]);
});

test('latin-1-supplement preset yields the expected range', () => {
  const codepoints = presetCodepoints('latin-1-supplement');
  assert.equal(codepoints[0], 0xa0);
  assert.equal(codepoints[codepoints.length - 1], 0xff);
});

test('an unknown preset id yields an empty list rather than throwing', () => {
  assert.deepEqual(presetCodepoints('custom'), []);
  assert.deepEqual(presetCodepoints('not-a-real-preset'), []);
});

test('every preset in the registry is reachable through presetCodepoints', () => {
  for (const id of Object.keys(CHARSET_PRESETS)) {
    assert.ok(presetCodepoints(id).length > 0, `${id} should yield at least one codepoint`);
  }
});

test('card-suits preset yields exactly the four suit codepoints', () => {
  assert.deepEqual(presetCodepoints('card-suits'), [0x2660, 0x2663, 0x2665, 0x2666]);
});

test('mergedPresetCodepoints unions non-overlapping presets in sorted order', () => {
  const merged = mergedPresetCodepoints(['digits', 'card-suits']);
  assert.deepEqual(merged, [0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x2660, 0x2663, 0x2665, 0x2666]);
});

test('mergedPresetCodepoints deduplicates an overlap (Digits sits entirely inside Basic Latin)', () => {
  const merged = mergedPresetCodepoints(['basic-latin', 'digits']);
  assert.deepEqual(merged, presetCodepoints('basic-latin')); // digits contribute nothing new
});

test('mergedPresetCodepoints returns [] for an empty selection and ignores unknown ids', () => {
  assert.deepEqual(mergedPresetCodepoints([]), []);
  assert.deepEqual(mergedPresetCodepoints(['not-a-real-preset']), []);
  assert.deepEqual(mergedPresetCodepoints(['digits', 'not-a-real-preset']), presetCodepoints('digits'));
});
