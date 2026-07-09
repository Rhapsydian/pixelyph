# Data model: Layer / Frame / Grid

**Status:** shipped. Built directly on `main` across five sessions (Session 0:
this document. Session 1: model layer. Session 2: export. Session 3: UI.
Session 4: tests) — see `BACKLOG.md`'s "Layer/Frame/Grid model redesign"
entry (marked DONE) for the session-by-session breakdown. Everything below
describes the current model, not a target. See "Pixel/Shape tier rename"
at the end of this document for one later change that postdates the
original Session 0-4 write-up.

## Why this model exists

Pixelyph's pre-migration model conflates "layer" (a persistent, styled
entity) with "shape" (the actual pixel content). Simple tier has to create
a whole new `Layer` — with a dense `Frame` pre-allocated for every
animation frame — the first time any color is used anywhere, even if that
color only ever appears in 1 of 16 frames. This model splits "Layer"
(persistent identity, no style) from "Grid" (the styled shape itself,
closer to a vector-editor object), so a layer's content can be sparse
per-frame instead of always fully allocated.

## Terminology: "Shape" in the UI, "Grid" in code

The app already uses "grid" for something else — the pixel-snapping grid
overlay toggle (`GridOverlay.jsx`; "a toggleable grid overlay (off by
default)" is a listed feature in `README.md`). Introducing the same word
for "an independently-styled object within a layer" would collide with
that existing, unrelated meaning right in the same app.

- **Every UI-facing string says "Shape."** Button labels ("+ Add Shape"),
  row names (default "Shape 1", user-renamable), tooltips, empty-state
  copy ("No shape selected"), toolbar action names ("Merge Down" acting on
  a shape) — all of it. This is the only word end users ever see; the UI
  never says "Grid."
- **The model/type name stays `Grid`** — matching the existing `Grid.js`
  primitive (`resizeAt`, etc.) and the `growGridToInclude`/
  `shrinkGridToFit`/`mergeGridDown` function names below. This is purely
  an internal/code-level detail, the same way `offsetX`/`pixels` are field
  names with no separate UI label of their own.
- **Net effect:** a developer reading `src/model/Grid.js` and a user
  reading the Layers panel are looking at the same concept under two
  different names, on purpose, to avoid the naming collision above.

## 1. Shapes

```js
/** @typedef {{
 *   id: string, name: string, locked: boolean, opacity: number,
 *   frames: Frame[],   // length === canvas.frameCount; same count/order across every Layer (unchanged invariant)
 * }} Layer */
// No style, no offset, no width/height — pure identity + display bookkeeping.
// z-order = position in canvas.layers array (unchanged convention).

/** @typedef {{
 *   visible: boolean,  // this Layer's visibility in THIS frame (unchanged meaning from the pre-migration Frame.visible)
 *   grids: Grid[],     // ordered list of shapes belonging to this layer, in this frame
 * }} Frame */

/** @typedef {{
 *   id: string,            // locally-generated (e.g. `grid-${n}`); see "id caveat" below
 *   name: string,          // e.g. "Shape 1" default, user-renamable — same as Layer.name
 *   offsetX: number, offsetY: number, width: number, height: number,
 *   pixels: Uint8Array,    // row-major, same convention as Grid.js today
 *   style: { fill: string|object|null, stroke?: object, effects: object[] },
 *   visible: boolean,      // per-shape visibility, independent of Frame.visible
 *   locked: boolean,       // per-shape lock, independent of visible (a hidden shape can be locked or not, and vice versa)
 *   opacity: number,       // per-shape opacity, same 0-1 convention as Layer.opacity
 * }} Grid */
```

