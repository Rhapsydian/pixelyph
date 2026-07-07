// Electron main process. Owns the BrowserWindow and the IPC handlers that
// back src/io/platform.js's isElectron() branch (save/open through native
// dialogs) and src/io/autosave.js's Electron branch (an app-data file
// instead of IndexedDB). Everything else — composeLayersSvg, compileFont,
// the whole UI — is the same code running in the web build; this file and
// electron/preload/index.js are the only Electron-specific surface.

import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import { join, extname, basename } from 'node:path';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';

// electron-vite bundles main as an ES module but still shims __dirname
// (via import.meta.dirname) for exactly this kind of path-join code.
const AUTOSAVE_FILENAME = 'autosave.json';

function autosavePath() {
  return join(app.getPath('userData'), AUTOSAVE_FILENAME);
}

const FILTER_LABELS = {
  pixelyph: 'Pixelyph Project',
  svg: 'SVG Image',
  png: 'PNG Image',
  webp: 'WebP Image',
  zip: 'Zip Archive',
};

/** @param {string} ext e.g. '.pixelyph' */
function filtersForExtension(ext) {
  const clean = ext.replace(/^\./, '').toLowerCase();
  if (!clean) return [{ name: 'All Files', extensions: ['*'] }];
  return [
    { name: FILTER_LABELS[clean] || `${clean.toUpperCase()} File`, extensions: [clean] },
    { name: 'All Files', extensions: ['*'] },
  ];
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  // electron-vite sets this during `electron-vite dev` so the window loads
  // the dev server (with HMR) instead of a built file.
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

ipcMain.handle('pixelyph:save-file', async (event, filename, arrayBuffer) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: filename,
    filters: filtersForExtension(extname(filename)),
  });
  if (canceled || !filePath) return;
  await writeFile(filePath, Buffer.from(arrayBuffer));
});

ipcMain.handle('pixelyph:open-file', async (event, accept) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: filtersForExtension(accept || ''),
  });
  if (canceled || filePaths.length === 0) return null;
  const filePath = filePaths[0];
  const buffer = await readFile(filePath);
  return { name: basename(filePath), data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) };
});

ipcMain.handle('pixelyph:write-autosave', async (_event, snapshot) => {
  await writeFile(autosavePath(), JSON.stringify(snapshot), 'utf-8');
});

ipcMain.handle('pixelyph:read-autosave', async () => {
  if (!existsSync(autosavePath())) return null;
  const text = await readFile(autosavePath(), 'utf-8');
  return JSON.parse(text);
});

ipcMain.handle('pixelyph:clear-autosave', async () => {
  if (existsSync(autosavePath())) await unlink(autosavePath());
});

// Help menu's "Visit on GitHub" — opens the user's actual default browser,
// not a second BrowserWindow loading the URL inside the app itself.
ipcMain.handle('pixelyph:open-external', async (_event, url) => {
  await shell.openExternal(url);
});

app.whenReady().then(() => {
  // The app has its own DOM-based File menu (src/ui/FileMenu.jsx) so the
  // same UI works identically in the web build, which has no native menu
  // at all — Electron's default File/Edit/View/Window/Help menu bar would
  // just be a second, inconsistent, and largely non-functional menu.
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
