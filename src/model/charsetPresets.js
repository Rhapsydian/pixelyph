// Starter codepoint presets for character-kind GlyphSets (CharacterMapPanel).
// Each preset is a pure function of codepoints — no glyph data, just "which
// cells should the character-map grid show."

function range(start, end) {
  const codepoints = [];
  for (let cp = start; cp <= end; cp++) codepoints.push(cp);
  return codepoints;
}

// A curated, not exhaustive, list of commonly-used symbols spanning several
// Unicode blocks (General Punctuation, Currency Symbols, Arrows,
// Miscellaneous Symbols, Dingbats) — typographic marks, arrows, weather/
// smiley/star glyphs, the four card suits, music notes, and check/ballot
// marks. Deliberately not the full contents of any one block (e.g.
// Miscellaneous Symbols alone is 256 codepoints, most of them obscure);
// this is "what a general-purpose pixel font commonly wants," not a
// systematic block dump.
const SYMBOLS_CODEPOINTS = [
  0x2013, // – en dash
  0x2014, // — em dash
  0x2018, // ' left single quotation mark
  0x2019, // ' right single quotation mark
  0x201c, // " left double quotation mark
  0x201d, // " right double quotation mark
  0x2020, // † dagger
  0x2022, // • bullet
  0x2026, // … horizontal ellipsis
  0x20ac, // € euro sign
  0x2190, // ← leftwards arrow
  0x2191, // ↑ upwards arrow
  0x2192, // → rightwards arrow
  0x2193, // ↓ downwards arrow
  0x2600, // ☀ black sun with rays
  0x2601, // ☁ cloud
  0x2602, // ☂ umbrella
  0x2605, // ★ black star
  0x2606, // ☆ white star
  0x260e, // ☎ black telephone
  0x2614, // ☔ umbrella with rain drops
  0x2639, // ☹ white frowning face
  0x263a, // ☺ white smiling face
  0x2660, // ♠ black spade suit
  0x2663, // ♣ black club suit
  0x2665, // ♥ black heart suit
  0x2666, // ♦ black diamond suit
  0x266a, // ♪ eighth note
  0x266b, // ♫ beamed eighth notes
  0x2708, // ✈ airplane
  0x2709, // ✉ envelope
  0x2713, // ✓ check mark
  0x2714, // ✔ heavy check mark
  0x2717, // ✗ ballot x
  0x2718, // ✘ heavy ballot x
  0x2764, // ❤ heavy black heart
];

export const CHARSET_PRESETS = {
  'basic-latin': { label: 'Basic Latin (ASCII printable)', codepoints: () => range(0x20, 0x7e) },
  'latin-1-supplement': { label: 'Latin-1 Supplement', codepoints: () => range(0xa0, 0xff) },
  digits: { label: 'Digits (0-9)', codepoints: () => range(0x30, 0x39) },
  symbols: { label: 'Symbols (♠ ★ ✓ →)', codepoints: () => SYMBOLS_CODEPOINTS.slice() },
};

export const CHARSET_PRESET_IDS = Object.keys(CHARSET_PRESETS);

/** @returns {number[]} the codepoints in `presetId`, or [] for an unknown/'custom' id. */
export function presetCodepoints(presetId) {
  const preset = CHARSET_PRESETS[presetId];
  return preset ? preset.codepoints() : [];
}

/**
 * The deduplicated, ascending-sorted union of codepoints across every preset
 * in `presetIds` — the character-map grid's multi-select support. Presets
 * can already overlap (Digits' 0x30-0x39 sits entirely inside Basic Latin's
 * 0x20-0x7e), so a naive concatenation would show the same cell twice.
 * Unknown ids contribute nothing, matching `presetCodepoints`' own behavior.
 *
 * @param {string[]} presetIds
 * @returns {number[]}
 */
export function mergedPresetCodepoints(presetIds) {
  const set = new Set();
  for (const id of presetIds) {
    for (const cp of presetCodepoints(id)) set.add(cp);
  }
  return Array.from(set).sort((a, b) => a - b);
}
