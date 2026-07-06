// Rasterizes every frame of an animation and tiles the results into one
// single-row PNG sprite sheet, alongside a TexturePacker/Aseprite-style JSON
// metadata sidecar ({frames:[{x,y,w,h}], frameRate}). Reuses rasterizeFrame
// (the same single-frame SVG->canvas rasterizer PNG/WebP export already
// uses) once per frame rather than a separate raster pipeline — each
// frame's rasterized PNG is decoded back to an image and drawn onto one
// shared canvas at its tile position.
//
// computeSpriteSheetLayout is pure (no DOM) and separated out specifically
// so the tile-position math is directly node --test-able; buildSpriteSheet
// itself needs a real <canvas>/Image, so it's manual-tested like the rest
// of this project's DOM-dependent raster code (rasterizeFrame.js itself).

import { rasterizeFrame } from './rasterizeFrame.js';
import { composeFrameBody } from '../svg/composeLayersSvg.js';

/**
 * Single-row tile layout for `frameCount` frames of `frameWidth` x
 * `frameHeight` (already at the target export scale).
 *
 * @param {number} frameCount
 * @param {number} frameWidth
 * @param {number} frameHeight
 * @returns {{ sheetWidth: number, sheetHeight: number, frames: {x:number,y:number,w:number,h:number}[] }}
 */
export function computeSpriteSheetLayout(frameCount, frameWidth, frameHeight) {
  const frames = [];
  for (let i = 0; i < frameCount; i++) {
    frames.push({ x: i * frameWidth, y: 0, w: frameWidth, h: frameHeight });
  }
  return { sheetWidth: frameWidth * frameCount, sheetHeight: frameHeight, frames };
}

function frameSvg(canvas, frameIndex) {
  const { body, defs } = composeFrameBody(canvas, frameIndex);
  const defsBlock = defs.length ? `<defs>${defs.join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas.width} ${canvas.height}">${defsBlock}${body}</svg>`;
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('spriteSheet: failed to decode a rasterized frame'));
    };
    image.src = url;
  });
}

/**
 * @param {object} canvas Canvas
 * @param {number} [scale] output size multiplier, same presets as PNG/WebP export
 * @returns {Promise<{ blob: Blob, metadata: { frames: object[], frameRate: number, width: number, height: number } }>}
 */
export async function buildSpriteSheet(canvas, scale = 1) {
  const frameWidth = canvas.width * scale;
  const frameHeight = canvas.height * scale;
  const layout = computeSpriteSheetLayout(canvas.frameCount, frameWidth, frameHeight);

  const sheetCanvas = document.createElement('canvas');
  sheetCanvas.width = layout.sheetWidth;
  sheetCanvas.height = layout.sheetHeight;
  const ctx = sheetCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = false; // hard pixel edges, matching rasterizeFrame's own setting

  for (let i = 0; i < canvas.frameCount; i++) {
    const frameBlob = await rasterizeFrame(frameSvg(canvas, i), canvas.width, canvas.height, scale, 'image/png');
    const image = await loadImageFromBlob(frameBlob);
    ctx.drawImage(image, layout.frames[i].x, layout.frames[i].y);
  }

  const blob = await new Promise((resolve, reject) => {
    sheetCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('buildSpriteSheet: canvas.toBlob produced no blob'))), 'image/png');
  });

  return { blob, metadata: { frames: layout.frames, frameRate: canvas.frameRate, width: layout.sheetWidth, height: layout.sheetHeight } };
}
