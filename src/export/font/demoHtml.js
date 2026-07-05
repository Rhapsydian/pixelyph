// Every font export also produces a single, self-contained .html file for
// immediately checking the result without installing anything: the
// compiled WOFF2 (falling back to WOFF) is base64-embedded directly in an
// inline @font-face, so the file opens and works standalone via
// double-click (file://) — no separate font asset, no path/CORS issues.
// Pure string generation (no DOM, no build step) — the inline <script> is
// plain vanilla JS since this file ships as pre-built static output.
//
// Only WOFF2/WOFF are ever embedded here — there's no OTF fallback, and
// that's deliberate, not a gap: `state/store.js`'s exportFont computes
// `woffBytes` unconditionally whenever a demo HTML is requested
// (`if (woff || wantDemoHtml) woffBytes = toWoff(otfBuffer)`), so the demo
// always has a WOFF to embed regardless of whether the user separately
// checked "OTF font file" or "WOFF" for the standalone export files — those
// checkboxes only control which extra files land in the export bundle, not
// what the demo embeds. WOFF (or WOFF2) is strictly the right choice for
// that embed anyway: `woff.js`'s toWoff is a lossless repackaging of the
// exact same SFNT tables `compileFont.js` produced (no outline/hinting/
// metric changes), just with per-table DEFLATE compression, so embedding it
// instead of the OTF costs nothing in rendering fidelity while making the
// resulting .html file's base64 payload smaller — and WOFF is the standard,
// universally-supported `@font-face` embedding format anyway, so there's no
// browser-compatibility reason to prefer a raw OTF source (`format('opentype')`)
// here either. (WOFF2 embedding is currently unreachable in practice since
// `WOFF2_EXPORT_ENABLED` is off — see BACKLOG.md — so `woff2Bytes` passed in
// below is always null for now; the WOFF2-preferred fallback chain in
// fontFaceRule is left in place for when that's re-enabled.)
//
// Character fonts get a live <textarea> preview (defaulted to a sample
// string covering every designed glyph) plus a full specimen grid below.
// Icon fonts get a grid of clickable swatches that insert into the same
// live preview, so icons can be composed/tested without knowing raw PUA
// escapes — plus a tiling test strip (several copies of one icon in a row)
// for visually checking iconTilePadding.
//
// Relies on a global `Buffer` for base64-encoding — available natively
// under `node --test`, and in the browser/Electron renderer via the
// src/polyfills.js shim loaded at app startup (see woff.js, which has the
// same dependency).
//
// Every demo carries a small "Made with Pixelyph" footer linking back to
// the live GitHub Pages demo (PIXELYPH_URL below) — this file is what
// someone downstream actually opens and looks at, so it's the one export
// artifact that benefits from carrying attribution/a way back to the tool
// that made it. The footer's styling is intentionally minimal, matching
// this file's plain functional look everywhere else — Phase 8's visual
// design pass (see the plan's phased roadmap) is scoped to cover this demo
// output too when it reskins the rest of the app, not just leave it as
// today's placeholder styling forever.

// The one hardcoded URL in this file — update it if Pixelyph ever gets an
// official domain name, in place of the GitHub Pages project site.
const PIXELYPH_URL = 'https://rhapsydian.github.io/pixelyph/';

const BRANDING_FOOTER = `<footer style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #333; font-size: 0.8rem; color: #888; text-align: center;">Made with <a href="${PIXELYPH_URL}" style="color: #4da3ff;">Pixelyph</a></footer>`;

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function fontFaceRule(familyName, woff2Bytes, woffBytes) {
  const sources = [];
  if (woff2Bytes) sources.push(`url(data:font/woff2;base64,${toBase64(woff2Bytes)}) format('woff2')`);
  if (woffBytes) sources.push(`url(data:font/woff;base64,${toBase64(woffBytes)}) format('woff')`);
  return `@font-face {\n  font-family: "${escapeHtml(familyName)}";\n  src: ${sources.join(',\n       ')};\n}`;
}

function sortedGlyphEntries(glyphSet) {
  return Array.from(glyphSet.glyphs.entries()).sort((a, b) => a[0] - b[0]);
}

function defaultSampleString(entries) {
  return entries.map(([codepoint]) => String.fromCodePoint(codepoint)).join('');
}

