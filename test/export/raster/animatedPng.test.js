import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeFramesAsApng } from '../../../src/export/raster/animatedPng.js';

// upng-js's own encoding runs fine under plain Node (no DOM needed) — only
// the "get RGBA pixels out of a rasterized SVG frame" half of animatedPng.js
// needs a real <canvas>/Image, so this file tests encodeFramesAsApng
// directly against hardcoded RGBA buffers, same "structural checks, not
// pixel-diffing" policy as animatedRaster.test.js.
//
// parseApngChunks is a small, real PNG/APNG chunk walker (length + 4-byte
// type + payload + crc, repeated) — reliable because PNG chunks are
// length-prefixed, so there's no risk of a false match inside compressed
// image data the way a byte-pattern scan would have.

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
  return [...bytes.slice(0, 8)].join(',');
}

/** @returns {{ type: string, payload: Uint8Array }[]} every chunk in file order */
function parseApngChunks(bytes) {
  let pos = 8; // PNG signature
  const chunks = [];
  while (pos < bytes.length) {
    const len = (bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    chunks.push({ type, payload: bytes.slice(pos + 8, pos + 8 + len) });
    pos += 8 + len + 4; // length + type + payload + crc
  }
  return chunks;
}

function readUint32(bytes, offset) {
  return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
}
function readUint16(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

test('encodeFramesAsApng produces a buffer with the PNG magic header and IEND trailer', () => {
  const bytes = encodeFramesAsApng([solidFrame(2, 2, [255, 0, 0, 255])], { width: 2, height: 2, durationsMs: [83] });
  assert.equal(magicHeader(bytes), '137,80,78,71,13,10,26,10');
  const chunks = parseApngChunks(bytes);
  assert.equal(chunks[chunks.length - 1].type, 'IEND');
});

test('encodeFramesAsApng emits exactly one fcTL/frame per input frame, plus one IDAT and N-1 fdAT chunks', () => {
  const frames = [
    solidFrame(2, 2, [255, 0, 0, 255]),
    solidFrame(2, 2, [0, 255, 0, 255]),
    solidFrame(2, 2, [0, 0, 255, 255]),
  ];
  const bytes = encodeFramesAsApng(frames, { width: 2, height: 2, durationsMs: [83, 83, 83] });
  const chunks = parseApngChunks(bytes);
  const counts = chunks.reduce((acc, c) => ({ ...acc, [c.type]: (acc[c.type] ?? 0) + 1 }), {});
  assert.equal(counts.fcTL, 3);
  assert.equal(counts.IDAT, 1);
  assert.equal(counts.fdAT, 2);
  assert.equal(counts.acTL, 1);
});

test('encodeFramesAsApng handles a single frame as a plain (non-animated) PNG', () => {
  const bytes = encodeFramesAsApng([solidFrame(1, 1, [0, 0, 0, 255])], { width: 1, height: 1, durationsMs: [83] });
  const chunks = parseApngChunks(bytes);
  const types = chunks.map((c) => c.type);
  assert.ok(!types.includes('acTL'));
  assert.ok(!types.includes('fcTL'));
  assert.ok(types.includes('IDAT'));
});

test("encodeFramesAsApng encodes each frame's own duration rather than a single shared rate", () => {
  const frames = [
    solidFrame(2, 2, [255, 0, 0, 255]),
    solidFrame(2, 2, [0, 255, 0, 255]),
    solidFrame(2, 2, [0, 0, 255, 255]),
  ];
  const bytes = encodeFramesAsApng(frames, { width: 2, height: 2, durationsMs: [100, 500, 1000] });
  const fcTLPayloads = parseApngChunks(bytes)
    .filter((c) => c.type === 'fcTL')
    .map((c) => c.payload);
  // fcTL payload layout: sequence(4) width(4) height(4) x(4) y(4) delay_num(2) delay_den(2) dispose(1) blend(1)
  const delays = fcTLPayloads.map((p) => readUint16(p, 20));
  assert.deepEqual(delays, [100, 500, 1000]);
  assert.ok(fcTLPayloads.every((p) => readUint16(p, 22) === 1000)); // delay_den, ms-based
});

test('encodeFramesAsApng does not silently truncate a small canvas with many frames (upng-js buffer-sizing bug)', () => {
  // A 2x2 canvas with 50 frames overflows upng-js's own default output
  // buffer estimate (`bufs[0].byteLength * bufs.length + 100`) and gets
  // silently truncated with no error — this is the regression this file's
  // custom chunk writer exists to avoid. See animatedPng.js's header comment.
  const frameCount = 50;
  const frames = Array.from({ length: frameCount }, (_, i) => solidFrame(2, 2, [i, 255 - i, 0, 255]));
  const bytes = encodeFramesAsApng(frames, { width: 2, height: 2, durationsMs: frames.map(() => 100) });
  const chunks = parseApngChunks(bytes);
  const counts = chunks.reduce((acc, c) => ({ ...acc, [c.type]: (acc[c.type] ?? 0) + 1 }), {});
  assert.equal(counts.fcTL, frameCount);
  assert.equal(counts.fdAT, frameCount - 1);
  assert.equal(chunks[chunks.length - 1].type, 'IEND');
  assert.equal(readUint32(parseApngChunks(bytes).find((c) => c.type === 'acTL').payload, 0), frameCount);
});
