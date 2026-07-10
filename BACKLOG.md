# Backlog

Two kinds of deferred items live here: features that were built, then
deliberately hidden or disabled behind a known issue, rather than shipped
half-broken or removed outright (the underlying model/logic is left intact
in each case — only the UI surface, or for WOFF2 the automatic invocation,
is switched off — so restoring them is a small, targeted change once the
blocking issue is fixed); and open ideas flagged for later discussion
rather than acted on immediately. Review this list once all
currently-planned phases are complete.

## DONE: Narrow the tier distinction to one axis, and rename it (Pixel / Shape)

Shipped in session 19 (2026-07-09), 4 commits on `main`. Fed by two Tokenote
items: "what would it take to add layers to Simple mode?" and "should
Simple/Advanced be renamed to something more descriptive?"

**Why:** `canvas.tier` used to bundle two independent things — "how many
layers can exist" and "how much manual control you have over a shape's
style" — into one flag. Split them: every tier now gets real multi-layer
support; the only thing that stays tier-gated is *manual* shape/style
authoring (gradients, stroke, effects, multiple shapes per layer,
per-shape selection). Once that was the real axis, "Simple/Advanced" no
longer described it, so the display labels became **"Pixel"** (paint
colors, shapes auto-managed) and **"Shape"** (author shapes manually) — a
**display-only** rename: `canvas.tier` keeps its stored values
`'simple'`/`'advanced'` everywhere, no save-format bump, no migration.

**Four checkpoints, each committed independently:**

1. **Retarget `autoLayerSync` to the active layer** (`src/model/autoLayerSync.js`) —
   `getSimpleLayer` no longer hardcodes `canvas.layers[0]`; it resolves
   `canvas.activeLayerId` (falling back to the topmost layer, then
   lazy-creating one for a blank canvas). `paintSimpleCell` also gained
   lock/per-frame-visibility guards matching `paintCell`'s advanced branch.
2. **Per-layer `convertTier` collapse + a merge-dedup fix** (`src/model/Canvas.js`) —
   Shape→Pixel used to flatten the whole canvas via cross-layer `colorAt`
   into one layer; `collapseLayerToAutoGrids` now collapses each layer's own
   grids independently (mirroring `extractRectFromActiveLayer`'s
   `topGridAt` scan), preserving layer count/order/names/lock/opacity/
   visibility. `mergeLayerDown` also gained a `dedupeSolidColorGrids` pass
   (built on a new `unionGridInto` pixel-OR helper in `Grid.js`, factored
   out of `mergeGridDown`), gated to `canvas.tier === 'simple'`, so two
   Pixel-tier layers each auto-managing their own same-color Grid fold into
   one on merge instead of leaving two.
3. **Pixel-tier Layers panel** (`src/ui/SidePanel.jsx`, `src/ui/draw/LayersPanel.jsx`) —
   the Layers tab now shows in both tiers (Style stays Shape-tier only);
   `LayersPanel` renders tier-aware via a `showShapes` flag: no expand
   caret, no shape sub-rows, no "Add Shape" button in Pixel tier, toolbar
   locked to its layer-action branch. No store wiring changes needed — the
   underlying actions were already tier-agnostic.
4. **Rename tier labels to Pixel/Shape** (`src/ui/draw/ContextBar.jsx`) —
   `TIER_LABELS`/`TIER_TOOLTIPS` maps with honest per-tier tooltip copy,
   plus a reworded Shape→Pixel confirm dialog describing the new per-layer
   collapse instead of the old "collapses every layer" wording.

Test suite: 332/332 → 338/338 passing (new coverage: active-layer paint
targeting + lock/visibility guards, per-layer `convertTier` preserving
identity, and the merge-dedup fix). Manually verified live in the browser:
paint isolation across layers, Layers panel rendering in Pixel tier, and
merge-down dedup, all with no console errors.

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

## DONE: Tool roadmap Checkpoints 1-6, and Checkpoint 7 sub-step 1

