// Tabbed side panel, mode/tier-aware — replaces the old stack of
// independent full-width bars (PalettePanel/ImportImagePanel/
// TilePreviewPanel/LayersPanel/LayerStylePanel in Draw mode;
// CharacterMapPanel/GlyphSetPanel/FontMetadataPanel/FontExportPanel in
// Glyph mode). Each tab renders the existing panel component unmodified in
// structure/behavior — this only changes how they're grouped and chromed.

import { useEffect } from 'react';
import { useStore } from '../state/store.js';
import { useResizeDrag } from './useResizeDrag.js';
import { ViewportPreview } from './ViewportPreview.jsx';
import { PalettePanel } from './draw/PalettePanel.jsx';
import { TilePreviewPanel } from './draw/TilePreviewPanel.jsx';
import { LayersPanel } from './draw/LayersPanel.jsx';
import { LayerStylePanel } from './draw/LayerStylePanel.jsx';
import { CharacterMapPanel } from './glyph/CharacterMapPanel.jsx';
import { GlyphSetPanel } from './glyph/GlyphSetPanel.jsx';
import { FontMetadataPanel } from './glyph/FontMetadataPanel.jsx';

function drawTabs(tier) {
  // Layers is available in both tiers (Pixel tier's layers are just
  // auto-managed instead of manually authored — see LayersPanel); Style
  // (manual fill/stroke/effects) stays Advanced/Shape-tier only.
  const tabs = [{ id: 'palette', label: 'Palette', Content: PalettePanel }];
  tabs.push({ id: 'layers', label: 'Layers', Content: LayersPanel });
  if (tier === 'advanced') {
    tabs.push({ id: 'style', label: 'Style', Content: LayerStylePanel });
  }
  tabs.push({ id: 'tile', label: 'Tile Preview', Content: TilePreviewPanel });
  return tabs;
}

function glyphTabs(kind) {
  const tabs = [];
  if (kind === 'characters') tabs.push({ id: 'characters', label: 'Characters', Content: CharacterMapPanel });
  tabs.push({ id: 'glyphs', label: 'Glyphs', Content: GlyphSetPanel });
  tabs.push({ id: 'font', label: 'Font', Content: FontMetadataPanel });
  return tabs;
}

export function SidePanel() {
  const mode = useStore((s) => s.mode);
  const tier = useStore((s) => s.canvas.tier);
  const glyphKind = useStore((s) => s.glyphSet?.kind);

  const tabs = mode === 'draw' ? drawTabs(tier) : glyphTabs(glyphKind);
  // Lifted to the store (not local state) so SvgPixelEditor can gate the
  // on-canvas gradient-angle handle on "the Style tab is actually visible".
  const activeTab = useStore((s) => s.sidePanelTab);
  const setActiveTab = useStore((s) => s.setSidePanelTab);
  // min/initial raised from 240/280: below ~340px the Layers tab's row
  // (thumbnail + eye/lock + name + opacity) doesn't fit on one line and the
  // opacity %-box wraps to a second row — 340 leaves a little headroom past
  // the measured minimum since the exact threshold shifts slightly with the
  // vertical scrollbar's width, which varies by OS/zoom.
  const [width, onHandlePointerDown] = useResizeDrag({ initial: 340, min: 340, max: 480, axis: 'x', invert: true });

  useEffect(() => {
    if (!tabs.some((t) => t.id === activeTab)) setActiveTab(tabs[0]?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tier, glyphKind]);

  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <div className="side-panel" style={{ width }}>
      <div className="resize-handle-col" onPointerDown={onHandlePointerDown} title="Drag to resize" />
      <div className="side-panel-content">
        <ViewportPreview />
        <div className="tab-bar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={tab.id === active?.id ? 'tab-button active' : 'tab-button'}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {active && <active.Content />}
      </div>
    </div>
  );
}
