// Assembles an animation into a looping GIF via gifenc (pure JS, no native
// deps — the plan's pick specifically so Electron packaging never needs a
// native binary, same reasoning as opentype.js/ttf2woff/wawoff2 elsewhere).
//
// Split in two so the actual GIF-encoding logic is directly node --test-able
// (gifenc itself runs fine under plain Node — no DOM needed): encodeFramesAsGif
// takes already-decoded per-frame RGBA buffers and has no DOM dependency;
// buildAnimatedGif is the thin DOM-dependent wrapper that gets those RGBA
// buffers by reusing rasterizeFrame (the same single-frame rasterizer
// PNG/WebP export and spriteSheet.js both use) and reading the pixels back
// out via a 2D canvas context.

// gifenc ships two builds with genuinely different export shapes: Node
// resolves package.json's `main` (a CJS bundle whose named exports aren't
// statically analyzable, so Node's ESM loader only exposes them via
// `.default`, the whole `module.exports` object), while Vite resolves
// `module` (a real ESM build with proper named exports — but *no* object
// under `.default`, just GIFEncoder itself re-exported under that name).
// A namespace import plus a runtime shape check covers both: under Node,
// `ns.GIFEncoder` is missing so we fall back to `ns.default` (the exports
// object); under Vite, `ns.GIFEncoder` is already there directly.
import * as gifencNs from 'gifenc';
const gifenc = gifencNs.GIFEncoder ? gifencNs : gifencNs.default;
const { GIFEncoder, quantize, applyPalette } = gifenc;
import { rasterizeFrame } from './rasterizeFrame.js';
import { composeFrameBody } from '../svg/composeLayersSvg.js';

/**
 * Encodes a sequence of already-decoded RGBA frames as a looping GIF.
 * `oneBitAlpha` quantization gives pixel art's usual fully-transparent
 * background a real GIF transparent index rather than flattening it to an
 * opaque color; frames with no transparent pixels just skip that option.
 * Each frame's own delay (ms) is per-frame, not a single rate for the whole
 * animation — gifenc's `writeFrame` already takes `delay` per call, so a
 * varying `durationsMs` array is exactly as cheap to encode as a uniform one.
 *
 * @param {(Uint8Array|Uint8ClampedArray)[]} rgbaFrames one flat RGBA buffer per frame, all the same width x height
 * @param {{ width: number, height: number, durationsMs: number[] }} options one duration per frame, same length as rgbaFrames
 * @returns {Uint8Array} a complete GIF file's bytes
 */
export function encodeFramesAsGif(rgbaFrames, { width, height, durationsMs }) {
  const gif = GIFEncoder();
  rgbaFrames.forEach((rgba, i) => {
    const palette = quantize(rgba, 256, { format: 'rgba4444', oneBitAlpha: true });
    const index = applyPalette(rgba, palette, 'rgba4444');
    const transparentIndex = palette.findIndex((color) => color[3] === 0);
    gif.writeFrame(index, width, height, {
      palette,
      delay: durationsMs[i],
      repeat: 0,
      ...(transparentIndex >= 0 ? { transparent: true, transparentIndex } : {}),
    });
  });
  gif.finish();
  return gif.bytes();
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
      reject(new Error('animatedRaster: failed to decode a rasterized frame'));
    };
    image.src = url;
  });
}

/**
 * @param {object} canvas Canvas
 * @param {number} [scale] output size multiplier, same presets as PNG/WebP export
 * @returns {Promise<Blob>} an `image/gif` blob
 */
export async function buildAnimatedGif(canvas, scale = 1) {
  const width = canvas.width * scale;
  const height = canvas.height * scale;

  const drawCanvas = document.createElement('canvas');
  drawCanvas.width = width;
  drawCanvas.height = height;
  const ctx = drawCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const rgbaFrames = [];
  for (let i = 0; i < canvas.frameCount; i++) {
    const frameBlob = await rasterizeFrame(frameSvg(canvas, i), canvas.width, canvas.height, scale, 'image/png');
    const image = await loadImageFromBlob(frameBlob);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0);
    rgbaFrames.push(ctx.getImageData(0, 0, width, height).data);
  }

  const bytes = encodeFramesAsGif(rgbaFrames, { width, height, durationsMs: canvas.frameDurations });
  return new Blob([bytes], { type: 'image/gif' });
}
