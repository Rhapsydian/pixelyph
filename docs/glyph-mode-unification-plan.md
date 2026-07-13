# Glyph Mode Unification: Merge Character/Icon Sub-Modes

**Status:** Planned, not started. Produced by a planning/research-only
session (no code changed). This is the design spec the next `/dev-session`
on this topic should execute against — see `BACKLOG.md`'s "Next session"
entry for the pointer here.

## Context

Glyph mode currently forces a choice at project-creation time between two
locked-forever sub-modes: **character font** (`kind: 'characters'`, glyphs
keyed by real typed Unicode codepoints) and **icon font** (`kind: 'icons'`,
glyphs keyed by auto-assigned Private-Use-Area codepoints, identified by a
free-form name instead). Research into the current codebase
(`src/model/GlyphSet.js`, `src/ui/glyph/*`, `src/export/font/*`) found that
underneath this UI/wizard-level split, the actual `Glyph` data shape was
already fully unified — every kind-specific behavior is a local `if (kind ===
...)` branch scattered across ~8 files, not a real structural divergence.
That makes a genuine merge tractable: delete the `kind` field, and let every
glyph freely have a real typed character, a free-form name, both, or neither,
with no project-level lock. This removes an artificial constraint (a project
that wants a few named icon glyphs alongside a Latin alphabet currently can't
have both) and simplifies the mental model to one glyph type.

The user also used this research pass to specify a richer target UX than a
pure refactor would require: bulk glyph creation via a modal, visual
"incomplete glyph" affordances (a corner caution badge + a plain-language
alert), and a placeholder-character watermark for a glyph that has a real
codepoint but no drawn pixels yet.

## Data model changes (`src/model/GlyphSet.js`)

- **Remove `kind` from `GlyphSet`** entirely: `GlyphSet = { id, meta,
  glyphs: Map<codepoint, Glyph> }`. `createGlyphSet({ meta })` drops the
  `kind` param.
- **Remove `unicode` from `Glyph`** entirely: `Glyph = { width, height,
  pixels, advanceWidth, leftSideBearing, name }`. Per the user's direction,
  a real character assigned to a glyph (by pasting the character, typing
  `U+xxxx`, or an HTML entity like `&hearts;`) becomes *the actual Map key*
  used for that glyph everywhere, including in the compiled font — not a
  separate decorative annotation as today's icon-kind `glyph.unicode` is
  (confirmed dead at every export/render path except the UI itself). This
  makes a standalone `unicode` field fully redundant with the Map key, same
  as it already effectively is for today's character-kind glyphs.
- **Two new pure predicates**, exported alongside the existing helpers:
  - `isAutoAssignedCodepoint(codepoint)` — `codepoint >= 0xE000 && codepoint
    <= 0xF8FF` (the PUA range). Replaces the `kind === 'icons'` check
    everywhere it currently gates behavior. Every existing glyph in every
    existing save already sits correctly on one side of this boundary by
    construction (old icon glyphs were always PUA-keyed; old character
    glyphs are real-Unicode-keyed), so this is a behavior-preserving swap,
    not a new rule.
  - `isDisplayableChar(codepoint)` — false for C0/C1 control characters
    (`U+0000–U+001F`, `U+007F`, `U+0080–U+009F`) and whitespace/separator
    characters (space, tab, newline, etc.); true otherwise. Drives label
    logic below. A small hardcoded map of common non-displayable
    codepoints → human labels (`0x20: 'Space'`, `0x09: 'Tab'`, `0x0A:
    'Line Feed'`, `0x0D: 'Carriage Return'`) is worth adding for nicer
    labels in that fallback case — implementation detail, not required for
    correctness.
  - Rename `nextIconCodepoint` → `nextAutoCodepoint` (cosmetic; its
    algorithm — smallest unused codepoint ≥ `U+E000`, recomputed fresh, no
    stored counter — is unchanged and was never actually icon-specific).
- **`isEmptyGlyph(glyph)`** — `true` iff every byte in `glyph.pixels` is 0.
  Needed for the caution-badge and watermark logic below; no new stored
  field, computed on demand.
