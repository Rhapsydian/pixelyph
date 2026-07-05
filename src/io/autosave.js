// Session persistence shouldn't depend on remembering to hit save: a
// debounced snapshot of the current project (the same JSON-safe shape
// io/projectFile.js writes to disk) lands in IndexedDB in the web build,
// or an app-data file in the Electron build (Phase 5), restored
// automatically on next launch if no explicit file was opened. Explicit
// Save/Open remain the durable, shareable path — this is crash/tab-close
// recovery only.
//
// IndexedDB isn't reachable from plain `node --test` (no browser storage
// APIs there), so per the plan's testing policy this file is verified
// manually rather than automated, same as the rest of the UI layer.

import { isElectron } from './platform.js';

const DB_NAME = 'pixelyph-autosave';
const STORE_NAME = 'snapshots';
const SNAPSHOT_KEY = 'current';
const DEBOUNCE_MS = 2000;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeSnapshotIndexedDb(snapshot) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(snapshot, SNAPSHOT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function readSnapshotIndexedDb() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(SNAPSHOT_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function clearSnapshotIndexedDb() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(SNAPSHOT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** @param {object} snapshot a serialized project document (io/projectFile.js's serializeProject) */
export async function writeAutosave(snapshot) {
  if (isElectron()) return window.pixelyph.writeAutosave(snapshot);
  return writeSnapshotIndexedDb(snapshot);
}

/** @returns {Promise<object|null>} the last autosaved project document, if any */
export async function readAutosave() {
  if (isElectron()) return window.pixelyph.readAutosave();
  return readSnapshotIndexedDb();
}

/** Call after an explicit save/open, or once the user discards recovered work. */
export async function clearAutosave() {
  if (isElectron()) return window.pixelyph.clearAutosave();
  return clearSnapshotIndexedDb();
}

/**
 * Debounces autosave writes so rapid edits don't hammer IndexedDB — call
 * on every committed history action; the actual write lands DEBOUNCE_MS
 * after the last call.
 *
 * @returns {(snapshot: object) => void}
 */
export function createAutosaveScheduler() {
  let timer = null;
  return (snapshot) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      writeAutosave(snapshot).catch((err) => console.error('autosave failed', err));
    }, DEBOUNCE_MS);
  };
}
