import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFilterDef } from '../../../src/export/svg/filters.js';

test('buildFilterDef returns an empty string when there are no effects', () => {
  assert.equal(buildFilterDef([], 'filter-1'), '');
  assert.equal(buildFilterDef(undefined, 'filter-1'), '');
});

test('buildFilterDef: drop-shadow emits one feDropShadow with dx/dy/blur/color/opacity', () => {
  const def = buildFilterDef([{ type: 'drop-shadow', dx: 0.3, dy: 0.2, blur: 0.1, color: '#000000', opacity: 0.6 }], 'filter-1');
  assert.match(def, /<filter id="filter-1"/);
  assert.match(def, /<feDropShadow dx="0\.3" dy="0\.2" stdDeviation="0\.1" flood-color="#000000" flood-opacity="0\.6"\/>/);
});

test('buildFilterDef: drop-shadow defaults opacity to 1 when omitted', () => {
  const def = buildFilterDef([{ type: 'drop-shadow', dx: 0, dy: 0, blur: 0.4, color: '#fff' }], 'filter-glow');
  assert.match(def, /flood-opacity="1"/);
});

test('buildFilterDef: blur emits one feGaussianBlur', () => {
  const def = buildFilterDef([{ type: 'blur', stdDeviation: 0.5 }], 'filter-2');
  assert.match(def, /<feGaussianBlur stdDeviation="0\.5"\/>/);
});

test('buildFilterDef: multiple effects chain as separate primitives in one filter', () => {
  const def = buildFilterDef(
    [
      { type: 'drop-shadow', dx: 0.1, dy: 0.1, blur: 0.1, color: '#000' },
      { type: 'blur', stdDeviation: 0.2 },
    ],
    'filter-3',
  );
  assert.match(def, /<feDropShadow[^>]*\/><feGaussianBlur[^>]*\/>/);
  assert.equal((def.match(/<filter /g) || []).length, 1);
});