- **`FontMeta.iconTilePadding` stays**, but changes meaning from "read live
  by `compileFont.js` on every export for every icon-kind glyph" to "default
  seed consulted only at glyph-creation time for a glyph that gets an
  auto-assigned codepoint" — exactly parallel to how `defaultGlyphWidth`
  already works. Consider renaming the field for clarity in a later pass;
  not required for this merge.

### New: optional background + foreground layered glyphs (3 buffers total)

Per the user's explicit correction, since `Glyph`'s shape is already being
touched this pass: the existing `pixels` buffer is the base/primary layer
(unchanged, mandatory, no rename). Add **two independent, optional**
additional pixel buffers alongside it — `Glyph.backgroundPixels` and
`Glyph.foregroundPixels` (each a `Uint8Array`, same `width`/`height` as
`pixels`), each defaulting to `undefined`/absent and each toggleable
independently of the other. A glyph can have 1, 2, or 3 active layers.
Presence of each field is itself the "this glyph has that layer" flag; no
separate booleans needed.

This maps directly to the CSS layering trick the user described: base glyph
content, a `::before`-rendered layer (background, behind/underneath), and a
`::after`-rendered layer (foreground, on top/overlaid) — each independently
colorable in CSS once export is wired up, giving **two- or three-color icon
fonts** depending on how many optional layers a given glyph actually uses.

**Explicit user correction: model only, no UI at all in this pass.** Nothing
in this plan builds an editing surface, a paint-target switch, thumbnail
compositing, or any other UI for the second/third layer — the deliverable
is purely the data shape and its pure helpers, ready for a future session
to build UI/export against without needing another model migration:
- `GlyphSet.js` gains small helpers: `addBackgroundLayer(glyph)` /
  `addForegroundLayer(glyph)` (each allocates a same-sized blank buffer),
  matching `removeBackgroundLayer(glyph)` / `removeForegroundLayer(glyph)`,
  and `isEmptyGlyph(glyph)` considers a glyph empty only if `pixels` **and**
  both optional buffers (whichever are present) are all-zero.
- **No editing UI, no store-level toggle/paint-target actions, no
  `GlyphThumbnail`/preview compositing** — none of that is built in this
  pass. These fields simply exist on `Glyph` and are inert/unused by every
  current code path until a future session decides to build the editing
  and export experience around them.
- **Persistence**: both new buffers are additive/optional, so old
  `.pixelyph` saves need no migration work for them — absent in every
  existing file, `undefined` by default, single-layer behavior preserved
  exactly. Worth making `projectFile.js`'s serialize/deserialize pair
  already handle these fields when present (reusing whatever bit-packing
  `pixels` uses), so the model is genuinely usable end-to-end at the data
  layer even though nothing creates non-empty data for it yet.
- **Export scope, explicit**: `compileFont.js`/`iconFontCss.js` are
  untouched by this — they only ever read `pixels` today and continue to.
  The eventual two-or-three-color CSS `::before`/`::after` export wiring is
  a fully separate future effort and should land as its own `BACKLOG.md`
  entry once this merge ships, referencing these fields as already in
  place.

### Selection/transform parity with Draw mode

Independent of the layered-glyph model work above: the user wants Glyph
mode's selection/move/transform to behave identically to Draw mode's — a
floating selection that requires explicit confirmation to finalize (per the
Draw-mode Selection redesign already shipped, sessions 29-30 —
`floatingGridSelection`, pending-then-finalize). A quick grep of
`SvgPixelEditor.jsx` during this planning pass shows glyph and draw mode
already share the exact same component and the exact same
`selection`/`floatingSelection`/`floatingGridSelection` store state
(`doc = mode === 'glyph' ? glyphCanvas : canvas`, used generically
throughout) — so this likely already works correctly today, structurally,
by virtue of reusing the identical code path. **Not fully verified in this
planning pass** — the implementation session should explicitly side-by-side
test Glyph mode's marquee-select → move/transform → finalize flow against
Draw mode's before writing any new code, treating any divergence found as a
bug to fix.

## Store actions (`src/state/store.js`)

Collapse `assignCodepoint` and `addIconGlyph` into **one unified glyph-creation
action**, e.g. `addGlyph({ character, name })`:
- `character` (optional, a parsed real codepoint via the existing richer
  `parseUnicodeInput` from `GlyphSetPanel.jsx` — handles literal paste,
  `U+xxxx`, `&hearts;`, `&#x2764;`) — if present, collision-checked via
  `wouldCollide` (confirm-replace prompt, same UX as today) and used as the
  literal Map key.
