import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeFill, serializeStroke, escapeAttr } from '../../../src/export/svg/layerStyle.js';

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
