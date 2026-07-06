import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeFramesAsGif } from '../../../src/export/raster/animatedRaster.js';

// gifenc runs fine under plain Node (no DOM needed) — only the "get RGBA
// pixels out of a rasterized SVG frame" half of animatedRaster.js needs a
// real <canvas>/Image, so this file tests encodeFramesAsGif directly against
// hardcoded RGBA buffers, per the plan's "structural checks (valid GIF
// header/frame count), not pixel-diffing" policy for this file.

function solidFrame(width, height, [r, g, b, a]) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = a;
  }
  return rgba;
}

function magicHeader(bytes) {
  return String.fromCharCode(...bytes.slice(0, 6));
}

/** Counts gifenc's per-frame Graphic Control Extension marker (0x21 0xF9 0x04 — see index.js's encodeGraphicControlExt, always emitted once per writeFrame call with a fixed 4-byte data block size), a reliable per-frame signature in gifenc's own output. */
function countFrameMarkers(bytes) {
  let count = 0;
  for (let i = 0; i < bytes.length - 2; i++) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04) count++;
  }
  return count;
}

test('encodeFramesAsGif produces a buffer with the GIF89a magic header', () => {
  const bytes = encodeFramesAsGif([solidFrame(2, 2, [255, 0, 0, 255])], { width: 2, height: 2, frameRate: 12 });
  assert.equal(magicHeader(bytes), 'GIF89a');
  assert.equal(bytes[bytes.length - 1], 0x3b); // GIF trailer byte
});

test('encodeFramesAsGif emits one Graphic Control Extension per frame', () => {
  const frames = [
    solidFrame(2, 2, [255, 0, 0, 255]),
    solidFrame(2, 2, [0, 255, 0, 255]),
    solidFrame(2, 2, [0, 0, 255, 255]),
  ];
  const bytes = encodeFramesAsGif(frames, { width: 2, height: 2, frameRate: 12 });
  assert.equal(countFrameMarkers(bytes), 3);
});

test('encodeFramesAsGif handles a single frame', () => {
  const bytes = encodeFramesAsGif([solidFrame(1, 1, [0, 0, 0, 255])], { width: 1, height: 1, frameRate: 12 });
  assert.equal(magicHeader(bytes), 'GIF89a');
  assert.equal(countFrameMarkers(bytes), 1);
});

test('encodeFramesAsGif gives a fully transparent frame a real transparent palette index', () => {
  const bytes = encodeFramesAsGif([solidFrame(2, 2, [0, 0, 0, 0])], { width: 2, height: 2, frameRate: 12 });
  // Graphic Control Extension packed byte's low bit is the transparency flag —
  // it's the 4th byte after the 0x21 0xF9 0x04 marker (block size, then the packed byte).
  const markerIndex = bytes.findIndex((_, i) => bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04);
  const packedByte = bytes[markerIndex + 3];
  assert.equal(packedByte & 0x01, 1, 'transparency flag should be set for an all-transparent frame');
});
