import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLospecPalette } from '../../src/model/paletteImport.js';

test('parses a well-formed Lospec .hex sample (one #RRGGBB per line)', () => {
  const sample = '#0d2b45\n#203c56\n#544e68\n#8d697a\n#d08159\n#ffaa5e\n#ffd4a3\n#ffecd6\n';
  assert.deepEqual(parseLospecPalette(sample), ['#0d2b45', '#203c56', '#544e68', '#8d697a', '#d08159', '#ffaa5e', '#ffd4a3', '#ffecd6']);
});

test('accepts lines without a leading # and lowercases hex digits', () => {
  assert.deepEqual(parseLospecPalette('FF00AA\nabc123'), ['#ff00aa', '#abc123']);
});

test('skips blank lines and normalizes CRLF/LF', () => {
  assert.deepEqual(parseLospecPalette('#111111\r\n\r\n#222222\n\n'), ['#111111', '#222222']);
});

test('skips malformed lines (wrong length, non-hex characters)', () => {
  assert.deepEqual(parseLospecPalette('#12345\n#1234567\n#gggggg\nnotacolor\n#abcdef'), ['#abcdef']);
});

test('an empty or all-invalid file yields an empty palette', () => {
  assert.deepEqual(parseLospecPalette(''), []);
  assert.deepEqual(parseLospecPalette('nonsense\nmore nonsense'), []);
});
