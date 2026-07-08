import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, paintCell, addLayer, addFrame, setActiveFrame } from '../../../src/model/Canvas.js';
import { composeLayersSvg, composeFrameBody } from '../../../src/export/svg/composeLayersSvg.js';

test('an empty canvas composes to an svg with a matching viewBox and no paths', () => {
  const canvas = createCanvas({ width: 3, height: 2 });
  const svg = composeLayersSvg(canvas);
  assert.equal(svg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2"></svg>');
});

test('one painted cell produces one <g> wrapping one traced <path>, with transform/fill on the path', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: 'Fill' });
  paintCell(canvas, 0, 0, '#ff0000');
  const svg = composeLayersSvg(canvas);
  assert.match(svg, /<g id="layer-fill">/);
  assert.match(svg, /<path transform="translate\(0,0\)" d="M0 0H1V1H0Z" fill-rule="evenodd" fill="#ff0000"\/>/);
});

test('multiple colors in simple tier produce one <g> with one <path> per shape', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  paintCell(canvas, 0, 0, '#ff0000');
  paintCell(canvas, 1, 0, '#00ff00');
  const svg = composeLayersSvg(canvas);
  assert.equal((svg.match(/<g /g) || []).length, 1); // simple tier is a single Layer
  assert.equal((svg.match(/<path /g) || []).length, 2); // one shape per color
  assert.match(svg, /fill="#ff0000"/);
  assert.match(svg, /fill="#00ff00"/);
});

test('two layers each get their own <g>, one <path> apiece', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: 'A' });
  paintCell(canvas, 0, 0, '#ff0000');
  addLayer(canvas, { name: 'B' });
  paintCell(canvas, 1, 0, '#00ff00');
  const svg = composeLayersSvg(canvas);
  assert.equal((svg.match(/<g /g) || []).length, 2);
  assert.equal((svg.match(/<path /g) || []).length, 2);
});

test('a layer holding multiple shapes at once renders each as a sibling <path> inside the one <g>', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: 'multi' });
  paintCell(canvas, 0, 0, '#ff0000'); // shape A
  canvas.activeGridId = null; // force a new shape rather than growing shape A
  paintCell(canvas, 1, 0, '#00ff00'); // shape B
  const svg = composeLayersSvg(canvas);
  assert.equal((svg.match(/<g /g) || []).length, 1);
  assert.equal((svg.match(/<path /g) || []).length, 2);
  assert.match(svg, /fill="#ff0000"/);
  assert.match(svg, /fill="#00ff00"/);
});

test('a layer hidden in the active frame is excluded from the composed output', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  paintCell(canvas, 0, 0, '#ff0000');
  canvas.layers[0].frames[0].visible = false;
  const svg = composeLayersSvg(canvas);
  assert.ok(!svg.includes('<path'));
});

test('a shape\'s own visibility is independent of its layer\'s frame visibility', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  paintCell(canvas, 0, 0, '#ff0000');
  const grid = canvas.layers[0].frames[0].grids[0];
  grid.visible = false;
  const svg = composeLayersSvg(canvas);
  assert.ok(!svg.includes('<path'));
});

test('a layer\'s visibility is independent per frame — hidden in one, visible in another', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: 'A' });
  paintCell(canvas, 0, 0, '#ff0000');
  addFrame(canvas); // frame 1, active
  paintCell(canvas, 0, 0, '#ff0000');
  canvas.layers[0].frames[0].visible = false; // hide only in frame 0

  assert.ok(!composeLayersSvg({ ...canvas, activeFrame: 0 }).includes('<path'));
  assert.ok(composeLayersSvg({ ...canvas, activeFrame: 1 }).includes('<path'));

  setActiveFrame(canvas, 0);
  assert.equal(canvas.layers[0].frames[canvas.activeFrame].visible, false);
  setActiveFrame(canvas, 1);
  assert.equal(canvas.layers[0].frames[canvas.activeFrame].visible, true);
});

test('non-default layer opacity is emitted on the wrapping <g>', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, { name: 'Fill' });
  paintCell(canvas, 0, 0, '#ff0000');
  layer.opacity = 0.5;
  const svg = composeLayersSvg(canvas);
  assert.match(svg, /<g id="layer-fill" opacity="0.5">/);
});

test('non-default shape opacity is emitted on the path', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  paintCell(canvas, 0, 0, '#ff0000');
  canvas.layers[0].frames[0].grids[0].opacity = 0.3;
  const svg = composeLayersSvg(canvas);
  assert.match(svg, /opacity="0\.3"/);
});

test('fill color is attribute-escaped', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  paintCell(canvas, 0, 0, '" fill="red');
  const svg = composeLayersSvg(canvas);
  assert.match(svg, /fill="&quot; fill=&quot;red"/);
});

