# Getting Started

Welcome to Pixelyph — a pixel-art and pixel-font editor. Unlike most pixel
editors, Pixelyph doesn't draw onto a grid of flat-colored squares under
the hood: every pixel you place is a real SVG shape, so gradients, strokes,
and effects are available right from the start, and what you see on the
canvas is exactly what gets exported.

This page walks through your first few minutes in the app. From here, head
to whichever mode's page matches what you want to make.

## Launching Pixelyph

When you open Pixelyph, you land on a startup screen with up to three
choices:

- **New Project** — opens the New Project wizard, described below.
- **Existing Project…** — opens a file picker so you can load a
  `.pixelyph` file you saved earlier. Pixelyph reads the file to figure out
  which mode it belongs to and opens straight into it.
- **Continue Last Session** — only appears if Pixelyph found automatically
  saved work from last time. Pixelyph saves your progress in the
  background as you work, so if the app or browser tab closes
  unexpectedly, you can pick up where you left off from here.

If you already have a project open and use File → New Project or File →
Open Project, this same startup flow appears as an overlay on top of your
current work (dimmed but still visible underneath) rather than replacing
the screen outright — so you can back out without losing anything.

## Choosing a mode

Clicking **New Project** takes you to **Choose Mode**, the first step of
the wizard. Pixelyph has two modes, and you pick one per project:

- **Draw** — for pixel art: illustrations, sprites, tilesets, animations.
  Choosing Draw takes you straight into an empty canvas with sensible
  defaults — there's nothing else to configure up front.
- **Glyph / Font** — for pixel fonts and icon sets, where you design many
  small, same-sized grids (called *glyphs*) instead of one big picture.
  Choosing Glyph asks a few follow-up questions: a family name for your
  font, how many pixels tall each glyph should be, a default glyph width,
  and an optional starter set of glyphs to create automatically (see
  [Glyph Mode](glyph-mode.md) for what that means).

Once you've picked a mode, that project stays in that mode — Pixelyph
doesn't switch a project between Draw and Glyph mid-way through. If you
want to start something new in the other mode, File → New Project brings
you right back to this Choose Mode screen (confirming first if you have
unsaved work open).

## The window layout

Once a project is open, you'll see:

- A **menu bar** across the top — File, Edit, Palette, Transform, Window,
  and Help. (In Draw mode, a second bar appears just below it with
  settings for whichever tool is currently selected.) Undo/redo buttons
  and a fullscreen toggle live here too.
- A **tool rail** down the left edge — the tools you draw with.
- The **canvas** in the middle — where you actually draw.
- A **side panel** on the right, organized into tabs — layers, palette,
  and mode-specific panels live here.

Every panel can be resized: hover over its edge until the cursor changes,
then drag.

## Saving your work

**File → Save Project** writes out a `.pixelyph` file — on the desktop
app this opens a normal save dialog, and on the web version it downloads
like any other file. This is the file to keep if you want a backup, want
to move your project to another computer, or want to hand it off to
someone else.

Pixelyph also saves your progress automatically in the background as a
safety net (see "Continue Last Session" above) — but that's only a
recovery mechanism, not a substitute for an actual saved file.

## Getting the Windows desktop app

Pixelyph also has a Windows desktop version, built with Electron, separate
from the web app. **Help → Download for Windows** takes you to the latest
release. The installer isn't code-signed, so the first time you run it,
Windows SmartScreen will show an "Unknown Publisher" warning — this is
expected and not a sign of a problem. Click **More info → Run anyway** to
continue.

## Where to go next

- [Draw Mode](draw-mode.md) — drawing tools, layers, the palette, and the
  Pixel/Shape tier system.
- [Animation](animation.md) — adding frames, previewing playback, and
  exporting an animation.
- [Glyph Mode](glyph-mode.md) — designing pixel fonts and icon sets.
- [Export](export.md) — every export format and when to reach for it.
- [Keyboard Shortcuts](keyboard-shortcuts.md) — the full shortcut list.
