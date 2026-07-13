# Keyboard Shortcuts

Every shortcut below is also listed next to its action in the Edit menu,
so you don't have to memorize this page — it's here for reference.

| Shortcut | Action |
| --- | --- |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` (or `Ctrl+Shift+Z`) | Redo |
| `Ctrl+X` | Cut selection |
| `Ctrl+C` | Copy selection |
| `Ctrl+V` | Paste |
| `Ctrl+A` | Select all |
| `Esc` | Deselect (or cancel a pending move/transform) |
| `Enter` | Commit a pending move |
| `Arrow keys` | Nudge by 1px |
| `Shift+Arrow keys` | Nudge by 10px |

`Ctrl` shortcuts are shown in their Windows/Linux form throughout the app
— on other platforms, use your OS's equivalent modifier key.

## What arrow-key nudge moves

Nudge targets whichever is most specific, in this order:

1. A floating selection, if one exists (any mode or tier).
2. Otherwise, the active shape (Shape tier).
3. Otherwise, the active layer's whole current-frame content (Pixel tier
   or Glyph mode).

A plain, not-yet-lifted rectangle selection doesn't nudge — there's no
established "move this" target until it's lifted into a floating
selection by dragging it or invoking the Move tool.

## Mouse-based shortcuts

These aren't keyboard shortcuts, but are easy to miss:

- **Right-click** erases instead of paints, for pencil, bucket fill, line,
  rectangle, and ellipse.
- **Scroll wheel** over the canvas zooms in and out directly.
