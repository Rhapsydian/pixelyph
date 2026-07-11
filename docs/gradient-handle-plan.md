# Gradient handle plan: linear endpoints + radial center/radius/focal

**Status:** planning complete, nothing implemented yet. Written session 24
(2026-07-10), as the detailed spec for
[`docs/tool-roadmap.md`](./tool-roadmap.md)'s Checkpoint 7 sub-step 2 —
satellite to that doc the same way [`docs/tool-options.md`](./tool-options.md)
is satellite to Checkpoint 1. **This doc is the NEXT SESSION starting
point — begin at Checkpoint 1 below.**

## Background

Checkpoint 7 sub-step 1 (session 22) shipped a draggable on-canvas
rotation handle for linear gradients (`GradientAngleHandle.jsx`), gated
behind a per-shape "Show angle handle on canvas" checkbox in the Style
tab's Fill section. That handle only exposes `angle` — SVG's
`linearGradient` actually takes a full `x1,y1,x2,y2` endpoint pair (4
DOF); the shipped handle fixes the center at the shape's bbox midpoint
and the length at a constant 0.5, discarding 3 of those. Revisiting the
actual spec surface while scoping sub-step 2 (originally planned as just
"add radial cx/cy/r") expanded the scope:

- **Linear** gets a second **mode** — free-draggable start/end points —
  alongside the existing angle mode.
- **Radial** gets `cx/cy/r` (center + radius drag) **and** an optional
  focal point `fx/fy` (SVG's radial gradients support a focal point
  distinct from center — the "off-center highlight" look — defaulting to
  `cx,cy` when unset, so it's additive with no migration).
- **Linear angle handle fix**: the shipped handle's spoke length currently
  scales with the shape's bounding box (it's pinned to the bbox edge), so
  a tiny shape gets a tiny, hard-to-grab handle and a large shape gets a
  huge one. Fixing this to a constant on-canvas length, still pivoting
  around the bbox center.
- A **Reset** button in the gradient editor modal, restoring only
  position/geometry fields to sane defaults (not stops/colors) — added
  because the fuller control surface (mode + endpoints + focal point) is
  easy to drag into a confusing state.

**Control placement, confirmed:** the enable/disable toggle stays in the
Style tab's Fill box (`LayerStylePanel.jsx`'s `FillEditor`), where it
already lives for the linear angle handle — contextual to the shape/fill
actually being edited there, rather than a toolbar button the user would
have to look away from the Style tab to find.

## Wireframes

**Gradient editor modal — Linear, Angle mode (unchanged, shipped today):**
```
┌ Edit Gradient ──────────────────────────────────┐
│ [swatch]  Type: [Linear ▾]  Mode: [Angle ▾]      │
│           Angle: [  0] °                          │
│  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬  (stop bar)         │
│  ○ #ffffff  offset 0                              │
│  ○ #000000  offset 1                              │
│                                    [Cancel] [OK]  │
└────────────────────────────────────────────────┘
```

**Same modal — Linear, Endpoints mode (new):**
```
┌ Edit Gradient ──────────────────────────────────┐
│ [swatch]  Type: [Linear ▾]  Mode: [Endpoints ▾]  │
│   x1:[0.00] y1:[0.50]    x2:[1.00] y2:[0.50]     │
│  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬  (stop bar)         │
│  ...                               [Cancel] [OK]  │
└────────────────────────────────────────────────┘
```

**Radial, with focal point and Reset (new):**
```
┌ Edit Gradient ──────────────────────────────────┐
│ [swatch]  Type: [Radial ▾]            [Reset]     │
│   cx:[0.50] cy:[0.50] r:[0.50]                    │
│   fx:[0.50] fy:[0.50]   (focal point)             │
│  ...                               [Cancel] [OK]  │
└────────────────────────────────────────────────┘
```
(Reset sits next to the type/mode controls in both linear and radial —
same row, restores position/geometry fields only; stops are untouched.)

**Style tab → Fill box (existing checkbox, reused + relabeled — no new
control added, both gradient types now gate on it):**
```
┌ Fill ─────────────────────────────────┐
│ [Gradient ▾]   [gradient swatch]  [💾] │
│ ☐ Gradient fine controls               │
└─────────────────────────────────────────┘
```

**On-canvas — Linear, Angle mode, fixed spoke length (fix to shipped
behavior): same short spoke on a tiny shape and a large one, always
pivoting at the bbox center:**
```
   tiny shape            large shape
     ●╌╌●                  ●╌╌╌╌●
   (short,               (same short
    fixed length)          fixed length)
```

**On-canvas — Linear, Endpoints mode:**
```
        ●───────────────────●
      (x1,y1)             (x2,y2)
   two independent draggable circles, connected
   by a straight guide line = the gradient's axis
```

