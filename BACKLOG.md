# Backlog

## Open

Two kinds of deferred items live here: features that were built, then
deliberately hidden or disabled behind a known issue, rather than shipped
half-broken or removed outright (the underlying model/logic is left intact
in each case — only the UI surface, or for WOFF2 the automatic invocation,
is switched off — so restoring them is a small, targeted change once the
blocking issue is fixed); and open ideas flagged for later discussion
rather than acted on immediately. Review this list once all
currently-planned phases are complete.

### Tool-gap backlog, carried over from the retired tool-roadmap doc

`docs/tool-roadmap.md`'s own 7 checkpoints all shipped (see this file's
Shipped section) and the doc was retired session 28 — its "Full sort
results" section (session 20's 23-item Pixel/Shape-mode gap-analysis
pass) is consolidated here rather than left behind in a deleted file.
Object select-and-drag, that section's other top-of-backlog item, also
shipped session 28 (see Shipped); the items below did not.

**Top-of-backlog** (has real dependencies between items, unlike the
plain list below):
- **Multi-select interaction** (shift/ctrl-click in `LayersPanel.jsx`) —
  the shared prerequisite unblocking both items below; bumped up
  specifically because of that, not because it's independently urgent.
- **Boolean shape operations** (union/subtract/intersect) — blocked on
  multi-select above, or could instead follow the Merge-Down convention
  ("act on the active shape + whatever's below it in stack") to avoid
  that dependency entirely — worth deciding which approach when this is
  picked up.
- **Alignment/distribution tools** — also blocked on multi-select above.

**Backlog** (no urgency, no blockers):
- Freehand/lasso select — `marqueeSelect.js` is rect-only today; needs a
  point-in-polygon test (no existing helper) and a
  `selection.kind: 'rect' | 'polygon'` discriminant so
  `copySelection`/`cutSelection` can dispatch to the right extractor. The
  floating-selection buffer itself needs no change (already a sparse
  `{x, y, width, height, cells}` shape regardless of source shape).
- Magic wand (select by color, Pixel tier only).
- Auto-trim canvas to content.
- Color replace / recolor-only paint mode.
- Custom/preset brush shapes.
- Style eyedropper (copy a shape's full fill+stroke+effects).
- Rounded-rectangle corner radius / polygon-star shape tool.
- Post-creation resize/transform handles on an existing shape.

**Long-term backlog:**
- Alpha/opacity-blend painting tool — deep architectural mismatch (every
  pixel is a strict boolean 0/1 today, save format bit-packs one bit per
  pixel); blast radius comparable to the whole Layer/Frame/Grid redesign,
  not a single-tool addition.

**Dismissed** (checked and explicitly rejected during session 20's pass,
not overlooked — full rationale is in git history, on
`docs/tool-roadmap.md` as of the commit before its removal): a bezier pen
tool / arbitrary path authoring (shapes are pixel grids authored by
painting, not vector paths with control-point handles — doesn't fit the
architecture); arbitrary rotate/skew/scale of a shape (would need pixel
resampling, breaking the "every pixel is a deliberate, exact choice"
premise — 90°-only rotation sidesteps this by staying resample-free).

**To resolve:** each item needs its own scoping pass when picked up —
this is an accounting of what didn't make the original 7 checkpoints,
not a ready-to-implement spec.

### WOFF2 font export — disabled, times out in real browsers

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

### Explore: optional truncation of off-canvas content

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

### Explore: masks — clipping masks and color-adjustment layers

**Not scoped — a discussion topic, not a planned feature.** Surfaced
during session 20's tool-gap-analysis pass, deliberately filed here in
the general project backlog rather than in the tool-specific roadmap doc
that pass produced (`docs/tool-roadmap.md`, retired session 28 once its
content shipped/migrated — see this file's own "Tool-gap backlog" entry
above), since it's bigger and more cross-cutting than anything else that
pass scoped. Two related but distinct ideas:
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

### Explore: making Pixelyph's capabilities more leverageable by AI agents

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

### Explore: publishing a downloadable Windows installer

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

### Layer groups/folders — residual sliver after the Layer/Frame/Grid redesign

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

### SVG pattern fills — built, then removed; more complex than it looked

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

### Demo projects

**Not scoped.** Ship a few sample `.pixelyph` projects (draw and glyph) so
new users have something to open and explore instead of a blank canvas.

### Electron automated GitHub build setup

**Not scoped.** CI (GitHub Actions) to build and publish Electron
installers automatically on tag/release — overlaps with, and would likely
subsume, the "publishing a downloadable Windows installer" item above.

### App hosting website with user manual

**Not scoped.** A hosted web build of the app, paired with a user manual /
docs site, so people can try or use Pixelyph without cloning and running it
locally.

## Shipped

### DONE: Object select-and-drag tool + Transform menu Selection scope

Shipped session 28 (2026-07-11), 2 commits on `main`. Two items from
`docs/tool-roadmap.md`'s "Full sort results" backlog, picked up directly
by user request (not flagged in Tokenote) — the doc itself is retired as
of this session (see the "Tool-gap backlog" Open entry and the "DONE:
Tool roadmap Checkpoints 1-6..." entry below for where its remaining
content landed).

1. **Object select-and-drag tool** (`5c99d99`) — new `selectMove` tool
   (`src/ui/draw/tools/selectMove.js`): click a shape in Shape tier to
   select and drag it (new `setGridPropsLive`); drag anywhere in Pixel
   tier/Glyph mode to shift the whole active layer's frame content (new
   `nudgeLayerFrameLive`). Both reuse the existing `paintCellLive`/
   `commitStroke` live-then-commit split so a full drag is exactly one
   undo step. New `topLayerAndGridAt` hit-test helper in `Canvas.js`
   (mirrors `topVisibleLayerAt`'s traversal, also returning the shape
   actually hit, skipping locked shapes). New `SelectMoveIcon` (a 4-arrow
   move cross, the Photoshop/Aseprite convention for this tool).
