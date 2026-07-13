// Assembles an animation into a looping APNG via upng-js's PNG compressor
// (pure JS deflate under the hood via pako — same "no native deps" reasoning
// as gifenc in animatedRaster.js). upng-js's own top-level `UPNG.encode()`
// pre-sizes its output buffer as `bufs[0].byteLength * bufs.length + 100`
// and silently truncates whenever that estimate undershoots the real
// per-frame chunk overhead (no error, no exception — typed-array writes
// past the array's end are just dropped) — verified directly: a 4x4 canvas
// already loses frames past the 3rd, and this app's canvases are routinely
// that small. `forbidPlte: true` is always passed to `compressPNG` so
// encoding stays lossless truecolor+alpha (ctype 6, matching pixel art's
// exact-color requirement) and our own chunk writer below never needs a
// PLTE/tRNS palette path. This file reuses upng-js's frame compressor
// (`UPNG.encode.compressPNG`, which is correct — the bug is only in the
// surrounding buffer-sizing) plus its exported CRC32/binary-write helpers
// (`UPNG.crc`, `UPNG._bin`), but assembles the PNG chunk stream itself into
// a growable array instead of trusting that fixed-size buffer.

import UPNG from 'upng-js';
import { rasterizeFrame } from './rasterizeFrame.js';
import { frameSvg, loadImageFromBlob } from './rasterFrameHelpers.js';

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function concatBytes(arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function u32(value) {
  const buf = new Uint8Array(4);
  UPNG._bin.writeUint(buf, 0, value);
  return buf;
}

function u16(value) {
  const buf = new Uint8Array(2);
  UPNG._bin.writeUshort(buf, 0, value);
  return buf;
}

function chunk(type, payload) {
  const body = new Uint8Array(4 + payload.length);
  UPNG._bin.writeASCII(body, 0, type);
  body.set(payload, 4);
  return concatBytes([u32(payload.length), body, u32(UPNG.crc.crc(body, 0, body.length))]);
}

function fcTLPayload({ sequenceNumber, rect, delayMs, dispose, blend }) {
  return concatBytes([
    u32(sequenceNumber),
    u32(rect.width),
    u32(rect.height),
    u32(rect.x),
    u32(rect.y),
    u16(delayMs),
    u16(1000), // delay denominator: delayMs is already milliseconds, so /1000 = seconds
    new Uint8Array([dispose, blend]),
  ]);
}

/**
 * Encodes a sequence of already-decoded RGBA frames as a looping APNG.
 * Mirrors `encodeFramesAsGif`'s shape (see animatedRaster.js): DOM-free and
 * node-testable, one duration per frame.
 *
 * @param {(Uint8Array|Uint8ClampedArray)[]} rgbaFrames one flat RGBA buffer per frame, all the same width x height
 * @param {{ width: number, height: number, durationsMs: number[] }} options one duration per frame, same length as rgbaFrames
 * @returns {Uint8Array} a complete APNG file's bytes
 */
export function encodeFramesAsApng(rgbaFrames, { width, height, durationsMs }) {
  const bufs = rgbaFrames.map((rgba) => rgba.buffer.slice(rgba.byteOffset, rgba.byteOffset + rgba.byteLength));
  const nimg = UPNG.encode.compressPNG(bufs, width, height, 0, /* forbidPlte */ true);
  const animated = bufs.length > 1;

  const parts = [
    PNG_SIGNATURE,
    chunk('IHDR', concatBytes([u32(width), u32(height), new Uint8Array([nimg.depth, nimg.ctype, 0, 0, 0])])),
    chunk('sRGB', new Uint8Array([1])),
  ];
  if (animated) parts.push(chunk('acTL', concatBytes([u32(bufs.length), u32(0)])));

  let sequenceNumber = 0;
  nimg.frames.forEach((frame, i) => {
    if (animated) {
      parts.push(
        chunk(
          'fcTL',
          fcTLPayload({ sequenceNumber: sequenceNumber++, rect: frame.rect, delayMs: durationsMs[i], dispose: frame.dispose, blend: frame.blend })
        )
      );
    }
    if (i === 0) parts.push(chunk('IDAT', frame.cimg));
    else parts.push(chunk('fdAT', concatBytes([u32(sequenceNumber++), frame.cimg])));
  });

  parts.push(chunk('IEND', new Uint8Array(0)));
  return concatBytes(parts);
}

/**
 * @param {object} canvas Canvas
 * @param {{ width: number, height: number }} [size] output pixel size — defaults to the canvas's own unscaled size (1x)
 * @returns {Promise<Blob>} an `image/png` blob (animated if the canvas has more than one frame)
 */
export async function buildAnimatedApng(canvas, size = { width: canvas.width, height: canvas.height }) {
  const { width, height } = size;

  const drawCanvas = document.createElement('canvas');
  drawCanvas.width = width;
  drawCanvas.height = height;
  const ctx = drawCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const rgbaFrames = [];
  for (let i = 0; i < canvas.frameCount; i++) {
    const frameBlob = await rasterizeFrame(frameSvg(canvas, i), width, height, 'image/png');
    const image = await loadImageFromBlob(frameBlob);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0);
    rgbaFrames.push(ctx.getImageData(0, 0, width, height).data);
  }

  const bytes = encodeFramesAsApng(rgbaFrames, { width, height, durationsMs: canvas.frameDurations });
  return new Blob([bytes], { type: 'image/png' });
}