Grid gets the same control set as Layer — name, visible, locked, opacity —
because from the UI's perspective a Shape (Grid) *is* a layer, just scoped
to one frame (see section 4). `locked` gates painting exactly like
`Layer.locked` does in the pre-migration model (`paintCell`'s `if (!layer
|| layer.locked) return;` becomes the same check against the active grid).

**Why `Frame[]` nests under `Layer` (not transposed to the canvas level):**
it matches how `Canvas.js` already implements `addFrame`/`duplicateFrame`/
`removeFrame` (loop over `canvas.layers`, splice each layer's `frames`
array in lockstep) — no structural change to that iteration pattern, just
each frame slot now holds a `grids` list instead of one `pixels` buffer.
It also gives `Frame.visible` an obvious, unambiguous home (the existing
per-layer-per-frame eye toggle).

**`id` caveat:** `Grid.id` exists *only* to let the UI and the active-grid
pointer (section 2) reference "this specific shape" and to give React
stable keys. It carries **no cross-frame semantic identity** — a grid in
frame 3 and a grid in frame 5 that happen to share an `id` (which only
happens via direct `duplicateFrame` provenance, since that's a deep-copy
of the existing array) are not "the same shape" to any model logic (paint
mutual-exclusivity, export, undo). `id` equality is used by exactly one
thing: the active-grid resolution heuristic below, as a best-effort "did
my selection survive a frame duplicate" check.

**Multi-grid scoping:** `frame.grids.length` can be > 1 for *any* layer,
in either tier. A Layer is a true collection of shapes; Advanced tier gets
an explicit "+ Add Shape" affordance per layer (creates a new empty Grid
in the active layer+frame, since painting alone only grows whichever Grid
is currently `activeGridId` — starting a genuinely separate shape needs an
explicit action, same as Illustrator's "new layer"/deselect-then-draw-new-
path pattern) plus per-shape reorder/duplicate/merge-down/delete,
mirroring the existing `LayersToolbar` pattern one level down,
action-for-action (see section 3's "Grid merge-down" and section 4).
Simple tier's existing behavior — one Grid per color present in a frame,
found by style scan — is a special case of this same shape, not a
separate mechanism.

This substantially resolves the "Layer groups/folders — deferred again"
backlog item, whose entire premise was "a layer holding more than one
shape." A residual sliver — nested, collapsible named *groups of layers*
— is a distinct, smaller ask than "one layer, multiple shapes," and can
stay its own much-narrower future item if still wanted.

`canvas.simpleTier` (the pre-migration `{ colorToLayerId: Map }`) is
dropped entirely — nothing reads it once Simple tier scans grids by style
instead of a persistent map.

## 2. Active-grid pointer

New stored field: `canvas.activeGridId: string|null`, alongside the
existing `canvas.activeLayerId`. This is a real, explicitly-selectable
pointer — not silently derived — matching the Illustrator-style intent:
the Layers panel shows, per layer, the shapes present in the *active
frame*, and clicking one sets it active for painting and for the style
editor (style now lives on Grid, not Layer).

**Resolution algorithm**, run whenever `activeFrame` or `activeLayerId`
changes:

```js
function resolveActiveGrid(layer, frameIndex, prevGrid) {
  const grids = layer?.frames[frameIndex]?.grids ?? [];
  if (grids.length === 0) return null;
  if (prevGrid) {
    const sameId = grids.find((g) => g.id === prevGrid.id);
    if (sameId) return sameId.id;                          // survives duplicateFrame
    const styleMatch = grids.find((g) => stylesEqual(g.style, prevGrid.style));
    if (styleMatch) return styleMatch.id;                  // best-effort "same shape" across unrelated frames
  }
  return grids[0].id;                                       // fallback: first shape in the list
}

// on setActiveFrame(newIndex):
const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
const prevGrid = layer?.frames[canvas.activeFrame]?.grids.find((g) => g.id === canvas.activeGridId);
canvas.activeFrame = newIndex;
canvas.activeGridId = resolveActiveGrid(layer, newIndex, prevGrid);

