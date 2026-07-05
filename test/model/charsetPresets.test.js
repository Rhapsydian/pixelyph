import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARSET_PRESETS, presetCodepoints, mergedPresetCodepoints } from '../../src/model/charsetPresets.js';

test('basic-latin preset yields the ASCII printable range', () => {
  const codepoints = presetCodepoints('basic-latin');
  assert.equal(codepoints[0], 0x20);
  assert.equal(codepoints[codepoints.length - 1], 0x7e);
  assert.equal(codepoints.length, 0x7e - 0x20 + 1);
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

test('symbols preset includes the four card suits, deduplicated and sorted ascending', () => {
  const codepoints = presetCodepoints('symbols');
  assert.ok(codepoints.includes(0x2660), 'spade');
  assert.ok(codepoints.includes(0x2663), 'club');
  assert.ok(codepoints.includes(0x2665), 'heart');
  assert.ok(codepoints.includes(0x2666), 'diamond');
  assert.deepEqual(codepoints, [...new Set(codepoints)].sort((a, b) => a - b)); // no dupes, ascending
});

test('mergedPresetCodepoints unions non-overlapping presets in sorted order', () => {
  const merged = mergedPresetCodepoints(['latin-1-supplement', 'symbols']);
  // latin-1-supplement (0xa0-0xff) sits entirely below every symbols codepoint
  // (0x2013+), so the sorted union is supplement-then-symbols.
  assert.deepEqual(merged, [...presetCodepoints('latin-1-supplement'), ...presetCodepoints('symbols')]);
});

test('mergedPresetCodepoints deduplicates when the same preset appears twice', () => {
  const merged = mergedPresetCodepoints(['basic-latin', 'basic-latin']);
  assert.deepEqual(merged, presetCodepoints('basic-latin'));
});

test('mergedPresetCodepoints returns [] for an empty selection and ignores unknown ids', () => {
  assert.deepEqual(mergedPresetCodepoints([]), []);
  assert.deepEqual(mergedPresetCodepoints(['not-a-real-preset']), []);
  assert.deepEqual(mergedPresetCodepoints(['symbols', 'not-a-real-preset']), presetCodepoints('symbols'));
});
