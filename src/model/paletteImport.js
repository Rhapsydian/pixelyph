// Parser for the community-standard Lospec `.hex` palette format (as
// exported by lospec.com): one #RRGGBB (or RRGGBB, no #) per line, blank
// lines allowed. Cheap, plugs straight into Canvas.palette.

const HEX_LINE = /^#?([0-9a-fA-F]{6})$/;

/**
 * @param {string} text raw contents of a Lospec .hex file
 * @returns {string[]} palette colors as '#rrggbb', invalid/blank lines skipped
 */
export function parseLospecPalette(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.match(HEX_LINE))
    .filter(Boolean)
    .map((match) => `#${match[1].toLowerCase()}`);
}
