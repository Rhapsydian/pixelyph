# Backlog

Two kinds of deferred items live here: features that were built, then
deliberately hidden or disabled behind a known issue, rather than shipped
half-broken or removed outright (the underlying model/logic is left intact
in each case — only the UI surface, or for WOFF2 the automatic invocation,
is switched off — so restoring them is a small, targeted change once the
blocking issue is fixed); and open ideas flagged for later discussion
rather than acted on immediately. Review this list once all
currently-planned phases are complete.

## NEXT SESSION: Layer/Frame/Grid model redesign — scoped, ready for Session 0

**This is the next `/dev-session` for this project.** Kick off straight into
a plan-mode design pass (Session 0 below) rather than asking what to work on
— the scope below is already agreed with the user across a full discussion;
what's left is turning it into a concrete implementation plan.

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
instead. Talking that through led to a cleaner reframe: separate "layer"
(a collection/identity, no style of its own) from "grid" (the actual
styled shape, closer to a vector-editor object) — see below.

**Confirmed data model** (agreed with the user; do not re-litigate these
without a specific reason — they were each a deliberate call):

```
Canvas
 └─ Layer[]           persistent identity: name, locked, opacity, z-order — pure collection, no style, no offset
     └─ Frame[]        same count/order across every layer (unchanged from today)
         └─ Grid[]     independent per frame (no cross-frame identity) — each Grid:
                        { offsetX, offsetY, width, height, pixels, style }
```

- **Grids have no cross-frame identity** — each frame's `grids` array is
  independent content, like today's per-frame `pixels` copies.
  `duplicateFrame` just deep-copies the array; no id tracking needed.
- **Simple tier becomes exactly one `Layer`, always** — not one auto-layer
  per color like today. That single layer's each-frame `grids` list holds
  one Grid per color *currently used in that frame*, found by scanning that
  frame's (short) grid list for a matching `style` — no persistent
  `colorToLayerId`-style map needed. This is simpler than today's
  `autoLayerSync.js`, not more complex.
- **Active-grid paint model** (the one place Pixelyph does something
  genuinely its own): there's always an "active grid" being edited, like
  today's `activeLayerId` but pointing at a specific grid within a
  layer+frame. Simple tier's paint op: turn the cell off in whichever grid
  currently owns it (if a different color), turn it on in the target
  color's grid (creating one in this frame if none exists yet) — same
  mutual-exclusivity invariant `paintSimpleCell` enforces today, just
  re-scoped from "across sibling layers" to "across sibling grids in one
  frame." Advanced tier's active grid is just whatever the user has
  explicitly selected; painting only touches that one grid, no
  auto-clearing (matches today's Advanced-tier behavior).
- **Grid bounds are fully auto-computed, both grow and shrink** — reuses
  `Layer.js`'s existing `growToInclude` almost as-is (same "reallocate to
  the minimal rect containing the new cell," applied to a Grid instead of
  a Layer) for growing; shrinking (recomputing the minimal bounding box
  after an erase, and deleting a Grid entirely once it's empty) is new
  logic `growToInclude` doesn't have today, mirroring the
  prune-when-empty pattern `paintSimpleCell` already uses for whole layers.
  **This retires the "Advanced-tier layer offset — manual X/Y input
  hidden" item below** — that item was shelved because manually-typed
  fractional offsets disagreed with the grid-overlay/cursor-snap pipeline;
  if offset is never manually typed at all, always derived from actual
  painted content, that whole bug class can't occur. When this migration
  ships, that backlog entry can be deleted rather than resolved
  separately.
- **Z-order is plain array order**, consistent with today's Layer order —
  applies to a frame's `grids` list the same way it applies to
  `canvas.layers` today.
- **Scoping call for the migration itself:** Advanced tier can ship with
  each Layer still holding exactly one Grid per frame (matching today's
  behavior 1:1, just on the new data shape). Letting a user add a *second*
  independent shape to one layer is genuinely the **"Layer groups/folders
  — deferred again"** item further down this file, now made easy by this
  foundation — it does not have to be built in the same pass as the
  migration.

**Phase breakdown:**
- **Session 0 — Design.** Turn the confirmed model above into a concrete
  spec: exact `Grid`/`Frame`/`Layer` shapes, the active-grid pointer's
  exact shape (which layer + which grid within the current frame), the
  shrink-to-fit algorithm, and — since this is a UI-affecting change for
  Advanced tier (an "active grid" selector needs to exist somewhere) —
  wireframes for whatever that selection affordance looks like. Output is
  a written spec, not code.
- **Session 1 — Model layer.** `Grid` becomes first-class (building on
  the existing `Grid.js` primitive). `Layer.style` moves to `Grid.style`.
  `Canvas.js`'s paint/resize/frame functions, `autoLayerSync.js` (gets
  simpler — one layer, not many), and `selection.js` all get rewritten
  against the new shape. `projectFile.js` gets a real version-3 migration
  (loading old v1/v2 saves, which are Layer-per-color, into the new
  one-simple-tier-layer-with-per-frame-grids shape).
