// Editor-only "checkerboard" backdrop (display-only, never exported — same
// convention as GridOverlay/ReferenceImageLayer) so an unpainted/transparent
// cell reads as visibly different from a cell actually painted white. The
// checker tile is half a grid cell (not a whole one) so the pattern is
// always finer than any single pixel-art cell, however zoomed in — a whole-
// cell-sized checker would be indistinguishable from a solid painted pixel.

export function TransparencyBackground({ width, height }) {
  return (
    <>
      <defs>
        <pattern id="pixelyph-checkerboard" width={1} height={1} patternUnits="userSpaceOnUse">
          <rect x={0} y={0} width={1} height={1} fill="var(--chrome-bg-raised)" />
          <rect x={0} y={0} width={0.5} height={0.5} fill="var(--chrome-border)" />
          <rect x={0.5} y={0.5} width={0.5} height={0.5} fill="var(--chrome-border)" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={width} height={height} fill="url(#pixelyph-checkerboard)" pointerEvents="none" />
    </>
  );
}
