import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameFileName, buildSpriteArchiveSvg } from '../../../src/export/raster/spriteArchive.js';
import { createCanvas, addFrame } from '../../../src/model/Canvas.js';

test('frameFileName zero-pads to a stable width across the whole frame count', () => {
  assert.equal(frameFileName(0, 12), 'frame-00.png');
  assert.equal(frameFileName(9, 12), 'frame-09.png');
  assert.equal(frameFileName(11, 12), 'frame-11.png');
});

test('frameFileName needs no padding for single-digit frame counts', () => {
  assert.equal(frameFileName(0, 5), 'frame-0.png');
  assert.equal(frameFileName(4, 5), 'frame-4.png');
});

test('frameFileName pads wider for triple-digit frame counts', () => {
  assert.equal(frameFileName(5, 150), 'frame-005.png');
  assert.equal(frameFileName(149, 150), 'frame-149.png');
});

test('frameFileName handles a single frame', () => {
  assert.equal(frameFileName(0, 1), 'frame-0.png');
});

test('frameFileName accepts a custom base name', () => {
  assert.equal(frameFileName(0, 12, 'sprite'), 'sprite-00.png');
});

test('frameFileName accepts a custom extension', () => {
  assert.equal(frameFileName(0, 12, 'frame', 'svg'), 'frame-00.svg');
  assert.equal(frameFileName(11, 12, 'frame', 'svg'), 'frame-11.svg');
});

test('buildSpriteArchiveSvg produces one real <svg> file per frame, named and ordered like the PNG archive', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  addFrame(canvas); // now 2 frames
  const { files, metadata } = buildSpriteArchiveSvg(canvas);

  assert.equal(files.length, 2);
  assert.equal(files[0].name, 'frame-0.svg');
  assert.equal(files[1].name, 'frame-1.svg');
  const decoded = new TextDecoder().decode(files[0].data);
  assert.match(decoded, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 2 2">/);

  assert.deepEqual(metadata.frames.map((f) => f.file), ['frame-0.svg', 'frame-1.svg']);
  assert.equal(metadata.frames.length, canvas.frameDurations.length);
});
