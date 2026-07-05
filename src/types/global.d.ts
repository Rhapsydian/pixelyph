// Ambient gaps this project's default TS lib doesn't cover: the File
// System Access API (not yet in lib.dom.d.ts for this TS version) and
// `window.pixelyph`, the contextBridge surface Phase 5's Electron preload
// script will expose (see io/platform.js, io/autosave.js).
export {};

declare global {
  interface Window {
    pixelyph?: {
      saveFile(filename: string, data: ArrayBuffer): Promise<void>;
      openFile(accept?: string): Promise<{ name: string; data: ArrayBuffer } | null>;
      writeAutosave(snapshot: object): Promise<void>;
      readAutosave(): Promise<object | null>;
      clearAutosave(): Promise<void>;
    };
    showSaveFilePicker(options?: { suggestedName?: string }): Promise<FileSystemFileHandle>;
    showOpenFilePicker(options?: { types?: { accept: Record<string, string[]> }[] }): Promise<FileSystemFileHandle[]>;
  }

  interface FileSystemFileHandle {
    getFile(): Promise<File>;
    createWritable(): Promise<FileSystemWritableFileStream>;
  }

  interface FileSystemWritableFileStream {
    write(data: Blob | BufferSource | string): Promise<void>;
    close(): Promise<void>;
  }
}
