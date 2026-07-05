// The one place an actual <canvas> element exists in the app, purely as a
// rasterization target — draws already-composed SVG into an offscreen
// canvas at a chosen scale multiplier and reads it back out as a blob.
// PNG/WebP export, the sprite sheet (Phase 6), and animated GIF (Phase 6)
// all reuse this same single-frame rasterizer.

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('rasterizeFrame: failed to load composed SVG as an image'));
    image.src = url;
  });
}

/**
 * @param {string} svgMarkup a full <svg>...</svg> string (composeLayersSvg / pixelloom's gridToSvg)
 * @param {number} width unscaled, matching the SVG's viewBox
 * @param {number} height unscaled, matching the SVG's viewBox
 * @param {number} [scale] output size multiplier (1x/4x/8x/16x are the offered presets)
 * @param {'image/png'|'image/webp'} [mimeType]
 * @returns {Promise<Blob>}
 */
export async function rasterizeFrame(svgMarkup, width, height, scale = 1, mimeType = 'image/png') {
  const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false; // hard pixel edges, not a blurred scale-up
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('rasterizeFrame: canvas.toBlob produced no blob'))), mimeType);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