2. **Transform menu Flip/Rotate now acts on the active selection**
   (`e4ceb65`) — a marquee selection (raw or already-floating) takes
   priority over the Canvas/Layer/Shape scope modal in both Draw and
   Glyph mode: the selection's cells transform in place, for the current
   frame only, with no scope picker. New `transformSelectionCells`
   (`selection.js`) remaps the sparse floating-selection cell list,
   matching `Grid.js`'s `flipPixelsH/V`/`rotatePixels90` direction; new
   `flipSelectionH/V`/`rotateSelection90/180/CCW90` store actions
   auto-lift a raw selection first (destructive, same as an ordinary
   drag-move lift). Caught and fixed a real pre-existing bug during
   manual testing: `commit()`'s glyph-mode branch only ever bumped
   `glyphSet`'s reference, never `glyphCanvas`'s, so any call to
   `dropFloatingSelection` that bypassed `SvgPixelEditor`'s `ctx`-wrapped
   local re-render `tick()` — the Enter-key handler, Edit menu's "Commit
   move", and now this new Selection scope — left the composed-SVG
   `useMemo` stale after a drop, rendering nothing (or the pre-drop
   content) instead of the just-pasted result. `commit()` now refreshes
   `glyphCanvas` too, mirroring how the Draw-mode branch already
   refreshes `canvas`.

Test suite: 424/424 → 433/433 (new coverage: `topLayerAndGridAt`;
`setGridPropsLive`/`nudgeLayerFrameLive`'s no-commit-until-drop behavior
plus the single commit on drag-end; `transformSelectionCells` for all
three transform kinds; the selection-scope store actions covering both
"raw selection only" and "already-floating" starting states). Manually
verified live in the browser: shape drag + undo (Shape tier), whole-layer
drag + undo (Pixel tier and Glyph mode), and selection flip via the
Transform menu with no modal and a correct one-step undo, in both Draw
and Glyph mode — the `glyphCanvas` staleness bug above was caught this
way, by inspecting the live SVG DOM directly rather than trusting a
disconnected `import()`'d store instance (the "Testing-methodology note"
lower in this file, from session 23, still applies and bit again here).

### DONE: Palette naming, frame reorder, Layers panel cleanup

Shipped session 27 (2026-07-11), 6 commits on `main`. Three independent,
small items pulled from `.claude/tokenote-notes.md`'s ⚡ Priority section.

