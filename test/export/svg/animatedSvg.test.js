import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, paintCell, addFrame, addLayer, setFrameDuration } from '../../../src/model/Canvas.js';
import { buildAnimationCss, composeAnimatedSvg } from '../../../src/export/svg/animatedSvg.js';

test('buildAnimationCss returns nothing for a single-frame (non-animated) canvas', () => {
  assert.equal(buildAnimationCss([100]), '');
  assert.equal(buildAnimationCss([]), '');
});

test('buildAnimationCss returns nothing when every duration is zero', () => {
  assert.equal(buildAnimationCss([0, 0, 0]), '');
});

test('buildAnimationCss emits one @keyframes + class rule per frame, sized/offset from uniform durations', () => {
  const css = buildAnimationCss([500, 500, 500, 500]); // 4 equal frames -> 2s total, 25% per step, 0.5s per frame
  assert.equal((css.match(/@keyframes pixelyph-frame-/g) || []).length, 4);
  for (let i = 0; i < 4; i++) {
    const expectedDelay = -i * 0.5;
    assert.match(css, new RegExp(`@keyframes pixelyph-frame-${i}\\{0%\\{opacity:1\\}25\\.0000%\\{opacity:0\\}100%\\{opacity:0\\}\\}`));
    const re = new RegExp(`\\.pixelyph-frame-${i}\\{animation:pixelyph-frame-${i} 2s steps\\(1,end\\) infinite;animation-delay:${expectedDelay}s\\}`);
    assert.match(css, re);
  }
});

test('buildAnimationCss gives each frame its own on-window and cumulative delay when durations differ', () => {
  // frame 0: 100ms, frame 1: 300ms, frame 2: 100ms -> total 500ms
  const css = buildAnimationCss([100, 300, 100]);
  assert.match(css, /@keyframes pixelyph-frame-0\{0%\{opacity:1\}20\.0000%\{opacity:0\}100%\{opacity:0\}\}/); // 100/500 = 20%
  assert.match(css, /@keyframes pixelyph-frame-1\{0%\{opacity:1\}60\.0000%\{opacity:0\}100%\{opacity:0\}\}/); // 300/500 = 60%
  assert.match(css, /@keyframes pixelyph-frame-2\{0%\{opacity:1\}20\.0000%\{opacity:0\}100%\{opacity:0\}\}/); // 100/500 = 20%
  assert.match(css, /\.pixelyph-frame-0\{animation:pixelyph-frame-0 0\.5s steps\(1,end\) infinite;animation-delay:-?0s\}/); // JS stringifies -0 as "0"
  assert.match(css, /\.pixelyph-frame-1\{animation:pixelyph-frame-1 0\.5s steps\(1,end\) infinite;animation-delay:-0\.1s\}/); // cumulative 100ms before frame 1
  assert.match(css, /\.pixelyph-frame-2\{animation:pixelyph-frame-2 0\.5s steps\(1,end\) infinite;animation-delay:-0\.4s\}/); // cumulative 400ms before frame 2
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
  assert.match(svg, /<style>@keyframes pixelyph-frame-0/);
});

test('composeAnimatedSvg reflects a custom per-frame duration in the emitted CSS', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  paintCell(canvas, 0, 0, '#ff0000');
  addFrame(canvas);
  setFrameDuration(canvas, 1, 900); // frame 0 stays at the default (1000/12 ≈ 83ms), frame 1 much longer
  const svg = composeAnimatedSvg(canvas);
  const totalMs = canvas.frameDurations[0] + 900;
  const expectedOnPercent = ((100 * 900) / totalMs).toFixed(4);
  assert.match(svg, new RegExp(`@keyframes pixelyph-frame-1\\{0%\\{opacity:1\\}${expectedOnPercent.replace('.', '\\.')}%`));
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
