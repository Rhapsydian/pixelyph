// Shared drag-to-resize behavior for the frame strip's height and the side
// panel's width — same logic either way (track pointer movement along one
// axis, clamp to [min, max]), just parameterized by axis and drag direction.

import { useCallback, useRef, useState } from 'react';

/**
 * @param {object} opts
 * @param {number} opts.initial starting size in px
 * @param {number} opts.min
 * @param {number} opts.max
 * @param {'x'|'y'} [opts.axis] which pointer coordinate drives the resize
 * @param {boolean} [opts.invert] true when dragging toward the panel's own
 *   docked edge should *grow* it (e.g. a bottom-docked panel's handle on its
 *   top edge, or a right-docked panel's handle on its left edge)
 * @returns {[number, (evt: PointerEvent) => void]} current size, and the
 *   pointerdown handler to attach to the drag handle element
 */
export function useResizeDrag({ initial, min, max, axis = 'y', invert = false }) {
  const [size, setSize] = useState(initial);
  const dragRef = useRef(null);

  const onHandlePointerDown = useCallback(
    (evt) => {
      evt.preventDefault();
      dragRef.current = { startPos: axis === 'y' ? evt.clientY : evt.clientX, startSize: size };

      function onMove(moveEvt) {
        const pos = axis === 'y' ? moveEvt.clientY : moveEvt.clientX;
        const delta = pos - dragRef.current.startPos;
        const signedDelta = invert ? -delta : delta;
        setSize(Math.max(min, Math.min(max, dragRef.current.startSize + signedDelta)));
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [axis, invert, min, max, size],
  );

  return [size, onHandlePointerDown];
}
