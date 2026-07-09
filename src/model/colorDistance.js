// Shared hex-color helpers — extracted from importRaster.js (which had its
// own private hexToRgb) so bucketFill.js's tolerance matching can reuse the
// same conversion instead of duplicating it.

/** @returns {[number,number,number]} */
export function hexToRgb(hex) {
  const stripped = hex.replace('#', '');
  return [parseInt(stripped.slice(0, 2), 16), parseInt(stripped.slice(2, 4), 16), parseInt(stripped.slice(4, 6), 16)];
}

/** Squared Euclidean RGB distance — same metric importRaster.js's nearestPaletteIndex already uses. */
export function colorDistance(hexA, hexB) {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
}
