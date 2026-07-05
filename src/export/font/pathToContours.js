// Pixelloom only exports the serialized `d` string (not raw contour points),
// so font compilation needs a small exact parser back to point arrays.
// Pixelloom's `d` output only ever uses M/H/V/h/v/Z, always on integer grid
// coordinates (see the pixelloom README's own worked example) — this parser
// only needs to handle that fixed subset, not general SVG path syntax.

/**
 * @param {string} d a pixelloom `gridToPath` output string
 * @returns {{x:number,y:number}[][]} one array of points per closed loop, in
 *   the same winding pixelloom traced them (outer CW, holes CCW, grid space)
 */
export function pathToContours(d) {
  const commands = d.match(/[MHVZ][^MHVZ]*/gi) ?? [];
  const contours = [];
  let current = null;
  let x = 0;
  let y = 0;

  for (const command of commands) {
    const type = command[0];
    const args = command.slice(1).trim();
    switch (type) {
      case 'M': {
        const [nx, ny] = args.split(/\s+/).map(Number);
        x = nx;
        y = ny;
        current = [{ x, y }];
        contours.push(current);
        break;
      }
      case 'H':
        x = Number(args);
        current.push({ x, y });
        break;
      case 'h':
        x += Number(args);
        current.push({ x, y });
        break;
      case 'V':
        y = Number(args);
        current.push({ x, y });
        break;
      case 'v':
        y += Number(args);
        current.push({ x, y });
        break;
      case 'Z':
      case 'z':
        // Closes back to the contour's start point, already the first
        // element — no new point to add.
        break;
      default:
        throw new Error(`Unexpected path command "${type}" — pixelloom only emits M/H/V/h/v/Z`);
    }
  }

  return contours;
}