function characterFontBody(glyphSet, entries) {
  const specimenEntries = entries
    .map(([codepoint]) => {
      const char = String.fromCodePoint(codepoint);
      const label = `U+${codepoint.toString(16).toUpperCase()}`;
      return `<div class="specimen-entry" data-codepoint="${codepoint}"><span class="glyph">${escapeHtml(char)}</span><span class="label">${escapeHtml(label)}</span></div>`;
    })
    .join('\n');
  return `
<textarea id="preview-text" rows="3">${escapeHtml(defaultSampleString(entries))}</textarea>
<div id="preview" class="preview"></div>
<h2>Specimen</h2>
<div id="specimen-grid">
${specimenEntries}
</div>`;
}

function iconFontBody(glyphSet, entries) {
  const swatches = entries
    .map(([codepoint, glyph]) => {
      const char = String.fromCodePoint(codepoint);
      const label = glyph.name || '(unnamed)';
      const title = `${label} (U+${codepoint.toString(16).toUpperCase()})`;
      return `<button type="button" class="icon-swatch" data-codepoint="${codepoint}" data-char="${escapeHtml(char)}" title="${escapeHtml(title)}"><span class="glyph">${escapeHtml(char)}</span><span class="label">${escapeHtml(label)}</span></button>`;
    })
    .join('\n');
  return `
<div id="icon-grid">
${swatches}
</div>
<p>Click an icon to insert it below:</p>
<textarea id="preview-text" rows="2"></textarea>
<div id="preview" class="preview"></div>
<h2>Tiling test</h2>
<div id="tiling-strip" class="preview"></div>`;
}

const DEMO_SCRIPT = `
var textArea = document.getElementById('preview-text');
var preview = document.getElementById('preview');
function syncPreview() { preview.textContent = textArea.value; }
if (textArea) { textArea.addEventListener('input', syncPreview); syncPreview(); }
Array.prototype.forEach.call(document.querySelectorAll('.icon-swatch'), function (btn) {
  btn.addEventListener('click', function () {
    textArea.value += btn.dataset.char;
    syncPreview();
  });
});
var firstSwatch = document.querySelector('.icon-swatch');
var tilingStrip = document.getElementById('tiling-strip');
if (firstSwatch && tilingStrip) tilingStrip.textContent = firstSwatch.dataset.char.repeat(8);
`;

/**
 * @param {object} glyphSet GlyphSet
 * @param {Uint8Array} [woff2Bytes] omit if WOFF2 compilation failed/timed out — falls back to WOFF-only
 * @param {Uint8Array} [woffBytes] fallback source for browsers without WOFF2 support
 * @returns {string} a standalone, double-click-openable .html document
 */
export function generateDemoHtml(glyphSet, woff2Bytes, woffBytes) {
  const { meta, kind } = glyphSet;
  const entries = sortedGlyphEntries(glyphSet);
  const body = kind === 'icons' ? iconFontBody(glyphSet, entries) : characterFontBody(glyphSet, entries);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(meta.familyName)} — Font Demo</title>
<style>
${fontFaceRule(meta.familyName, woff2Bytes, woffBytes)}
body { font-family: sans-serif; background: #121212; color: #eee; padding: 2rem; }
textarea { width: 100%; font-size: 1.2rem; box-sizing: border-box; }
.preview { font-family: "${escapeHtml(meta.familyName)}"; font-size: 2.5rem; min-height: 3rem; padding: 0.5rem; border: 1px solid #333; margin: 1rem 0; word-break: break-all; }
#specimen-grid, #icon-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.specimen-entry, .icon-swatch { display: flex; flex-direction: column; align-items: center; gap: 4px; border: 1px solid #333; padding: 6px; min-width: 40px; background: #1e1e1e; color: #eee; }
.icon-swatch { cursor: pointer; }
.specimen-entry .glyph, .icon-swatch .glyph { font-family: "${escapeHtml(meta.familyName)}"; font-size: 1.6rem; }
.specimen-entry .label, .icon-swatch .label { font-size: 0.65rem; color: #888; }
</style>
</head>
<body>
<h1>${escapeHtml(meta.familyName)}</h1>
${body}
<script>
${DEMO_SCRIPT}
</script>
${BRANDING_FOOTER}
</body>
</html>`;
}
