// opentype.js ships two different builds with two different export shapes:
// the CJS build (package.json "main") wraps everything behind a `default`
// property, while the real ESM build (package.json "module") only has named
// exports (Font, Glyph, Path, ...) and no `default` at all. Plain
// `node --test` resolves the CJS build (so `import opentype from
// 'opentype.js'` works), while Vite's dependency pre-bundling resolves the
// ESM build (so the same default import throws "does not provide an export
// named 'default'"). A namespace import normalizes both shapes into one.
import * as opentypeNamespace from 'opentype.js';

export const opentype = opentypeNamespace.default ?? opentypeNamespace;
