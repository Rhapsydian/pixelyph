// Simple tier is "advanced tier with auto-managed layers, panel hidden": one
// full-canvas, single-color layer per palette color in use, reconciled on
// every painted cell so "last color painted wins" per cell — the mutual-
// exclusivity invariant that lets a multi-color stroke or selection-paste
// decompose cleanly back into per-color layers for pixelloom to trace.

import { set } from './Grid.js';
import { createLayer, isEmpty } from './Layer.js';

function frameGrid(canvas, layer) {
  const frameIndex = Math.max(0, Math.min(canvas.activeFrame ?? 0, layer.frames.length - 1));
  return { width: layer.width, height: layer.height, pixels: layer.frames[frameIndex].pixels };
}

/**
 * Lazily creates a full-canvas, auto-managed layer for `color` if one
 * doesn't already exist.
 *
 * @param {object} canvas
 * @param {string} color
 * @returns {object} Layer
 */
export function getOrCreateAutoLayer(canvas, color) {
  const existingId = canvas.simpleTier.colorToLayerId.get(color);
  if (existingId) {
    const existing = canvas.layers.find((l) => l.id === existingId);
    if (existing) return existing;
  }
  const layer = createLayer({ name: color, width: canvas.width, height: canvas.height, fill: color, autoManaged: true, autoColor: color, frameCount: canvas.frameCount });
  canvas.layers.push(layer);
  canvas.simpleTier.colorToLayerId.set(color, layer.id);
  return layer;
}

/**
 * Simple-tier per-cell paint: clears (x, y) from every *other* auto-managed
 * layer, sets it into `color`'s layer (creating one lazily if needed), then
 * GCs any auto layer left empty. `color` of null/undefined just erases.
 *
 * @param {object} canvas
 * @param {number} x canvas-space (auto layers are always full-canvas, so this doubles as local space)
 * @param {number} y canvas-space
 * @param {string|null} [color]
 */
export function paintSimpleCell(canvas, x, y, color) {
  for (const layer of canvas.layers.filter((l) => l.autoManaged && l.autoColor !== color)) {
    set(frameGrid(canvas, layer), x, y, 0);
  }
  if (color) {
    const target = getOrCreateAutoLayer(canvas, color);
    set(frameGrid(canvas, target), x, y, 1);
  }
  canvas.layers = canvas.layers.filter((layer) => {
    if (!layer.autoManaged || !isEmpty(layer)) return true;
    if (canvas.simpleTier.colorToLayerId.get(layer.autoColor) === layer.id) {
      canvas.simpleTier.colorToLayerId.delete(layer.autoColor);
    }
    return false;
  });
}
