# Backlog

Two kinds of deferred items live here: features that were built, then
deliberately hidden or disabled behind a known issue, rather than shipped
half-broken or removed outright (the underlying model/logic is left intact
in each case — only the UI surface, or for WOFF2 the automatic invocation,
is switched off — so restoring them is a small, targeted change once the
blocking issue is fixed); and open ideas flagged for later discussion
rather than acted on immediately. Review this list once all
currently-planned phases are complete.

## DONE: Layer/Frame/Grid model redesign

Shipped across 5 sessions (0-4); merged `layer-frame-grid-redesign` into
`main` (fast-forward, `main` hadn't moved) once Session 4's rewritten test
suite passed clean.

**Why:** started from two small questions ("why is a 16x16 save's `pixels`
string 344 characters" and "how do vector animation apps handle layer/frame
ownership") that exposed a real design gap: Pixelyph has been conflating
"layer" (a persistent, styled entity) with "shape" (the actual pixel
content), which is why Simple tier has to create a whole new `Layer` —
with a dense `Frame` entry pre-allocated for *every* frame in the
animation — the first time any color is used anywhere, even if that color
only ever appears in 1 of 16 frames. Surveyed how real animation tools
handle this (Adobe Animate/Flash, Aseprite, After Effects/Lottie, Rive):
none of them invert the layer/frame nesting, and all of them keep a layer
as the persistent identity while making per-frame content sparse/optional
instead.

**Full data model spec: [`docs/data-model.md`](./docs/data-model.md).**
Exact `Layer`/`Frame`/`Grid` shapes, the `activeGridId` selection pointer
and its frame-switch resolution algorithm, the grow/shrink-to-fit
algorithm, the two merge operations (layer merge-down is now pure
concatenation; grid/shape merge-down keeps the old bounding-box+pixel-OR
behavior, "bottom wins" on style), UI wireframes, and the save-file v3
migration outline all live there, not duplicated here.

**Retires the "Advanced-tier layer offset — manual X/Y input hidden" item
below** once shipped — offset becomes fully auto-computed from painted
content, never manually typed, so the fractional-offset bug class this was
shelved for can't occur. Delete that entry when this migration ships.

**Substantially resolves "Layer groups/folders — deferred again" below** —
Advanced tier now supports multiple shapes per layer per frame from the
start (not deferred), which was that item's entire premise. See that
entry's note.

**Phase breakdown:**
- **Session 0 — Design. Done.** Spec written to `docs/data-model.md`.
- **Session 1 — Model layer. Done.** `Grid` is now first-class; `Layer`
  shrank to pure identity (`{id,name,locked,opacity,frames}`), style moved
  to `Grid.style`. `Canvas.js`'s paint/resize/frame/merge functions,
  `autoLayerSync.js` (collapsed to one style-scanned layer),
  `selection.js`, and `GlyphSet.js`'s `canvasToGlyphPixels` all rewritten
  against the new shape. `projectFile.js` got a real version-3 migration
  (v1/v2 saves crop each frame to a Grid; Simple-tier saves collapse their
  per-color auto-layers into one Layer). Test suite: 300/300 passing ->
  290 passing / 63 skipped (old-shape assertions, tagged by which future
  session unblocks them) / 0 failing.
- **Session 2 — Export/compose. Done.** Turned out to be a single-function
  fix: only `composeLayersSvg.js`'s `composeLayersBody` actually read
  layer/frame pixel data — `animatedSvg.js`/`spriteSheet.js`/
  `animatedRaster.js`/`spriteArchive.js` all only ever call
  `composeFrameBody`, so they needed zero source changes once
  `composeLayersBody` was rewritten to iterate `layers -> frame.grids ->
  each grid`. The layer-level `<g id="layer-{slug}">` (a documented,
  already-shipped feature — see "Draw mode" in `README.md`) is preserved
  keyed on layer name, now wrapping one `<path>` per shape instead of
  exactly one; gradient/filter def ids moved from `grad-${layer.id}` to
  `grad-${grid.id}`. Test suite: 313 passing / 44 skipped / 0 failing.
- **Session 3 — UI. Done.** `LayersPanel.jsx` now shows each layer's Shapes
  as expandable, indented sub-rows (same eye/lock/name/opacity control set
  as a layer row, a small gap so an active layer's and an active shape's
  highlight borders never touch) — move/duplicate/merge-down/delete live
  in one shared toolbar that context-switches between layer and shape
  actions based on which kind of row was last clicked (tracked separately
  from `activeGridId`, since that auto-resolves to a shape even on a plain
  layer click, which would otherwise make layer actions unreachable on any
  non-empty layer); Add Layer/Add Shape stayed two distinct icon buttons
  (a stacked-diamond glyph and a single-square glyph, each with a small
  "+" badge) rather than folding "add" into the context switch, since
  unlike the other four it isn't an action *on* the current selection.
  `LayerStylePanel.jsx` retargeted from the active layer to the active
  shape. `SvgPixelEditor.jsx`'s cursor-targeting/paint-targeting/
  grid-overlay offset source switched from the retired `layer.offset` to
  the active shape's `offsetX`/`offsetY` — this was a live bug (the old
  read threw whenever an advanced-tier layer was active), so painting only
  started working again at the very end of this session. `Canvas.js`
  gained `addGrid`/`removeGrid`/`reorderGrid`/`duplicateGrid`/a
  canvas-level `mergeGridDown`; `store.js` gained matching thin-wrapper
  actions plus `setActiveGridId`, and `applyContentSnapshot`'s stale
  `simpleTier.colorToLayerId` write (silently breaking undo/redo) was
  removed. `createShapeGrid` gained a `filled` option so "+ Add Shape"
  creates a genuinely empty shape instead of one with a pre-painted pixel.
  Test suite: 313 passing / 44 skipped -> 317 passing / 40 skipped / 0
  failing (4 newly-passing were unblocked by the `simpleTier` fix; 3 more
  were rewritten against `Grid` instead of staying skipped).
- **Session 4 — Tests + hardening. Done.** Un-skipped all 40 old-shape
  tests across 5 files (`Canvas.test.js` 19, `autoLayerSync.test.js` 8,
  `Layer.test.js` 6, `projectFile.test.js` 4, `selection.test.js` 3). Most
  were already superseded by replacement tests Sessions 1-3 had written
  alongside their rewrites — those skips were deleted outright rather than
  duplicated. Six needed genuinely new coverage where behavior itself had
  changed, not just relocated: `addLayer` no longer eager-creates content;
  a layer-level `locked` check is distinct from a locked Grid; `convertTier`
  simple->advanced on a blank canvas now leaves a genuinely empty layer
  (no more auto solid-black fill, since style only exists once a Grid is
  created); a shape's gradient fill clones independently on `duplicateLayer`;
  `addFrame` at an explicit index; and `colorAt`/`topVisibleLayerAt` reading
  the active frame's own shapes. Two more edge cases (`growGridToInclude` in
  one direction only, and on an unfilled shape) backfilled `Grid.test.js`,
  which already covered most of `Layer.test.js`'s retired `growToInclude`
  skips. Test suite: 317 passing/40 skipped/0 failing -> 326 passing/0
  skipped/0 failing. Merged to `main`.

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