1. **Name-prompt dialog for palette saves** (`5c7f090`) — a new
   promise-based `nameDialog`/`requestName`/`resolveName` pair in
   `store.js` (mirrors the existing `confirmDialog` pattern) and a new
   `NamePromptModal.jsx`, wired into the three palette-save call sites:
   gradient "Save to palette" (solids stay unprompted), "Save style", and
   `PalettePanel`'s "Add a new gradient" draft flow (Cancel leaves the
   draft open). Caught and fixed a real bug during manual testing: the
   modal stayed mounted between separate dialogs, so the name field
   carried over the previous entry's text instead of resetting.
2. **Animation frame reorder controls** (`3045c8e`, `8b33eb7`, `b824067`)
   — a new `reorderFrame` in `Canvas.js` swaps a frame across every
   layer's `frames` plus `frameDurations` in lockstep; `FrameStrip.jsx`
   restructured into a shared toolbar (Move left/right, Duplicate,
   Delete) mirroring `LayersPanel`'s toolbar convention, and the strip
   switched to horizontal-only scroll instead of wrapping. Two follow-up
   fixes from live use: bumped `MIN_HEIGHT` to match the panel's actual
   rendered height, and fixed the frame-thumbnail border corners looking
   clipped (the `.cell` wrapper needed `overflow: hidden` so its rounded
   border wasn't overpainted by the flush square thumbnail).
3. **Removed the Layers panel's flip/rotate buttons** (`5e80f4b`,
   `10f9a03`) — first the layer-level branch (redundant with the
   Transform menu's Layer scope), then by follow-up request the
   shape-level branch too (redundant with the Transform menu's Shape
   scope) — flip/rotate is now only reachable through the Transform menu.

Test suite: 422/422 → 424/424 (new coverage: `reorderFrame` at both the
model and store level, including its undo-tracking and the two
`activeFrame` remap branches). Manually verified every checkpoint live in
the browser via the Browser pane.

### DONE: Checkpoint 7 sub-step 2 (gradient handles)

Shipped session 26 (2026-07-11), 8 commits on `main`
(`b75e426..e12fc2e`). Full write-up folded into this entry — the original
planning doc, `docs/gradient-handle-plan.md`, was removed after shipping.

**Five checkpoints, each committed independently:**
1. **Fixed the linear angle handle's spoke length** (`b75e426`) — pivots at
   the shape's bbox center with a fixed length, instead of scaling with
   bbox size.
2. **Linear endpoints mode: data + modal** (`568d365`) — `mode`/
   `x1/y1/x2/y2` schema, `serializeFill`'s endpoints branch, the editor
   modal's Angle/Endpoints select, Reset button.
3. **Shared drag-handle infra + linear endpoints on-canvas handle**
   (`569a4a1`) — `useGradientDragHandle` hook extracted from the angle
   handle's pointer-lifecycle pattern, `GradientPointHandle` (generic
   draggable point), wired into `SvgPixelEditor.jsx`; checkbox relabeled
   "Gradient fine controls".
4. **Radial center + radius on-canvas handle** (`11fe8a3`) — center/radius
   drag handles, checkbox gate extended to radial gradients.
5. **Radial focal point** (`e94e7ce`) — `fx/fy` schema (defaults to
   `cx/cy`), a clamped diamond handle, modal fx/fy inputs.

**Plus three refinements from live testing:**
- **Off-canvas handle visibility** (`c1a9562`) — the artwork/overlays now
  render in a nested, still-clipped `<svg>`, while the outer `<svg>` (where
  handles render) is `overflow: visible`, so a dragged handle stays visible
  and grabbable past the canvas edge instead of vanishing at the viewBox
  boundary.
- **Focal-point clamp margin** (`66c8661`) — clamped to 97% of the radius
  instead of exactly `r`; SVG renders a visible seam when a radial
  gradient's focal point sits exactly on the boundary.
