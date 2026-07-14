// Live specimen preview: a single, always-shown multi-line textarea (no
// more kind-gated textarea/icon-swatch split — every glyph, typed or
// auto-assigned, gets a click-to-insert swatch, matching demoHtml.js's own
// "every glyph gets a swatch, auto-assigned codepoints have no natural
// keystroke" convention) plus a hybrid preview-color model: one picker
// sets the color newly-inserted glyphs are stamped with; already-placed
// glyphs keep their own locked-in color until "Apply to all" overrides
// every one in a single action. Each row lays out left-to-right using the
// same glyphMetrics formula compileFont.js uses for real export, so
// "gapless tiling" is a font-metadata property (horizontalPadding/bearings
// set to 0), not a separate preview mode.

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store.js';
import { gridToPath } from 'pixelloom';
import { glyphMetrics } from '../../model/GlyphSet.js';
import { useResizeDrag } from '../useResizeDrag.js';
import { IconButton } from '../IconButton.jsx';
import { ColorAlphaInput } from '../ColorAlphaInput.jsx';
import { TrashIcon, ChevronDownIcon } from '../icons.jsx';

const PREVIEW_HEIGHT = 48;
const SWATCH_HEIGHT = 24;
const DEFAULT_PREVIEW_COLOR = '#eeeeee';
// Tall enough for the header + a 2-row textarea + one row of the (capped,
// independently-scrollable) insert-glyph swatches + the color row, with a
// sliver of the preview box itself still visible — same reasoning as
// FrameStrip's own MIN_HEIGHT.
const MIN_HEIGHT = 220;
const INITIAL_HEIGHT = 280;
const MAX_HEIGHT = 480;
// The insert-glyph row scrolls internally past this height instead of
// pushing the color row/preview box down — matters once a glyph set grows
// past a handful of entries (a full Basic Latin preset is 95 swatches).
const INSERT_ROW_MAX_HEIGHT = 140;

function ExpandCaret({ expanded }) {
  return (
    <span style={{ display: 'inline-flex', transform: expanded ? undefined : 'rotate(-90deg)' }}>
      <ChevronDownIcon size={12} />
    </span>
  );
}