## Explore: making Pixelyph's capabilities more leverageable by AI agents

**Not scoped — a discussion topic, not a planned feature.** `src/model`
and `src/export` are already pure, DOM-free functions (canvas/glyph
mutation, SVG composition, font compilation), which raises the question of
whether it's worth exposing them through a scriptable interface — a small
CLI, or an MCP server — rather than only through the React UI, so an agent
could drive Pixelyph's capabilities via structured calls instead of GUI
automation.

**Main tradeoff to weigh whenever this gets picked up:** a first-class
scriptable interface is a second surface to design and keep stable
(versioning, docs, what counts as a breaking change) alongside the UI,
versus the much lighter option of just documenting the existing pure
functions as an importable library and leaving any driver code to whoever
wants it.

**To resolve:** discuss and scope properly before building anything.

## Explore: publishing a downloadable Windows installer

**Not scoped — a discussion topic, not a planned feature.** `electron-builder`
already produces a working NSIS installer locally (`npm run dist:win`, see
Phase 6), but nothing builds or hosts one anywhere a README link could point
to — there's no CI workflow that runs `electron-builder` and no GitHub
Release (or other host) it publishes to.

**What it would take:** a GitHub Actions workflow that runs on tag/push,
builds via `electron-builder`, and attaches the `.exe` to a GitHub Release,
then a README link to that release (mirroring the existing test-status
badge pattern) rather than a raw file link.

