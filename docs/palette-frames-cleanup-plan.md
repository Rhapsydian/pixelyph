# Palette naming, frame reorder, and Layers panel cleanup

**Status:** planning complete, nothing implemented yet. Written session 26
(2026-07-11), scoping three items from `.claude/tokenote-notes.md`'s ⚡
Priority section. **This doc is the NEXT SESSION starting point — begin at
Checkpoint 1 below.**

## Background

Three independent, small Tokenote-flagged items, explored and scoped in one
pass:

1. When saving a gradient or style to the palette, prompt for a name.
2. Add animation frame reorder controls.
3. Remove the rotate/flip **layer** buttons from the Layers panel — they're
   redundant with the Transform menu (added sessions 22-23).

Each is its own checkpoint — implement → `npm test` → manual browser
verification → commit independently, pausing for confirmation between them,
same pattern as the gradient-handle-plan session.

## Checkpoint 1 — Prompt for a name when saving a gradient/style to the palette

**Reuse the existing promise-based dialog pattern**, not a new one-off:
`src/state/store.js:845-854` already has `confirmDialog`/`requestConfirm`/
`resolveConfirm` (a `window.confirm` replacement — `set({confirmDialog:
{message, resolve}})`, a `ConfirmModal.jsx` renders it), and
`paletteImportModeDialog`/`requestPaletteImportMode` is the same pattern for
a 3-way choice. Add a third: `nameDialog`/`requestName`/`resolveName`.

- **`src/state/store.js`**, next to `confirmDialog` (~line 845): add
  `nameDialog: null`, `requestName: (label, defaultValue = '') => new
  Promise((resolve) => set({ nameDialog: { label, defaultValue, resolve }
  }))`, `resolveName: (result) => { get().nameDialog?.resolve(result);
  set({ nameDialog: null }); }`. Resolves the trimmed name string, or `null`
  on Cancel/Escape (mirrors `resolveConfirm(false)`).
- **New `src/ui/NamePromptModal.jsx`**, mirroring `src/ui/ConfirmModal.jsx`
  exactly (same `Modal`/`ModalActions` shell, renders `null` when
  `nameDialog` is falsy): a controlled `<input type="text">` seeded from
  `nameDialog.defaultValue`, label from `nameDialog.label`, Enter-to-confirm
  (`onKeyDown` — Escape-to-cancel is already handled by `Modal` itself),
  `ModalActions` with `onCancel={() => resolveName(null)}`,
  `onConfirm={() => resolveName(name.trim())}`. Empty name is allowed
  (matches `ManageSwatchesModal.jsx`'s existing `"(unnamed)"` convention for
  a nameless entry).
- **`src/App.jsx`**: mount `<NamePromptModal />` next to the existing
  `<ConfirmModal />` (~line 255).
- **`store.js`'s `addPaletteStyle`** (line 747) needs a signature change:
  it currently does `addPaletteStyleModel(get().canvas.palette,
  cloneLayerStyle(styleValue))`, and **`cloneLayerStyle`**
  (`src/model/Canvas.js:43-49`) reconstructs a new object with only
  `{fill, stroke, effects}` — any `name` spread onto the input gets silently
  dropped. Change to `addPaletteStyle: (styleValue, name) => {
  addPaletteStyleModel(get().canvas.palette, name != null ? {
  ...cloneLayerStyle(styleValue), name } : cloneLayerStyle(styleValue));
  commit(); }` — `name` optional, existing call sites (incl.
  `test/state/store.test.js:187`) keep working unchanged. `addPaletteFill`
  (line 743) needs no change — it forwards `fillValue` as-is, and
  `Palette.js`'s `addFill` (line 64) already does `{ ...fillValue, id }`, so
  `addPaletteFill({ ...fill, name })` just works.
- **Three call sites, each becomes `async`:**
  - `src/ui/draw/LayerStylePanel.jsx`'s `FillEditor.saveToPalette()`
    (line 65-68): only prompt for `kind === 'gradient'` — solid colors have
    no name concept at all (`Palette.js`'s `addColor` stores bare hex
    strings, confirmed by `renameEntry` no-op'ing for `group === 'colors'`),
    so leave `addPaletteColor(fill)` unprompted.
    `if (kind === 'gradient') { const name = await requestName('Name this
    gradient'); if (name == null) return; addPaletteFill({ ...fill, name });
    }`.
  - `LayerStylePanel.jsx`'s "Save style" button (line 260,
    `onClick={() => addPaletteStyle(grid.style)}`): `onClick={async () => {
    const name = await requestName('Name this style'); if (name == null)
    return; addPaletteStyle(grid.style, name); }}`.
  - `src/ui/draw/PalettePanel.jsx`'s `FillsGroup.confirmAddGradient()`
    (line 127-130): prompt before adding; on cancel, leave `draftGradient`
    open (don't discard the user's in-progress edit) — `async function
    confirmAddGradient() { const name = await requestName('Name this
    gradient'); if (name == null) return; addPaletteFill({ ...draftGradient,
    name }); setDraftGradient(null); }`.

## Checkpoint 2 — Animation frame reorder controls