**Replaces a vague Tokenote item** ("Full tool review, eg: Add additional
pencil, eraser, line, etc width options. Look for missing pixel art and
vector art tools that would be appropriate for Pixelyph.") — session 20
did a full 23-item survey of Pixel-mode gaps vs. standard pixel-art tools
and Shape-mode gaps vs. standard vector-art tools, sorted every item into
implement/backlog/dismiss, then scoped the 11 "implement" items into seven
checkpoints. **Full spec: [`docs/tool-roadmap.md`](./docs/tool-roadmap.md)**
(which in turn points to [`docs/tool-options.md`](./docs/tool-options.md)
for Checkpoint 1's deep technical detail); also has the full sort
accounting (backlog/long-term-backlog/dismissed items).

**Shipped:**
- **Checkpoint 1** (session 21) — pixel paint-tool cluster (brush width,
  dithering, pixel-perfect, bucket fill global+tolerance). Fully verified.
- **Checkpoint 2** (session 21) — nudge (arrow keys, floating
  selection/active shape/active layer, Shift for a 10px step). Fully
  verified.
- **Checkpoint 3** (session 21) — generate palette from image (Add/Replace
  prompt). Fully verified.
- **Checkpoint 4** (session 21) — configurable tile/sub-grid guide
  overlay. Fully verified.
- **Checkpoint 5** (session 21) — OS-clipboard image paste-in. Verified in
  both the web build and the Electron dev build (user-confirmed).
- **Checkpoint 6** (sessions 21-22) — whole-canvas/layer/shape flip + 90°
  rotation. Fully verified in session 22: canvas-level rotate math exact
  (hand-derived offset matched the rendered SVG `translate()` exactly),
  shape/layer flip+rotate correct in both tiers, "All frames" scoping
  confirmed both directions on a real multi-frame animation. One notable,
  non-bug edge case found: rotating a single layer (not the whole canvas)
  on a non-square canvas can push its content outside visible bounds —
  consistent with this doc's own "off-canvas content is preserved, not
  deleted" convention below, not something to fix.
- **Checkpoint 7 sub-step 1** (session 22) — interactive on-canvas linear-
  gradient angle handle: drag a handle directly on the artwork to rotate a
  Shape-tier grid's gradient angle, instead of only typing a number into
  the gradient editor modal. Gated behind a new "Show angle handle on
  canvas" checkbox in the Style tab's Fill section (per-shape, always
  starts off on a newly-selected shape) — the handle only shows when both
  that toggle is on and the Style tab is the visible side-panel tab. A
  real bug was caught and fixed during manual verification: the handle's
  drag gesture didn't stop propagation on `pointerup`/`pointermove`, so it
  bubbled into the canvas's own paint-tool tracking and fired a spurious
  extra undo commit — every drag was silently creating two undo steps
  instead of one. Radial gradients are still out of scope (sub-step 2,
  not started).

**To resolve:** Checkpoint 7 sub-step 2 (radial gradient cx/cy/r on-canvas
handle) is unscheduled — the tool-roadmap doc's own sequencing note called
this "the biggest, most architecturally novel item... best done last/
alone," and sub-step 1 already absorbed a full session. Pick up when
ready; re-read `docs/tool-roadmap.md`'s Checkpoint 7 section first, since
the linear sub-step's design (drag math, live/commit split) generalizes
directly to radial once picked back up.

## NEXT SESSION: finish the toolbar reorganization (Checkpoint E + a target-picker refinement)

Session 22 pivoted mid-stream from the tool-roadmap work above into a
toolbar reorganization the user asked for directly (not tracked in
`docs/tool-roadmap.md`): move Undo/Redo up next to the fullscreen toggle,
add a **Transform** menu (Resize/Flip/Rotate, replacing the old inline
`ContextBar` controls) with proper modals including a 3×3 anchor-grid
picker, and establish a left/right split in `ContextBar` (interface-
behavior controls vs. active-tool-specific settings). Broken into
checkpoints, tracked in the session's plan file
(`functional-dreaming-firefly.md`, not committed to the repo — session log
below has the durable record).

**Shipped and committed (session 22):**
- New rotation directions: `rotateCanvas180`/`rotateCanvasCCW90` (Draw) and
  `rotateActiveGlyph180`/`rotateActiveGlyphCCW90` (Glyph), both built by
  looping the existing tested 90°-clockwise primitives rather than new
  pixel math — one commit per call regardless of internal pass count.
- A **Transform** menu (between Palette and Window, both modes): **Resize…**
  opens a modal with a new reusable `AnchorGrid` 3×3 picker (drop-in
  replacement for the old plain anchor `<select>`); Flip/Rotate run
  instantly when there's nothing to choose (Glyph mode, or originally a
  single-frame Draw project — see below for how this gating changed),
  otherwise open a scope modal. All math verified exactly against
  hand-derived predictions via the rendered SVG's `translate()`.

**In progress, NOT committed — start here:**
Mid-session feedback: the Transform menu's Flip/Rotate should let you pick
a *target* (Canvas/Layer in Pixel tier; Canvas/Layer/Shape in Shape tier),
not just always operate on the whole canvas — confirmed this should
**always** show as a choice (even with one layer), and that Layer/Shape
should gain 180°/CCW rotation too (previously 90°-CW-only), so every
target offers the same 5 operations. Work done, uncommitted:
- `rotateActiveShape180`/`rotateActiveShapeCCW90` and
  `rotateActiveLayer180`/`rotateActiveLayerCCW90` added to `store.js`
  (same repeated-90°-primitive approach), with round-trip unit tests —
  **401/401 tests passing** as of the last run.
- `TransformScopeModal.jsx` rewritten to add a target radio-picker above
  the existing "apply to all frames" checkbox (which now hides when Shape
  is picked — shape-level flip/rotate has no frame-scope concept).
- `MenuBar.jsx` reworked so Draw-mode Flip/Rotate **always** opens the
  scope modal now (no more single-frame shortcut — target choice is always
  meaningful); builds per-target action maps, omitting Shape when Shape
  tier has no active grid to target.

**Not yet done:**
1. Re-run `npm test` — the last edit (`MenuBar.jsx`) was never re-verified
   after this rewrite; real risk of a stray bug from mid-edit.
