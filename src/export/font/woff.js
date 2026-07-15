// Derives .woff/.woff2 from the compiled OTF buffer (compileFont.js). WOFF
// wrapping is agnostic to whether the underlying SFNT is CFF- or
// glyf-flavored — it just repackages the existing tables with per-table
// compression — so this works unmodified on our always-CFF output.
//
// ttf2woff references the bare `Buffer` global (standard in Node, absent in
// the browser/Electron renderer without the src/polyfills.js shim loaded at
// app startup). Both packages ship a CJS build without a proper `default`
// export shape, so — like opentype.js (opentypeCompat.js) — a namespace
// import with a fallback normalizes that.
//
// KNOWN ISSUE (see BACKLOG.md): wawoff2's compress() has been observed to
// hang indefinitely (never resolves or rejects) in at least one real
// Chromium/Electron environment, in both `vite dev` and a production `vite
// build` — verified directly, not a dev-only pre-bundling artifact, and not
// reproducible under plain `node --test` (where it works correctly). Root
// cause wasn't pinned down (WebAssembly itself works fine in that
// environment; the hang is specific to wawoff2's emscripten runtime-init
// handoff). toWoff2 below wraps the call with a timeout so a WOFF2 export
// can never hang the UI forever, but WOFF2 export is currently disabled
// entirely (state/store.js's WOFF2_EXPORT_ENABLED, FontExportPanel's
// hidden checkbox) rather than have every export reliably eat that
// timeout. Callers that do invoke this should treat a rejection as "WOFF2
// unavailable this session" and continue with whichever other formats were
// requested, not as a fatal export failure.

import * as ttf2woffNamespace from 'ttf2woff';

const ttf2woff = ttf2woffNamespace.default ?? ttf2woffNamespace;
const WOFF2_TIMEOUT_MS = 8000;

/**
 * @param {ArrayBuffer} otfBuffer
 * @returns {Uint8Array}
 */
export function toWoff(otfBuffer) {
  return ttf2woff(new Uint8Array(otfBuffer));
}

/**
 * @param {ArrayBuffer} otfBuffer
 * @returns {Promise<Uint8Array>} rejects if compression fails or exceeds WOFF2_TIMEOUT_MS (see KNOWN ISSUE above)
 */
export async function toWoff2(otfBuffer) {
  // Dynamic import rather than a static one (like ttf2woff above): callers
  // only ever reach this while WOFF2_EXPORT_ENABLED is true (state/store.js),
  // which is currently always false — a static import would still pull
  // wawoff2's whole WASM runtime into the main bundle regardless, since
  // bundlers resolve those at build time, not by whether the code path ever
  // runs. This way it's its own chunk that's simply never fetched while the
  // feature stays disabled.
  const wawoff2Namespace = await import('wawoff2');
  const wawoff2 = wawoff2Namespace.default ?? wawoff2Namespace;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`WOFF2 compression did not complete within ${WOFF2_TIMEOUT_MS}ms`)), WOFF2_TIMEOUT_MS);
  });
  try {
    return await Promise.race([wawoff2.compress(new Uint8Array(otfBuffer)), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
