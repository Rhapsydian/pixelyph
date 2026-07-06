// A self-contained, looping animated SVG: one <g class="pixelyph-frame-N">
// per animation frame (each built from composeFrameBody, the same per-frame
// primitive spriteSheet.js/animatedRaster.js use), stepped through via a
// single shared CSS @keyframes rule rather than one animation per frame.
//
// The trick: every frame's <g> uses the *same* @keyframes definition (an
// instant on/off toggle, timed with `steps(1, end)` so there's no fade
// between frames) but with its own negative `animation-delay` — frame i
// starts `i` frame-durations "into" the cycle, so its on-window lands
// exactly on the i-th slot of the shared timeline. This is the standard
// CSS technique for stepping through a sequence of elements with one
// keyframes block instead of generating N near-identical ones.
//
// Gradient/filter <defs> are frame-invariant (they come from LayerStyle,
// which belongs to the Layer, not to a specific frame) but composeFrameBody
// regenerates them on every call — deduped by exact string here so the same
// gradient/filter def doesn't appear once per frame in the output.

import { composeFrameBody } from './composeLayersSvg.js';

const ANIMATION_NAME = 'pixelyph-frames';

/**
 * Builds the <style> block driving the frame step animation: one shared
 * @keyframes rule plus one tiny per-frame class rule (its negative delay).
 * Pure string generation, no DOM — the "keyframe-string generation" the
 * plan calls out as directly testable.
 *
 * @param {number} frameCount
 * @param {number} frameRate frames per second
 * @returns {string} a `<style>...</style>` block, or '' if there's nothing to animate
 */
export function buildAnimationCss(frameCount, frameRate) {
  if (frameCount <= 1 || frameRate <= 0) return '';
  const duration = frameCount / frameRate;
  const stepPercent = (100 / frameCount).toFixed(4);
  const perFrameDelay = 1 / frameRate;
  const classRules = [];
  for (let i = 0; i < frameCount; i++) {
    const delay = -i * perFrameDelay;
    classRules.push(`.pixelyph-frame-${i}{animation:${ANIMATION_NAME} ${duration}s steps(1,end) infinite;animation-delay:${delay}s}`);
  }
  // 0%->stepPercent%: holds opacity 1 (this frame's on-window); stepPercent%->100%: holds 0.
  // steps(1,end) makes both segments instant holds with a hard cut at the boundary, not a fade.
  return `<style>@keyframes ${ANIMATION_NAME}{0%{opacity:1}${stepPercent}%{opacity:0}100%{opacity:0}}${classRules.join('')}</style>`;
}

/**
 * @param {object} canvas Canvas
 * @returns {string} a full, self-contained `<svg>...</svg>` document
 */
export function composeAnimatedSvg(canvas) {
  const { width, height, frameCount, frameRate } = canvas;
  const defsSet = new Set();
  const groups = [];
  for (let i = 0; i < frameCount; i++) {
    const { body, defs } = composeFrameBody(canvas, i);
    for (const def of defs) defsSet.add(def);
    groups.push(`<g class="pixelyph-frame-${i}">${body}</g>`);
  }
  const defsBlock = defsSet.size ? `<defs>${Array.from(defsSet).join('')}</defs>` : '';
  const style = buildAnimationCss(frameCount, frameRate);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${style}${defsBlock}${groups.join('')}</svg>`;
}