// --- Advanced tier: gradient fill, stroke, effects (now per-shape) ---

test('a gradient fill emits a <defs> block with the gradient, referenced by url() from the path', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: 'grad' });
  paintCell(canvas, 0, 0, '#ffffff');
  const grid = canvas.layers[0].frames[0].grids[0];
  grid.style.fill = { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] };
  const svg = composeLayersSvg(canvas);
  assert.match(svg, new RegExp(`<defs><linearGradient id="grad-${grid.id}"`));
  assert.match(svg, new RegExp(`fill="url\\(#grad-${grid.id}\\)"`));
});

test('a stroke emits stroke/stroke-width/stroke-dasharray attributes on the path', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: 'stroked' });
  paintCell(canvas, 0, 0, '#ff0000');
  canvas.layers[0].frames[0].grids[0].style.stroke = { color: '#00ff00', width: 0.2, linecap: 'round', linejoin: 'round', dashArray: [0.5, 0.25] };
  const svg = composeLayersSvg(canvas);
  assert.match(svg, /stroke="#00ff00" stroke-width="0\.2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="0\.5,0\.25"/);
});

test('effects emit a per-shape <filter> def referenced by filter="url(...)" on the path', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: 'shadowed' });
  paintCell(canvas, 0, 0, '#ff0000');
  const grid = canvas.layers[0].frames[0].grids[0];
  grid.style.effects = [{ type: 'drop-shadow', dx: 0.2, dy: 0.2, blur: 0.1, color: '#000', opacity: 0.5 }];
  const svg = composeLayersSvg(canvas);
  assert.match(svg, new RegExp(`<filter id="filter-${grid.id}"`));
  assert.match(svg, new RegExp(`filter="url\\(#filter-${grid.id}\\)"`));
});

test('multiple styled shapes collect all defs into one shared <defs> block with no id collisions', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: 'a' });
  paintCell(canvas, 0, 0, '#ffffff');
  canvas.layers[0].frames[0].grids[0].style.fill = { type: 'radial-gradient', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] };
  addLayer(canvas, { name: 'b' });
  paintCell(canvas, 1, 0, '#ffffff');
  canvas.layers[1].frames[0].grids[0].style.effects = [{ type: 'blur', stdDeviation: 0.3 }];
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
  paintCell(canvas, 0, 0, '#ff0000');
  const svg = composeLayersSvg(canvas);
  assert.match(svg, /<g id="layer-sky-background"/);
});

test('two layers sharing a name get distinct ids, not a collision', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: 'Outline' });
  paintCell(canvas, 0, 0, '#ff0000');
  addLayer(canvas, { name: 'Outline' });
  paintCell(canvas, 1, 0, '#00ff00');
  const svg = composeLayersSvg(canvas);
  assert.match(svg, /<g id="layer-outline"/);
  assert.match(svg, /<g id="layer-outline-2"/);
});

test('a name with no slug-safe characters falls back to "layer-unnamed" rather than an empty id', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: '!!!' });
  paintCell(canvas, 0, 0, '#ff0000');
  const svg = composeLayersSvg(canvas);
  assert.match(svg, /<g id="layer-unnamed"/);
});

// --- Animation (Phase 7): frame-aware composition ---

test('composeLayersSvg renders whichever frame is active, not always frame 0', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  paintCell(canvas, 0, 0, '#ff0000'); // frame 0
  addFrame(canvas); // frame 1, active
  paintCell(canvas, 1, 0, '#00ff00'); // frame 1

  const svgFrame1 = composeLayersSvg(canvas);
  assert.match(svgFrame1, /fill="#00ff00"/);
  assert.ok(!svgFrame1.includes('#ff0000'));

  setActiveFrame(canvas, 0);
  const svgFrame0 = composeLayersSvg(canvas);
  assert.match(svgFrame0, /fill="#ff0000"/);
  assert.ok(!svgFrame0.includes('#00ff00'));
});

test('composeFrameBody renders a specific frame without mutating canvas.activeFrame', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  paintCell(canvas, 0, 0, '#ff0000'); // frame 0
  addFrame(canvas); // frame 1, active
  paintCell(canvas, 1, 0, '#00ff00'); // frame 1

  const { body: frame0Body } = composeFrameBody(canvas, 0);
  const { body: frame1Body } = composeFrameBody(canvas, 1);
  assert.match(frame0Body, /fill="#ff0000"/);
  assert.match(frame1Body, /fill="#00ff00"/);
  assert.equal(canvas.activeFrame, 1); // untouched by composeFrameBody's shallow override
});
