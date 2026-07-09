// Hand-rolled inline SVG icons, not a new npm dependency. Generic
// "stock-style" line icons as placeholders, structured so any individual
// icon can be swapped for custom art later without touching call sites —
// every icon takes only `size` and forwards nothing else, so call sites
// never depend on internal path data.

const base = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Svg({ size = 16, children }) {
  return (
    <svg width={size} height={size} {...base} aria-hidden="true">
      {children}
    </svg>
  );
}

export function PencilIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12.5 3.5 16.5 7.5 6 18H2v-4L12.5 3.5Z" />
      <path d="M10.5 5.5 14.5 9.5" />
    </Svg>
  );
}

export function EraserIcon(props) {
  return (
    <Svg {...props}>
      <path d="M7 15 15 7l3 3-8 8H7l-3-3 3-3Z" />
      <path d="M7 15 3 11" />
    </Svg>
  );
}

export function BucketIcon(props) {
  return (
    <Svg {...props}>
      <path d="M3 9 10 3l7 6-7 7-7-7Z" />
      <path d="M6 12 14 4" />
      <path d="M15 13c1 1.5 2 2.5 2 3.5a2 2 0 1 1-4 0c0-1 1-2 2-3.5Z" />
    </Svg>
  );
}

export function EyedropperIcon(props) {
  return (
    <Svg {...props}>
      <path d="M13.5 2.5a2.1 2.1 0 0 1 3 3L15 7l-3-3 1.5-1.5Z" />
      <path d="M12 5 5 12l-2 5 5-2 7-7-3-3Z" />
    </Svg>
  );
}

export function LineIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 16 16 4" />
    </Svg>
  );
}

export function RectangleIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5" width="13" height="10" rx="1" />
    </Svg>
  );
}

export function EllipseIcon(props) {
  return (
    <Svg {...props}>
      <ellipse cx="10" cy="10" rx="6.5" ry="5" />
    </Svg>
  );
}

export function SelectIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="3.5" width="13" height="13" rx="1" strokeDasharray="2.5 2.5" />
    </Svg>
  );
}

export function UndoIcon(props) {
  return (
    <Svg {...props}>
      <path d="M8 4 4 8l4 4" />
      <path d="M4 8h7a5 5 0 0 1 0 10h-3" />
    </Svg>
  );
}

export function RedoIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12 4 16 8l-4 4" />
      <path d="M16 8H9a5 5 0 0 0 0 10h3" />
    </Svg>
  );
}

export function PlayIcon(props) {
  return (
    <Svg {...props}>
      <path d="M6 4 16 10 6 16Z" />
    </Svg>
  );
}

export function PauseIcon(props) {
  return (
    <Svg {...props}>
      <rect x="5" y="4" width="3.5" height="12" rx="0.5" />
      <rect x="11.5" y="4" width="3.5" height="12" rx="0.5" />
    </Svg>
  );
}

export function GridIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="14" height="14" rx="1" />
      <path d="M3 8.33h14M3 11.67h14M8.33 3v14M11.67 3v14" />
    </Svg>
  );
}

export function PlusIcon(props) {
  return (
    <Svg {...props}>
      <path d="M10 4v12M4 10h12" />
    </Svg>
  );
}

// Shared by AddLayerIcon/AddShapeIcon below — a small "+" badge in the
// viewBox's top-right corner, kept out of the way of each glyph's own
// bottom-left-weighted artwork.
function PlusBadge() {
  return (
    <>
      <circle cx="15.5" cy="4.5" r="3.5" />
      <path d="M15.5 2.8v3.4M13.8 4.5h3.4" />
    </>
  );
}

export function AddLayerIcon(props) {
  return (
    <Svg {...props}>
      <path d="M8 8 13 11 8 14 3 11 8 8Z" />
      <path d="M3 13.5 8 16.5 13 13.5" />
      <PlusBadge />
    </Svg>
  );
}

export function AddShapeIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3" y="9" width="9" height="9" rx="1" />
      <PlusBadge />
    </Svg>
  );
}

