import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../../src/export/slugify.js';

test('lowercases and hyphenates spaces', () => {
  assert.equal(slugify('Sky Background'), 'sky-background');
});

test('collapses runs of unsafe characters into a single hyphen', () => {
  assert.equal(slugify('Outline!!  (v2)'), 'outline-v2');
});

test('trims leading/trailing hyphens produced by leading/trailing punctuation', () => {
  assert.equal(slugify('  -- edge case -- '), 'edge-case');
});

test('a string with no slug-safe characters at all slugifies to an empty string', () => {
  assert.equal(slugify('!!!'), '');
});

test('digits are preserved', () => {
  assert.equal(slugify('Layer 2'), 'layer-2');
});
