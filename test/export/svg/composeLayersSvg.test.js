import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, paintCell } from '../../../src/model/Canvas.js';
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
  assert.match(svg, /<g transform="translate\(0,0\)">/);
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
  assert.match(svg, /<g transform="translate\(0,0\)" opacity="0.5">/);
});

test('fill color is attribute-escaped', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  paintCell(canvas, 0, 0, '" fill="red');
  const svg = composeLayersSvg(canvas);
  assert.match(svg, /fill="&quot; fill=&quot;red"/);
});
