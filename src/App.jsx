import { gridToSvg } from 'pixelloom';

// Phase 0 scaffold sanity check: the exact 3x3 example from pixelloom's README,
// rendered here to confirm the dependency resolves and traces correctly.
const pixels = [
  true, true, true,
  true, false, true,
  true, true, true,
];

export default function App() {
  const svgMarkup = gridToSvg(pixels, 3, 3, { fill: '#6c4de6' });

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>Pixelyph</h1>
      <p>Phase 0 scaffold — pixelloom is wired up and tracing correctly below.</p>
      <div
        style={{ width: 96, height: 96 }}
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />
    </main>
  );
}
