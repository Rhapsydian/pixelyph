import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, paintCell, addLayer } from '../../../src/model/Canvas.js';
import { composeLayersSvg } from '../../../src/export/svg/composeLayersSvg.js';

test('an empty canvas composes to an svg with a matching viewBox and no paths', () => {
  const canvas = createCanvas({ width: 3, height: 2 });
  const svg = composeLayersSvg(canvas);
  assert.equal(svg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2"></svg>');
});

test('one painted cell produces one <g> wrapping one traced <path> with the layer color', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  paintCell(canvas, 0, 0, '#ff0000');
  const svg = composeLayersSvg(canvas);
  assert.match(svg, /<g id="layer-ff0000" transform="translate\(0,0\)">/);
  assert.match(svg, /<path d="M0 0H1V1H0Z" fill-rule="evenodd" fill="#ff0000"\/>/);
});

test('multiple colors produce one <g><path> pair per auto-managed layer', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  paintCell(canvas, 0, 0, '#ff0000');
  paintCell(canvas, 1, 0, '#00ff00');
  const svg = composeLayersSvg(canvas);
  assert.equal((svg.match(/<g /g) || []).length, 2);
  assert.match(svg, /fill="#ff0000"/);
  assert.match(svg, /fill="#00ff00"/);
});

test('a hidden layer is excluded from the composed output', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  paintCell(canvas, 0, 0, '#ff0000');
  canvas.layers[0].visible = false;
  const svg = composeLayersSvg(canvas);
  assert.ok(!svg.includes('<path'));
});

test('non-default opacity is emitted on the wrapping <g>', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  paintCell(canvas, 0, 0, '#ff0000');
  canvas.layers[0].opacity = 0.5;
  const svg = composeLayersSvg(canvas);
  assert.match(svg, /<g id="layer-ff0000" transform="translate\(0,0\)" opacity="0.5">/);
});

test('fill color is attribute-escaped', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  paintCell(canvas, 0, 0, '" fill="red');
  const svg = composeLayersSvg(canvas);
  assert.match(svg, /fill="&quot; fill=&quot;red"/);
});

// --- Advanced tier: gradient fill, stroke, effects ---

test('a gradient fill emits a <defs> block with the gradient, referenced by url() from the path', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, { name: 'grad' });
  layer.style.fill = { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] };
  paintCell(canvas, 0, 0, 'x');
  const svg = composeLayersSvg(canvas);
  assert.match(svg, new RegExp(`<defs><linearGradient id="grad-${layer.id}"`));
  assert.match(svg, new RegExp(`fill="url\\(#grad-${layer.id}\\)"`));
});

test('a stroke emits stroke/stroke-width/stroke-dasharray attributes on the path', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: 'stroked' });
  paintCell(canvas, 0, 0, 'x');
  canvas.layers[0].style.stroke = { color: '#00ff00', width: 0.2, linecap: 'round', linejoin: 'round', dashArray: [0.5, 0.25] };
  const svg = composeLayersSvg(canvas);
  assert.match(svg, /stroke="#00ff00" stroke-width="0\.2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="0\.5,0\.25"/);
});

test('effects emit a per-layer <filter> def referenced by filter="url(...)" on the path', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, { name: 'shadowed' });
  paintCell(canvas, 0, 0, 'x');
  layer.style.effects = [{ type: 'drop-shadow', dx: 0.2, dy: 0.2, blur: 0.1, color: '#000', opacity: 0.5 }];
  const svg = composeLayersSvg(canvas);
  assert.match(svg, new RegExp(`<filter id="filter-${layer.id}"`));
  assert.match(svg, new RegExp(`filter="url\\(#filter-${layer.id}\\)"`));
});

test('multiple styled layers collect all defs into one shared <defs> block with no id collisions', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  canvas.tier = 'advanced';
  const a = addLayer(canvas, { name: 'a' });
  a.style.fill = { type: 'radial-gradient', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] };
  canvas.activeLayerId = a.id;
  paintCell(canvas, 0, 0, 'x');
  const b = addLayer(canvas, { name: 'b' });
  b.style.effects = [{ type: 'blur', stdDeviation: 0.3 }];
  paintCell(canvas, 1, 0, 'x');
  const svg = composeLayersSvg(canvas);
  assert.equal((svg.match(/<radialGradient /g) || []).length, 1);
  assert.equal((svg.match(/<filter /g) || []).length, 1);
  assert.equal((svg.match(/<defs>/g) || []).length, 1);
});

// --- CSS-selectable layer ids (on by default, derived from the layer name) ---

test('a layer\'s <g> id is a slugified version of its name', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: 'Sky Background' });
  paintCell(canvas, 0, 0, 'x');
  const svg = composeLayersSvg(canvas);
  assert.match(svg, /<g id="layer-sky-background"/);
});

test('two layers sharing a name get distinct ids, not a collision', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: 'Outline' });
  paintCell(canvas, 0, 0, 'x');
  addLayer(canvas, { name: 'Outline' });
  paintCell(canvas, 1, 0, 'x');
  const svg = composeLayersSvg(canvas);
  assert.match(svg, /<g id="layer-outline"/);
  assert.match(svg, /<g id="layer-outline-2"/);
});

test('a name with no slug-safe characters falls back to "layer-unnamed" rather than an empty id', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: '!!!' });
  paintCell(canvas, 0, 0, 'x');
  const svg = composeLayersSvg(canvas);
  assert.match(svg, /<g id="layer-unnamed"/);
});
