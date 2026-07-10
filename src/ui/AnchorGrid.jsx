// A 3x3 anchor picker — controlled component over the same 9-string anchor
// enum resizeCanvas/resizeActiveGlyph/resizeFontPixelsPerEm already accept
// (`anchorOffset` in model/Grid.js resolves any of these via substring
// match), so this is a drop-in replacement for the old plain <select> of
// the same 9 values, no translation layer needed. Modeled on
// TilePreviewPanel.jsx's CSS Grid usage (the only other grid layout in the
// app) for structure, and GradientEditorModal.jsx's selected-stop
// accent-border convention for the selected-cell styling.

const CELLS = [
  ['top-left', '◤'],
  ['top', '▲'],
  ['top-right', '◥'],
  ['left', '◀'],
  ['center', '●'],
  ['right', '▶'],
  ['bottom-left', '◣'],
  ['bottom', '▼'],
  ['bottom-right', '◢'],
];

export function AnchorGrid({ value, onChange }) {
  return (
    <div
      role="group"
      aria-label="Resize anchor"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 28px)',
        gridTemplateRows: 'repeat(3, 28px)',
        gap: 2,
      }}
    >
      {CELLS.map(([anchor, glyph]) => {
        const selected = anchor === value;
        return (
          <button
            key={anchor}
            type="button"
            title={anchor}
            aria-pressed={selected}
            onClick={() => onChange(anchor)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: selected ? '1px solid var(--chrome-accent)' : '1px solid var(--chrome-border)',
              background: selected ? 'var(--chrome-accent-soft)' : 'var(--chrome-bg-raised)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--chrome-text)',
              cursor: 'pointer',
              padding: 0,
              lineHeight: 1,
            }}
          >
            {glyph}
          </button>
        );
      })}
    </div>
  );
}
