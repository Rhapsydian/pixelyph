// Symmetry/mirror drawing: a pure coordinate transform, applied uniformly
// by whichever tool is active (pencil, line, shapes, ...) rather than each
// tool special-casing it — a tool just asks "which cells does painting
// (x, y) actually touch" and paints all of them.
//
// 'x' mirrors across the vertical center line (reflects x — left/right
// symmetry), 'y' mirrors across the horizontal center line (reflects y —
// top/bottom symmetry), 'both' does either.

/**
 * @param {number} width canvas width
 * @param {number} height canvas height
 * @param {number} x
 * @param {number} y
 * @param {'none'|'x'|'y'|'both'} mode
 * @returns {{x:number,y:number}[]} deduplicated, always includes (x, y) itself
 */
export function mirrorPoints(width, height, x, y, mode) {
  const mirrorX = width - 1 - x;
  const mirrorY = height - 1 - y;
  const candidates = [{ x, y }];
  if (mode === 'x' || mode === 'both') candidates.push({ x: mirrorX, y });
  if (mode === 'y' || mode === 'both') candidates.push({ x, y: mirrorY });
  if (mode === 'both') candidates.push({ x: mirrorX, y: mirrorY });

  const seen = new Set();
  const result = [];
  for (const point of candidates) {
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(point);
  }
  return result;
}
