import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeFill, serializeStroke, escapeAttr, angleFromVector, endpointsFromAngle, angleFromEndpoints } from '../../../src/export/svg/layerStyle.js';

test('serializeFill: null fill serializes to fill="none" with no def', () => {
  const { attr, def } = serializeFill(null, 'grad-1');
  assert.equal(attr, 'none');
  assert.equal(def, '');
});

test('serializeFill: a solid color string passes through with no def', () => {
  const { attr, def } = serializeFill('#ff0000', 'grad-1');
  assert.equal(attr, '#ff0000');
  assert.equal(def, '');
});

test('serializeFill: linear-gradient at angle 0 spans left-to-right and references its own id', () => {
  const fill = { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] };
  const { attr, def } = serializeFill(fill, 'grad-layer-1');
  assert.equal(attr, 'url(#grad-layer-1)');
  assert.match(def, /<linearGradient id="grad-layer-1" x1="0" y1="0\.5" x2="1" y2="0\.5">/);
  assert.match(def, /<stop offset="0" stop-color="#fff"\/>/);
  assert.match(def, /<stop offset="1" stop-color="#000"\/>/);
});

test('serializeFill: radial-gradient carries cx/cy/r through verbatim', () => {
  const fill = { type: 'radial-gradient', cx: 0.5, cy: 0.4, r: 0.6, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] };
  const { attr, def } = serializeFill(fill, 'grad-2');
  assert.equal(attr, 'url(#grad-2)');
  assert.match(def, /<radialGradient id="grad-2" cx="0\.5" cy="0\.4" r="0\.6">/);
});

test('serializeFill: linear-gradient with mode "endpoints" passes x1/y1/x2/y2 through verbatim', () => {
  const fill = {
    type: 'linear-gradient',
    mode: 'endpoints',
    x1: 0.1,
    y1: 0.2,
    x2: 0.9,
    y2: 0.8,
    angle: 45, // stale angle left over from a prior mode switch — must be ignored in endpoints mode
    stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }],
  };
  const { attr, def } = serializeFill(fill, 'grad-3');
  assert.equal(attr, 'url(#grad-3)');
  assert.match(def, /<linearGradient id="grad-3" x1="0\.1" y1="0\.2" x2="0\.9" y2="0\.8">/);
});

test('endpointsFromAngle/angleFromEndpoints round-trip at 0/90/45 degrees', () => {
  for (const angle of [0, 90, 45]) {
    const { x1, y1, x2, y2 } = endpointsFromAngle(angle);
    assert.ok(Math.abs(angleFromEndpoints(x1, y1, x2, y2) - angle) < 1e-9);
  }
});

test('angleFromEndpoints: direction-only on an asymmetric endpoint pair (not a true magnitude round-trip)', () => {
  // (0,0)->(2,0) and (0,0)->(1,0) point the same direction but have different lengths;
  // angleFromEndpoints only recovers direction, so both collapse to the same angle.
  assert.equal(angleFromEndpoints(0, 0, 2, 0), angleFromEndpoints(0, 0, 1, 0));
});

test('serializeStroke: no stroke serializes to an empty string', () => {
  assert.equal(serializeStroke(undefined), '');
});

test('serializeStroke: full stroke emits color/width/cap/join/dash attributes', () => {
  const attr = serializeStroke({ color: '#123456', width: 0.2, linecap: 'round', linejoin: 'bevel', dashArray: [0.5, 0.25] });
  assert.match(attr, /stroke="#123456"/);
  assert.match(attr, /stroke-width="0\.2"/);
  assert.match(attr, /stroke-linecap="round"/);
  assert.match(attr, /stroke-linejoin="bevel"/);
  assert.match(attr, /stroke-dasharray="0\.5,0\.25"/);
});

test('serializeStroke: dashArray is omitted when absent', () => {
  const attr = serializeStroke({ color: '#000', width: 0.1 });
  assert.ok(!attr.includes('stroke-dasharray'));
});

test('escapeAttr escapes ampersands and quotes', () => {
  assert.equal(escapeAttr('" fill="red'), '&quot; fill=&quot;red');
});

test('angleFromVector: right/down/left vectors map to 0/90/180 degrees', () => {
  assert.equal(angleFromVector(0.5, 0), 0);
  assert.equal(angleFromVector(0, 0.5), 90);
  assert.equal(angleFromVector(-0.5, 0), 180);
});

test('angleFromVector: round-trips through serializeFill\'s forward math', () => {
  for (const angle of [0, 37, 90, 179, -45, 123.4]) {
    const rad = (angle * Math.PI) / 180;
    const dx = Math.cos(rad) * 0.5;
    const dy = Math.sin(rad) * 0.5;
    const recovered = angleFromVector(dx, dy);
    const diff = ((recovered - angle + 540) % 360) - 180; // shortest signed angular difference
    assert.ok(Math.abs(diff) < 1e-9, `expected ${recovered} to match ${angle} mod 360`);
  }
});
