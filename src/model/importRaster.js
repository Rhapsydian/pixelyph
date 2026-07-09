// Pure downsample+quantize pipeline: raster RGBA -> paintable grid content.
// io/imageDecode.js is the only DOM-touching half of raster import (file ->
// raw RGBA); everything here operates on a plain typed array, so it's
// node --test-able with a hardcoded RGBA array, no real image decoding
// needed in its tests.

import quantize from 'quantize';
import { hexToRgb } from './colorDistance.js';

const ALPHA_THRESHOLD = 128; // source pixels below this alpha are treated as transparent (unpainted)

/**
 * @typedef {{ width: number, height: number, data: Uint8Array|Uint8ClampedArray }} RgbaImage RGBA, row-major, 4 bytes/pixel
 */

function nearestSourcePixel(image, tx, ty, targetWidth, targetHeight) {
  const sx = Math.min(image.width - 1, Math.floor(((tx + 0.5) * image.width) / targetWidth));
  const sy = Math.min(image.height - 1, Math.floor(((ty + 0.5) * image.height) / targetHeight));
  const i = (sy * image.width + sx) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
}

function averageSourceBlock(image, tx, ty, targetWidth, targetHeight) {
  const x0 = Math.floor((tx * image.width) / targetWidth);
  const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * image.width) / targetWidth));
  const y0 = Math.floor((ty * image.height) / targetHeight);
  const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * image.height) / targetHeight));
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;
  for (let sy = y0; sy < y1 && sy < image.height; sy++) {
    for (let sx = x0; sx < x1 && sx < image.width; sx++) {
      const i = (sy * image.width + sx) * 4;
      r += image.data[i];
      g += image.data[i + 1];
      b += image.data[i + 2];
      a += image.data[i + 3];
      count++;
    }
  }
  if (count === 0) return [0, 0, 0, 0];
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count), Math.round(a / count)];
}

/**
 * Downsamples an RGBA image to targetWidth x targetHeight. 'nearest' suits
 * sources already at pixel-art scale; 'average' suits photos/logos being
 * reduced from a much larger source.
 *
 * @param {RgbaImage} image
 * @param {number} targetWidth
 * @param {number} targetHeight
 * @param {'nearest'|'average'} [mode]
 * @returns {RgbaImage}
 */
export function downsampleImage(image, targetWidth, targetHeight, mode = 'nearest') {
  const data = new Uint8Array(targetWidth * targetHeight * 4);
  for (let ty = 0; ty < targetHeight; ty++) {
    for (let tx = 0; tx < targetWidth; tx++) {
      const [r, g, b, a] = mode === 'average' ? averageSourceBlock(image, tx, ty, targetWidth, targetHeight) : nearestSourcePixel(image, tx, ty, targetWidth, targetHeight);
      const i = (ty * targetWidth + tx) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { width: targetWidth, height: targetHeight, data };
}

/** @param {number[]} rgb */
function toHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

function nearestPaletteIndex(rgb, paletteRgb) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < paletteRgb.length; i++) {
    const [pr, pg, pb] = paletteRgb[i];
    const dist = (rgb[0] - pr) ** 2 + (rgb[1] - pg) ** 2 + (rgb[2] - pb) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/**
 * Generates a fresh palette from an image's opaque pixels via median-cut
 * quantization (the `quantize` package — same algorithm family as classic
 * "extract a palette from an image" tools).
 *
 * @param {RgbaImage} image
 * @param {number} [maxColors]
 * @returns {string[]} '#rrggbb' palette
 */
export function generatePalette(image, maxColors = 16) {
  const pixels = [];
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3] < ALPHA_THRESHOLD) continue;
    pixels.push([image.data[i], image.data[i + 1], image.data[i + 2]]);
  }
  if (pixels.length === 0) return [];
  const uniqueCount = new Set(pixels.map((p) => p.join(','))).size;
  if (uniqueCount <= 1) return [toHex(pixels[0])];
  const cmap = quantize(pixels, Math.max(2, Math.min(maxColors, uniqueCount)));
  return cmap.palette().map(toHex);
}

/**
 * Downsamples and quantizes a raster image into per-cell colors ready to
 * feed straight into paintCell. Colors are nearest-RGB-matched to
 * `options.palette` if given, otherwise a fresh palette is generated.
 *
 * @param {RgbaImage} image
 * @param {number} targetWidth
 * @param {number} targetHeight
 * @param {{ mode?: 'nearest'|'average', palette?: string[], maxColors?: number }} [options]
 * @returns {{ width: number, height: number, palette: string[], colors: (string|null)[] }}
 *   colors is row-major, length targetWidth*targetHeight; null = transparent/unpainted cell
 */
export function importRasterToGrid(image, targetWidth, targetHeight, { mode = 'nearest', palette, maxColors = 16 } = {}) {
  const down = downsampleImage(image, targetWidth, targetHeight, mode);
  const finalPalette = palette && palette.length ? palette : generatePalette(down, maxColors);
  const paletteRgb = finalPalette.map(hexToRgb);
  const colors = new Array(targetWidth * targetHeight).fill(null);
  for (let i = 0, p = 0; i < down.data.length; i += 4, p++) {
    if (down.data[i + 3] < ALPHA_THRESHOLD || paletteRgb.length === 0) continue;
    const idx = nearestPaletteIndex([down.data[i], down.data[i + 1], down.data[i + 2]], paletteRgb);
    colors[p] = finalPalette[idx];
  }
  return { width: targetWidth, height: targetHeight, palette: finalPalette, colors };
}