// on setActiveLayerId(newLayerId): no prior-grid carryover across different layers —
// just default to the new layer's first grid in the current frame, or null.
canvas.activeGridId = resolveActiveGrid(newLayer, canvas.activeFrame, null);
```

**Why the style-matching fallback:** the dominant recurring interaction in
frame-by-frame animation is scrubbing/stepping through many frames while
continuing to adjust *one particular shape* (e.g. tweaking a mouth or eye
across a lip-sync run). `duplicateFrame` already covers the "frames were
built by duplicating" case for free via `id` match, but a lot of animation
is drawn frame-by-frame independently, not always via duplicate — in that
case, clearing selection to `null` on every single frame step would force
a re-click every frame during rapid scrubbing, which is far more
disruptive to flow than an occasional wrong-shape guess. Style is a
reasonable proxy for "the same conceptual shape" (a character's eye is
usually drawn in a consistent color across frames) — matching by it keeps
selection sticky in the common case, and the failure mode (two
same-styled shapes, arbitrary pick) is a one-click correction, not a
workflow break. First-grid-in-list is the final fallback only when
neither id nor style produces a match.

Advanced tier's paint op targets `activeGridId` exclusively (no
auto-clearing of siblings), and is a no-op if that grid's `locked` is
`true` (same gating as `Layer.locked` in `paintCell` today). If
`activeGridId` is `null` (nothing selected, or the layer has no shape in
this frame yet), painting creates a new Grid in that layer+frame — same
"first paint allocates" pattern `growToInclude` already uses today, just
also covering "first paint in this frame at all."

Simple tier keeps its own separate paint rule: scan the single layer's
current-frame grids for one matching the target color, clear the cell
from whichever grid currently owns it, set it in the target color's grid
(creating one if none exists), GC the grid if now empty. `activeGridId`
is not user-facing in Simple tier (panel is Advanced-only, per the
existing `tier !== 'advanced'` gate).

## 3. Grow / shrink

**Growing** — reuses `Layer.js`'s existing `growToInclude` almost
unchanged, just operating on one Grid's own pixel buffer instead of
mapping over a `frames` array (a Grid belongs to exactly one frame, so
this is strictly simpler than what it replaces):

```js
export function growGridToInclude(grid, x, y) {
  const minX = Math.min(grid.offsetX, x);
  const minY = Math.min(grid.offsetY, y);
  const maxX = Math.max(grid.offsetX + grid.width, x + 1);
  const maxY = Math.max(grid.offsetY + grid.height, y + 1);
  if (minX === grid.offsetX && minY === grid.offsetY && maxX === grid.offsetX + grid.width && maxY === grid.offsetY + grid.height) return;
  const newWidth = maxX - minX, newHeight = maxY - minY;
  const padX = grid.offsetX - minX, padY = grid.offsetY - minY;
  grid.pixels = resizeAt({ width: grid.width, height: grid.height, pixels: grid.pixels }, newWidth, newHeight, padX, padY).pixels;
  grid.offsetX = minX; grid.offsetY = minY;
  grid.width = newWidth; grid.height = newHeight;
}
```

**Shrinking** — new logic, runs after every erase that clears a cell
inside a Grid's bounds (same eager timing as today's empty-layer GC in
`paintSimpleCell`):

```js
function minimalBounds(grid) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (!grid.pixels[y * grid.width + x]) continue;
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
  }
  return maxX < minX ? null : { minX, minY, maxX, maxY };  // null => fully empty
}

