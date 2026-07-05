// Starter codepoint presets for character-kind GlyphSets (CharacterMapPanel).
// Each preset is a pure function of codepoints — no glyph data, just "which
// cells should the character-map grid show."

function range(start, end) {
  const codepoints = [];
  for (let cp = start; cp <= end; cp++) codepoints.push(cp);
  return codepoints;
}

export const CHARSET_PRESETS = {
  'basic-latin': { label: 'Basic Latin (ASCII printable)', codepoints: () => range(0x20, 0x7e) },
  'latin-1-supplement': { label: 'Latin-1 Supplement', codepoints: () => range(0xa0, 0xff) },
  digits: { label: 'Digits (0-9)', codepoints: () => range(0x30, 0x39) },
};

export const CHARSET_PRESET_IDS = Object.keys(CHARSET_PRESETS);

/** @returns {number[]} the codepoints in `presetId`, or [] for an unknown/'custom' id. */
export function presetCodepoints(presetId) {
  const preset = CHARSET_PRESETS[presetId];
  return preset ? preset.codepoints() : [];
}