- If `character` is absent, `nextAutoCodepoint(glyphSet)` supplies the key.
- `name` (optional free text) is attached regardless of which path the
  codepoint took.
- Calling with **both fields empty** is valid and is the "add a completely
  bare empty glyph" action the user explicitly asked for — no gating on
  either field.
- Default glyph width at creation: use `meta.defaultGlyphWidth` when a real
  `character` was given; use raw `meta.pixelsPerEm` (square tile) when the
  codepoint was auto-assigned — this preserves today's two divergent
  defaults (`assignCodepoint` vs `addIconGlyph`'s width math, lines
  1160-1183) but keys the choice off *this glyph's own path*, not a
  project-wide flag.

**New: `reassignGlyphCodepoint(oldCodepoint, newCodepoint)`** — needed
because "Edit selected glyph" can now change which real character a glyph
represents, which under the new model must move the Map entry (delete +
re-insert), not just patch a decorative field like today's
`updateGlyphMeta({ unicode })` does. Needs the same `wouldCollide` confirm
pattern as creation. `activeCodepoint` must follow the glyph to its new key.

`updateGlyphMeta` keeps handling `name` patches only (drop the `unicode`
patch branch — the field no longer exists).

**New: `addGlyphsFromPreset(codepoints)`** — bulk-creation entry point for
the new modal (below): given a list of codepoints (e.g. every codepoint in
one or more checked charset presets, or a hand-picked subset), creates an
empty-grid `Glyph` at each one that doesn't already exist, skipping any
that do (no destructive overwrite in a bulk operation — simpler and safer
than per-item collision prompts for a multi-hundred-codepoint preset).

`glyphContentSnapshot`/`applyGlyphContentSnapshot` need no shape change
(they already snapshot the whole `GlyphSet`; `kind` and `unicode` simply stop
existing in what gets serialized once the model change lands).

## UI changes

### `GlyphSetPanel.jsx` — becomes the single, unconditional glyph browser/editor entry point
- **One add-glyph form**, always visible, two optional inputs (Character,
  Name) plus a "Create" button that's *always enabled* (not gated on either
  field being filled) — covers all four cases: typed+named, typed-only,
  named-only (auto-keyed), and fully bare.
- **Unified label function** (replacing today's `kind`-branching
  `glyphLabel`): if the glyph's codepoint is real (not
  `isAutoAssignedCodepoint`) **and** `isDisplayableChar`, show the character
  itself (`❤ (U+2764)`); else if `name` is set, show the name; else fall
  back to a hex/placeholder label (`(unnamed) (U+E003)`). Matches the user's
  explicit instruction: prefer the real character over the name field for
  display, except for non-displayed characters like space/CR.
- **Sort toggle**: default codepoint order, plus a small "Sort: Codepoint /
  Name" control — both orderings kept per the user's answer, rather than
  dropping the alphabetical-by-name option icon-heavy projects rely on
  today.
- **Caution badge**: a small badge in the thumbnail's upper-left corner
  whenever a glyph has *any* of: an auto-assigned (non-deliberate) codepoint,
  an empty `name`, or `isEmptyGlyph(glyph)` is true. All three are
  independently-computed, no new stored flags.