**Mirror `reorderLayer`'s established single-step-swap convention**
(`Canvas.js:247-254`, used by `reorderGrid`/`reorderPaletteEntry` too), but
frames need a wider swap: unlike a layer (identified by a stable `id`), a
frame is purely positional — **every** layer's `frames` array is
index-keyed in lockstep with `canvas.frameCount`, and `canvas.activeFrame`/
`canvas.frameDurations` are plain index-keyed too. So the swap must touch
all three.

- **`src/model/Canvas.js`**, near `addFrame`/`duplicateFrame`/`removeFrame`
  (~line 800): add
  ```js
  export function reorderFrame(canvas, index, direction) {
    const j = index + direction;
    if (j < 0 || j >= canvas.frameCount) return;
    for (const layer of canvas.layers) {
      [layer.frames[index], layer.frames[j]] = [layer.frames[j], layer.frames[index]];
    }
    [canvas.frameDurations[index], canvas.frameDurations[j]] = [canvas.frameDurations[j], canvas.frameDurations[index]];
    if (canvas.activeFrame === index) canvas.activeFrame = j;
    else if (canvas.activeFrame === j) canvas.activeFrame = index;
  }
  ```
  (`direction` is `1|-1`, same convention as `reorderLayer`; no-ops past
  either end. The `activeFrame` remap keeps whichever frame was actually
  selected "following" it through the swap, regardless of which of the two
  swapped positions triggered the move — matches how a moved/selected item
  usually stays selected.)
- **`src/state/store.js`**: import `reorderFrame as reorderFrameModel`
  alongside the other `Canvas.js` imports (~line 32), add a wrapper next to
  `duplicateFrame`/`removeFrame`: `reorderFrame: (index, direction) => {
  reorderFrameModel(get().canvas, index, direction); commit(); }`
  (undo-tracked, same as every other reorder action).
