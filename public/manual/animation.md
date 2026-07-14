# Animation

Any Draw-mode project can be animated with multiple frames — this works
the same way whether you're on Pixel tier or Shape tier. Every layer
always has the same number of frames as every other layer, so adding,
duplicating, or removing a frame does it across all of them at once —
they can't drift out of sync with each other.

## Adding your first frame

The frame strip is a panel docked to the bottom of the window (drag its
top edge to resize it). Its toolbar lets you add, reorder, duplicate, and
delete frames — each button acts on whichever frame is currently active.
Click a frame's thumbnail to switch to it and start drawing on it.

Each frame has its own duration, in milliseconds, which you can edit
individually. The **Default FPS** setting controls the pace new frames get
when you add them — changing it doesn't retroactively rescale frames you
already created.

## Playing back your animation

Press Play to step through your frames on a timer, using each frame's own
duration, looping continuously. Selecting a frame manually (or switching
to a different project) pauses playback automatically — the same
"touching it takes back control" behavior you'd expect from a video
player. Clicking or dragging on the canvas while playing also pauses
playback first, so you never accidentally paint into whatever frame
happened to be showing at that instant.

## Using onion skinning to keep motion consistent

Turn on onion skinning to see a faded, tinted preview of the frame(s) next
to the one you're editing, layered behind your current work. It's a
lightweight way to keep motion smooth and consistent from frame to frame
without having to flip back and forth to compare.

## Exporting an animation

Once your project has more than one frame, the Export modal (File →
Export…) offers animation-aware formats in addition to the single-frame
ones — see [Export](export.md) for the complete list, but in short:

- **Animated SVG** — one self-contained, looping file, with each frame
  able to run at its own speed.
- **Sprite Sheet** — a single tiled PNG plus a JSON file describing where
  each frame is (the same style used by tools like TexturePacker or
  Aseprite).
- **Sprite Archive** — every frame saved as its own file (PNG, SVG, or
  both), plus a small file describing each frame's duration.
- **Animated GIF** — exports with real transparency for fully-transparent
  pixels.
- **Animated PNG (APNG)** — lossless, with full transparency, and works
  natively in every current browser.

Every one of these raster formats reuses the exact same single-frame
rendering Pixelyph uses for a plain PNG/WebP export, just run once per
frame — so what you see while editing a frame always matches how it looks
in your exported animation.
