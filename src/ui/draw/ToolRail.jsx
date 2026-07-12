// Vertical icon-button strip, left edge — tool selection only (the
// Aseprite/Photopea convention: a vertical tool bar carries just tool
// identity, contextual options like tier/symmetry/zoom live in ContextBar
// instead). marqueeSelect works in both modes as of Phase 5 — the store's
// selection actions are mode-aware, so it's no longer Draw-mode-only.

import { useStore } from '../../state/store.js';
import { IconButton } from '../IconButton.jsx';
import { TOOL_NAMES } from './tools/index.js';
import {
  PencilIcon,
  EraserIcon,
  BucketIcon,
  EyedropperIcon,
  LineIcon,
  RectangleIcon,
  EllipseIcon,
  SelectIcon,
  SelectMoveIcon,
} from '../icons.jsx';

const TOOL_ICONS = {
  pencil: PencilIcon,
  eraser: EraserIcon,
  bucketFill: BucketIcon,
  eyedropper: EyedropperIcon,
  line: LineIcon,
  rectangle: RectangleIcon,
  ellipse: EllipseIcon,
  marqueeSelect: SelectIcon,
  selectMove: SelectMoveIcon,
};

const TOOL_LABELS = {
  pencil: 'Pencil',
  eraser: 'Eraser',
  bucketFill: 'Bucket Fill',
  eyedropper: 'Eyedropper',
  line: 'Line',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  marqueeSelect: 'Select',
  selectMove: 'Move',
};

export function ToolRail() {
  const activeTool = useStore((s) => s.activeTool);
  const setActiveTool = useStore((s) => s.setActiveTool);

  return (
    <div className="tool-rail">
      {TOOL_NAMES.map((name) => {
        const Icon = TOOL_ICONS[name];
        return (
          <IconButton
            key={name}
            icon={<Icon />}
            label={TOOL_LABELS[name]}
            active={activeTool === name}
            onClick={() => setActiveTool(name)}
          />
        );
      })}
    </div>
  );
}
