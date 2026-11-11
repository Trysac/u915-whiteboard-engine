import { WhiteboardError } from "./errors.js";
import type { Op, OpField, ShapeInput, ShapePatch, ShapeType } from "./types.js";

const COLOR_REGEX = /^#[0-9a-f]{6}$/;

export const MAX_BATCH_OPS = 10_000;
export const MAX_PATH_POINTS = 10_000;
export const MIN_PATH_POINTS = 2;
export const MAX_STROKE_WIDTH = 100;

export function isValidColor(val: unknown): val is string {
  return typeof val === "string" && (val === "none" || COLOR_REGEX.test(val));
}

export function isFiniteNumber(val: unknown): val is number {
  return typeof val === "number" && Number.isFinite(val);
}

export function isValidStrokeWidth(val: unknown): val is number {
  return isFiniteNumber(val) && val >= 0 && val <= MAX_STROKE_WIDTH;
}

export function isValidNonNegative(val: unknown): val is number {
  return isFiniteNumber(val) && val >= 0;
}

export function isValidPoints(val: unknown): val is readonly (readonly [number, number])[] {
  if (!Array.isArray(val)) {
    return false;
  }
  if (val.length < MIN_PATH_POINTS || val.length > MAX_PATH_POINTS) {
    return false;
  }
  for (let i = 0; i < val.length; i++) {
    const pt = val[i];
    if (!Array.isArray(pt) || pt.length !== 2 || !isFiniteNumber(pt[0]) || !isFiniteNumber(pt[1])) {
      return false;
    }
  }
  return true;
}

export function clonePoints(pts: readonly (readonly [number, number])[]): [number, number][] {
  return pts.map((p) => [p[0], p[1]]);
}

export function validateShapeInput(input: ShapeInput): void {
  if (typeof input !== "object" || input === null) {
    throw new WhiteboardError("invalid_shape", "Shape input must be an object");
  }
  const strokeWidth = input.strokeWidth ?? 1;
  if (!isValidStrokeWidth(strokeWidth)) {
    throw new WhiteboardError(
      "invalid_shape",
      "strokeWidth must be a finite number between 0 and 100",
    );
  }
  if (!isValidColor(input.stroke)) {
    throw new WhiteboardError("invalid_shape", "stroke must be lowercase #rrggbb or 'none'");
  }

  switch (input.type) {
    case "rect":
    case "ellipse": {
      if (
        !isFiniteNumber(input.x) ||
        !isFiniteNumber(input.y) ||
        !isValidNonNegative(input.w) ||
        !isValidNonNegative(input.h)
      ) {
        throw new WhiteboardError("invalid_shape", "x, y must be finite and w, h must be >= 0");
      }
      if (!isValidColor(input.fill)) {
        throw new WhiteboardError("invalid_shape", "fill must be lowercase #rrggbb or 'none'");
      }
      break;
    }
    case "line": {
      if (
        !isFiniteNumber(input.x1) ||
        !isFiniteNumber(input.y1) ||
        !isFiniteNumber(input.x2) ||
        !isFiniteNumber(input.y2)
      ) {
        throw new WhiteboardError("invalid_shape", "x1, y1, x2, y2 must be finite numbers");
      }
      break;
    }
    case "path": {
      if (!isValidPoints(input.points)) {
        throw new WhiteboardError(
          "invalid_shape",
          "points must be an array of 2..10000 finite [x, y] pairs",
        );
      }
      break;
    }
    default:
      throw new WhiteboardError("invalid_shape", "Unsupported shape type");
  }
}

const ALLOWED_PATCH_FIELDS: Readonly<Record<ShapeType, ReadonlySet<string>>> = {
  rect: new Set(["x", "y", "w", "h", "stroke", "fill", "strokeWidth"]),
  ellipse: new Set(["x", "y", "w", "h", "stroke", "fill", "strokeWidth"]),
  line: new Set(["x1", "y1", "x2", "y2", "stroke", "strokeWidth"]),
  path: new Set(["points", "stroke", "strokeWidth"]),
};

export function validateShapePatch(shapeType: ShapeType, patch: ShapePatch): OpField[] {
  if (typeof patch !== "object" || patch === null) {
    throw new WhiteboardError("invalid_shape", "Patch must be an object");
  }
  const allowed = ALLOWED_PATCH_FIELDS[shapeType];
  const keys = Object.keys(patch);
  const fields: OpField[] = [];

  for (const key of keys) {
    const val = (patch as Record<string, unknown>)[key];
    if (val === undefined) {
      continue;
    }
    if (!allowed.has(key)) {
      throw new WhiteboardError(
        "invalid_shape",
        `Field '${key}' is not valid for shape type '${shapeType}'`,
      );
    }
    if (!isValidFieldValue(key as OpField, val)) {
      throw new WhiteboardError("invalid_shape", `Invalid value for field '${key}'`);
    }
    fields.push(key as OpField);
  }
  return fields;
}

export function isValidFieldValue(field: OpField, val: unknown): boolean {
  switch (field) {
    case "type":
      return val === "rect" || val === "ellipse" || val === "line" || val === "path";
    case "z":
    case "x":
    case "y":
    case "x1":
    case "y1":
    case "x2":
    case "y2":
      return isFiniteNumber(val);
    case "w":
    case "h":
      return isValidNonNegative(val);
    case "strokeWidth":
      return isValidStrokeWidth(val);
    case "stroke":
    case "fill":
      return isValidColor(val);
    case "deleted":
      return typeof val === "boolean";
    case "points":
      return isValidPoints(val);
    default:
      return false;
  }
}

export function validateOp(op: unknown): asserts op is Op {
  if (typeof op !== "object" || op === null) {
    throw new WhiteboardError("invalid_op", "Operation must be an object");
  }
  const record = op as Record<string, unknown>;
  if (
    typeof record.shapeId !== "string" ||
    record.shapeId.length === 0 ||
    record.shapeId.length > 200
  ) {
    throw new WhiteboardError("invalid_op", "Invalid shapeId in op");
  }
  if (typeof record.field !== "string") {
    throw new WhiteboardError("invalid_op", "Invalid field in op");
  }
  if (!isValidFieldValue(record.field as OpField, record.value)) {
    throw new WhiteboardError("invalid_op", `Invalid value for op field '${record.field}'`);
  }
  const clock = record.clock;
  if (
    !Array.isArray(clock) ||
    clock.length !== 2 ||
    typeof clock[0] !== "number" ||
    !Number.isInteger(clock[0]) ||
    clock[0] < 1 ||
    typeof clock[1] !== "string" ||
    clock[1].length === 0 ||
    clock[1].length > 200
  ) {
    throw new WhiteboardError("invalid_op", "Invalid Lamport clock in op");
  }
}