**On-canvas — Radial, with focal point:**
```
              ◇  ← focal handle (fx,fy), a diamond so
                   it's grabbable even when it starts
                   coincident with the center handle
              ●───────●
           (cx,cy)  (cx+r, cy)
            center    radius handle
   spoke line from center to radius handle; focal
   handle is clamped to stay within the r circle
```

## Data model changes (all additive, no migration)

`Grid.style.fill` for `linear-gradient` gains:
- `mode: 'angle' | 'endpoints'` — absent/`'angle'` behaves exactly as
  today (fully backward-compatible with every existing save/test/palette
  entry, which has no `mode` field).
- `x1, y1, x2, y2` — 0–1 objectBoundingBox fractions, read only when
  `mode === 'endpoints'`. Both representations stay on the object once
  endpoints mode has been entered, so toggling modes in the editor doesn't
  lose data — recomputed only at the moment of an explicit switch, not
  kept continuously in sync during a drag (same one-way-resync-on-switch
  approach `setType` already uses for linear↔radial).

`Grid.style.fill` for `radial-gradient` gains:
- `fx, fy` — 0–1 fractions, defaulting to `cx,cy` when absent (matches
  SVG's own default-focal-equals-center behavior, so old saves render
  identically with no explicit fx/fy needed).

## Files to change (full picture — see per-checkpoint breakdown below for
what lands in which checkpoint)