function PreviewGlyph({ glyph, height, color = '#eee' }) {
  const scale = height / glyph.height;
  const width = glyph.width * scale;
  const d = gridToPath(glyph.pixels, glyph.width, glyph.height);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${glyph.width} ${glyph.height}`} style={{ display: 'block', flexShrink: 0 }}>
      {d && <path d={d} fill={color} fillRule="evenodd" />}
    </svg>
  );
}

/** Common-prefix/common-suffix diff: the unchanged head/tail of `text` keep their existing colors; whatever changed in between (typed, pasted, or deleted) becomes `insertedCount` fresh copies of `fillColor`. */
function diffColors(oldChars, newChars, oldColors, fillColor) {
  let prefix = 0;
  const maxPrefix = Math.min(oldChars.length, newChars.length);
  while (prefix < maxPrefix && oldChars[prefix] === newChars[prefix]) prefix++;
  let suffix = 0;
  const maxSuffix = Math.min(oldChars.length - prefix, newChars.length - prefix);
  while (suffix < maxSuffix && oldChars[oldChars.length - 1 - suffix] === newChars[newChars.length - 1 - suffix]) suffix++;
  const insertedCount = newChars.length - prefix - suffix;
  return [
    ...oldColors.slice(0, prefix),
    ...Array(insertedCount).fill(fillColor),
    ...(suffix > 0 ? oldColors.slice(oldColors.length - suffix) : []),
  ];
}

/** Splits `chars`/`colors` (already zipped) into rows on '\n', then lays each row out left-to-right in scaled pixel units via glyphMetrics — absolute pen-position math, not flexbox gap, so a font whose bearings/padding are 0 actually renders with touching glyphs. */
function layoutRows(chars, colors, glyphSet, scale) {
  const rows = [[]];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '\n') { rows.push([]); continue; }
    rows[rows.length - 1].push({ char: chars[i], color: colors[i] });
  }
  return rows.map((row) => {
    let penX = 0;
    const items = row.map(({ char, color }) => {
      const codepoint = char.codePointAt(0);
      const glyph = glyphSet.glyphs.get(codepoint);
      if (glyph) {
        const { offsetX, advanceWidth } = glyphMetrics(glyphSet.meta, codepoint, glyph);
        const item = { key: `${codepoint}-${penX}`, glyph, color, x: (penX + offsetX) * scale };
        penX += advanceWidth;
        return item;
      }
      const fallbackAdvance = glyphSet.meta.pixelsPerEm * 0.5;
      const item = { key: `?-${penX}`, glyph: null, char, x: penX * scale, width: fallbackAdvance * scale };
      penX += fallbackAdvance;
      return item;
    });
    return { items, width: penX * scale };
  });
}

function glyphLabel(glyph, codepoint) {
  if (glyph.name) return glyph.name;
  return `U+${codepoint.toString(16).toUpperCase()}`;
}

export function SpecimenPreviewPanel() {
  const glyphSet = useStore((s) => s.glyphSet);
  const [text, setText] = useState('');
  const [colors, setColors] = useState(/** @type {string[]} */ ([]));
  const [previewColor, setPreviewColor] = useState(DEFAULT_PREVIEW_COLOR);
  const [collapsed, setCollapsed] = useState(false);
  const [height, onHandlePointerDown] = useResizeDrag({ initial: INITIAL_HEIGHT, min: MIN_HEIGHT, max: MAX_HEIGHT, axis: 'y', invert: true });
  const textareaRef = useRef(null);
  const pendingCursorRef = useRef(null);

  // Restores focus/cursor after a swatch-click inserts at a specific
  // position — has to run post-render since the textarea's DOM value
  // only reflects the new `text` once React commits it.
  useEffect(() => {
    if (pendingCursorRef.current == null) return;
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(pendingCursorRef.current, pendingCursorRef.current);
    }
    pendingCursorRef.current = null;
  }, [text]);

  if (!glyphSet) return null;

  function updateText(nextText) {
    const oldChars = Array.from(text);
    const newChars = Array.from(nextText);
    setColors(diffColors(oldChars, newChars, colors, previewColor));
    setText(nextText);
  }

  /** Inserts `char` at the textarea's current cursor position (replacing any active selection), rather than always appending at the end. */
  function insertAtCursor(char) {
    const el = textareaRef.current;
    const start = el ? el.selectionStart : text.length;
    const end = el ? el.selectionEnd : text.length;
    pendingCursorRef.current = start + char.length;
    updateText(text.slice(0, start) + char + text.slice(end));
  }

  function clearPreview() {
    setText('');
    setColors([]);
  }

  function applyColorToAll() {
    setColors((prev) => prev.map(() => previewColor));
  }

  const scale = PREVIEW_HEIGHT / glyphSet.meta.pixelsPerEm;
  const rows = layoutRows(Array.from(text), colors, glyphSet, scale);
  const sortedGlyphs = Array.from(glyphSet.glyphs.entries()).sort((a, b) => a[0] - b[0]);

  return (
    <div className="canvas-region-stretch" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {!collapsed && <div className="resize-handle-row" onPointerDown={onHandlePointerDown} title="Drag to resize" />}
      <div
        className="panel"
        style={{
          height: collapsed ? undefined : height,
          minHeight: collapsed ? undefined : MIN_HEIGHT,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          background: 'var(--chrome-bg-panel)',
          borderTop: '1px solid var(--chrome-border)',
          borderLeft: '1px solid var(--chrome-border)',
          borderRight: '1px solid var(--chrome-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <IconButton
            icon={<ExpandCaret expanded={!collapsed} />}
            label={collapsed ? 'Expand Specimen Preview' : 'Collapse Specimen Preview'}
            onClick={() => setCollapsed((c) => !c)}
          />
          <strong>Specimen Preview</strong>
        </div>
        {!collapsed && (
          <>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => updateText(e.target.value)}
              placeholder="Type a sample string..."
              rows={2}
              style={{ width: '100%', resize: 'vertical', flexShrink: 0 }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', alignContent: 'flex-start', gap: 4, maxHeight: INSERT_ROW_MAX_HEIGHT, overflowY: 'auto', flex: '0 1 auto', minHeight: 0 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--chrome-text-muted)', alignSelf: 'center' }}>Insert glyph:</span>
              {sortedGlyphs.map(([codepoint, glyph]) => (
                <button
                  key={codepoint}
                  title={glyphLabel(glyph, codepoint)}
                  onClick={() => insertAtCursor(String.fromCodePoint(codepoint))}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: 4 }}
                >
                  <PreviewGlyph glyph={glyph} height={SWATCH_HEIGHT} color="var(--chrome-text)" />
                  <span style={{ fontSize: 9 }}>{glyphLabel(glyph, codepoint)}</span>
                </button>
              ))}
              {sortedGlyphs.length === 0 && <span style={{ color: 'var(--chrome-text-muted)', fontSize: 'var(--text-xs)' }}>No glyphs yet.</span>}
              <IconButton icon={<TrashIcon />} label="Clear preview" disabled={text.length === 0} onClick={clearPreview} style={{ alignSelf: 'center' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--chrome-text-muted)' }}>Preview color:</span>
              <ColorAlphaInput value={previewColor} onChange={setPreviewColor} title="Color newly-inserted preview glyphs are stamped with" />
              <button onClick={applyColorToAll} disabled={colors.length === 0} title="Recolor every glyph already in the preview to the current color">
                Apply to all
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 4, background: 'var(--chrome-bg-app)', border: '1px solid var(--chrome-border)', overflow: 'auto', flex: 1, minHeight: PREVIEW_HEIGHT + 8 }}>
              {text.length === 0 && <span style={{ color: 'var(--chrome-text-faint)' }}>Preview will appear here.</span>}
              {text.length > 0 && rows.map((row, i) => (
                <div key={i} style={{ position: 'relative', height: PREVIEW_HEIGHT, width: Math.max(row.width, 1), flexShrink: 0 }}>
                  {row.items.map((item) =>
                    item.glyph ? (
                      <div key={item.key} style={{ position: 'absolute', left: item.x, bottom: 0 }}>
                        <PreviewGlyph glyph={item.glyph} height={PREVIEW_HEIGHT} color={item.color} />
                      </div>
                    ) : (
                      <span
                        key={item.key}
                        style={{ position: 'absolute', left: item.x, bottom: 0, width: item.width, textAlign: 'center', color: 'var(--chrome-text-faint)' }}
                      >
                        {item.char === ' ' ? ' ' : '?'}
                      </span>
                    ),
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
