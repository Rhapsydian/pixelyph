// Toggleable grid-line overlay: a tiled 1x1 <pattern>, not a second canvas
// layered on top — same viewBox coordinate space as the artwork itself.

export function GridOverlay({ width, height, offsetX = 0, offsetY = 0 }) {
  const transform = (offsetX !== 0 || offsetY !== 0) ? `translate(${offsetX},${offsetY})` : undefined;
  return (
    <>
      <defs>
        <pattern id="pixelyph-grid" width={1} height={1} patternUnits="userSpaceOnUse" patternTransform={transform}>
          <path d="M 1 0 L 0 0 0 1" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth={0.05} />
        </pattern>
      </defs>
      <rect x={0} y={0} width={width} height={height} fill="url(#pixelyph-grid)" pointerEvents="none" />
    </>
  );
}