**`src/export/svg/layerStyle.js`**
- `serializeFill`'s linear branch (~line 21): branch on `fill.mode ===
  'endpoints'` → passthrough `x1/y1/x2/y2` verbatim; else keep the
  existing angle→vector math unchanged.
- `serializeFill`'s radial branch (~line 30): add `fx="${fill.fx ?? fill.cx}"
  fy="${fill.fy ?? fill.cy}"` attributes.
- Add `endpointsFromAngle(angle)` (forward, extracted from the existing
  0.5±dx/dy formula) and `angleFromEndpoints(x1,y1,x2,y2)` (inverse, via
  `angleFromVector(x2-x1, y2-y1)` — direction only, a lossy UI-convenience
  seed, not a round-trip).

**`src/ui/GradientEditorModal.jsx`**
- Linear: add a mode select (Angle / Endpoints). Angle mode keeps the
  existing input; Endpoints mode shows `x1/y1/x2/y2` number inputs (step
  0.05), mirroring the existing `cx/cy/r` block. `setMode(mode)` merges in
  `endpointsFromAngle`/`angleFromEndpoints`'s result plus the new `mode`.
- Radial: add `fx/fy` number inputs (step 0.05) below `cx/cy/r`, displayed
  via `gradient.fx ?? gradient.cx` / `gradient.fy ?? gradient.cy` fallback
  so they show sensible defaults before ever being touched.
- Add a **Reset** button (next to the type/mode controls) that restores
  only position/geometry fields to sane defaults — `{ mode: 'angle', angle:
  0 }` for linear (dropping `x1/y1/x2/y2`), `{ cx: 0.5, cy: 0.5, r: 0.5 }`
  for radial (dropping `fx/fy` so they fall back to center again) — while
  leaving `stops` untouched. Reuses the same default values `setType`
  already seeds a fresh gradient with, just applied on demand instead of
  only on type switch.

**`src/ui/draw/gradientHandleGeometry.js`** — extend (update header
comment to describe it as shared handle geometry for all gradient
controls):
- `fractionToCanvasPoint(bounds, fx, fy)` / `canvasPointToFraction(bounds, px, py)` —
  generic, unclamped. Covers radial's `cx,cy`, both linear endpoints, and
  (pre-clamp) the focal point — one implementation instead of three
  near-duplicates.
- `radialEdgeCanvasPosition(bounds, cx, cy, r)` / `radialRadiusFromDrag(bounds, px, cx)` —
  radius-specific, with a `MIN_RADIAL_R = 0.02` floor.
- `clampPointToRadius(cx, cy, r, fx, fy)` — if the focal point's distance
  from center exceeds `r`, scales it back to the boundary (Euclidean, in
  the same fraction space `cx/cy/r` already live in).
- **Fix `gradientHandlePosition(bounds, angle)`** — currently places the
  handle on the bbox edge (`bounds.minX + fx*(maxX-minX)`, etc.), so its
  distance from center scales with shape size. Change it to pivot at
  `gradientBoundsCenter(bounds)` and project outward by a fixed
  `ANGLE_HANDLE_LENGTH` constant (canvas cells, not bbox-relative) instead
  of a bbox-scaled fraction — same `center + length*(cos,sin)` shape,
  just no `bounds`-size dependency in the magnitude.
- **Fix `angleFromHandleDrag(bounds, px, py)`** to match — instead of
  normalizing `(px,py)` into a bbox fraction first, compute the angle
  directly from the vector between the drag point and
  `gradientBoundsCenter(bounds)` (`angleFromVector(px - center.x, py -
  center.y)`), removing the bbox-size dependency from the inverse too.
  `bounds` is still needed (for the center), just no longer for scaling.
  This only changes the drag handle's on-screen geometry — `serializeFill`
  itself is untouched, so the actual rendered gradient's angle math and
  fixed 0.5 magnitude don't change at all.

**`src/ui/draw/useGradientDragHandle.js`** (new) — the pointer-lifecycle
pattern `GradientAngleHandle.jsx` already implements (per-handle
`setPointerCapture`, drag/cancelled refs, Escape-to-revert,
pointercancel-as-Escape, and **`e.stopPropagation()` on every pointer
event type, not just pointerdown** — replicating the `ef09c5a` fix, since
`SvgPixelEditor`'s `handlePointerUp` has no in-progress-drag guard and
will misfire a spurious extra undo commit on any unstopped bubbled
`pointerup`), factored out so the new draggable circles/diamonds below
don't each re-implement it. `GradientAngleHandle.jsx`'s own pointer
lifecycle is left as-is (not migrated onto the new hook — no reason to
touch working, tested drag-event code just to deduplicate); only its
geometry inputs change, via the `gradientHandleGeometry.js` fixes above.

**`src/ui/draw/GradientPointHandle.jsx`** (new) — one generic draggable
point (`{fx, fy}`), built on the hook above, with an optional `shape`
prop (`'circle'` default, `'diamond'` for the focal handle) and an
optional `clamp(fx, fy)` prop (used only by the focal instance). Reused
for: radial's center handle, radial's focal handle, and each of the two
linear-endpoint handles — four use sites, one component.

**`src/ui/draw/GradientRadiusHandle.jsx`** (new) — one draggable
radius-edge circle relative to a fixed center, built on the same hook.

**`src/ui/draw/GradientRadialHandle.jsx`** (new) — composes:
`GradientPointHandle` (center, circle) + `GradientRadiusHandle` (radius) +
`GradientPointHandle` (focal, diamond, clamped to the current `cx,cy,r`)
+ connecting spoke line. Props: `grid`, `getCanvasPoint`,
`onDragCenter`/`onCommitCenter({cx,cy})`, `onDragRadius`/`onCommitRadius(r)`,
`onDragFocal`/`onCommitFocal({fx,fy})`.

**`src/ui/draw/GradientLinearEndpointsHandle.jsx`** (new) — composes two
`GradientPointHandle`s (`x1,y1` and `x2,y2`) + a connecting line. Props:
`grid`, `getCanvasPoint`, `onDragStart`/`onCommitStart({x1,y1})`,
`onDragEnd`/`onCommitEnd({x2,y2})`.

**`src/ui/draw/SvgPixelEditor.jsx`**
- Generalize `showGradientHandle` (~line 473) to also match
  `'radial-gradient'` (currently linear-only).
- Branch which component renders on `activeGrid.style.fill.type` +
  `.mode`: `GradientAngleHandle` (linear, mode !== 'endpoints' —
  unchanged wiring), `GradientLinearEndpointsHandle` (linear, mode ===
  'endpoints'), `GradientRadialHandle` (radial). Wire each's live/commit
  callbacks to `updateGridStyleLive`/`updateGridStyle` exactly as the
  existing linear wiring does (~lines 576–587), merging dragged fields
  into `activeGrid.style.fill`, calling `tick()` after live updates.

**`src/ui/draw/LayerStylePanel.jsx`** — reuse the existing checkbox as-is
(no new control): generalize its gate (~line 96) from
`fill?.type === 'linear-gradient'` to include `'radial-gradient'`, and
rename its label from "Show angle handle on canvas" to **"Gradient fine
controls"** (title updated to describe draggable on-canvas
position/angle/radius controls generically, not angle-specific). No store
changes needed: `gradientHandleEnabledGridId`/`setGradientHandleEnabled`
are already fill-type-agnostic.

**No `store.js` changes** — `updateGridStyle`/`updateGridStyleLive`
(~lines 604–627) are generic patches on `grid.style`, reused as-is for
every handle type including the new focal one.

**No changes needed** in `FillSwatch.jsx`/`PalettePanel.jsx` — both call
`serializeFill` directly for previews, so endpoints-mode and
focal-point fills render correctly there automatically.

## Checkpoint breakdown

**Checkpoint 1 — Fix the linear angle handle's spoke length.** Isolated,
no schema change: `gradientHandlePosition`/`angleFromHandleDrag` in
`gradientHandleGeometry.js` switch from bbox-scaled to a fixed
`ANGLE_HANDLE_LENGTH`. Good first checkpoint — quick, low-risk, no
dependencies on anything else here.

**Checkpoint 2 — Linear endpoints mode: data + modal only (no on-canvas
handle yet).** Schema (`mode`, `x1/y1/x2/y2`), `serializeFill`'s endpoints
branch, `endpointsFromAngle`/`angleFromEndpoints`, the modal's mode select
+ numeric endpoint inputs + mode-switch resync, and the linear half of the
Reset button. Fully testable via the modal's numeric inputs and exported
SVG output alone, with no on-canvas dragging involved yet.

**Checkpoint 3 — Shared drag-handle infra + linear endpoints on-canvas
handle.** `useGradientDragHandle` (generic pointer-lifecycle hook,
extracted from `GradientAngleHandle.jsx`'s pattern), `GradientPointHandle`
(generic draggable point), `GradientLinearEndpointsHandle`, wired into
`SvgPixelEditor.jsx`; checkbox relabeled to "Gradient fine controls" (still
linear-only gate at this point). Depends on Checkpoint 2's schema.

**Checkpoint 4 — Radial center + radius on-canvas handle (no focal yet).**
`GradientRadiusHandle`, `GradientRadialHandle` (center + radius only),
wired in; checkbox gate extended to `'radial-gradient'`. Depends on
Checkpoint 3's `GradientPointHandle`/hook (reused for the center point).

**Checkpoint 5 — Radial focal point.** Schema (`fx/fy`), `serializeFill`'s
fx/fy passthrough-with-default, modal fx/fy inputs, `clampPointToRadius`,
`GradientPointHandle`'s diamond-shape variant, wiring the third handle
into `GradientRadialHandle`, and the radial half of the Reset button.
Depends on Checkpoint 4.

Each checkpoint: implement → `npm test` → manual browser verification (the
relevant slice of the checklist below) → commit independently, same
pattern as the original tool-roadmap checkpoints — pause for confirmation
between checkpoints rather than grinding through all five in one sitting.

## Tests

- `test/export/svg/layerStyle.test.js` — `serializeFill` with `mode:
  'endpoints'` passes `x1/y1/x2/y2` through verbatim; radial `fx/fy`
  passthrough and default-to-`cx/cy`-when-absent; `endpointsFromAngle`/
  `angleFromEndpoints` round-trip at a few angles (0°, 90°, 45°) and the
  inverse's direction-only behavior on an asymmetric endpoint pair.
- `test/ui/draw/gradientHandleGeometry.test.js` — `fractionToCanvasPoint`/
  `canvasPointToFraction` round-trip; `radialEdgeCanvasPosition`/
  `radialRadiusFromDrag` including the `MIN_RADIAL_R` floor; `clampPointToRadius`
  for a point inside, on, and outside the `r` boundary.

## Verification (per checkpoint)

1. `npm test` — report before/after pass counts.
2. Manual, in-browser (Shape/Advanced tier only, Style tab):
   - **Linear, angle mode**: drag, Escape, commit, single undo entry all
     still work (regression check on the drag mechanics themselves, which
     are unchanged). **New**: confirm the spoke is now a fixed, comfortable
     length on both a small shape (e.g. 4×4) and a large one (e.g. 32×32)
     instead of scaling with shape size — adjust `ANGLE_HANDLE_LENGTH` if
     it looks too short/long on either.
   - **Linear, endpoints mode**: switch mode in the editor, toggle the
     canvas checkbox, drag each endpoint independently — live update,
     Escape reverts, one undo entry per commit, no spurious double-undo.
   - **Switch angle ↔ endpoints** a few times — seeded values are visually
     sensible each direction.
   - **Radial center + radius**: drag both — live update, Escape revert,
     commit, `r` never reaches zero/negative even dragged past center.
   - **Radial focal point**: drag the diamond handle away from center,
     confirm the gradient's highlight visibly shifts off-center; drag it
     past the `r` boundary and confirm it clamps to the edge instead of
     escaping the circle; confirm it starts coincident with center (no
     fx/fy set) and is still independently grabbable there.
   - **Checkbox placement**: confirm it's in the Fill box for both
     gradient types, resets off on new shape selection (unchanged).
   - **Palette preview**: save an endpoints-mode linear and a
     focal-point radial to the palette, confirm both swatches render
     correctly.
   - **Reset button**: drag a linear gradient into endpoints mode and off
     to odd values, click Reset — confirm it snaps back to `angle: 0`, mode
     back to Angle, and stops are unchanged. Same check for radial after
     dragging center/radius/focal around.
