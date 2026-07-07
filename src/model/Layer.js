// A Layer owns its own local grid (not full-canvas) — `offset` places it in
// shared canvas space. Simple tier only ever creates full-canvas, solid-fill
// auto-managed layers (see autoLayerSync.js); advanced tier's free-floating
// layers (arbitrary offset, gradient/stroke/effects style) are what
// growToInclude and non-full-canvas offsets are really for.

import { resizeAt } from './Grid.js';

let nextId = 1;
/** @returns {string} */
function makeId() {
  return `layer-${nextId++}`;
}

/**
 * @typedef {{ pixels: Uint8Array, visible: boolean }} Frame
 * @typedef {{ fill: string|object|null, stroke?: object, effects: object[] }} LayerStyle
 * @typedef {{
 *   id: string, name: string, locked: boolean, opacity: number,
 *   offset: { x: number, y: number }, width: number, height: number,
 *   style: LayerStyle, frames: Frame[],
 *   autoManaged?: boolean, autoColor?: string,
 * }} Layer
 */
// Visibility is per-*frame* (Frame.visible), not a single per-Layer
// boolean — different frames of the same animation can show or hide the
// same layer independently (a layer that only exists in frames 3–5, say).
// `locked` and `opacity` stay layer-level; only visibility varies frame to
// frame. See Canvas.js's paintCell for the "hidden in the active frame
// behaves as locked" enforcement this enables.

/**
 * @param {{ name?: string, width: number, height: number, fill?: string,
 *           offset?: {x:number,y:number}, autoManaged?: boolean, autoColor?: string,
 *           frameCount?: number }} options
 * @returns {Layer}
 */
export function createLayer({ name = 'Layer', width, height, fill = '#000000', offset = { x: 0, y: 0 }, autoManaged, autoColor, frameCount = 1 }) {
  return {
    id: makeId(),
    name,
    locked: false,
    opacity: 1,
    offset: { x: offset.x, y: offset.y },
    width,
    height,
    style: { fill, effects: [] },
    frames: Array.from({ length: frameCount }, () => ({ pixels: new Uint8Array(width * height), visible: true })),
    ...(autoManaged !== undefined ? { autoManaged } : {}),
    ...(autoColor !== undefined ? { autoColor } : {}),
  };
}

/** @returns {boolean} */
export function isEmpty(layer) {
  return layer.frames.every((frame) => frame.pixels.every((v) => v === 0));
}

/**
 * Reallocates a layer's grid (offset + width/height, every frame) so that
 * canvas-space point (x, y) falls inside its bounds. No-ops if already
 * inside. Mutates `layer` in place — callers already work on a fresh clone
 * per committed action (see history.js).
 *
 * @param {Layer} layer
 * @param {number} x canvas-space
 * @param {number} y canvas-space
 */
export function growToInclude(layer, x, y) {
  const minX = Math.min(layer.offset.x, x);
  const minY = Math.min(layer.offset.y, y);
  const maxX = Math.max(layer.offset.x + layer.width, x + 1);
  const maxY = Math.max(layer.offset.y + layer.height, y + 1);
  if (minX === layer.offset.x && minY === layer.offset.y && maxX === layer.offset.x + layer.width && maxY === layer.offset.y + layer.height) {
    return;
  }
  const newWidth = maxX - minX;
  const newHeight = maxY - minY;
  const padX = layer.offset.x - minX;
  const padY = layer.offset.y - minY;
  layer.frames = layer.frames.map((frame) => ({
    pixels: resizeAt({ width: layer.width, height: layer.height, pixels: frame.pixels }, newWidth, newHeight, padX, padY).pixels,
    visible: frame.visible,
  }));
  layer.offset = { x: minX, y: minY };
  layer.width = newWidth;
  layer.height = newHeight;
}