export function DuplicateIcon(props) {
  return (
    <Svg {...props}>
      <rect x="6.5" y="6.5" width="10" height="10" rx="1" />
      <path d="M3.5 13.5v-9a1 1 0 0 1 1-1h9" />
    </Svg>
  );
}

export function TrashIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 6h12" />
      <path d="M8 6V4h4v2" />
      <path d="M5.5 6 6 16h8l0.5-10" />
    </Svg>
  );
}

export function EyeIcon(props) {
  return (
    <Svg {...props}>
      <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" />
      <circle cx="10" cy="10" r="2.2" />
    </Svg>
  );
}

export function EyeOffIcon(props) {
  return (
    <Svg {...props}>
      <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" />
      <circle cx="10" cy="10" r="2.2" />
      <path d="M3 3l14 14" />
    </Svg>
  );
}

export function LockIcon(props) {
  return (
    <Svg {...props}>
      <rect x="4.5" y="9" width="11" height="8" rx="1" />
      <path d="M6.5 9V6a3.5 3.5 0 0 1 7 0v3" />
    </Svg>
  );
}

export function UnlockIcon(props) {
  return (
    <Svg {...props}>
      <rect x="4.5" y="9" width="11" height="8" rx="1" />
      <path d="M6.5 9V6a3.5 3.5 0 0 1 6.5-1.8" />
    </Svg>
  );
}

export function MoveUpIcon(props) {
  return (
    <Svg {...props}>
      <path d="M10 16V4" />
      <path d="M5.5 8.5 10 4l4.5 4.5" />
    </Svg>
  );
}

export function MoveDownIcon(props) {
  return (
    <Svg {...props}>
      <path d="M10 4v12" />
      <path d="M5.5 11.5 10 16l4.5-4.5" />
    </Svg>
  );
}

export function MergeDownIcon(props) {
  return (
    <Svg {...props}>
      <path d="M6 3v6a3 3 0 0 0 3 3h5" />
      <path d="M11 9l3 3-3 3" />
    </Svg>
  );
}

export function TileIcon(props) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="2.5" width="6" height="6" rx="0.5" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="0.5" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="0.5" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="0.5" />
    </Svg>
  );
}

export function CloseIcon(props) {
  return (
    <Svg {...props}>
      <path d="M5 5l10 10M15 5 5 15" />
    </Svg>
  );
}

export function ChevronDownIcon(props) {
  return (
    <Svg {...props}>
      <path d="M5 7.5 10 12.5 15 7.5" />
    </Svg>
  );
}

/** An arrow pointing into a paint palette (thumb-hole blob + a few dabs of color) — "send this to the shared palette," used by both "Save style" and "Save to palette." The arrowhead (tip at x=5) and the palette blob (left edge at x=8.5) are deliberately kept apart with a real gap between them — an earlier version had the tip overlapping the blob's edge, reading as one smudged shape at small sizes. */
export function SaveToPaletteIcon(props) {
  return (
    <Svg {...props}>
      <path d="M1 10h2" />
      <path d="M2.5 7.5 5 10l-2.5 2.5" />
      <path d="M18.5 10a5 4.5 0 1 1-10 0 5 4.5 0 0 1 10 0Z" />
      <circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="9.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="12" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function FullscreenIcon(props) {
  return (
    <Svg {...props}>
      <path d="M7 3H4a1 1 0 0 0-1 1v3" />
      <path d="M13 3h3a1 1 0 0 1 1 1v3" />
      <path d="M7 17H4a1 1 0 0 1-1-1v-3" />
      <path d="M13 17h3a1 1 0 0 0 1-1v-3" />
    </Svg>
  );
}

export function FullscreenExitIcon(props) {
  return (
    <Svg {...props}>
      <path d="M3 7V4a1 1 0 0 1 1-1h3" />
      <path d="M17 7V4a1 1 0 0 0-1-1h-3" />
      <path d="M3 13v3a1 1 0 0 0 1 1h3" />
      <path d="M17 13v3a1 1 0 0 1-1 1h-3" />
    </Svg>
  );
}