export function shrinkGridToFit(grid) {
  const bounds = minimalBounds(grid);
  if (!bounds) return null;  // caller deletes this Grid from frame.grids
  const { minX, minY, maxX, maxY } = bounds;
  const newWidth = maxX - minX + 1, newHeight = maxY - minY + 1;
  grid.pixels = resizeAt(grid, newWidth, newHeight, -minX, -minY).pixels;
  grid.offsetX += minX; grid.offsetY += minY;
  grid.width = newWidth; grid.height = newHeight;
  return grid;
}
```

**No new primitive needed in `Grid.js`** — `resizeAt(grid, newWidth,
newHeight, offsetX, offsetY)` already supports negative offsets for
cropping (its own doc comment says so; today it's only exercised by
`resize`'s anchor-crop path, not yet by content-driven shrink, but the
implementation needs no change). `shrinkGridToFit` returning `null`
mirrors `Layer.js`'s existing `isEmpty` + `paintSimpleCell`'s
filter-out-empty pattern, re-scoped from "filter empty layers out of
`canvas.layers`" to "filter empty grids out of `frame.grids`."

### 3a. Layer merge-down — concatenation, not pixel-OR

Two distinct merge operations exist — merging *layers* (each a collection
of shapes) is a different operation from merging *grids/shapes* (each a
single styled object), and they behave differently on purpose.

The pre-migration `mergeLayerDown(canvas, layerId)`: `index =
canvas.layers.findIndex(...)`, `top = canvas.layers[index]`, `bottom =
canvas.layers[index - 1]` — "top" is the *higher* array index (more
front, per `composeLayersBody`'s array-order-is-back-to-front convention),
merged down into "bottom" at the lower index. That version has to compute
a combined bounding box and OR the two layers' pixel buffers together
into one new buffer, *only* because a Layer's pixels were one monochrome
mask with a single shared style — colors couldn't coexist without a real
merge step.

Under this model, a Layer is just a collection of Grids — each already
carrying its own offset/size/style independently — so **merging two
layers is just concatenation, per frame; no pixel math, no bounding-box
computation, needed at all:**

```js
export function mergeLayerDown(canvas, layerId) {
  const index = canvas.layers.findIndex((l) => l.id === layerId);
  if (index <= 0) return;
  const top = canvas.layers[index];
  const bottom = canvas.layers[index - 1];
  bottom.frames.forEach((bottomFrame, i) => {
    const topFrame = top.frames[i];
    const incoming = topFrame.visible
      ? topFrame.grids
      : topFrame.grids.map((g) => ({ ...g, visible: false })); // preserve "whole top layer was hidden here" per-shape
    bottomFrame.grids = [...bottomFrame.grids, ...incoming];   // bottom's shapes stay back, top's shapes stay in front
  });
  canvas.layers.splice(index, 1);
  canvas.activeLayerId = bottom.id;
}
```

Two real, deliberate behavior changes from the pre-migration model:
- **Order matters and is preserved:** `[...bottomFrame.grids,
  ...topFrame.grids]` keeps bottom's shapes toward the back and top's
  toward the front, matching the pre-merge visual stacking exactly.
- **Style is no longer destroyed by merging** (an improvement, not just a
  side effect): the pre-migration merge keeps only the bottom layer's
  single style, silently discarding the top layer's color/stroke/effects.
  Since every Grid keeps its own `style`, a merge now preserves each
  shape's original appearance — `README.md`'s Layers-panel bullet ("merging
  keeps the bottom layer's style") becomes inaccurate for *layer* merges
  once this ships (Session 3) and should be updated; it stays accurate for
  *shape* merges (3b, below).
- **Per-frame layer-hidden state is translated onto the individual
  incoming grids** (`topFrame.visible === false` → each of that frame's
  incoming grids gets `visible: false`) rather than silently dropped —
  this is exactly what `Grid.visible` is for.

### 3b. Grid merge-down — same behavior as the pre-migration Layer merge

Merging two grids/shapes together *does* keep today's bounding-box +
pixel-OR approach, and the result keeps the *lower* one's style — this is
the mirror-image case from 3a. A single Grid can only have one `style`;
fusing two shapes into one *must* collapse them onto one style, so this
operation can't be a costless concatenation the way layer-merge is. It's
the pre-migration `mergeLayerDown` algorithm, unchanged in substance, just
re-scoped from two Layers (each with a `frames` array) down to two Grids
(each already single-frame, so no `.map` over frames is needed):

```js
export function mergeGridDown(frame, gridId) {
  const index = frame.grids.findIndex((g) => g.id === gridId);
  if (index <= 0) return;
  const top = frame.grids[index];
  const bottom = frame.grids[index - 1];
  const minX = Math.min(top.offsetX, bottom.offsetX);
  const minY = Math.min(top.offsetY, bottom.offsetY);
  const maxX = Math.max(top.offsetX + top.width, bottom.offsetX + bottom.width);
  const maxY = Math.max(top.offsetY + top.height, bottom.offsetY + bottom.height);
  const width = maxX - minX, height = maxY - minY;
  const pixels = new Uint8Array(width * height);
  for (const grid of [bottom, top]) {
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (!grid.pixels[y * grid.width + x]) continue;
        pixels[(grid.offsetY + y - minY) * width + (grid.offsetX + x - minX)] = 1;
      }
    }
  }
  bottom.offsetX = minX; bottom.offsetY = minY;
  bottom.width = width; bottom.height = height;
  bottom.pixels = pixels;
  // bottom keeps its own id/name/style/visible/locked/opacity —
  // same "bottom wins" convention as the Layer merge (3a).
  frame.grids.splice(index, 1);
}
```

This is the shape toolbar's "Merge Down" action (section 4) — the fifth
action alongside Add Shape/Move Up/Move Down/Duplicate/Delete, giving
Shape rows the exact same action set as Layer rows.

## 4. UI

Illustrator-style: the Layers panel gets an expand affordance per layer
showing that layer's shapes *in the active frame*; clicking a shape row
sets `activeGridId` directly (and `activeLayerId` to its parent, if not
already active). Each Shape row has the **same control set as a Layer
row** — thumbnail, visibility, lock, name, opacity — since a Shape (Grid)
is a layer scoped to one frame. A per-layer shape toolbar mirrors the
existing `LayersToolbar` one level down, action-for-action: Add Shape,
Move Up/Down (z-order within that layer's current-frame grid list),
Duplicate, Merge Down (3b), Delete. The Fill/Stroke/Effects style editor
retargets from `activeLayerId`'s layer to `activeGridId`'s grid.

```
┌─ Layers ─────────────────────────────────────────────────────────┐
│ [+ Add Layer]                         [▲][▼][⧉][⊟][🗑]           │
├─────────────────────────────────────────────────────────────────┤
│ ▾ [thumb] [👁][🔒] Layer 2                  [Opacity: 100%]      │  <- layer row (expand caret)
│     [+ Add Shape]                 [▲][▼][⧉][⊟][🗑]                │  <- shape toolbar (this layer, active frame)
│     [thumb][👁][🔒] Shape A  (3,2 5×4)      [Opacity: 100%]      │  <- shape row: same controls as a layer row
│     [thumb][👁][🔒] Shape B  (9,1 2×2)      [Opacity: 100%] ◂    │  <- selected => activeGridId
│ ▸ [thumb] [👁][🔒] Layer 1                  [Opacity: 80%]       │  <- collapsed (shapes hidden)
└─────────────────────────────────────────────────────────────────┘

