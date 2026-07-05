// DOM-dependent half of raster import: decodes a File/Blob into a plain
// RGBA typed array. Everything downstream (model/importRaster.js) is pure
// and tested with a hardcoded array instead of exercising this.

/**
 * @param {File|Blob} file
 * @returns {Promise<{width: number, height: number, data: Uint8ClampedArray}>}
 */
export async function decodeImageFile(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return { width: bitmap.width, height: bitmap.height, data };
}
