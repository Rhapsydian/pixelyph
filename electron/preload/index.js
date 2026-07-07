// Preload script: the only place window.pixelyph is defined. src/io/platform.js
// and src/io/autosave.js check `Boolean(window.pixelyph)` to decide whether
// they're running in Electron, then call these methods directly — so the
// shape here must match exactly what those two files already expect.

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('pixelyph', {
  /**
   * @param {string} filename
   * @param {ArrayBuffer} arrayBuffer
   */
  saveFile: (filename, arrayBuffer) => ipcRenderer.invoke('pixelyph:save-file', filename, arrayBuffer),

  /**
   * @param {string} [accept]
   * @returns {Promise<{name: string, data: ArrayBuffer}|null>}
   */
  openFile: (accept) => ipcRenderer.invoke('pixelyph:open-file', accept),

  /** @param {object} snapshot */
  writeAutosave: (snapshot) => ipcRenderer.invoke('pixelyph:write-autosave', snapshot),

  /** @returns {Promise<object|null>} */
  readAutosave: () => ipcRenderer.invoke('pixelyph:read-autosave'),

  clearAutosave: () => ipcRenderer.invoke('pixelyph:clear-autosave'),

  /** @param {string} url */
  openExternal: (url) => ipcRenderer.invoke('pixelyph:open-external', url),
});
