import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createZip } from '../../src/export/zip.js';

function readU16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}
function readU32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

test('createZip produces a valid archive: correct signatures, entry count, and unmodified stored file bytes', () => {
  const files = [
    { name: 'a.txt', data: new TextEncoder().encode('hello world') },
    { name: 'b.json', data: new TextEncoder().encode('{"x":1}') },
  ];
  const zip = createZip(files, { date: new Date(2024, 0, 1, 12, 30, 0) });

  assert.equal(readU32(zip, 0), 0x04034b50);

  let offset = 0;
  for (const file of files) {
    assert.equal(readU32(zip, offset), 0x04034b50);
    const nameLen = readU16(zip, offset + 26);
    const extraLen = readU16(zip, offset + 28);
    const dataLen = readU32(zip, offset + 18);
    const name = new TextDecoder().decode(zip.slice(offset + 30, offset + 30 + nameLen));
    assert.equal(name, file.name);
    assert.equal(dataLen, file.data.length);
    const dataStart = offset + 30 + nameLen + extraLen;
    assert.deepEqual(zip.slice(dataStart, dataStart + dataLen), file.data);
    offset = dataStart + dataLen;
  }

  const centralDirStart = offset;
  let centralCount = 0;
  while (readU32(zip, offset) === 0x02014b50) {
    centralCount++;
    const nameLen = readU16(zip, offset + 28);
    offset += 46 + nameLen;
  }
  assert.equal(centralCount, files.length);

  assert.equal(readU32(zip, offset), 0x06054b50);
  assert.equal(readU16(zip, offset + 10), files.length);
  assert.equal(readU32(zip, offset + 16), centralDirStart);
});

test('createZip on an empty file list produces just an end-of-central-directory record', () => {
  const zip = createZip([]);
  assert.equal(zip.length, 22);
  assert.equal(readU32(zip, 0), 0x06054b50);
  assert.equal(readU16(zip, 10), 0);
});

test('createZip gives each file an independent CRC-32 (differing content -> differing CRCs)', () => {
  const zip = createZip([
    { name: 'a.bin', data: new Uint8Array([1, 2, 3]) },
    { name: 'b.bin', data: new Uint8Array([4, 5, 6]) },
  ]);
  const crcA = readU32(zip, 14);
  const nameLenA = readU16(zip, 26);
  const nextOffset = 30 + nameLenA + 3; // header + name + 3 stored bytes
  const crcB = readU32(zip, nextOffset + 14);
  assert.notEqual(crcA, crcB);
});
