// Like spriteSheet.js, but each frame is rasterized to its own standalone PNG
// file instead of tiled into one sheet image — for pipelines that want
// individual frame files rather than a tile atlas. Sibling to spriteSheet.js/
// animatedRaster.js, reusing the same small frameSvg/loadImageFromBlob shape
// each of those already duplicates rather than introducing a new shared-helper
// module for a third copy.

import { rasterizeFrame } from './rasterizeFrame.js';
import { composeFrameBody } from '../svg/composeLayersSvg.js';

/**
 * Zero-pads `index` to a stable width across the whole frame count (so
 * filenames sort correctly regardless of frame count — e.g. 12 frames pads
 * to 2 digits: `frame-00.png` … `frame-11.png`).
 *
 * @param {number} index
 * @param {number} frameCount
 * @param {string} [baseName]
 * @returns {string}
 */
export function frameFileName(index, frameCount, baseName = 'frame') {
  const width = String(Math.max(0, frameCount - 1)).length;
  return `${baseName}-${String(index).padStart(width, '0')}.png`;
}

function frameSvg(canvas, frameIndex) {
  const { body, defs } = composeFrameBody(canvas, frameIndex);
  const defsBlock = defs.length ? `<defs>${defs.join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas.width} ${canvas.height}">${defsBlock}${body}</svg>`;
}

/**
 * @param {object} canvas Canvas
 * @param {{ width: number, height: number }} [size] output pixel size for each frame — defaults to the canvas's own unscaled size (1x)
 * @returns {Promise<{ files: {name: string, data: Uint8Array}[], metadata: { frames: {file: string, duration: number}[] } }>}
 */
export async function buildSpriteArchive(canvas, size = { width: canvas.width, height: canvas.height }) {
  const { width, height } = size;
  const files = [];
  const frames = [];

  for (let i = 0; i < canvas.frameCount; i++) {
    const blob = await rasterizeFrame(frameSvg(canvas, i), width, height, 'image/png');
    const name = frameFileName(i, canvas.frameCount);
    files.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
    frames.push({ file: name, duration: canvas.frameDurations[i] });
  }

  return { files, metadata: { frames } };
}