**Main tradeoff to weigh whenever this gets picked up:** ongoing CI
maintenance plus committing to a versioning/tagging cadence, versus the
project's current "early development" status where "clone and
`npm run dist:win` yourself" is a perfectly reasonable interim answer.

**To resolve:** revisit once the project is far enough along that shipping
installable builds to non-developers actually makes sense.

## Layer groups/folders — residual sliver after the Layer/Frame/Grid redesign

**Original premise resolved:** this item used to mean "a layer holding
more than one shape." The Layer/Frame/Grid redesign ships exactly that (a
Layer is a collection of Grids/shapes; Advanced tier has Add Shape/
reorder/duplicate/merge/delete per layer, see `docs/data-model.md` section
4), so what's left below is a narrower, distinct ask.

**Residual sliver, if still wanted:** nested, collapsible named *groups of
layers* (grouping whole layers together, not shapes within one layer) is a
distinct, smaller ask than what this item originally described. If picked
up, it still touches:

- Reorder semantics: single-step move-up/move-down (no drag-and-drop) for
  layers today — moving a layer in or out of a group, or past a group
  boundary, needs its own defined behavior on top of that.
- Collapse/expand state per group — a new piece of working-session state
  (like `activeLayerId`/`activeFrame`), not artwork content.
- `composeLayersSvg.js`'s `composeLayersBody` iterates `canvas.layers` as
  a flat, linear list — grouping would need either a flattening pass
  before composition or a recursive rewrite, without changing the
  exported SVG's actual visual stacking order.

**To resolve:** scope properly in its own planning session if/when this
residual sliver is picked up — likely much smaller now than before the
Grid redesign, but still its own session, not a slice of another phase.

## SVG pattern fills — built, then removed; more complex than it looked

**Not scoped.** Phase 9 briefly added a `pattern` fill kind (alongside
solid/gradient) — a raw-pasted-SVG-markup `<pattern>` def, tiled at a
user-set size — with its own Fill-editor UI, a "Gradients & Patterns"
palette group, and model/export support (`serializeFill`'s `pattern`
branch, `Layer.style.fill`'s pattern shape). After actually using it, the
"paste raw markup" approach turned out to be a poor fit: there's no
authoring or preview affordance for *building* a pattern (only editing one
you already have markup for elsewhere), no validation that pasted content
is even valid SVG, and no good way to keep a pattern's tile size sensible
relative to the layer/canvas grid it's applied to. The whole feature was
removed — not just hidden — rather than ship a half-satisfying stopgap:
`serializeFill`'s pattern branch, the Fill editor's pattern option and its
editing modal, and the palette's pattern group are all gone; the palette
group is back to plain "Gradients."

**To resolve:** if patterns come back, they need real authoring — likely
a small tile-drawing surface (reusing the pixel-grid editing primitives
already in `src/model`) rather than a paste-a-string textarea — scoped as
its own planning session, not a slice of a larger phase.

## Canvas and layer axis flipping

**Not scoped.** Flip the whole canvas, or a single layer, horizontally
and/or vertically.

## Whole-image and layer 90° rotations

**Not scoped.** Rotate the whole canvas, or a single layer, in 90°
increments.

## Demo projects

**Not scoped.** Ship a few sample `.pixelyph` projects (draw and glyph) so
new users have something to open and explore instead of a blank canvas.

## Electron automated GitHub build setup

**Not scoped.** CI (GitHub Actions) to build and publish Electron
installers automatically on tag/release — overlaps with, and would likely
subsume, the "publishing a downloadable Windows installer" item above.

## App hosting website with user manual

**Not scoped.** A hosted web build of the app, paired with a user manual /
docs site, so people can try or use Pixelyph without cloning and running it
locally.
