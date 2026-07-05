import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARSET_PRESETS, presetCodepoints } from '../../src/model/charsetPresets.js';

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
