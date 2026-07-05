// A cursor-following <rect> outlining the hovered cell — an SVG element
// like the grid overlay, not a second canvas/DOM layer.

export function BrushCursor({ x, y }) {
  return <rect x={x} y={y} width={1} height={1} fill="none" stroke="#ff5f5f" strokeWidth={0.08} pointerEvents="none" />;
}
