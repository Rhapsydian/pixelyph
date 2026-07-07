// Shared fullscreen toggle — the standard Fullscreen API works unchanged in
// both the web build and Electron's renderer (no new IPC needed), so this is
// the one code path for both. Multiple call sites (the header button, the
// Window menu item) each get their own `isFullscreen` via the
// `fullscreenchange` event, so either one reflects state changed by the other
// (or by the browser's own Escape-to-exit handling).

import { useEffect, useState } from 'react';

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));

  useEffect(() => {
    function onChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  function toggleFullscreen() {
    // Both can reject (e.g. a browser/embedding context that disallows
    // fullscreen entirely) — swallow rather than let it surface as an
    // unhandled rejection; `isFullscreen` just stays whatever it already was.
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  return [isFullscreen, toggleFullscreen];
}
