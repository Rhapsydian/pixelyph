// ttf2woff (Phase 5's WOFF export, src/export/font/woff.js) references the
// bare `Buffer` global — standard in Node, but Vite doesn't polyfill Node
// globals for the browser/Electron-renderer build. This is the one place
// the app needs a Buffer shim; everything else works with plain
// Uint8Array/ArrayBuffer. Must be imported before anything that might reach
// ttf2woff (see main.jsx).

import { Buffer } from 'buffer';

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}