Style panel, shape selected:              Style panel, nothing selected:
┌─ Style ────────────────────┐            ┌─ Style ──────────────────────┐
│ Fill:   [■ #4477AA ▾]      │            │ No shape selected — click a  │
│ Stroke: [ ] width: [1]     │            │ layer's shape above, or      │
│ Effects: [+ Add effect]    │            │ paint a cell to create one.  │
└─────────────────────────────┘            └───────────────────────────────┘
```

Switching the active frame re-renders each layer's shape sub-rows straight
from that frame's actual `grids` list — no separate computation needed
there, since grid geometry is already kept eagerly minimal by grow/shrink
at edit time (section 3). The one thing that *does* need resolving on a
frame switch is which shape stays *selected* (`activeGridId`), which is
what section 2's resolution algorithm is for — that's a UI-selection
question, not a grid-data question.

`GridOverlay.jsx`/`SvgPixelEditor.jsx` swap their offset source from
`activeLayer.offset.x/y` to the active grid's `offsetX/offsetY`
(data-source change only, no visual change to the overlay/cursor-snap
itself) — this is exactly what retires the "Advanced-tier layer offset —
manual X/Y input hidden" backlog item, since offset is now always integer
and auto-computed by grow/shrink, never hand-typed.

## 5. Save format (`projectFile.js`) — version 3

`PIXELYPH_VERSION` becomes `3`. Precedent already exists for gating decode
logic on version (`decodePixels(base64, length, pixelyphVersion)` already
branches between v1/v2's bit-packing change) — a v3 branch extends the
same pattern in `deserializeProject`.

Pixel encoding stays as the pre-migration bit-pack-then-base64
(`bitsToBase64`) — considered and explicitly deferred, see the RLE note
below.

New save shape (per Layer, per Frame):
```json
{ "id", "name", "locked": false, "opacity": 1,
  "frames": [
    { "visible": true,
      "grids": [ { "id", "name": "Shape 1", "offsetX": 3, "offsetY": 2, "width": 5, "height": 4,
                    "pixels": "BASE64", "style": {...}, "visible": true, "locked": false, "opacity": 1 } ] }
  ]
}
```

**Migrating an old (v1/v2) Layer**, for each frame index `i`:
- `oldFrame.visible` copies straight across to `newFrame.visible` — same
  meaning, no ambiguity (this is the payoff of nesting `Frame` under
  `Layer`).
- If `oldFrame.pixels` is all-zero, `newFrame.grids = []`.
- Otherwise, compute `minimalBounds` on `oldFrame.pixels`, crop via
  `resizeAt(..., -bounds.minX, -bounds.minY)`, and build one Grid:
  `offsetX = oldLayer.offset.x + bounds.minX` (symmetric for Y),
  `width/height` from the bounds, `style` cloned from `oldLayer.style`,
  `name` defaulted (e.g. `"Shape 1"`), `visible: true`, `locked: false`,
  `opacity: 1` (no historical per-shape data to migrate any of these
  from).

**Simple-tier collapse:** for any save with `tier === 'simple'`, merge all
of its old per-color auto-layers into a single new Layer; for each frame,
that one Layer's `grids` list gets one Grid per color that had content in
that frame (so `frame.grids.length` can be > 1 immediately after a
migrated load — expected and correct for Simple tier, matching what a
freshly-drawn Simple-tier canvas looks like going forward). Advanced-tier
saves migrate 1:1, one Layer per old Layer (each landing with exactly one
Grid per frame it had content in — multi-grid Advanced-tier layers only
arise from new "+ Add Shape" use going forward, not from migrated data).

**RLE encoding — considered, deferred.** A backlog item asked to consider
run-length encoding for grid pixel compression; since the save format is
already bumping to v3, this was weighed for bundling in. Decision: keep
the current bit-pack+base64 encoding unchanged. Grids are now auto-cropped
to their minimal bounding box, which reduces RLE's main benefit
(compressing long uniform runs) — a typical small cropped shape doesn't
have much redundancy left to squeeze. Left open for a dedicated future
pass rather than bundling a second pixel-encoding change into an
already-large migration.

## Glyph mode: effectively one Grid per glyph

Glyph mode's own document (`GlyphSet.js`) doesn't use `Layer`/`Frame`/
`Grid` directly — a `Glyph` is already just `{ width, height, pixels:
Uint8Array, advanceWidth, leftSideBearing, name, unicode }`, a plain
boolean grid with no color/layers/style of its own, and this migration
doesn't change that shape. Editing reuses Draw mode's machinery
indirectly: `glyphToCanvas(glyph)` wraps one glyph as a throwaway
single-color (`palette: ['#000000']`), single-frame, Simple-tier `Canvas`,
so the same `paintCell`/`SvgPixelEditor` code edits it unchanged. Since
that canvas only ever has one possible color, its one Layer's one Frame
can only ever hold **0 or 1 Grid — never more**. So functionally: one Grid
per glyph, or none if the glyph is empty.

`glyphToCanvas` itself needs no change — it just calls `paintCell` once
per "on" pixel, which transparently becomes Grid-based under the hood once
Session 1 rewrites `paintCell`.

`canvasToGlyphPixels`, which reads the edited result back out, **does**
need a real rewrite:

```js
// pre-migration — works only because auto-layers are always full-canvas,
// so layer.frames[0].pixels is already a dense width*height buffer:
export function canvasToGlyphPixels(canvas) {
  const layer = canvas.layers[0];
  return layer ? layer.frames[0].pixels.slice() : new Uint8Array(canvas.width * canvas.height);
}
```

Post-migration, a Grid is auto-cropped to its minimal bounding box
(`offsetX`/`offsetY`/`width`/`height` don't generally match the glyph's
full dimensions), so this needs to pull the one Grid out of the single
layer's single frame and **expand its cropped buffer back into a full
`canvas.width × canvas.height` boolean array at `(offsetX, offsetY)`** —
the inverse of `growGridToInclude`:

```js
export function canvasToGlyphPixels(canvas) {
  const layer = canvas.layers[0];
  const grid = layer?.frames[0]?.grids[0];
  const pixels = new Uint8Array(canvas.width * canvas.height);
  if (!grid) return pixels;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.pixels[y * grid.width + x]) {
        pixels[(grid.offsetY + y) * canvas.width + (grid.offsetX + x)] = 1;
      }
    }
  }
  return pixels;
}
```

`GlyphSet.js`'s own top-of-file comment ("at most one plain black
auto-layer") also needs a one-line wording update to describe "at most one
Grid in that one layer's frame" instead. This is Session 1 scope (it's
part of the `Canvas`/`paintCell` rewrite's blast radius), not a separate
session — flagged here so it isn't missed, since `GlyphSet.js` doesn't
otherwise show up in the Draw-mode file list above.

## 6. What Session 0 does not cover (forward references)

- Export modules (`composeLayersSvg.js`, `animatedSvg.js`, `spriteSheet.js`,
  `animatedRaster.js`, `spriteArchive.js`) all currently read
  `layer.style`/`layer.opacity` as singular and frame-invariant — every
  one needs rewriting to iterate `layers -> frame.grids -> each grid` and
  composite per-grid style/visibility. **Session 2.**
- `Canvas.js`'s `paintCell`, `topVisibleLayerAt`, `colorAt`,
  `mergeLayerDown` (3a), the new `mergeGridDown` (3b), `autoLayerSync.js`'s
  `paintSimpleCell`/`getOrCreateAutoLayer`, `selection.js`, and
  `GlyphSet.js`'s `canvasToGlyphPixels` (see "Glyph mode" above) all need
  rewriting/adding against this shape. **Session 1.**
- The ~7 test files referencing the pre-migration `Layer.frames`/
  `Canvas.layers` shape directly. **Session 4.**

## Pixel/Shape tier rename (post-Session-4 change)

A later session narrowed `canvas.tier` to one real axis and renamed its
display labels — this section documents what changed against the model
above, since it postdates the original Session 0-4 write-up.

**What stayed the same:** `canvas.tier`'s two stored values are still the
literal strings `'simple'`/`'advanced'` everywhere in code and in saved
projects — this was a **display-only** rename, no save-format migration.
The UI shows **Pixel** (was "Simple") and **Shape** (was "Advanced")
instead.

**What actually changed — the axis itself:** before this, `canvas.tier`
bundled two independent things into one flag: how many layers can exist,
and how much manual control a Grid's style gets. Both tiers now get full
multi-layer support (any number, reorderable, lockable, per-frame
visibility) — the *only* thing still tier-gated is manual shape/style
authoring (gradients, stroke, effects, multiple shapes per layer,
per-shape selection). Once that's the real axis, "Simple/Advanced" no
longer described it; "Pixel" (paint colors, shapes auto-managed) and
"Shape" (author shapes manually) do.

**`autoLayerSync.js`'s `getSimpleLayer`** (the function backing Pixel-tier
auto-managed painting) no longer hardcodes `canvas.layers[0]` — it
resolves `canvas.activeLayerId`, falling back to the topmost layer, then
lazy-creating one for a blank canvas. This is what makes Pixel tier's
multi-layer support real: painting always targets whichever layer is
active, not always the first one.

**`Canvas.js`'s `convertTier`** (Shape → Pixel) used to flatten the whole
canvas into one layer via a cross-layer `colorAt` scan. It now runs a new
per-layer helper, `collapseLayerToAutoGrids`, independently on each layer
— scanning only that layer's own current-frame shapes (`topGridAt`-wins
within the layer, mirroring `selection.js`'s
`extractRectFromActiveLayer`) and rebuilding it into one Grid per solid
color. Layer count, order, names, lock, and opacity all survive; only
each layer's *shapes* are rebuilt, same lossy-per-layer trade-off the
pre-rename version had per-canvas.

**`Canvas.js`'s `mergeLayerDown`** gained a dedup pass, `dedupeSolidColorGrids`,
gated on `canvas.tier === 'simple'`. Since two Pixel-tier layers can each
independently auto-manage a same-color Grid, a plain concatenation (3a's
original behavior) would leave two same-color Grids in the merged frame
instead of one — breaking Pixel tier's one-Grid-per-color invariant.
`dedupeSolidColorGrids` folds later same-color duplicates into the first
Grid of that color via a new pixel-OR helper, `unionGridInto` (`Grid.js`,
factored out of `mergeGridDown`/3b). Shape tier is exempt — it legitimately
keeps same-color shapes separate.

## Critical files

- `src/model/Layer.js` — `growToInclude`/`isEmpty` are the direct basis
  for `growGridToInclude`/`shrinkGridToFit` above; `Layer` typedef shrinks
  to identity-only fields.
- `src/model/Grid.js` — `resizeAt` reused unmodified for both grow and
  shrink; new `Grid` typedef and the grow/shrink/merge orchestration
  functions land here (or an adjacent module).
- `src/model/Canvas.js` — `paintCell`, `addFrame`/`duplicateFrame`/
  `removeFrame`, `mergeLayerDown` currently assume `layer.frames[i].pixels`/
  `layer.style`/`layer.offset`; rewritten against `layer.frames[i].grids`.
  New `mergeGridDown` (3b) lands here too.
- `src/model/autoLayerSync.js` — collapses to "one Layer, scan/create
  Grids by style within the active frame," retiring `colorToLayerId`.
- `src/io/projectFile.js` — houses the v3 migration; the version-branch
  pattern already established by `decodePixels` is the direct template.
- `src/ui/draw/LayersPanel.jsx`, `src/ui/draw/LayerStylePanel.jsx`,
  `src/ui/draw/GridOverlay.jsx`, `src/ui/draw/SvgPixelEditor.jsx` — the
  new shape sub-rows and per-layer shape toolbar (section 4), style panel
  retargeting to `activeGridId`, and the offset-source swap in
  overlay/cursor-snap.
- `src/model/GlyphSet.js` — `canvasToGlyphPixels` needs a real rewrite (see
  "Glyph mode" above); `glyphToCanvas` is unaffected. **Session 1**, not
  tangential — it depends directly on `Canvas.js`'s new shape.
