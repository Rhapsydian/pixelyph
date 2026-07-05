// "Copy as SVG" — writes both image/svg+xml (Illustrator/Inkscape/Affinity
// paste reliably; Figma is inconsistent) and a text/plain fallback of the
// same markup, identical code path in web and Electron renderer.

/**
 * @param {string} svgMarkup
 * @returns {Promise<void>}
 */
export async function copySvgToClipboard(svgMarkup) {
  const item = new ClipboardItem({
    'image/svg+xml': new Blob([svgMarkup], { type: 'image/svg+xml' }),
    'text/plain': new Blob([svgMarkup], { type: 'text/plain' }),
  });
  await navigator.clipboard.write([item]);
}
