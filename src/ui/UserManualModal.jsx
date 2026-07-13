// Help > User Manual. Topic content is plain markdown files under
// public/manual/ — fetched at runtime rather than bundled as JS modules, so
// they're just as easy to read straight from GitHub as they are in-app (see
// docs/README.md). Relative paths (no leading "/") are used throughout so
// they resolve correctly under all three ways this app is served: the web
// build's GitHub Pages subpath, the local dev server's root, and Electron's
// packaged file:// load — see electron.vite.config.mjs's `base: './'`.
//
// Last-viewed topic and scroll position persist to localStorage (not the
// autosave.js/IPC mechanism the rest of the app uses for project content —
// this is UI state, not project data, and localStorage is available in the
// Electron renderer too since it's just a normal Chromium page).

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '../state/store.js';
import { Modal, ModalFooter } from './Modal.jsx';
import { openExternalUrl } from '../io/platform.js';

const TOPICS = [
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'draw-mode', label: 'Draw Mode' },
  { id: 'glyph-mode', label: 'Glyph Mode' },
  { id: 'animation', label: 'Animation' },
  { id: 'export', label: 'Export' },
  { id: 'keyboard-shortcuts', label: 'Keyboard Shortcuts' },
];
const TOPIC_IDS = new Set(TOPICS.map((t) => t.id));
const DEFAULT_TOPIC = TOPICS[0].id;

const STORAGE_KEY = 'pixelyph-manual-state';

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePersisted(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Best-effort — losing the "resume where you left off" nicety isn't worth surfacing an error for.
  }
}

/** Internal manual links (e.g. "draw-mode.md") switch topic in-app; anything else opens in a real browser. */
function ManualLink({ href, children, onNavigate }) {
  const topicId = href?.replace(/\.md$/, '');
  if (topicId && TOPIC_IDS.has(topicId)) {
    return (
      <a href={href} onClick={(e) => { e.preventDefault(); onNavigate(topicId); }}>
        {children}
      </a>
    );
  }
  return (
    <a href={href} onClick={(e) => { e.preventDefault(); openExternalUrl(href); }}>
      {children}
    </a>
  );
}

/** Markdown image paths are written relative to public/manual/ (so they also resolve on GitHub); rewrite them to the actual served path. */
function ManualImage({ src, alt }) {
  return <img src={`manual/${src}`} alt={alt} style={{ maxWidth: '100%' }} />;
}

export function UserManualModal() {
  const open = useStore((s) => s.userManualOpen);
  const setOpen = useStore((s) => s.setUserManualOpen);
  const [topic, setTopic] = useState(DEFAULT_TOPIC);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const contentRef = useRef(null);
  const pendingScrollRestore = useRef(null);

  // On open, resume the last-viewed topic (and queue its scroll position to
  // restore once that topic's content has loaded below).
  useEffect(() => {
    if (!open) return;
    const persisted = loadPersisted();
    if (persisted?.topic && TOPIC_IDS.has(persisted.topic)) {
      setTopic(persisted.topic);
      pendingScrollRestore.current = persisted.scrollTop ?? 0;
    } else {
      pendingScrollRestore.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetch(`manual/${topic}.md`)
      .then((res) => res.text())
      .then((text) => {
        if (cancelled) return;
        setContent(text);
        setLoading(false);
        // Restore scroll only right after a fetch completes, once the new
        // content is actually in the DOM to scroll within.
        requestAnimationFrame(() => {
          if (contentRef.current && pendingScrollRestore.current != null) {
            contentRef.current.scrollTop = pendingScrollRestore.current;
            pendingScrollRestore.current = null;
          }
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open, topic]);

  function handleSelectTopic(nextTopic) {
    if (nextTopic === topic) return;
    setTopic(nextTopic);
    savePersisted({ topic: nextTopic, scrollTop: 0 });
  }

  function handleScroll() {
    savePersisted({ topic, scrollTop: contentRef.current?.scrollTop ?? 0 });
  }

  if (!open) return null;

  return (
    <Modal title="Pixelyph User Manual" onClose={() => setOpen(false)}>
      <div style={{ display: 'flex', width: '76vw', height: '68vh' }}>
        <nav style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--chrome-border)', overflowY: 'auto', paddingRight: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {TOPICS.map((t) => (
            <button
              key={t.id}
              onClick={() => handleSelectTopic(t.id)}
              style={{
                textAlign: 'left',
                background: t.id === topic ? 'var(--chrome-bg-raised)' : 'transparent',
                color: t.id === topic ? 'var(--chrome-accent)' : 'var(--chrome-text-muted)',
                border: 'none',
                borderRadius: 'var(--radius-sm, 4px)',
                padding: '6px 8px',
                cursor: 'pointer',
                fontSize: 'var(--text-sm)',
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div ref={contentRef} onScroll={handleScroll} className="manual-content" style={{ flex: 1, overflowY: 'auto', paddingLeft: 20 }}>
          {loading ? (
            <p>Loading…</p>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: (props) => <ManualLink {...props} onNavigate={handleSelectTopic} />,
                img: ManualImage,
              }}
            >
              {content}
            </ReactMarkdown>
          )}
        </div>
      </div>
      <ModalFooter>
        <button className="btn" onClick={() => setOpen(false)}>Close</button>
      </ModalFooter>
    </Modal>
  );
}
