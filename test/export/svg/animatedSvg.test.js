import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, paintCell, addFrame, addLayer } from '../../../src/model/Canvas.js';
import { buildAnimationCss, composeAnimatedSvg } from '../../../src/export/svg/animatedSvg.js';

test('buildAnimationCss returns nothing for a single-frame (non-animated) canvas', () => {
  assert.equal(buildAnimationCss(1, 12), '');
  assert.equal(buildAnimationCss(0, 12), '');
});

test('buildAnimationCss returns nothing for a zero/negative frame rate', () => {
  assert.equal(buildAnimationCss(3, 0), '');
  assert.equal(buildAnimationCss(3, -1), '');
});

test('buildAnimationCss emits one shared @keyframes rule and one class rule per frame, with the expected step percentage and per-frame delay', () => {
  const css = buildAnimationCss(4, 2); // 4 frames at 2fps -> 2s total duration, 25% per step, 0.5s per frame
  assert.equal((css.match(/@keyframes pixelyph-frames/g) || []).length, 1);
  assert.match(css, /0%\{opacity:1\}25\.0000%\{opacity:0\}100%\{opacity:0\}/);
  for (let i = 0; i < 4; i++) {
    const expectedDelay = -i * 0.5;
    const re = new RegExp(`\\.pixelyph-frame-${i}\\{animation:pixelyph-frames 2s steps\\(1,end\\) infinite;animation-delay:${expectedDelay}s\\}`);
    assert.match(css, re);
  }
});

test('composeAnimatedSvg emits one <g class="pixelyph-frame-N"> per frame, each with that frame\'s own content', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  paintCell(canvas, 0, 0, '#ff0000'); // frame 0
  addFrame(canvas); // frame 1, active
  paintCell(canvas, 1, 0, '#00ff00'); // frame 1

  const svg = composeAnimatedSvg(canvas);
  assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 2 1">/);
  assert.match(svg, /<g class="pixelyph-frame-0">.*fill="#ff0000".*<\/g>/);
  assert.match(svg, /<g class="pixelyph-frame-1">.*fill="#00ff00".*<\/g>/);
  assert.ok(!/pixelyph-frame-0[^]*#00ff00/.test(svg.match(/<g class="pixelyph-frame-0">.*?<\/g>/s)[0]));
});

test('composeAnimatedSvg includes the animation <style> block for a multi-frame canvas', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  paintCell(canvas, 0, 0, '#ff0000');
  addFrame(canvas);
  const svg = composeAnimatedSvg(canvas);
  assert.match(svg, /<style>@keyframes pixelyph-frames/);
});

test('composeAnimatedSvg omits the <style> block for a single-frame canvas', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  paintCell(canvas, 0, 0, '#ff0000');
  const svg = composeAnimatedSvg(canvas);
  assert.ok(!svg.includes('<style>'));
});

test('composeAnimatedSvg dedupes a frame-invariant gradient/filter def instead of repeating it once per frame', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, { name: 'grad' });
  layer.style.fill = { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] };
  paintCell(canvas, 0, 0, 'x'); // frame 0
  addFrame(canvas); // frame 1, same layer/style, active
  paintCell(canvas, 0, 0, 'x'); // frame 1

  const svg = composeAnimatedSvg(canvas);
  assert.equal((svg.match(/<linearGradient/g) || []).length, 1);
});
