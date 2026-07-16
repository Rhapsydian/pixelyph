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
// insert into the live preview at the textarea's current cursor position
// (not always appended at the end), so PUA-keyed glyphs can be composed/
// tested without knowing raw escapes. Mirrors the in-app Specimen Preview
// panel's hybrid color model: a native color picker sets the color
// newly-inserted/typed characters are stamped with (each character gets
// its own `<span style="color:...">`, tracked in a parallel `colors`
// array the same common-prefix/suffix diff the in-app panel uses), and an
// "Apply to all" button force-recolors every character already in the
// preview. Unlike the in-app panel (which lays out plain-pixel SVG paths
// manually via glyphMetrics, since no compiled font exists yet at edit
// time), this preview renders through the real embedded `@font-face` —
// the browser's own text layout already produces exactly the spacing the
// shipped font will have, multi-line included (`white-space: pre-wrap`),
// no manual metrics math needed here. Swatch-click focus uses
// `{ preventScroll: true }` so returning focus to the (likely
// higher-up-the-page) textarea after a click doesn't yank the viewport
// back up away from the swatch grid the user is actively clicking through.
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

// The one hardcoded URL in this file.
const PIXELYPH_URL = 'https://pixelyph.com/';

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
  const swatches = entries
    .map(([codepoint, glyph]) => {
      const isAuto = isAutoAssignedCodepoint(codepoint);
      const char = String.fromCodePoint(codepoint);
      const hex = `U+${codepoint.toString(16).toUpperCase()}`;
      const label = glyph.name || (isAuto ? '(unnamed)' : hex);
      const title = `${label} (${hex})`;
      return `<button type="button" class="icon-swatch" data-codepoint="${codepoint}" data-char="${escapeHtml(char)}" title="${escapeHtml(title)}"><span class="glyph">${escapeHtml(char)}</span><span class="label">${escapeHtml(label)}</span></button>`;
    })
    .join('\n');
  return `
<textarea id="preview-text" rows="3">${escapeHtml(defaultSampleString(entries))}</textarea>
<div class="preview-color-row">
  <label>Preview color: <input type="color" id="preview-color" value="#eeeeee"></label>
  <button type="button" id="apply-to-all">Apply to all</button>
</div>
<div id="preview" class="preview"></div>
<p>Click a glyph to insert it at the cursor:</p>
<h2>Specimen</h2>
<div id="specimen-grid">
${swatches}
</div>`;
}

const DEMO_SCRIPT = `
var textArea = document.getElementById('preview-text');
var preview = document.getElementById('preview');
var colorInput = document.getElementById('preview-color');
var applyToAllBtn = document.getElementById('apply-to-all');

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// Same common-prefix/common-suffix diff the in-app Specimen Preview panel
// uses: the unchanged head/tail of the text keep their existing colors,
// whatever changed in between becomes fresh copies of the current color.
function diffColors(oldChars, newChars, oldColors, fillColor) {
  var prefix = 0;
  var maxPrefix = Math.min(oldChars.length, newChars.length);
  while (prefix < maxPrefix && oldChars[prefix] === newChars[prefix]) prefix++;
  var suffix = 0;
  var maxSuffix = Math.min(oldChars.length - prefix, newChars.length - prefix);
  while (suffix < maxSuffix && oldChars[oldChars.length - 1 - suffix] === newChars[newChars.length - 1 - suffix]) suffix++;
  var insertedCount = newChars.length - prefix - suffix;
  var next = oldColors.slice(0, prefix);
  for (var i = 0; i < insertedCount; i++) next.push(fillColor);
  if (suffix > 0) next = next.concat(oldColors.slice(oldColors.length - suffix));
  return next;
}

var colors = [];
if (textArea) colors = Array.from(textArea.value).map(function () { return colorInput.value; });

function syncPreview() {
  if (!preview) return;
  var chars = Array.from(textArea.value);
  var html = '';
  for (var i = 0; i < chars.length; i++) {
    html += chars[i] === '\\n' ? '\\n' : '<span style="color:' + (colors[i] || colorInput.value) + '">' + escapeHtml(chars[i]) + '</span>';
  }
  preview.innerHTML = html;
}

function updateText(nextValue) {
  var oldChars = Array.from(textArea.value);
  var newChars = Array.from(nextValue);
  colors = diffColors(oldChars, newChars, colors, colorInput.value);
  textArea.value = nextValue;
  syncPreview();
}

if (textArea) {
  textArea.addEventListener('input', function () { updateText(textArea.value); });
  syncPreview();
}
if (applyToAllBtn) {
  applyToAllBtn.addEventListener('click', function () {
    colors = colors.map(function () { return colorInput.value; });
    syncPreview();
  });
}
Array.prototype.forEach.call(document.querySelectorAll('.icon-swatch'), function (btn) {
  btn.addEventListener('click', function () {
    var start = textArea.selectionStart;
    var end = textArea.selectionEnd;
    var char = btn.dataset.char;
    var nextValue = textArea.value.slice(0, start) + char + textArea.value.slice(end);
    updateText(nextValue);
    var pos = start + char.length;
    textArea.focus({ preventScroll: true });
    textArea.setSelectionRange(pos, pos);
  });
});
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
.preview-color-row { display: flex; align-items: center; gap: var(--space-3); margin-top: var(--space-3); font-size: var(--text-sm); }
.preview-color-row input[type="color"] {
  width: 28px; height: 28px; padding: 2px; background: var(--chrome-bg-raised);
  border: 1px solid var(--chrome-border); border-radius: var(--radius-sm); cursor: pointer;
}
.preview {
  font-family: "${escapeHtml(meta.familyName)}"; font-size: 2.5rem;
  min-height: 3rem; padding: var(--space-3); border: 1px solid var(--chrome-border);
  border-radius: var(--radius-md); background: var(--chrome-bg-panel);
  margin: var(--space-4) 0; word-break: break-all; white-space: pre-wrap;
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
