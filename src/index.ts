/**
 * Public entry point of `@trysac/whiteboard-engine`.
 *
 * Provides a headless whiteboard engine with LWW register per-field replication,
 * camera zoom/pan transforms, 256-unit uniform grid spatial indexing for hit-testing,
 * box selection, local undo/redo, and deterministic SVG export.
 */

export { Camera } from "./camera.js";
export { WhiteboardError, type WhiteboardErrorCode } from "./errors.js";
export { exportSvg, formatSvgNumber } from "./svg.js";
export type {
  EllipseShape,
  EllipseShapeInput,
  ExportSvgOptions,
  LamportClock,
  LineShape,
  LineShapeInput,
  Op,
  OpField,
  OpValue,
  PathShape,
  PathShapeInput,
  Point,
  Rect,
  RectShape,
  RectShapeInput,
  Shape,
  ShapeInput,
  ShapePatch,
  ShapeType,
  WhiteboardOptions,
  WhiteboardStats,
} from "./types.js";
export { compareClocks, hitTest, selectInRect, Whiteboard } from "./whiteboard.js";
