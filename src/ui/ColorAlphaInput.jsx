// Color swatch + independent alpha slider, composing to/parsing from one
// #RRGGBB or #RRGGBBAA string. Native <input type="color"> has no alpha
// channel, but modern browsers parse 8-digit hex directly in SVG fill/
// stroke attributes (CSS Color 4) — so this needs no model change, only a
// richer string format. Falls back to plain 6-digit hex at full opacity so
// existing saved projects/solid colors round-trip unchanged.

function parseColor(value) {
  const hex = typeof value === 'string' ? value.trim() : '';
  if (/^#[0-9a-fA-F]{8}$/.test(hex)) {
    return { rgb: hex.slice(0, 7), alpha: parseInt(hex.slice(7, 9), 16) / 255 };
  }
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return { rgb: hex, alpha: 1 };
  }
  return { rgb: '#000000', alpha: 1 };
}

function composeColor(rgb, alpha) {
  if (alpha >= 1) return rgb;
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${rgb}${a}`;
}

export function ColorAlphaInput({ value, onChange, title }) {
  const { rgb, alpha } = parseColor(value);
  const alphaPercent = Math.round(alpha * 100);

  function handleRgbChange(e) {
    onChange(composeColor(e.target.value, alpha));
  }
  function handleAlphaChange(e) {
    onChange(composeColor(rgb, Number(e.target.value) / 100));
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title={title}>
      <input type="color" value={rgb} onChange={handleRgbChange} />
      <input
        type="range"
        min={0}
        max={100}
        value={alphaPercent}
        onChange={handleAlphaChange}
        style={{ width: 60 }}
        title="Alpha"
      />
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--chrome-text-muted)', minWidth: 30 }}>{alphaPercent}%</span>
    </span>
  );
}