- **Selection alert**: when the newly-active glyph triggers the badge for
  missing-codepoint-or-name (not for the empty-grid condition alone, which
  is visually self-evident as a blank canvas per the user's own reasoning),
  show a small inline message near the editor, e.g. "Glyph missing character
  or name." — wording adapts to which of the two is actually missing.
- **"Edit selected glyph" sub-panel**: generalizes today's icon-only
  rename/re-unicode section to every glyph — Name field (`updateGlyphMeta`)
  and Character field (`reassignGlyphCodepoint`), always shown for whichever
  glyph is active, not gated on kind.
- Drop the `— {glyphSet.kind}` from the panel header; drop all `kind`
  reads/branches.

### Bulk-Add modal (replaces `CharacterMapPanel.jsx`'s always-inline panel)
Per the user's explicit direction, this becomes a **modal** (matching the
app's existing modal pattern — see `NamePromptModal`/`ExportModal`), opened
via a button from `GlyphSetPanel` (e.g. "Bulk Add…"), not a permanently-docked
side-panel tab:
- Charset-preset checkboxes (reuse `CHARSET_PRESETS`/`mergedPresetCodepoints`
  from `charsetPresets.js` unchanged) let the user pick individual codepoints
  or whole presets (Basic Latin, Latin-1, Symbols, etc.).
- Confirming adds every selected codepoint as an **empty-grid glyph with its
  real codepoint set** (`addGlyphsFromPreset`) — a genuine bulk-create, not
  today's one-at-a-time type-then-click-Create flow.
- Rename away from "Character Map" — call it something scope-neutral like
  "Bulk Add Glyphs" per the user's implicit framing (a mixed-content project
  bulk-adding a handful of real Latin letters alongside hand-made icons
  shouldn't feel mislabeled).

### `GlyphThumbnail.jsx` — watermark replaces the old "phantom slot" concept entirely
**Correction from the user**: this is not an addition alongside today's
behavior, it's a replacement. Today's component has a `!glyph` branch that
renders a faint placeholder character for a codepoint that has **no**
`Glyph` object yet (used by the old `CharacterMapPanel`'s preset-browsing
grid, which shows every codepoint in a checked preset as a ghost cell before
any glyph is actually created). **That concept goes away.** Per the user:
*glyphs shouldn't show in the glyph panel unless they've actually been
added* — `GlyphSetPanel` only ever iterates real `glyphSet.glyphs` Map
entries (already true structurally), and nothing should ever call
`GlyphThumbnail` with a `codepoint` but no `glyph` anymore, so the `!glyph`
branch and its `codepoint` prop are dead code to remove.

The consequence: **preset selection must eagerly create real, empty-grid
glyphs with their codepoint set**, not just show a browsing grid — both in
the new Bulk-Add modal (already the plan, see below) and, per the user's
explicit correction, in the **New Project wizard's "Initial charset preset"
step too** — choosing a preset there should have `buildGlyphDocument`
immediately create one empty `Glyph` per codepoint in that preset, upfront,
as part of project creation (not deferred to first-open-of-Glyph-tab
browsing).

The watermark itself survives, narrowed to exactly one case: a real `Glyph`
Map entry exists, has a real (non-auto-assigned) displayable codepoint, and
`isEmptyGlyph(glyph)` is true (per the 3-layer definition above) — render
the character as a low-opacity SVG `<text>` backdrop sized to the glyph's
`width`/`height` viewBox, beneath the empty pixel path(s). Flagged as the
one piece of this plan with any rendering technical risk (system-font
rendering inside an SVG viewBox sized in grid units, not points — needs a
manual visual check across a few glyph sizes). No watermark for
auto-assigned/nameless codepoints (nothing meaningful to render).

### Glyph display color (canvas-only visual preference, new)
A new control in `ContextBar.jsx`, next to the existing grid-toggle
`IconButton` (`showGrid`/`toggleGrid`, line ~139) and following that exact
pattern: a **Glyph-mode-only** color swatch/picker that changes what color
the glyph's pixels render as on the **editing canvas only** — display
preference, not document data. Not exported, not saved to the `.pixelyph`
file, not part of `glyphContentSnapshot`/undo history — a transient UI
setting exactly like `showGrid` already is. New store state
`glyphDisplayColor` + `setGlyphDisplayColor` action, read by
`SvgPixelEditor.jsx`'s glyph-mode rendering path to override the pixel
fill color it currently hardcodes. Purely a convenience for users who find
a glyph hard to see against the canvas background in its default color.

### `SidePanel.jsx`
`glyphTabs()` loses its `kind` parameter and the `Characters`-tab-only-for-
character-kind gate. With `CharacterMapPanel` becoming a modal rather than a
tab, the tab list simplifies to just "Glyphs" and "Font", always shown; the
modal is opened from a button inside the Glyphs tab instead of occupying its
own tab slot.

### New Project wizard (`App.jsx`)
Delete the `Kind` `<select>` from the `glyph-options` step entirely.
`deriveDefaultWidth` collapses to one formula, no `kind` param. The "Initial
charset" preset dropdown loses its `glyphKind === 'characters' &&` gate,
always shown — **and its meaning changes** per the correction above:
choosing a preset now means `buildGlyphDocument` eagerly creates one
empty-grid `Glyph` per codepoint in that preset immediately at project
creation (reusing whatever bulk-creation helper the Bulk-Add modal uses,
e.g. `addGlyphsFromPreset` applied during document construction rather than
as a later store action), not just a seed for later browsing.
`newProject('glyph', { familyName, initialPreset, pixelsPerEm,
defaultGlyphWidth })` and `buildGlyphDocument(...)` both drop `kind`.

## Export pipeline (`src/export/font/`)

Two independent per-glyph checks replace the single `kind` switch — kept
separate since they answer different questions:

**Horizontal metrics (`compileFont.js`)** — branch on
`isAutoAssignedCodepoint(codepoint)` instead of `kind`:
```
if (isAutoAssignedCodepoint(codepoint)) {
  offsetX = (meta.iconTilePadding ?? 0) * scale;
  advanceWidth = glyph.width * scale + 2 * (meta.iconTilePadding ?? 0) * scale;
} else {
  offsetX = (glyph.leftSideBearing ?? 0) * scale;
  advanceWidth = (glyph.advanceWidth ?? glyph.width) * scale;
}
```
Provably behavior-identical to today for every existing glyph in every
existing save (see Migration below).

**Naming (`compileFont.js`'s `glyphName()`, `iconFontCss.js`)** — branch on
`glyph.name` presence, not codepoint origin or kind: `glyph.name ?
`icon-${slugify(glyph.name)}` : uniHex(codepoint)`. Per the user's
instruction, **the name field is what drives CSS class construction**,
regardless of whether the glyph also has a real assigned character — this is
already almost exactly today's logic; dropping the `kind !== 'icons'`
early-return is the entire change. `iconFontCss.js`'s slug fallback for a
named-but-unslugifiable-name case should fall back to the glyph's own hex
codepoint (not a generic `icon-icon`) to keep bulk-generated CSS classes
distinguishable.

**`FontExportPanel.jsx`**: the "CSS + JSON manifest" checkbox row is now
always shown, unconditionally (not auto-detected from glyph content) — the
most coherent option once there's no discriminant to gate on at all.

**`demoHtml.js`**: stays close to its current shape (static, downloadable
artifact) — a seeded textarea (pre-filled with every *typed* glyph's
character) plus a clickable swatch strip of every glyph that inserts into
the textarea, and the existing tiling-test strip conditional (only renders
if at least one auto-assigned-codepoint glyph exists). The big interactive
redesign below is scoped to the in-app `SpecimenPreviewPanel.jsx` only;
optionally mirror the color picker into `demoHtml.js` later as a nicety,
not required for this pass.

## Specimen Preview redesign (`SpecimenPreviewPanel.jsx`)

Today's panel (read in full during this planning pass) renders one flat
row: a plain `<textarea>` for character-kind, a swatch-button row for
icon-kind, each placed glyph rendered as a fixed-color (`#eee`) SVG with no
line-break handling — a real `\n` keystroke just fails to resolve to a
glyph and renders `?`. Three changes, per the user's explicit direction:

**1. Multi-line, real-font-metrics layout.** Split the preview text on `\n`
into rows; lay out each row using the **same per-glyph metrics formula
`compileFont.js` uses** (`offsetX`/`advanceWidth` from
`isAutoAssignedCodepoint`-branch or stored bearings) — extract that formula
out of `compileFont.js` into one shared pure function, e.g.
`glyphMetrics(meta, codepoint, glyph)` in a small shared module (or
`GlyphSet.js` itself), imported by both `compileFont.js` and the preview
renderer. This was the user's own call after the planning pass raised a
tight-tile-grid alternative: **no separate "tile mode" toggle** — if a user
wants glyphs to touch edge-to-edge in the preview (and in the real exported
font), that's a function of their font metadata, not a special preview
mode. Concretely: auto-keyed glyphs touch when `iconTilePadding` is `0`;
typed glyphs touch when `leftSideBearing` is `0` and `advanceWidth ===
width`. **Document this relationship** in `public/manual/glyph-mode.md`
(new short section, e.g. "Getting seamless tile edges") so users know which
meta fields to change rather than looking for a mode switch that doesn't
exist.

**2. Preview color — hybrid global/locked-per-instance.** One color
picker sets the "current preview color." Each glyph inserted into the
preview (by typing or clicking a swatch) is stamped with whatever color is
currently active at the moment of insertion — changing the picker
afterward does **not** retroactively recolor already-placed glyphs. An
"Apply to all" button next to the picker force-recolors every glyph
currently in the preview to the active color in one action. Implementation
needs a parallel `colors: string[]` array alongside the preview `text`,
kept in sync on every text-change event (a lightweight diff: characters
added at some position get the current color inserted at that position;
characters removed drop their paired color entry; unchanged runs keep their
existing colors). `PreviewGlyph`'s hardcoded `fill="#eee"` becomes a `color`
prop driven per-instance from this array.

Note: since the background/foreground layers are model-only in this pass
(no UI, see above), the preview renders only the base `pixels` layer for
every glyph — nothing to composite yet.

## Migration (`src/io/projectFile.js`)

`serializeGlyphSetProject` stops writing `kind`/`unicode`.
`deserializeGlyphSetProject` simply stops reading/validating `gs.kind` and
`glyph.unicode` — old saves carrying either field load fine with those keys
silently ignored, no explicit transform, no data loss. This is close to a
true no-op specifically because of the `isAutoAssignedCodepoint` design
choice above: every existing glyph in every existing save is already
correctly positioned relative to the PUA boundary by construction, so no
per-glyph backfill is needed at load time.

**Accepted edge case** (per the user's explicit sign-off): a pre-merge
character-kind project where a user manually typed/pasted a real character
that happens to fall in `U+E000–F8FF` (legal but never produced by any
keyboard, no standard reason to type deliberately) would, post-migration,
start getting icon-tiling export metrics instead of its own stored bearings.
Vanishingly rare — documented here and in the eventual commit message rather
than guarded against with extra migration complexity.

No `PIXELYPH_VERSION` bump is functionally required (dropping ignored keys
is inherently tolerant either direction).

## Suggested checkpoint sequencing

Matching this project's established convention (one commit + test-count
delta + manual browser verification per checkpoint, per `BACKLOG.md`'s
Shipped-section house style). Baseline at time of writing: 469/469 passing
(`node --test`).

1. **Core model** — `GlyphSet.js` (drop `kind`/`unicode`, add
   `isAutoAssignedCodepoint`/`isDisplayableChar`/`isEmptyGlyph`, rename
   `nextIconCodepoint`), plus the two new optional `backgroundPixels`/
   `foregroundPixels` fields and their `add*Layer`/`remove*Layer` helpers
   (model-only, no UI — see "no UI" correction above), `projectFactory.js`,
   `store.js`'s snapshot helpers. Update `GlyphSet.test.js` (including
   coverage for the new layer helpers, even with no UI to drive them yet).
2. **Store actions** — unify `assignCodepoint`/`addIconGlyph` into
   `addGlyph`, add `reassignGlyphCodepoint` and `addGlyphsFromPreset`, retire
   the `unicode` branch in `updateGlyphMeta`; add `glyphDisplayColor`/
   `setGlyphDisplayColor` (transient UI state, not undo-tracked, same
   pattern as `showGrid`). No background/foreground store actions — nothing
   to drive them without UI. No dedicated store test file exists today
   (confirmed — `node --test` covers pure model/export/io only) so this
   leans on manual verification.
3. **Selection/transform parity check** — side-by-side verify Glyph mode's
   current selection/move/transform against Draw mode's
   floating-selection-requires-finalize behavior (see "Selection/transform
   parity" above); fix any divergence found. Independent of the layered-
   glyph model work, since no layer UI exists yet to complicate it.
4. **GlyphThumbnail rewrite** — remove the old `!glyph` phantom-slot branch
   entirely (dead per the "no ghost cells" correction), add the
   empty-but-keyed-glyph watermark backdrop. Manual visual check across a
   few glyph sizes/codepoints.
5. **Export pipeline** — `compileFont.js` (metrics + naming per the rules
   above; extract the shared `glyphMetrics()` helper used later by
   checkpoint 10's preview), `iconFontCss.js`, `FontExportPanel.jsx`.
   Untouched by the layered-glyph fields (they're inert/unread). Update
   `compileFont.test.js`/`iconFontCss.test.js` with mixed-glyph-set
   assertions (typed-named, auto-keyed-named, and bare glyphs in one
   export).
6. **Migration** — `projectFile.js` stops writing/reading `kind`/`unicode`;
   adds read/write support for the two new optional layer fields when
   present (additive, no migration transform needed — absent in every old
   file). Add a hand-authored legacy-fixture test (old `kind: 'icons'` and
   `kind: 'characters'` documents) to `projectFile.test.js`.
7. **New Project wizard** — `App.jsx`: remove Kind select, simplify
   `deriveDefaultWidth`, un-gate the preset dropdown, wire eager empty-glyph
   creation for the chosen initial preset into `buildGlyphDocument`.
8. **`GlyphSetPanel.jsx` merge** — unified add-glyph form, label function,
   sort toggle, caution badges, selection alert, generalized edit sub-panel.
   Only ever renders real Map entries (no phantom slots). No
   background/foreground UI here either. **Riskiest checkpoint**: the most
   behavior to reconcile in one file, the most genuinely new interaction,
   zero existing automated coverage for any `.jsx` file in this repo.
   Recommend a quick on-canvas sketch/wireframe check-in with the user
   before implementing.
9. **Bulk-Add modal** — convert `CharacterMapPanel.jsx` into the new modal,
   wire `addGlyphsFromPreset` (eager empty-grid creation, codepoint set, no
   ghost/browsing-only cells), remove it from `SidePanel.jsx`'s tab list.
10. **Glyph display color control** — new swatch/picker in `ContextBar.jsx`
    next to the grid toggle, Glyph-mode only, wired to
    `glyphDisplayColor`/`setGlyphDisplayColor` from checkpoint 2, overriding
    `SvgPixelEditor.jsx`'s glyph-mode pixel fill color. Small, isolated,
    low risk.
11. **Specimen Preview redesign** — multi-line real-font-metrics layout
    (shared `glyphMetrics()` from checkpoint 5), global/locked-per-instance
    color model + "Apply to all." Renders only the base `pixels` layer per
    glyph (nothing else to render yet). Riskiest UI checkpoint besides #8
    (the color-locking diff logic and the metrics-driven multi-row layout
    are both genuinely new). No existing test file for this panel —
    manual-only: type a multi-line sample, confirm rows use real metrics
    (and touch when meta fields are set to 0-gap values), confirm
    newly-picked colors only affect newly-added glyphs until "Apply to all"
    is used.
12. **Docs pass** — `docs/features.md`, `docs/data-model.md` (retire the
    `kind` discriminant, document the two new optional layers as a model-only,
    not-yet-exported extension point), `public/manual/glyph-mode.md`
    (rewrite "Character sets vs. icon sets," add the new "Getting seamless
    tile edges in Specimen Preview" section), `README.md` if it mentions the
    split, `BACKLOG.md` Shipped entry (and remove this planning doc, or fold
    it into the Shipped write-up, per this project's convention of retiring
    planning docs once their content ships) — plus a **new Open/backlog
    entry** for the deferred two-or-three-color CSS `::before`/`::after`
    export *and* its editing UI, since the layer fields now exist in the
    model but nothing creates, edits, or exports them yet.

## Decisions already made with the user (do not re-litigate)

- Full merge: no `kind` field anywhere, one glyph type, mixing allowed.
- Old saves auto-migrate transparently on load, no prompt.
- A real typed/pasted character always becomes the actual codepoint key
  (not a decorative side-annotation) — this retires `glyph.unicode` as a
  separate field.
- Display label prefers the real character over the name, except for
  non-displayed characters (space, CR, etc.), where it falls back to name.
- The `name` field (not the character) drives CSS class construction in
  icon-font export.
- `CharacterMapPanel` becomes a **modal** for bulk-adding glyphs (individual
  picks or whole presets), producing empty-grid glyphs with real codepoints
  set.
- Bare empty glyphs (no character, no name) must be addable in one click.
- Caution badge (upper-left corner) on any glyph missing a real codepoint,
  missing a name, or with an empty grid.
- Selection alert text only for missing-codepoint-or-name (empty-grid is
  self-evident visually, no alert needed for that case alone).
- Keep both codepoint-order and name-order sort options (toggle), rather
  than dropping alphabetical sort.
- The rare PUA-typed-character migration edge case (Migration section
  above) is accepted, not guarded against.
- Specimen Preview supports multi-line layout, laid out with real font
  metrics (no separate "tile mode") — gapless tiling is a font-metadata
  concern, documented in the manual rather than a special preview toggle.
- Specimen Preview color is a hybrid model: one global "current color"
  picker stamps newly-added glyphs at insertion time; existing placed
  glyphs keep their locked-in color until an explicit "Apply to all" bulk
  override.
- Add two optional per-glyph layers, `backgroundPixels` and
  `foregroundPixels` (independent, opt-in, additive, alongside the existing
  base `pixels`), as groundwork for a future two-or-three-color
  `::before`/`::after` icon-font export. **Model only, no UI whatsoever in
  this pass** — no editing surface, no paint-target switch, no thumbnail/
  preview compositing, no store actions to drive them. Purely a data-shape
  extension point for a fully separate future session.
- No more "phantom slot" placeholder cells for codepoints without a real
  `Glyph` object — `GlyphSetPanel` only ever shows glyphs that have actually
  been added. Both the New Project wizard's initial-preset choice and the
  Bulk-Add modal must eagerly create real, empty-grid glyphs with their
  codepoint set, rather than deferring creation to a later browse-and-type
  step.
- New Glyph-mode-only "display color" control (next to the grid toggle) —
  canvas-rendering preference only, not document data, not exported.
- Glyph mode's selection/transform must behave identically to Draw mode's
  floating-selection-requires-finalize model — needs explicit verification
  against current behavior before new code is written, not assumed. (Scoped
  to the existing base layer only, since no other paint target exists yet.)

## Verification plan for the implementation session

- `npm test` before/after each checkpoint, reporting the pass-count delta
  (per this project's `.claude/dev-session.md` override).
- Manual verification via the Browser pane (`pixelyph-dev`, port 5173) for
  every UI-touching checkpoint, per this project's established convention —
  particularly checkpoints 3-4 and 8-11, which have no automated coverage
  at all. Concretely exercise:
  - Creating a typed+named glyph, a named-only (auto-keyed) glyph, and a
    bare glyph (no character, no name) in the same project — confirming the
    bare-glyph action requires no fields filled in.
  - Re-keying an existing glyph's character via "Edit selected glyph" and
    confirming the Map entry actually moves (old codepoint gone, new one
    present, undo/redo both work).
  - Bulk-adding a full preset via the new modal and via the wizard's initial
    preset choice, confirming both eagerly create real empty-grid glyphs
    with codepoints set (no ghost/browsing-only cells anywhere).
  - Confirming the caution badge/alert appear and disappear correctly as
    glyphs are completed, and that nothing renders a placeholder for a
    codepoint that has no real `Glyph` object.
  - Opening a legacy `.pixelyph` save with `kind: 'icons'` and one with
    `kind: 'characters'` and confirming both load and export correctly
    post-migration.
  - Exporting a mixed-content font (OTF + CSS/manifest) and spot-checking
    the compiled glyph names/advance widths for both a typed-character
    glyph and an auto-keyed glyph in the same font.
  - Confirming `GlyphSet.js`'s new `addBackgroundLayer`/`addForegroundLayer`/
    `removeBackgroundLayer`/`removeForegroundLayer` helpers work correctly
    at the model level (unit tests) even though no UI calls them yet, and
    that a hand-constructed glyph with either optional layer round-trips
    correctly through save/load and is correctly ignored by
    `compileFont.js` (scope-boundary check).
  - Side-by-side comparing Glyph mode's marquee-select/move/transform/
    finalize flow against Draw mode's, confirming identical
    requires-confirmation behavior.
  - Toggling the new Glyph-mode display-color control and confirming it
    changes only the on-canvas render color (not thumbnails, not export).
  - Typing a multi-line sample into Specimen Preview and confirming each
    row lays out using real font metrics; setting `iconTilePadding`/bearings
    to zero and confirming glyphs actually touch; picking a new preview
    color and confirming only newly-added glyphs adopt it until "Apply to
    all" is clicked.
