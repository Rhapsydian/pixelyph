# Backlog

Features that were built, then deliberately hidden or disabled behind a
known issue, rather than shipped half-broken or removed outright. The
underlying model/logic is left intact in each case — only the
UI surface (or, for WOFF2, the automatic invocation) is switched off — so
restoring them is a small, targeted change once the blocking issue is
fixed. Review this list once all currently-planned phases are complete.

## WOFF2 font export — disabled, times out in real browsers

`wawoff2`'s WOFF2 compression (`src/export/font/woff.js`'s `toWoff2`) was
found, via direct in-browser testing (not just `node --test`, where it
works correctly), to hang indefinitely in a real Chromium/Electron
environment — reproduced in both `vite dev` and a production `vite build`,
so not a dev-server-only artifact. Root cause wasn't pinned down: plain
`WebAssembly.instantiate` works fine in that same environment, so the hang
is specific to wawoff2's emscripten runtime-init handoff, not WASM support
in general.

**Current state:**
- `toWoff2` has an 8-second timeout so it can never hang the UI forever —
  but it reliably times out rather than succeeding, so leaving it reachable
  just means every export that includes it eats that timeout for no
  benefit.
- WOFF2 export is disabled at the source: `WOFF2_EXPORT_ENABLED = false` in
  `state/store.js`'s `exportFont` action skips calling `toWoff2` at all.
- The WOFF2 checkbox row is removed from `FontExportPanel.jsx` (character
  fonts now offer OTF/WOFF/demo HTML; icon fonts add CSS+manifest).
- The `woff2Failed` result flag and its UI warning in `FontExportPanel` are
  left in place, dormant — they'll just never trigger while disabled.

**To resolve:**
1. Root-cause the wawoff2 hang (or evaluate a different pure-JS/WASM WOFF2
   encoder as a replacement — `ttf2woff`'s WOFF1 path has no such issue and
   is a reasonable reference for "this works fine").
2. Flip `WOFF2_EXPORT_ENABLED` back to `true` in `state/store.js`.
3. Restore the `{ key: 'woff2', label: 'WOFF2' }` row to `CHECKBOX_ROWS` in
   `FontExportPanel.jsx` (and its `selected` default state).

## Advanced-tier layer offset — manual X/Y input hidden

The per-layer offset X/Y number inputs in `LayersPanel.jsx` were removed
(commit `1851d64`, "Hide layer offset UI controls pending fractional-offset
fixes") after two preceding fixes for offset-aware grid alignment (commits
`e26abc9` "Shift grid overlay to match active layer offset in advanced
mode" and `2ba7c3c` "Align BrushCursor snap with active layer offset
grid") still left non-integer offset values behaving inconsistently
between the grid overlay, brush cursor snapping, and the actual painted
result.

**Current state:** the `Layer.offset` model field, the `setLayerOffset`
store action, `GridOverlay`'s offset-aware pattern transform, and
`SvgPixelEditor`'s offset-aware cursor snapping are all still intact and
still used (e.g. layers moved programmatically, or offsets restored from a
saved project, render and paint correctly) — only the manual "type an X/Y
value" input UI is hidden, since that's the path that surfaces fractional
values the rest of the pipeline doesn't fully agree on.

**To resolve:**
1. Decide the intended behavior for fractional offsets (snap to whole grid
   cells only, e.g. round on input / on blur; or make the whole pipeline —
   grid overlay, cursor snap, paint targeting — consistently fractional-
   aware) and fix whichever of `GridOverlay.jsx` / `SvgPixelEditor.jsx` /
   `Canvas.js`'s `paintCell` doesn't match that decision.
2. Restore the X/Y `<input type="number">` pair in `LayersPanel.jsx`'s
   `LayerRow` (removed in `1851d64` — that diff is a small, direct
   reference for what to add back).
