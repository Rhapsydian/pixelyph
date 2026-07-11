// A self-contained, looping animated SVG: one <g class="pixelyph-frame-N">
// per animation frame (each built from composeFrameBody, the same per-frame
// primitive spriteSheet.js/animatedRaster.js use), stepped through via CSS
// @keyframes, one rule per frame since frames can have different durations
// (see setFrameDuration/Canvas.js's frameDurations).
//
// The trick: every frame's <g> gets its own @keyframes definition (an
// instant on/off toggle, timed with `steps(1, end)` so there's no fade
// between frames) sized to *that frame's own* share of the total cycle
// (durationMs[i] / totalMs), combined with a negative `animation-delay`
// equal to the cumulative duration of every frame before it — so frame i's
// on-window lands exactly on its slot of the shared timeline regardless of
// how long any frame (including itself) actually lasts. When every frame
// happens to have the same duration this degenerates to evenly-spaced
// slots, but nothing here assumes that.
//
// Gradient/filter <defs> are frame-invariant (they come from LayerStyle,
// which belongs to the Layer, not to a specific frame) but composeFrameBody
// regenerates them on every call — deduped by exact string here so the same
// gradient/filter def doesn't appear once per frame in the output.

import { composeFrameBody } from './composeLayersSvg.js';

const ANIMATION_NAME = 'pixelyph-frame';

/**
 * Builds the <style> block driving the frame step animation: one
 * @keyframes rule + one class rule per frame, sized/offset from each
 * frame's own duration. Pure string generation, no DOM — the
 * "keyframe-string generation" the plan calls out as directly testable.
 *
 * @param {number[]} durationsMs one entry per frame, milliseconds
 * @returns {string} a `<style>...</style>` block, or '' if there's nothing to animate
 */
export function buildAnimationCss(durationsMs) {
  const frameCount = durationsMs.length;
  if (frameCount <= 1) return '';
  const totalMs = durationsMs.reduce((sum, ms) => sum + ms, 0);
  if (totalMs <= 0) return '';
  const totalSeconds = totalMs / 1000;
  const rules = [];
  let cumulativeMs = 0;
  for (let i = 0; i < frameCount; i++) {
    const keyframesName = `${ANIMATION_NAME}-${i}`;
    const onPercent = ((100 * durationsMs[i]) / totalMs).toFixed(4);
    const delaySeconds = -((totalMs - cumulativeMs) / 1000);
    // 0%->onPercent%: holds opacity 1 (this frame's own on-window); onPercent%->100%: holds 0.
    // steps(1,end) makes both segments instant holds with a hard cut at the boundary, not a fade.
    rules.push(`@keyframes ${keyframesName}{0%{opacity:1}${onPercent}%{opacity:0}100%{opacity:0}}`);
    rules.push(`.pixelyph-frame-${i}{animation:${keyframesName} ${totalSeconds}s steps(1,end) infinite;animation-delay:${delaySeconds}s}`);
    cumulativeMs += durationsMs[i];
  }
  return `<style>${rules.join('')}</style>`;
}

/**
 * @param {object} canvas Canvas
 * @returns {string} a full, self-contained `<svg>...</svg>` document
 */
export function composeAnimatedSvg(canvas) {
  const { width, height, frameCount, frameDurations } = canvas;
  const defsSet = new Set();
  const groups = [];
  for (let i = 0; i < frameCount; i++) {
    const { body, defs } = composeFrameBody(canvas, i);
    for (const def of defs) defsSet.add(def);
    groups.push(`<g class="pixelyph-frame-${i}">${body}</g>`);
  }
  const defsBlock = defsSet.size ? `<defs>${Array.from(defsSet).join('')}</defs>` : '';
  const style = buildAnimationCss(frameDurations);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${style}${defsBlock}${groups.join('')}</svg>`;
}
