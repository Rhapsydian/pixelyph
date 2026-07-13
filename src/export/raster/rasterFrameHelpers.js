// Shared by animatedRaster.js (GIF) and animatedPng.js (APNG): turns one
// animation frame into SVG markup, then decodes a rasterized blob of that
// markup back into a loadable <img> so its pixels can be read via canvas.

import { composeFrameBody } from '../svg/composeLayersSvg.js';

export function frameSvg(canvas, frameIndex) {
  const { body, defs } = composeFrameBody(canvas, frameIndex);
  const defsBlock = defs.length ? `<defs>${defs.join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas.width} ${canvas.height}">${defsBlock}${body}</svg>`;
}

export function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('rasterFrameHelpers: failed to decode a rasterized frame'));
    };
    image.src = url;
  });
}
