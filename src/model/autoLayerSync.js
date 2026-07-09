// Simple/Pixel tier is "advanced/Shape tier with style-scanned auto layers,
// manual shape authoring hidden": layers behave the same as advanced tier
// (any number, reorderable, lockable, per-frame visibility), but each
// layer's current frame holds one Grid (Shape) per distinct color painted
// anywhere in that frame — reconciled on every painted cell so "last color
// painted wins" per cell, the mutual-exclusivity invariant that lets a
// multi-color stroke or selection-paste decompose cleanly back into
// per-color shapes for pixelloom to trace.
// Grids are found by scanning style, not tracked via a persistent map (the
// pre-migration `colorToLayerId`) — a shape only needs to exist in frames
// where its color actually appears, which is the whole point of this
// redesign (see docs/data-model.md).

import { get, set, createShapeGrid, growGridToInclude, shrinkGridToFit } from './Grid.js';
import { createLayer } from './Layer.js';

/**
 * Returns Simple tier's active managed layer — resolves `canvas.activeLayerId`
 * so Simple/Pixel tier can have more than one layer (see docs/data-model.md);
 * falls back to the topmost existing layer if the active id doesn't resolve,
 * or lazy-creates one for a blank canvas.
 *
 * @param {object} canvas
 * @returns {object} Layer
 */
function getSimpleLayer(canvas) {
  if (canvas.layers.length === 0) {
    const layer = createLayer({ name: 'Layer 1', frameCount: canvas.frameCount });
    canvas.layers.push(layer);
    canvas.activeLayerId = layer.id;
    return layer;
  }
  return canvas.layers.find((l) => l.id === canvas.activeLayerId) ?? canvas.layers[canvas.layers.length - 1];
}

/** @returns {object} Frame the current active frame of the simple-tier layer. */
function currentFrame(canvas, layer) {
  const frameIndex = Math.max(0, Math.min(canvas.activeFrame ?? 0, layer.frames.length - 1));
  return layer.frames[frameIndex];
}

/**
 * Simple-tier per-cell paint: finds whichever shape in the active frame
 * currently owns (x, y) and clears it from there (shrinking or deleting
 * that shape, same as any other erase) unless it's already `color`'s own
 * shape, then — if painting, not erasing — sets the cell into the shape
 * matching `color` (creating one lazily if none exists yet this frame).
 * `color` of null/undefined just erases.
 *
 * @param {object} canvas
 * @param {number} x canvas-space
 * @param {number} y canvas-space
 * @param {string|null} [color]
 */
export function paintSimpleCell(canvas, x, y, color) {
  const layer = getSimpleLayer(canvas);
  if (layer.locked) return;
  const frame = currentFrame(canvas, layer);
  if (!frame.visible) return;
  const owner = frame.grids.find((g) => get(g, x - g.offsetX, y - g.offsetY));
  if (owner && owner.style.fill !== color) {
    set(owner, x - owner.offsetX, y - owner.offsetY, 0);
    if (!shrinkGridToFit(owner)) frame.grids = frame.grids.filter((g) => g.id !== owner.id);
  }
  if (!color || owner?.style.fill === color) return;
  let target = frame.grids.find((g) => g.style.fill === color);
  if (!target) {
    target = createShapeGrid({ name: color, offsetX: x, offsetY: y, style: { fill: color, effects: [] } });
    frame.grids.push(target);
  } else {
    growGridToInclude(target, x, y);
  }
  set(target, x - target.offsetX, y - target.offsetY, 1);
}