- **Session 2 — Export/compose.** `composeLayersSvg.js` and the three
  animated-export files (`animatedSvg.js`, `spriteSheet.js`,
  `animatedRaster.js`, `spriteArchive.js`) need to iterate
  `layers -> frames -> grids` and composite per-grid style instead of
  per-layer style.
- **Session 3 — UI.** `LayersPanel.jsx` needs to show/manage a layer's
  grid(s); Advanced tier gets whatever active-grid-selection affordance
  Session 0 designed.
- **Session 4 — Tests + hardening.** Rewrite the ~7 test files that
  reference the old `Layer.frames`/`Canvas.layers` shape directly
  (heaviest: `test/model/Canvas.test.js`), plus new coverage for the
  sparsity behavior itself — that's the actual point of doing this.

**Files known to be affected** (from a read-only Explore-agent survey done
during scoping; re-verify at Session 1, this list predates the final
Grid-based design): `src/model/Canvas.js`, `src/model/Layer.js`,
`src/model/autoLayerSync.js`, `src/model/selection.js`,
`src/io/projectFile.js`, `src/export/svg/composeLayersSvg.js`,
`src/export/svg/animatedSvg.js`, `src/export/raster/spriteSheet.js`,
`src/export/raster/animatedRaster.js`, `src/export/raster/spriteArchive.js`,
`src/state/store.js`, `src/model/history.js`, `src/ui/draw/LayersPanel.jsx`,
`src/ui/draw/FrameStrip.jsx`, `src/model/GlyphSet.js` (tangential — glyphs
are single-frame, low risk).

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

**Superseded by the "Layer/Frame/Grid model redesign" item above** — that
migration makes offset fully auto-computed (never manually typed), which
removes the fractional-offset disagreement this item was blocked on
entirely. Once that migration ships, delete this entry rather than
resolving it separately; keeping it below for now since the redesign
hasn't happened yet.

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

## Layer groups/folders — deferred again

**Feeds into the "Layer/Frame/Grid model redesign" item above** — once a
Layer is a collection of Grids rather than one styled entity, "a layer
holding more than one shape" is most of the way to this feature already.
Worth revisiting scope here once that migration ships, rather than
designing grouping against the current flat-layer model.

**Not scoped.** Raised during Phase 9's (Palette/Layers/Style review)
planning and deferred a second time rather than built. A flat layer list
(`LayersPanel.jsx`) is simple to reorder and reason about; nesting layers
under a collapsible named group touches several things at once:

- Reorder semantics: Phase 9 kept single-step move-up/move-down (no drag-
  and-drop) for both layers and the palette — moving a layer in or out of
  a group, or past a group boundary, needs its own defined behavior on top
  of that.
- Collapse/expand state per group — a new piece of working-session state
  (like `activeLayerId`/`activeFrame`), not artwork content.
- `composeLayersSvg.js`'s `composeLayersBody` currently iterates
  `canvas.layers` as a flat, linear list — grouping would need either a
  flattening pass before composition or a recursive rewrite, without
  changing the exported SVG's actual visual stacking order.

**To resolve:** scope properly in its own planning session if/when it's
picked up — likely bigger than a slice of whatever phase is running at
the time.

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