- **Focal point follows center/radius changes** (`e12fc2e`) — an
  explicitly-set focal point now translates when the center moves and
  rescales proportionally when the radius changes (both the on-canvas
  handles and the modal's numeric cx/cy/r inputs), instead of staying at a
  fixed absolute position that could drift outside the radius.

Test suite: 404/404 → 422/422. Manually verified throughout via the
Browser pane, including exact numeric confirmation of the clamp/rescale
math (distance-to-radius ratios matching before/after to within floating
point).

### DONE: Fix animated SVG export gap/misordering for mixed-duration frames

Shipped session 25 (2026-07-10), commit `ee16e90`. User-reported bug: an
animation with all frames at 300ms except one at 600ms showed a gap right
before the 600ms frame, with the following frame appearing too early.

**Root cause:** `buildAnimationCss` (`src/export/svg/animatedSvg.js`)
computed each frame's CSS `animation-delay` from the cumulative duration of
every frame *before* it. A negative `animation-delay` means "act as if the
animation already ran this long" — so the delay actually needs to reflect
how far the frame's slot sits from the *end* of the cycle, not the start.
The old formula only produced correct output by coincidence in the trivial
2-equal-duration-frame case (confirmed via a 100,000-sample timeline
simulation comparing generated CSS output against the expected schedule);
any animation with 3+ frames had frames landing in shuffled real-time
slots, which only became a *visible* gap once a duration actually differed
from its neighbors.

**Fix:** delay changed from `-(cumulativeMs / 1000)` to
`-((totalMs - cumulativeMs) / 1000)`. Tests: 403/403 → 404/404 (updated two
existing assertions that had hard-coded the old, buggy delay values, and
added a regression test for the exact reported scenario that scrubs the
generated CSS's actual on/off timeline rather than just checking numbers).
Manually verified two ways: scrubbing the Web Animations API's
`currentTime` across a full cycle in the browser (exact match to the
expected per-frame windows, no gaps/overlaps), and a live check against
the user's actual project in standalone Chrome (the Claude Code Browser
pane surfaced an unrelated double-save-dialog quirk during testing, absent
in standalone Chrome — a preview-tool artifact, not an app bug).

### DONE: Narrow the tier distinction to one axis, and rename it (Pixel / Shape)

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

### DONE: Layer/Frame/Grid model redesign

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

### DONE: Tool roadmap Checkpoints 1-6, and Checkpoint 7 sub-step 1

**Replaces a vague Tokenote item** ("Full tool review, eg: Add additional
pencil, eraser, line, etc width options. Look for missing pixel art and
vector art tools that would be appropriate for Pixelyph.") — session 20
did a full 23-item survey of Pixel-mode gaps vs. standard pixel-art tools
and Shape-mode gaps vs. standard vector-art tools, sorted every item into
implement/backlog/dismiss, then scoped the 11 "implement" items into seven
checkpoints. **Full spec lived in `docs/tool-roadmap.md`** — removed
session 28 once every checkpoint below had shipped; its full sort
accounting (backlog/long-term-backlog/dismissed items) is now this
file's own "Tool-gap backlog, carried over from the retired tool-roadmap
doc" Open entry, above.

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

**Checkpoint 7 sub-step 2** (radial gradient cx/cy/r + focal-point
on-canvas handles) shipped session 26 — see the "DONE: Checkpoint 7
sub-step 2 (gradient handles)" entry above.

### DONE: Toolbar reorganization (Transform menu target-picker + Checkpoint E)

Shipped across sessions 22-23. Pivoted mid-stream from the tool-roadmap work
above into a toolbar reorganization the user asked for directly (not
tracked in `docs/tool-roadmap.md`): a **Transform** menu (Resize/Flip/
Rotate, replacing the old inline `ContextBar` controls) with proper modals
including a 3×3 anchor-grid picker and a Canvas/Layer/Shape target picker,
Undo/Redo moved up next to the fullscreen toggle, and a left/right split in
`ContextBar` (interface-behavior controls vs. active-tool-specific
settings). Checkpoints were tracked in session plan files
(`functional-dreaming-firefly.md`, `gentle-humming-journal.md` — not
committed to the repo; session logs below have the durable record).

**Session 22:**
- New rotation directions: `rotateCanvas180`/`rotateCanvasCCW90` (Draw) and
  `rotateActiveGlyph180`/`rotateActiveGlyphCCW90` (Glyph), both built by
  looping the existing tested 90°-clockwise primitives rather than new
  pixel math — one commit per call regardless of internal pass count.
- A **Transform** menu (between Palette and Window, both modes): **Resize…**
  opens a modal with a new reusable `AnchorGrid` 3×3 picker (drop-in
  replacement for the old plain anchor `<select>`); Flip/Rotate run
  instantly when there's nothing to choose (Glyph mode), otherwise open a
  scope modal. All math verified exactly against hand-derived predictions
  via the rendered SVG's `translate()`.

**Session 23:**
- Finished the target-picker refinement left uncommitted at session 22's
  pause: `rotateActiveShape180`/`rotateActiveShapeCCW90` and
  `rotateActiveLayer180`/`rotateActiveLayerCCW90` (`store.js`), a
  `TransformScopeModal.jsx` target radio-picker (Canvas/Layer in Pixel
  tier; Canvas/Layer/Shape in Shape tier — the "all frames" checkbox hides
  when Shape is picked), and `MenuBar.jsx` always opening the scope modal
  in Draw mode. Re-ran `npm test` (401/401, confirming the paused
  `MenuBar.jsx` edit hadn't broken anything) and manually verified every
  tier/target combination plus the actual rotation math for a Layer-CCW90°
  and a Shape-180° case via the rendered SVG's `translate()` — exact match,
  no bugs found. Committed as `d6b8189`.
- **Checkpoint E**: moved Undo/Redo into the header next to the fullscreen
  toggle (`App.jsx`); removed the now-redundant inline resize/flip/rotate/
  all-frames/undo-redo controls from `ContextBar.jsx` (superseded by the
  Transform menu); split the remaining controls into a left (tier toggle,
  symmetry, grid, tile) / right (shape-filled, select-scope, brush
  width/dither/pixel-perfect/fill options) group with a new
  `.context-bar-divider` class. Committed as `60e6265`. A follow-up request
  left-aligned the right-hand group (dropped its `marginLeft: auto`) rather
  than pushing it to the far edge — committed as `7c9d41f`.

**Testing-methodology note, still applies:** a fresh
`import('/src/state/store.js')` via `preview_eval` can resolve to a store
instance disconnected from the one the actually-rendered React app uses —
prefer driving the UI through real DOM clicks/events and reading state
back via the accessibility snapshot/SVG inspection, not a separately
imported store reference. Session 23 hit a related timing gotcha in the
Browser-pane `javascript_tool`: reading the DOM synchronously right after a
`.click()` on a store-wired button can observe a stale pre-render state
(React batches the re-render after the handler returns) — wrap
click-then-read checks in an `await new Promise(r => setTimeout(r, 100))`
(or equivalent) between the click and the read, not just between separate
tool calls.

### DONE: Fix Pixel→Shape tier switch not activating the color-matching shape

Shipped session 23, commit `2b8db34`. User-reported bug: Pixel tier's paint
routine (`autoLayerSync.js`'s `paintSimpleCell`) never touches
`canvas.activeGridId` — it finds/creates a same-color Grid purely by
scanning `style.fill`. So `activeGridId` stayed stale (typically `null`)
across a Pixel→Shape tier switch, and Shape tier's `paintCell` looks up the
grid to paint into strictly by `id === canvas.activeGridId` — a failed
lookup unconditionally allocates a brand-new Grid, creating an unwanted
duplicate of whatever same-color shape already existed from Pixel-tier
painting.

**Fix:** `convertTier` (`Canvas.js`) now takes the palette's current
`activeColor` and, when switching to Shape tier, resolves `activeGridId` to
the active layer's active-frame Grid whose `style.fill` matches it (falling
back to the prior default — first shape, or none — when no match exists on
that layer). `setTier` (`store.js`) passes `get().activeColor` through.
Tests: 401/401 → 403/403 (two new cases: color-match activation, and the
no-match fallback). Manually verified live: painted red then green in Pixel
tier, switched to Shape tier with green still selected, painted again, and
confirmed the stroke extended the existing green shape (same Grid) instead
of creating a third path; also confirmed switching with a never-painted
color selected falls back cleanly with no error.
