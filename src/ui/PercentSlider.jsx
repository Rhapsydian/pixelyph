// A 0–1 fraction, shown and edited as a whole-number percentage — a range
// slider paired with a directly-editable number input, kept in sync both
// ways. Used wherever the app has an opacity/alpha slider (layer opacity,
// color alpha, reference-image opacity) so the percentage is never just a
// read-only label.
//
// `onChange` fires on every interaction (slider drag tick or number edit) —
// callers that commit live (ColorAlphaInput, the reference-image opacity
// slider) just wire it straight to their setter. `onCommit` (defaults to
// `onChange`) fires only on mouseup/blur, for callers that intentionally
// defer committing until a drag ends (LayersPanel's per-layer opacity,
// which keeps its own local-state-until-release pattern — this component
// only supplies the display/edit widget, not that policy).

import { useEffect, useState } from 'react';

export function PercentSlider({ value, onChange, onCommit = onChange, title, sliderWidth = 60, numberWidth = 44 }) {
  const [percent, setPercent] = useState(Math.round(value * 100));

  useEffect(() => {
    setPercent(Math.round(value * 100));
  }, [value]);

  function handleSlider(e) {
    const next = Number(e.target.value);
    setPercent(next);
    onChange(next / 100);
  }

  function handleNumber(e) {
    const next = Math.max(0, Math.min(100, Number(e.target.value)));
    setPercent(next);
    onChange(next / 100);
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title={title}>
      <input type="range" min={0} max={100} value={percent} onChange={handleSlider} onMouseUp={() => onCommit(percent / 100)} style={{ width: sliderWidth }} />
      <input type="number" min={0} max={100} value={percent} onChange={handleNumber} onBlur={() => onCommit(percent / 100)} style={{ width: numberWidth }} />
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--chrome-text-muted)' }}>%</span>
    </span>
  );
}
