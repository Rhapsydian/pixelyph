// Toggleable grid-line overlay: a tiled 1x1 <pattern>, not a second canvas
// layered on top — same viewBox coordinate space as the artwork itself.
// The tile/sub-grid guide is a second, independently-toggleable pattern in
// the same component (avoids duplicating the width/height/offsetX/offsetY
// prop plumbing SvgPixelEditor.jsx already threads through).

export function GridOverlay({ width, height, offsetX = 0, offsetY = 0, showGrid = true, tileGridSize = 0 }) {
  const transform = (offsetX !== 0 || offsetY !== 0) ? `translate(${offsetX},${offsetY})` : undefined;
  return (
    <>
      <defs>
        {showGrid && (
          <pattern id="pixelyph-grid" width={1} height={1} patternUnits="userSpaceOnUse" patternTransform={transform}>
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={0.06} />
          </pattern>
        )}
        {tileGridSize > 0 && (
          <pattern id="pixelyph-tile-grid" width={tileGridSize} height={tileGridSize} patternUnits="userSpaceOnUse" patternTransform={transform}>
            <path d={`M ${tileGridSize} 0 L 0 0 0 ${tileGridSize}`} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={0.12} />
          </pattern>
        )}
      </defs>
      {showGrid && <rect x={0} y={0} width={width} height={height} fill="url(#pixelyph-grid)" pointerEvents="none" />}
      {tileGridSize > 0 && <rect x={0} y={0} width={width} height={height} fill="url(#pixelyph-tile-grid)" pointerEvents="none" />}
    </>
  );
}
