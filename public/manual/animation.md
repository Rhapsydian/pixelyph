# Animation

Every layer carries a uniform number of frames — adding, duplicating, or
removing a frame does it across every layer at once, so they never drift
out of sync. Animation works the same way in both Pixel and Shape tier.

## The frame strip

A resizable panel docked to the bottom of the window (drag its top edge
to resize) with a toolbar — add, move left/right, duplicate, delete —
acting on the active frame. Click a frame's thumbnail to select it. Each
frame has its own duration in milliseconds, editable per frame; the frame
row scrolls horizontally once it outgrows the panel's width. The
**Default FPS** control sets the pace for newly-added frames only — it
doesn't retroactively rescale frames that already exist.

## Playback preview

Play/Pause steps through the actual editing surface on a timer, using
each frame's own duration, looping. Manually selecting a frame (or
switching projects) pauses playback — the same "scrubbing takes back
control" convention most video players use. Clicking or dragging on the
canvas while playing also pauses it, without also painting into whatever
frame happened to be active at that instant.

## Onion skinning

Toggle onion skinning to see a faded, color-tinted preview of the
adjacent frame(s) rendered behind the one you're actively editing — useful
for keeping motion consistent frame to frame.

## Exporting an animation

Once a project has more than one frame, the Export modal (File →
Export…) offers several animation-aware formats — see
[Export](export.md) for the full list, but in short:

- **Animated SVG** — a single self-contained, looping file; each frame can
  run at a different speed.
- **Sprite Sheet** — one tiled PNG plus a JSON metadata sidecar
  (TexturePacker/Aseprite-style).
- **Sprite Archive** — each frame as its own file (PNG, SVG, or both).
- **Animated GIF** — real GIF transparency for fully-transparent pixels.
- **Animated PNG (APNG)** — lossless, full alpha transparency, natively
  supported by every current browser's `<img>` tag.

Every raster animation format reuses the same single-frame rasterizer
PNG/WebP export already uses, called once per animation frame, so a
frame's appearance in an export always matches what you see while
editing it.
