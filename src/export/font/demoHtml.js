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
// One unified body for every glyph set, regardless of what mix of typed
// and auto-assigned glyphs it has: a live <textarea> preview seeded with
// every *typed* glyph's character (auto-assigned/PUA codepoints have no
// natural keystroke, so they're left out of the seed text), plus a grid of
// clickable swatches — one per glyph, typed or auto-assigned alike — that
// insert into the same live preview, so PUA-keyed glyphs can be composed/
// tested without knowing raw escapes. A tiling test strip (several copies
// of one auto-assigned glyph in a row, for visually checking
// horizontalPadding) only renders if the set actually has at least one
// auto-assigned glyph — nothing to usefully tile otherwise.
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

import { isAutoAssignedCodepoint } from '../../model/GlyphSet.js';

// The one hardcoded URL in this file — update it if Pixelyph ever gets an
// official domain name, in place of the GitHub Pages project site.
const PIXELYPH_URL = 'https://rhapsydian.github.io/pixelyph/';

const BRANDING_FOOTER = `<footer>Made with <a href="${PIXELYPH_URL}">Pixelyph</a></footer>`;

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

// Auto-assigned (PUA) codepoints have no natural keystroke, so they're left
// out of the seed text — only real typed characters go in by default.
function defaultSampleString(entries) {
  return entries
    .filter(([codepoint]) => !isAutoAssignedCodepoint(codepoint))
    .map(([codepoint]) => String.fromCodePoint(codepoint))
    .join('');
}

function glyphBody(entries) {
  const hasAutoAssigned = entries.some(([codepoint]) => isAutoAssignedCodepoint(codepoint));
  const swatches = entries
    .map(([codepoint, glyph]) => {
      const isAuto = isAutoAssignedCodepoint(codepoint);
      const char = String.fromCodePoint(codepoint);
      const hex = `U+${codepoint.toString(16).toUpperCase()}`;
      const label = glyph.name || (isAuto ? '(unnamed)' : hex);
      const title = `${label} (${hex})`;
      return `<button type="button" class="icon-swatch"${isAuto ? ' data-auto="1"' : ''} data-codepoint="${codepoint}" data-char="${escapeHtml(char)}" title="${escapeHtml(title)}"><span class="glyph">${escapeHtml(char)}</span><span class="label">${escapeHtml(label)}</span></button>`;
    })
    .join('\n');
  return `
<textarea id="preview-text" rows="3">${escapeHtml(defaultSampleString(entries))}</textarea>
<div id="preview" class="preview"></div>
<p>Click a glyph to insert it above:</p>
<h2>Specimen</h2>
<div id="specimen-grid">
${swatches}
</div>${hasAutoAssigned ? `
<h2>Tiling test</h2>
<div id="tiling-strip" class="preview"></div>` : ''}`;
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
var firstAutoSwatch = document.querySelector('.icon-swatch[data-auto="1"]');
var tilingStrip = document.getElementById('tiling-strip');
if (firstAutoSwatch && tilingStrip) tilingStrip.textContent = firstAutoSwatch.dataset.char.repeat(8);
`;

/**
 * @param {object} glyphSet GlyphSet
 * @param {Uint8Array} [woff2Bytes] omit if WOFF2 compilation failed/timed out — falls back to WOFF-only
 * @param {Uint8Array} [woffBytes] fallback source for browsers without WOFF2 support
 * @returns {string} a standalone, double-click-openable .html document
 */
export function generateDemoHtml(glyphSet, woff2Bytes, woffBytes) {
  const { meta } = glyphSet;
  const entries = sortedGlyphEntries(glyphSet);
  const body = glyphBody(entries);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(meta.familyName)} — Font Demo</title>
<style>
${fontFaceRule(meta.familyName, woff2Bytes, woffBytes)}
:root {
  --space-2: 0.5rem; --space-3: 0.75rem; --space-4: 1rem; --space-5: 1.5rem; --space-6: 2rem;
  --chrome-bg-app: #121212; --chrome-bg-panel: #1e1e1e; --chrome-bg-raised: #262626;
  --chrome-border: #333; --chrome-border-strong: #4a4a4a;
  --chrome-text: #eaeaea; --chrome-text-muted: #999; --chrome-text-faint: #666;
  --chrome-accent: #4da3ff; --chrome-accent-hover: #6db5ff;
  --radius-sm: 4px; --radius-md: 6px;
  --text-xs: 0.75rem; --text-sm: 0.85rem;
}
* { box-sizing: border-box; }
body {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: var(--chrome-bg-app); color: var(--chrome-text);
  padding: var(--space-6); max-width: 900px; margin: 0 auto;
}
h1 { font-weight: 500; }
h2 { font-size: var(--text-sm); text-transform: uppercase; letter-spacing: 0.05em; color: var(--chrome-text-muted); margin: var(--space-6) 0 var(--space-3); }
textarea, button {
  font-family: inherit; color: var(--chrome-text); background: var(--chrome-bg-raised);
  border: 1px solid var(--chrome-border); border-radius: var(--radius-sm);
}
textarea { width: 100%; font-size: 1.2rem; padding: var(--space-3); }
textarea:hover, button:hover { border-color: var(--chrome-border-strong); }
textarea:focus-visible, button:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--chrome-accent); border-color: var(--chrome-accent); }
.preview {
  font-family: "${escapeHtml(meta.familyName)}"; font-size: 2.5rem;
  min-height: 3rem; padding: var(--space-3); border: 1px solid var(--chrome-border);
  border-radius: var(--radius-md); background: var(--chrome-bg-panel);
  margin: var(--space-4) 0; word-break: break-all;
}
#specimen-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.icon-swatch {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  border: 1px solid var(--chrome-border); border-radius: var(--radius-sm);
  padding: var(--space-2); min-width: 40px; background: var(--chrome-bg-panel); color: var(--chrome-text);
  transition: border-color 0.1s ease, background-color 0.1s ease;
  cursor: pointer;
}
.icon-swatch:hover { background: var(--chrome-bg-raised); border-color: var(--chrome-accent); }
.icon-swatch:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--chrome-accent); }
.icon-swatch .glyph { font-family: "${escapeHtml(meta.familyName)}"; font-size: 1.6rem; }
.icon-swatch .label { font-size: 0.65rem; color: var(--chrome-text-muted); }
footer {
  margin-top: var(--space-6); padding-top: var(--space-4);
  border-top: 1px solid var(--chrome-border); font-size: var(--text-xs);
  color: var(--chrome-text-faint); text-align: center;
}
footer a { color: var(--chrome-accent); }
footer a:hover { color: var(--chrome-accent-hover); }
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
