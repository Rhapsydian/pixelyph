// Single web-vs-electron platform abstraction. Phase 1 only implements the
// web side (File System Access API where available, download-link
// fallback otherwise); Phase 5 fills in the Electron branch over IPC.
// Every other file (composeLayersSvg, compileFont later, the whole UI)
// stays platform-agnostic and calls only these functions.

/** @returns {boolean} */
export function isElectron() {
  return typeof window !== 'undefined' && Boolean(window.pixelyph);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Saves `blob` as `filename`. Prefers the File System Access API's save
 * picker (lets the user pick/reuse a real path); falls back to a plain
 * download link anywhere that API isn't supported (Safari, Firefox).
 *
 * @param {string} filename
 * @param {Blob} blob
 */
export async function saveFile(filename, blob) {
  if (isElectron()) {
    await window.pixelyph.saveFile(filename, await blob.arrayBuffer());
    return;
  }
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: filename });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return; // user cancelled the picker
      // any other failure (e.g. a browser that half-implements the API) falls
      // through to the download-link path below rather than failing the save
    }
  }
  downloadBlob(filename, blob);
}

/**
 * Opens a user-picked file. Prefers the File System Access API's open
 * picker, falls back to a plain <input type="file">.
 *
 * @param {string} [accept] e.g. '.pixelyph' or 'image/*'
 * @returns {Promise<{ name: string, blob: Blob }|null>} null if the user cancelled
 */
export async function openFile(accept) {
  if (isElectron()) {
    const result = await window.pixelyph.openFile(accept);
    return result ? { name: result.name, blob: new Blob([result.data]) } : null;
  }
  if (typeof window.showOpenFilePicker === 'function') {
    try {
      const [handle] = await window.showOpenFilePicker(accept ? { types: [{ accept: { '*/*': [accept] } }] } : {});
      const file = await handle.getFile();
      return { name: file.name, blob: file };
    } catch (err) {
      if (err?.name === 'AbortError') return null;
      throw err;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, blob: file } : null);
    };
    input.click();
  });
}
