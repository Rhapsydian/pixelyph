import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeFramesAsGif } from '../../../src/export/raster/animatedRaster.js';

// gifenc runs fine under plain Node (no DOM needed) — only the "get RGBA
// pixels out of a rasterized SVG frame" half of animatedRaster.js needs a
// real <canvas>/Image, so this file tests encodeFramesAsGif directly against
// hardcoded RGBA buffers, per the plan's "structural checks (valid GIF
// header/frame count), not pixel-diffing" policy for this file.
//
// parseGifFrames is a small, real (if minimal) GIF87a/89a walker — not a
// naive byte-pattern scan — because scanning for gifenc's Graphic Control
// Extension marker (0x21 0xF9 0x04) anywhere in the buffer risks false
// positives inside LZW-compressed image data. Written directly against
// gifenc's own encodeLogicalScreenDescriptor/encodeGraphicControlExt/
// encodeImageDescriptor (node_modules/gifenc/src/index.js), which is
// deterministic enough to make this a reliable structural check.

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

/** Skips a size-prefixed sub-block sequence starting at `pos`, ending after its zero-length terminator. */
function skipSubBlocks(bytes, pos) {
  while (bytes[pos] !== 0) pos += 1 + bytes[pos];
  return pos + 1;
}

/** @returns {{ delayCentiseconds: number, transparent: boolean, transparentIndex: number }[]} one entry per image frame, in order */
function parseGifFrames(bytes) {
  let pos = 6; // "GIF89a"
  const lsdFields = bytes[pos + 4];
  const globalColorTableFlag = (lsdFields & 0x80) !== 0;
  const globalColorTableBytes = globalColorTableFlag ? 3 * (1 << ((lsdFields & 0x07) + 1)) : 0;
  pos += 7 + globalColorTableBytes; // Logical Screen Descriptor is 7 bytes

  const frames = [];
  let pendingGce = null;
  while (pos < bytes.length) {
    const marker = bytes[pos];
    if (marker === 0x21) {
      // Extension: introducer + label, then any number of size-prefixed sub-blocks.
      const label = bytes[pos + 1];
      if (label === 0xf9) {
        const packed = bytes[pos + 3];
        const delayLow = bytes[pos + 4];
        const delayHigh = bytes[pos + 5];
        const transparentIndex = bytes[pos + 6];
        pendingGce = { delayCentiseconds: delayLow | (delayHigh << 8), transparent: (packed & 0x01) === 1, transparentIndex };
      }
      pos = skipSubBlocks(bytes, pos + 2);
    } else if (marker === 0x2c) {
      // Image Descriptor: separator + 8 bytes of fields + 1 packed byte, then an optional local color table, then LZW-encoded image data.
      const packed = bytes[pos + 9];
      const localColorTableFlag = (packed & 0x80) !== 0;
      const localColorTableBytes = localColorTableFlag ? 3 * (1 << ((packed & 0x07) + 1)) : 0;
      pos += 10 + localColorTableBytes;
      pos += 1; // LZW minimum code size
      pos = skipSubBlocks(bytes, pos);
      frames.push(pendingGce ?? {});
      pendingGce = null;
    } else {
      break; // GIF trailer (0x3b), or nothing left worth walking further
    }
  }
  return frames;
}

test('encodeFramesAsGif produces a buffer with the GIF89a magic header', () => {
  const bytes = encodeFramesAsGif([solidFrame(2, 2, [255, 0, 0, 255])], { width: 2, height: 2, durationsMs: [83] });
  assert.equal(magicHeader(bytes), 'GIF89a');
  assert.equal(bytes[bytes.length - 1], 0x3b); // GIF trailer byte
});

test('encodeFramesAsGif emits exactly one image frame per input frame', () => {
  const frames = [
    solidFrame(2, 2, [255, 0, 0, 255]),
    solidFrame(2, 2, [0, 255, 0, 255]),
    solidFrame(2, 2, [0, 0, 255, 255]),
  ];
  const bytes = encodeFramesAsGif(frames, { width: 2, height: 2, durationsMs: [83, 83, 83] });
  assert.equal(parseGifFrames(bytes).length, 3);
});

test('encodeFramesAsGif handles a single frame', () => {
  const bytes = encodeFramesAsGif([solidFrame(1, 1, [0, 0, 0, 255])], { width: 1, height: 1, durationsMs: [83] });
  assert.equal(magicHeader(bytes), 'GIF89a');
  assert.equal(parseGifFrames(bytes).length, 1);
});

test('encodeFramesAsGif encodes each frame\'s own duration rather than a single shared rate', () => {
  const frames = [
    solidFrame(2, 2, [255, 0, 0, 255]),
    solidFrame(2, 2, [0, 255, 0, 255]),
    solidFrame(2, 2, [0, 0, 255, 255]),
  ];
  const bytes = encodeFramesAsGif(frames, { width: 2, height: 2, durationsMs: [100, 500, 1000] });
  const parsed = parseGifFrames(bytes);
  // GIF delay is centiseconds (1/100s), so ms/10 — a real, if lossy, resolution limit of the format itself.
  assert.deepEqual(parsed.map((f) => f.delayCentiseconds), [10, 50, 100]);
});

test('encodeFramesAsGif gives a fully transparent frame a real transparent palette index', () => {
  const bytes = encodeFramesAsGif([solidFrame(2, 2, [0, 0, 0, 0])], { width: 2, height: 2, durationsMs: [83] });
  const [frame] = parseGifFrames(bytes);
  assert.equal(frame.transparent, true);
});
