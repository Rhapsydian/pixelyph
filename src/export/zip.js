// A minimal ZIP writer (STORE method only — no compression) for bundling
// multiple exported files (font export panel) into a single archive, so
// checking several export formats produces one save dialog/download
// instead of one per file. Pure function, no dependency: the files bundled
// here (compiled fonts, WOFF2, HTML/CSS/JSON) are already compressed or
// small, so skipping DEFLATE is a fine trade-off — and it sidesteps
// reaching for another WASM-based library after wawoff2 (see woff.js)
// already turned out to hang in a real browser.
//
// Format reference: PKZIP APPNOTE.TXT — local file header + central
// directory + end-of-central-directory record, each a fixed-layout little-
// endian struct. No zip64 support needed at this file-count/size scale.

const textEncoder = new TextEncoder();

let crcTable = null;
function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

/** @param {Uint8Array} bytes @returns {number} */
function crc32(bytes) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}
function u32(value) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}
function concatBytes(chunks) {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

/** MS-DOS date/time encoding used by the zip format's fixed-size header fields. */
function dosDateTime(date) {
  const dosTime = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const dosDate = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

/**
 * @param {{name: string, data: Uint8Array}[]} files
 * @param {{date?: Date}} [options] fixed date for deterministic output in tests
 * @returns {Uint8Array} a valid .zip archive (STORE method, no compression)
 */
export function createZip(files, { date = new Date() } = {}) {
  const { dosTime, dosDate } = dosDateTime(date);
  const localParts = [];
  const centralEntries = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBytes = textEncoder.encode(name);
    const crc = crc32(data);
    const localOffset = offset;

    const localHeader = concatBytes([
      u32(0x04034b50),
      u16(20), // version needed to extract
      u16(0), // general purpose bit flag
      u16(0), // compression method: stored
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(data.length), // compressed size (== uncompressed, stored)
      u32(data.length),
      u16(nameBytes.length),
      u16(0), // extra field length
      nameBytes,
    ]);

    localParts.push(localHeader, data);
    offset += localHeader.length + data.length;
    centralEntries.push({ nameBytes, crc, size: data.length, localOffset });
  }

  const centralParts = centralEntries.map(({ nameBytes, crc, size, localOffset }) =>
    concatBytes([
      u32(0x02014b50),
      u16(20), // version made by
      u16(20), // version needed to extract
      u16(0), // general purpose bit flag
      u16(0), // compression method: stored
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0), // extra field length
      u16(0), // file comment length
      u16(0), // disk number start
      u16(0), // internal file attributes
      u32(0), // external file attributes
      u32(localOffset),
      nameBytes,
    ]),
  );

  const centralDirBytes = concatBytes(centralParts);
  const endRecord = concatBytes([
    u32(0x06054b50),
    u16(0), // disk number
    u16(0), // disk where central directory starts
    u16(files.length), // central directory records on this disk
    u16(files.length), // total central directory records
    u32(centralDirBytes.length),
    u32(offset), // offset of start of central directory
    u16(0), // comment length
  ]);

  return concatBytes([...localParts, centralDirBytes, endRecord]);
}
