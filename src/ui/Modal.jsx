// A small, reusable centered modal shell — dark backdrop, app-themed panel,
// Escape-to-close, click-outside-to-close. Callers supply their own content
// (including whatever confirm/close button makes sense for that modal) so
// this stays a pure layout/chrome component, not a dialog-with-opinions.
// `hidden` lets a caller temporarily hide the whole overlay without
// unmounting it — used by ColorAlphaInput's color-picker modal so the
// EyeDropper API's screen-sampling mode isn't blocked by our own backdrop.

import { useEffect } from 'react';

export function Modal({ title, onClose, children, hidden = false }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (hidden) return null;

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          background: 'var(--chrome-bg-panel)',
          border: '1px solid var(--chrome-border-strong)',
          borderRadius: 'var(--radius-md)',
          padding: 16,
          minWidth: 260,
          maxWidth: '90vw',
          maxHeight: '85vh',
          overflow: 'auto',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {title && <strong>{title}</strong>}
        {children}
      </div>
    </div>
  );
}
