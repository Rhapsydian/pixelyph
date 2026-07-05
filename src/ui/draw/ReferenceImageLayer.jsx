// A non-exported trace-over guide, display-only: deliberately excluded
// from composeLayersSvg/every export path (see Canvas.referenceImage).

export function ReferenceImageLayer({ referenceImage, width, height }) {
  return (
    <image
      href={referenceImage.dataUrl}
      x={0}
      y={0}
      width={width}
      height={height}
      opacity={referenceImage.opacity}
      preserveAspectRatio="none"
      pointerEvents="none"
    />
  );
}
