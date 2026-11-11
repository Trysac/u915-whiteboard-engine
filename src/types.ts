/**
 * 2D point in world or screen coordinates.
 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Axis-aligned rectangle in world coordinates.
 */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Supported shape types.
 */
export type ShapeType = "rect" | "ellipse" | "line" | "path";

/**
 * Input for creating a rectangle shape.
 */
export interface RectShapeInput {
  readonly type: "rect";
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly stroke: string;
  readonly fill: string;
  readonly strokeWidth?: number;
}

/**
 * Input for creating an ellipse shape.
 */
export interface EllipseShapeInput {
  readonly type: "ellipse";
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly stroke: string;
  readonly fill: string;
  readonly strokeWidth?: number;
}

/**
 * Input for creating a line shape.
 */
export interface LineShapeInput {
  readonly type: "line";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly stroke: string;
  readonly strokeWidth?: number;
}

/**
 * Input for creating a multi-point path shape.
 */
export interface PathShapeInput {
  readonly type: "path";
  readonly points: readonly (readonly [number, number])[];
  readonly stroke: string;
  readonly strokeWidth?: number;
}

/**
 * Union of all shape creation inputs.
 */
export type ShapeInput = RectShapeInput | EllipseShapeInput | LineShapeInput | PathShapeInput;

/**
 * Patch object for updating an existing shape.
 */
export type ShapePatch = {
  readonly x?: number;
  readonly y?: number;
  readonly w?: number;
  readonly h?: number;
  readonly x1?: number;
  readonly y1?: number;
  readonly x2?: number;
  readonly y2?: number;
  readonly points?: readonly (readonly [number, number])[];
  readonly stroke?: string;
  readonly fill?: string;
  readonly strokeWidth?: number;
};

/**
 * Materialized rectangle shape.
 */
export interface RectShape {
  readonly id: string;
  readonly type: "rect";
  readonly z: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly stroke: string;
  readonly fill: string;
  readonly strokeWidth: number;
}

/**
 * Materialized ellipse shape.
 */
export interface EllipseShape {
  readonly id: string;
  readonly type: "ellipse";
  readonly z: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly stroke: string;
  readonly fill: string;
  readonly strokeWidth: number;
}

/**
 * Materialized line shape.
 */
export interface LineShape {
  readonly id: string;
  readonly type: "line";
  readonly z: number;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly stroke: string;
  readonly strokeWidth: number;
}

/**
 * Materialized path shape.
 */
export interface PathShape {
  readonly id: string;
  readonly type: "path";
  readonly z: number;
  readonly points: [number, number][];
  readonly stroke: string;
  readonly strokeWidth: number;
}

/**
 * Materialized live shape.
 */
export type Shape = RectShape | EllipseShape | LineShape | PathShape;

/**
 * Lamport clock tuple `[counter, clientId]`.
 */
export type LamportClock = readonly [counter: number, clientId: string];

/**
 * Allowed field names in replication operations.
 */
export type OpField =
  | "type"
  | "z"
  | "deleted"
  | "x"
  | "y"
  | "w"
  | "h"
  | "x1"
  | "y1"
  | "x2"
  | "y2"
  | "points"
  | "stroke"
  | "fill"
  | "strokeWidth";

/**
 * Allowed values in replication operations.
 */
export type OpValue = string | number | boolean | readonly (readonly [number, number])[];

/**
 * Replicated last-writer-wins field operation.
 */
export interface Op {
  readonly shapeId: string;
  readonly field: OpField;
  readonly value: OpValue;
  readonly clock: LamportClock;
}

/**
 * Configuration options for a `Whiteboard` instance.
 */
export interface WhiteboardOptions {
  readonly clientId: string;
  readonly maxShapes?: number;
  readonly maxHistory?: number;
  readonly onOps?: (ops: Op[]) => void;
}

/**
 * Diagnostic statistics for the board.
 */
export interface WhiteboardStats {
  readonly candidates: number;
}

/**
 * Options for SVG export.
 */
export interface ExportSvgOptions {
  readonly padding?: number;
}