2. Manual browser verification (none done yet for this sub-round): Pixel
   tier should offer Canvas/Layer only; Shape tier with an active shape
   should offer all three; Shape tier with *no* active shape should hide
   the Shape option; the frame-scope checkbox should disappear only when
   Shape is picked. Verify actual rotation results per target the same way
   Checkpoint 6 was verified (inspect the rendered SVG's `translate()`
   against hand-derived math) — none of the new Layer/Shape 180°/CCW store
   actions have been exercised in the live app yet, only unit-tested.
3. Commit once verified.
4. **Checkpoint E** (fully unstarted): move Undo/Redo from `ContextBar`
   into the header next to the fullscreen toggle; restructure `ContextBar`
   into the left (interface behavior: tier toggle, symmetry, grid, tile)
   / right (active-tool settings: shape-filled, select-scope, brush
   width/dither/pixel-perfect/fill options) split, with a new shared
   `.context-bar-divider` class; remove the now-redundant old inline
   resize/flip/rotate/all-frames controls the Transform menu replaced.

**Testing-methodology note, still applies:** a fresh
`import('/src/state/store.js')` via `preview_eval` can resolve to a store
instance disconnected from the one the actually-rendered React app uses —
prefer driving the UI through real DOM clicks/events and reading state
back via the accessibility snapshot/SVG inspection, not a separately
imported store reference.

## Explore: optional truncation of off-canvas content

**Not scoped — a discussion topic, not a planned feature.** Surfaced during
Checkpoint 2 (nudge)'s manual testing: nudging a shape/layer entirely off
the canvas doesn't delete anything — the content is preserved at its new
(possibly negative or overflowing) offset and comes right back if nudged
back into view. This matches `resizeCanvas`'s existing behavior (shrinking
the canvas never deletes content outside the new bounds either) and is the
same non-destructive convention Photoshop/Illustrator/Aseprite use for
off-canvas layer content — so today's behavior is working as designed, not
a bug.

**Open question:** should users be able to opt into truncation —
permanently deleting pixels that fall outside canvas bounds — as an
alternative to the current always-preserve behavior?

**Why this needs discussion, not just a toggle:**
- Non-destructive is the safer default (matches undo expectations, matches
  industry precedent) but keeps invisible bloat in the save file (a shape
  entirely off-canvas still serializes its pixel data).
- Destructive truncation needs a clear trigger point (an opt-in setting? a
  one-time "trim off-canvas content" action? automatic on save?) and
  interacts with undo (should truncating itself be undoable? should it
  warn first, like the lossy tier-collapse confirm already does?).
- Touches the same offset/bounds code paths as `resizeCanvas`,
  `nudgeLayerFrame`, and the flip/rotate checkpoint
  (`docs/tool-roadmap.md`'s Checkpoint 6) — worth scoping together with any
  future canvas-bounds-aware work rather than as a one-off.

**To resolve:** discuss desired trigger/scope before implementing anything.

## Explore: masks — clipping masks and color-adjustment layers

**Not scoped — a discussion topic, not a planned feature.** Surfaced
during session 20's tool-gap-analysis pass, deliberately filed here in
the general project backlog rather than in
[`docs/tool-roadmap.md`](./docs/tool-roadmap.md)'s tools-specific list,
since it's bigger and more cross-cutting than anything else that pass
scoped. Two related but distinct ideas:
- **Clipping masks** — a mask gating visibility, using another pixel
  buffer as the mask shape. No blocker in principle, but touches export
  (`composeLayersSvg.js` and friends), the data model (a new per-shape or
  per-layer mask reference), and the UI simultaneously.
- **Color-adjustment/blend-mode layers** — Photoshop-style adjustment
  layers that shift hue, multiply/blend color, etc. against whatever's
  beneath them, not just gate visibility. Implies a real
  compositing-model question (what "on top of" means beyond simple
  z-order + opacity) — `composeLayersSvg.js` doesn't currently do
  anything beyond stacking + opacity, so this is a new feature area, not
  an extension of an existing one.

**To resolve:** needs its own research/scoping pass before it's
backlog-ready in the normal sense — too vague and cross-cutting to write
as a scoped implementation item today.

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

## Canvas and layer axis flipping — scoped, see tool roadmap

**Now scoped**, along with 90° rotation and shape-level flip/rotate, as
Checkpoint 6 of [`docs/tool-roadmap.md`](./docs/tool-roadmap.md) — see the
"NEXT SESSION: Tool roadmap" entry above. Flip the whole canvas, a single
layer, or a single shape, horizontally and/or vertically.

## Whole-image and layer 90° rotations — scoped, see tool roadmap

**Now scoped** alongside axis flipping above, as Checkpoint 6 of
[`docs/tool-roadmap.md`](./docs/tool-roadmap.md). Rotate the whole canvas,
a single layer, or a single shape, in 90° increments — including the
resolved Glyph-mode behavior (re-crop/pad back to `pixelsPerEm`, behind a
warning confirmation).

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
