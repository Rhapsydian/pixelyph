import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridToPath } from 'pixelloom';

test('pixelloom dependency resolves and traces the README example correctly', () => {
  const pixels = [
    true, true, true,
    true, false, true,
    true, true, true,
  ];

  assert.equal(gridToPath(pixels, 3, 3), 'M0 0H3V3H0ZM2 1H1V2H2Z');
});
