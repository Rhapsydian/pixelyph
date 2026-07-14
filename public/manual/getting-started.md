# Getting Started

Pixelyph is a pixel-art and pixel-font editor that draws with real SVG
shapes instead of a raster grid — what you see while drawing is exactly
what gets exported, gradients and effects included.

## Launching Pixelyph

On launch you land on a startup screen with three choices:

- **New Project** — opens the New Project wizard (see below).
- **Existing Project…** — opens a file picker for a previously-saved
  `.pixelyph` file. Pixelyph reads the file's own kind (Draw or Glyph) and
  opens the matching mode automatically.
- **Continue Last Session** — only shown when an autosaved session exists.
  Pixelyph autosaves as you work, so an unexpected close (a crash, closing
  the tab, quitting Electron) can be recovered from here.

The startup screen and wizard overlay the editor rather than replacing it
outright, so if you're returning to an already-open project, the interface
underneath stays visible (dimmed) while you decide.

## Choosing a mode

The New Project wizard's first step is **Choose Mode**:

- **Draw** — pixel art with layers, multi-frame animation, and SVG/raster
  export. Uses standard defaults; there's nothing else to configure up
  front.
- **Glyph / Font** — pixel fonts or icon sets, one grid per glyph, with no
  locked-in choice between the two (a glyph can freely have a real typed
  character, a name, both, or neither). Continuing from here asks for a
  family name, the grid height in pixels-per-em, a default glyph width,
  and an optional starter charset (Basic Latin, Latin-1 Supplement, or
  Symbols) — choosing one eagerly creates an empty glyph for every
  codepoint in it; choosing none seeds a single bare glyph instead of
  starting empty.

Mode is chosen once at project creation and isn't toggled mid-session.
File → New Project jumps straight back to this Choose Mode screen (asking
to discard the current project first, if one is open) rather than making
you click through the title screen again.

## The window layout

Once a project is open, the header holds Pixelyph's menu bar — **File,
Edit, Palette, Transform, Window, Help** (Draw mode also gets an extra
context bar below it for tool settings) — plus Undo/Redo and a fullscreen
toggle. Below that: a vertical tool rail on the left, the canvas in the
middle, and a tabbed side panel on the right. Panels are resizable — drag
a panel's edge to resize it.

## Saving your work

**File → Save Project** writes a `.pixelyph` file (a native save dialog on
the Electron desktop build, a browser download on the web build).
Pixelyph also autosaves continuously in the background — see "Continue
Last Session" above — but a manual save is still the way to get a real
file you can back up, move between machines, or hand to someone else.

## Getting the Windows desktop app

Pixelyph also runs as a Windows desktop app (Electron), separate from the
web version. **Help → Download for Windows** takes you to the latest
release on GitHub. The installer isn't code-signed, so Windows
SmartScreen will show an "Unknown Publisher" warning the first time you
run it — that's expected, not a sign anything's wrong. Click **More
info → Run anyway** to proceed.

## Where to go next

- [Draw Mode](draw-mode.md) — tools, layers, palette, and the Pixel/Shape
  tier system.
- [Animation](animation.md) — frames, playback, and animation export.
- [Glyph Mode](glyph-mode.md) — designing pixel fonts and icon sets.
- [Export](export.md) — every export format and when to use it.
- [Keyboard Shortcuts](keyboard-shortcuts.md) — the full shortcut list.