- **`src/ui/icons.jsx`**: add `MoveLeftIcon`/`MoveRightIcon` (~line 242,
  next to `MoveUpIcon`/`MoveDownIcon`) — same line-icon convention as the
  rest of the file (a 90°-rotated version of the up/down chevron-arrow
  paths; icons in this file intentionally take only `size` and own their
  path data, not a runtime CSS transform — see the file's header comment).
- **`src/ui/draw/FrameStrip.jsx`**: restructure to a shared toolbar acting
  on `canvas.activeFrame`, mirroring `LayersPanel.jsx`'s `LayersToolbar`
  convention (one toolbar acting on `canvas.activeLayerId`/`activeGridId`,
  not per-row buttons) — consistent with how the Layers/Shapes panel
  already works, and it de-duplicates the toolbar from every card down to
  one.
  - Move the toolbar into the top controls row (line 115-139), right after
    the existing "Add frame" `IconButton` (line 124): four new/moved
    `IconButton`s — **Move left** (`<MoveLeftIcon />`,
    `disabled={canvas.activeFrame === 0}`,
    `onClick={() => reorderFrame(canvas.activeFrame, -1)}`), **Move right**
    (`<MoveRightIcon />`, `disabled={canvas.activeFrame === canvas.frameCount
    - 1}`, `onClick={() => reorderFrame(canvas.activeFrame, 1)}`),
    **Duplicate frame** (moved from `FrameCard`, now
    `onClick={() => duplicateFrame(canvas.activeFrame)}`, no `frameIndex`
    prop needed), **Delete frame** (moved from `FrameCard`, now
    `onClick={() => removeFrame(canvas.activeFrame)}`,
    `disabled={canvas.frameCount <= 1}`, same guard as today's
    `isOnlyFrame`).
  - `FrameCard` (line 38-87) loses its per-card action-buttons row
    (line 81-84) and the `duplicateFrame`/`removeFrame`/`isOnlyFrame` prop
    entirely — it goes back to being purely presentational (thumbnail,
    index label, duration input, click-to-select), matching how a
    `LayersPanel` row shows identity/state but not move/duplicate/delete
    actions.
  - **Scroll direction**: today the frame-cards row (line 140,
    `flexWrap: 'wrap'`) wraps onto additional rows once it outgrows the
    panel's width, and the outer `.panel` div's `overflow: 'auto'`
    (line 107) scrolls that vertically. Switch to horizontal-only: drop
    `flexWrap: 'wrap'` from the cards row (single row, `flexWrap: 'nowrap'`)
    and give *only that row* its own scroll container (`overflowX: 'auto',
    overflowY: 'hidden'`, `flex: 1`, `minHeight: 0`) instead of scrolling
    the whole panel. **The top controls row (Frames label/Play/toolbar/FPS/
    Onion skin) must stay fixed in place — it does not scroll in either
    direction when the frame strip is scrolled horizontally.** Give it
    `flexShrink: 0` and keep it a sibling *outside* the cards row's own
    scroll container (not nested inside it), so it's structurally
    unaffected by that container's scroll position. This needs the `.panel`
    div itself to become a column flex container (`display: 'flex',
    flexDirection: 'column'`, dropping its own `overflow: 'auto'` in favor
    of `overflow: 'hidden'` now that the inner cards row owns its own
    scrollbar) so the two rows stack with the second one filling/scrolling
    the remaining height.
  - `MIN_HEIGHT` (line 20, currently `230`, sized per its own comment for
    "controls row + one full row of frame cards ... + action buttons"):
    with per-card action buttons gone *and* the strip now always exactly
    one row tall regardless of frame count (no more multi-row wrap growth),
    this can drop further than a same-content-different-scroll-direction
    change alone would justify — start around `140` and adjust visually
    during this checkpoint's manual verification (confirm the single card
    row — thumbnail + index + duration input — isn't clipped) so the
    canvas/viewport get the freed-up space. The `useResizeDrag` `max: 480`
    (line 97) can stay as the user's own upper resize bound, unaffected.
- **Tests:**
  - `test/model/Canvas.test.js` — a `reorderFrame` test mirroring
    `reorderLayer swaps a layer with its neighbor and no-ops past either
    end` (line 250-261): build a canvas with 2+ frames holding
    distinguishable per-frame content in a layer, swap, assert each layer's
    `frames` array order changed, `frameDurations` swapped alongside, and a
    no-op past either end.
  - `test/state/store.test.js` — extend the existing `'addFrame/
    duplicateFrame/removeFrame are undo-tracked...'` test (line 243-271) or
    add a sibling: `reorderFrame` is undo-tracked, and `activeFrame` follows
    the moved frame correctly (cover both "moving the active frame" and
    "moving a frame adjacent to a different active frame" — the two
    `activeFrame` remap branches).

## Checkpoint 3 — Remove the Layers panel's layer-level flip/rotate buttons

Scoped to the **layer**-level toolbar branch only, per the Tokenote item's
own wording ("flip **layer** buttons") — the **shape**-level flip/rotate
buttons in the same file are a separate branch and stay untouched.

- **`src/ui/draw/LayersPanel.jsx`**: remove the three `IconButton`s at
  line 329-331 (`FlipHorizontalIcon` "Flip layer horizontal",
  `FlipVerticalIcon` "Flip layer vertical", `Rotate90Icon` "Rotate layer
  90°") from the non-shape (`else`) branch's `actionButtons`. Remove the
  now-unused `flipActiveLayerH`/`flipActiveLayerV`/`rotateActiveLayer90`
  store selectors (line 291-293) — the shape-level branch (line 312-314)
  uses its own separate `flipActiveShapeH`/`flipActiveShapeV`/
  `rotateActiveShape90` selectors (line 288-290), so the
  `FlipHorizontalIcon`/`FlipVerticalIcon`/`Rotate90Icon` **imports** stay
  (still used by the shape branch) — only the layer-branch selector hooks
  and JSX buttons go.
- **No store/model changes** — confirmed `flipActiveLayerH`/
  `flipActiveLayerV`/`rotateActiveLayer90` (`store.js:511-532`) stay live:
  `MenuBar.jsx:141-143` already wires the same three (plus
  `rotateActiveLayerCCW90`/`rotateActiveLayer180`) into
  `TransformScopeModal` for every Transform-menu Flip/Rotate → Layer
  action, so removing the panel buttons is JSX/import-only deletion.
- **No test changes needed** — no `LayersPanel.jsx` component tests exist;
  `test/state/store.test.js` calls the store actions directly (unaffected
  by removing the panel's own buttons).

## Verification (per checkpoint)

1. `npm test` — report before/after pass counts.
2. Manual, in-browser via the `pixelyph` launch config:
   - **Checkpoint 1**: Shape tier, apply a gradient, click "Save to
     palette" — modal appears, type a name, confirm, check the new Palette
     swatch's tooltip shows the name. Repeat for "Save style" and for
     `PalettePanel`'s own "+ add gradient" draft flow. Confirm Cancel aborts
     the save (no new palette entry) in all three. Confirm saving a solid
     color still has no name prompt (unchanged behavior).
   - **Checkpoint 2**: add 3+ frames with visually distinct content, click
     through the strip to make different frames active, use the shared
     toolbar's Move left/right (and confirm Duplicate/Delete still work from
     their new toolbar location, acting on whichever frame is active) —
     confirm thumbnails *and* playback order actually change, confirm the
     moved frame's own content stays selected/active through the move,
     confirm buttons disable at the first/last position, confirm undo
     reverts a reorder, and confirm the lowered `MIN_HEIGHT` shows no
     clipping at the default single-frame state. Add enough frames to
     overflow the panel's width and confirm the strip scrolls horizontally
     (never wraps to a second row, no vertical scrollbar) while the top
     controls row (Add frame/toolbar/FPS/Onion skin) stays pinned in view.
   - **Checkpoint 3**: Shape tier, Layers panel — confirm the layer
     toolbar's flip/rotate buttons are gone while a shape's own flip/rotate
     buttons still appear when a shape row is selected; confirm Transform
     menu → Flip/Rotate → Layer target still works end-to-end.
3. Mark each item's `<!-- tokenote:id=... -->` comment `resolved` in
   `.claude/tokenote-notes.md` once addressed (per the project's Tokenote
   close-out convention), and commit each checkpoint independently in the
   repo's terse imperative style — no auto-push.
