import { pencilTool } from './pencil.js';
import { eraserTool } from './eraser.js';
import { bucketFillTool } from './bucketFill.js';
import { eyedropperTool } from './eyedropper.js';
import { lineTool } from './line.js';
import { rectangleTool } from './rectangle.js';
import { ellipseTool } from './ellipse.js';
import { marqueeSelectTool } from './marqueeSelect.js';

export const tools = {
  pencil: pencilTool,
  eraser: eraserTool,
  bucketFill: bucketFillTool,
  eyedropper: eyedropperTool,
  line: lineTool,
  rectangle: rectangleTool,
  ellipse: ellipseTool,
  marqueeSelect: marqueeSelectTool,
};

export const TOOL_NAMES = Object.keys(tools);
