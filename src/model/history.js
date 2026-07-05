// A capped stack of full document snapshots, generic over "whatever
// document is currently open" (a Canvas in Draw mode, a GlyphSet in Glyph
// mode) — both are plain cloneable data (Uint8Arrays + JSON-safe metadata,
// plus a Map for Canvas.simpleTier), so one snapshot-stack implementation
// serves either. Callers decide *what* counts as a snapshot: pass only the
// fields that constitute the artwork (for Canvas: layers/width/height/
// palette/tier) and leave out working-session state like symmetryMode or
// referenceImage, so undo/redo never touches those.

const DEFAULT_CAPACITY = 50;

/**
 * @param {object} initialSnapshot
 * @param {number} [capacity]
 * @returns {{ stack: object[], index: number, capacity: number }}
 */
export function createHistory(initialSnapshot, capacity = DEFAULT_CAPACITY) {
  return { stack: [structuredClone(initialSnapshot)], index: 0, capacity };
}

/**
 * Pushes a new snapshot as the current position, discarding any redo
 * entries beyond it, and dropping the oldest entry once over capacity.
 *
 * @param {{ stack: object[], index: number, capacity: number }} history
 * @param {object} snapshot
 */
export function pushSnapshot(history, snapshot) {
  history.stack = history.stack.slice(0, history.index + 1);
  history.stack.push(structuredClone(snapshot));
  if (history.stack.length > history.capacity) history.stack.shift();
  history.index = history.stack.length - 1;
}

/** @returns {boolean} */
export function canUndo(history) {
  return history.index > 0;
}

/** @returns {boolean} */
export function canRedo(history) {
  return history.index < history.stack.length - 1;
}

/** @returns {object|null} the prior snapshot (cloned), or null if nothing to undo */
export function undo(history) {
  if (!canUndo(history)) return null;
  history.index--;
  return structuredClone(history.stack[history.index]);
}

/** @returns {object|null} the next snapshot (cloned), or null if nothing to redo */
export function redo(history) {
  if (!canRedo(history)) return null;
  history.index++;
  return structuredClone(history.stack[history.index]);
}
