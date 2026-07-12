import { pencilTool } from './pencil.js';
import { eraserTool } from './eraser.js';
import { bucketFillTool } from './bucketFill.js';
import { eyedropperTool } from './eyedropper.js';
import { lineTool } from './line.js';
import { rectangleTool } from './rectangle.js';
import { ellipseTool } from './ellipse.js';
import { marqueeSelectTool } from './marqueeSelect.js';
import { targetMoveTool } from './targetMove.js';

export const tools = {
  pencil: pencilTool,
  eraser: eraserTool,
  bucketFill: bucketFillTool,
  eyedropper: eyedropperTool,
  line: lineTool,
  rectangle: rectangleTool,
  ellipse: ellipseTool,
  marqueeSelect: marqueeSelectTool,
  targetMove: targetMoveTool,
};

export const TOOL_NAMES = Object.keys(tools);
