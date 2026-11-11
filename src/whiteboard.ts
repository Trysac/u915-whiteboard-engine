import type { Camera } from "./camera.js";
import { WhiteboardError } from "./errors.js";
import { getShapeExpandedBounds, getShapeRawBounds, hitTestShape } from "./geometry.js";
import { SpatialGrid } from "./grid.js";
import type {
  LamportClock,
  Op,
  OpField,
  OpValue,
  Point,
  Rect,
  Shape,
  ShapeInput,
  ShapePatch,
  ShapeType,
  WhiteboardOptions,
  WhiteboardStats,
} from "./types.js";
import {
  clonePoints,
  isFiniteNumber,
  MAX_BATCH_OPS,
  validateOp,
  validateShapeInput,
  validateShapePatch,
} from "./validation.js";

interface FieldRegister {
  value: OpValue;
  clock: LamportClock;
}

interface ShapeRecord {
  readonly id: string;
  readonly registers: Map<OpField, FieldRegister>;
}

interface HistoryDelta {
  readonly shapeId: string;
  readonly field: OpField;
  readonly prevValue: OpValue;
}

interface HistoryEntry {
  readonly deltas: HistoryDelta[];
}

/**
 * Compares two Lamport clocks `[counter, clientId]`.
 * Returns > 0 if `a > b`, < 0 if `a < b`, and 0 if equal.
 */
export function compareClocks(a: LamportClock, b: LamportClock): number {
  if (a[0] !== b[0]) {
    return a[0] - b[0];
  }
  if (a[1] < b[1]) {
    return -1;
  }
  if (a[1] > b[1]) {
    return 1;
  }
  return 0;
}

function cloneOpValue(val: OpValue): OpValue {
  if (Array.isArray(val)) {
    return clonePoints(val as readonly (readonly [number, number])[]);
  }
  return val;
}

function cloneOp(op: Op): Op {
  return {
    shapeId: op.shapeId,
    field: op.field,
    value: cloneOpValue(op.value),
    clock: [op.clock[0], op.clock[1]],
  };
}

/**
 * Headless whiteboard scene with per-field LWW-Element-Set replication,
 * incremental spatial grid indexing, and local undo/redo.
 */
export class Whiteboard {
  private readonly clientId: string;
  private readonly maxShapes: number;
  private readonly maxHistory: number;
  private readonly onOps: ((ops: Op[]) => void) | undefined;

  private shapeIdCounter = 0;
  private highestClock = 0;
  private readonly records = new Map<string, ShapeRecord>();
  private readonly liveShapes = new Map<string, Shape>();
  private readonly grid = new SpatialGrid();
  private readonly undoStack: HistoryEntry[] = [];
  private readonly redoStack: HistoryEntry[] = [];
  private lastCandidates = 0;

  public constructor(opts: WhiteboardOptions) {
    if (
      typeof opts !== "object" ||
      opts === null ||
      typeof opts.clientId !== "string" ||
      opts.clientId.trim() === "" ||
      opts.clientId.length > 100
    ) {
      throw new WhiteboardError("invalid_shape", "clientId must be a non-empty string");
    }
    this.clientId = opts.clientId;
    this.maxShapes = opts.maxShapes ?? 10_000;
    this.maxHistory = opts.maxHistory ?? 200;
    this.onOps = opts.onOps;
    if (!Number.isInteger(this.maxShapes) || this.maxShapes < 1) {
      throw new WhiteboardError("invalid_shape", "maxShapes must be a positive integer");
    }
    if (!Number.isInteger(this.maxHistory) || this.maxHistory < 0) {
      throw new WhiteboardError("invalid_shape", "maxHistory must be a non-negative integer");
    }
  }

  /**
   * Adds a new shape to the whiteboard and returns its generated ID (`<clientId>:<counter>`).
   */
  public addShape(s: ShapeInput): string {
    validateShapeInput(s);
    if (this.records.size >= this.maxShapes) {
      throw new WhiteboardError("too_many_shapes", "Maximum number of shapes reached");
    }

    this.shapeIdCounter += 1;
    const id = `${this.clientId}:${this.shapeIdCounter}`;
    const clock = this.nextClock();
    const z = this.computeMaxZ() + 1;
    const strokeWidth = s.strokeWidth ?? 1;

    const ops: Op[] = [
      { shapeId: id, field: "type", value: s.type, clock },
      { shapeId: id, field: "z", value: z, clock },
      { shapeId: id, field: "deleted", value: false, clock },
      { shapeId: id, field: "stroke", value: s.stroke, clock },
      { shapeId: id, field: "strokeWidth", value: strokeWidth, clock },
    ];

    switch (s.type) {
      case "rect":
      case "ellipse":
        ops.push(
          { shapeId: id, field: "x", value: s.x, clock },
          { shapeId: id, field: "y", value: s.y, clock },
          { shapeId: id, field: "w", value: s.w, clock },
          { shapeId: id, field: "h", value: s.h, clock },
          { shapeId: id, field: "fill", value: s.fill, clock },
        );
        break;
      case "line":
        ops.push(
          { shapeId: id, field: "x1", value: s.x1, clock },
          { shapeId: id, field: "y1", value: s.y1, clock },
          { shapeId: id, field: "x2", value: s.x2, clock },
          { shapeId: id, field: "y2", value: s.y2, clock },
        );
        break;
      case "path":
        ops.push({
          shapeId: id,
          field: "points",
          value: clonePoints(s.points),
          clock,
        });
        break;
    }

    this.applyBatchInternal(ops);
    this.pushUndoEntry([{ shapeId: id, field: "deleted", prevValue: true }]);
    this.redoStack.length = 0;
    this.emitOps(ops);
    return id;
  }

  /**
   * Updates fields of an existing live shape.
   */
  public updateShape(id: string, patch: Partial<ShapeInput>): void {
    const live = this.getRequiredLiveShape(id);
    const fields = validateShapePatch(live.type, patch as ShapePatch);
    if (fields.length === 0) {
      return;
    }

    const record = this.records.get(id);
    if (record === undefined) {
      throw new WhiteboardError("unknown_shape", `Shape '${id}' does not exist`);
    }
    const clock = this.nextClock();
    const ops: Op[] = [];
    const deltas: HistoryDelta[] = [];

    for (const field of fields) {
      const rawVal = (patch as Record<string, unknown>)[field] as OpValue;
      const nextValue = cloneOpValue(rawVal);
      const prevReg = record.registers.get(field);
      if (prevReg !== undefined) {
        deltas.push({
          shapeId: id,
          field,
          prevValue: cloneOpValue(prevReg.value),
        });
      }
      ops.push({ shapeId: id, field, value: nextValue, clock });
    }

    this.applyBatchInternal(ops);
    this.pushUndoEntry(deltas);
    this.redoStack.length = 0;
    this.emitOps(ops);
  }

  /**
   * Marks an existing live shape as deleted.
   */
  public deleteShape(id: string): void {
    this.getRequiredLiveShape(id);
    const clock = this.nextClock();
    const ops: Op[] = [{ shapeId: id, field: "deleted", value: true, clock }];
    this.applyBatchInternal(ops);
    this.pushUndoEntry([{ shapeId: id, field: "deleted", prevValue: false }]);
    this.redoStack.length = 0;
    this.emitOps(ops);
  }

  /**
   * Moves an existing live shape to the top of the z-order (`maxZ + 1`).
   */
  public bringToFront(id: string): void {
    const live = this.getRequiredLiveShape(id);
    const prevZ = live.z;
    const nextZ = this.computeMaxZ() + 1;
    const clock = this.nextClock();
    const ops: Op[] = [{ shapeId: id, field: "z", value: nextZ, clock }];
    this.applyBatchInternal(ops);
    this.pushUndoEntry([{ shapeId: id, field: "z", prevValue: prevZ }]);
    this.redoStack.length = 0;
    this.emitOps(ops);
  }

  /**
   * Validates and applies a batch of remote operations atomically.
   */
  public applyRemote(ops: Op[]): void {
    if (!Array.isArray(ops)) {
      throw new WhiteboardError("invalid_op", "ops must be an array");
    }
    if (ops.length > MAX_BATCH_OPS) {
      throw new WhiteboardError(
        "input_too_large",
        `Batch size ${ops.length} exceeds limit of ${MAX_BATCH_OPS}`,
      );
    }

    const newShapeIds = new Set<string>();
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      validateOp(op);
      if (!this.records.has(op.shapeId)) {
        newShapeIds.add(op.shapeId);
      }
    }

    if (this.records.size + newShapeIds.size > this.maxShapes) {
      throw new WhiteboardError("too_many_shapes", "Maximum number of shapes reached");
    }

    this.applyBatchInternal(ops);
  }

  /**
   * Reverts the most recent local action by emitting a new op batch with a fresh clock.
   */
  public undo(): boolean {
    const entry = this.undoStack.pop();
    if (entry === undefined) {
      return false;
    }
    const redoEntry = this.applyHistoryEntry(entry);
    this.redoStack.push(redoEntry);
    return true;
  }

  /**
   * Re-applies the most recently undone local action by emitting a new op batch.
   */
  public redo(): boolean {
    const entry = this.redoStack.pop();
    if (entry === undefined) {
      return false;
    }
    const undoEntry = this.applyHistoryEntry(entry);
    this.pushUndoEntry(undoEntry.deltas);
    return true;
  }

  /**
   * Returns all live (non-deleted) shapes ordered by `(z, id)` ascending.
   */
  public shapes(): Shape[] {
    const list = Array.from(this.liveShapes.values());
    list.sort(compareShapeOrder);
    return list.map(cloneShape);
  }

  /**
   * Returns statistics from the most recent `hitTest` call on this board.
   */
  public stats(): WhiteboardStats {
    return { candidates: this.lastCandidates };
  }

  /**
   * Internal helper used by `hitTest` to query the spatial grid and record candidate counts.
   * @internal
   */
  public performHitTest(camera: Camera, screenPoint: Point, tolerancePx = 4): string | null {
    if (
      !isFiniteNumber(screenPoint.x) ||
      !isFiniteNumber(screenPoint.y) ||
      !isFiniteNumber(tolerancePx) ||
      tolerancePx < 0
    ) {
      throw new WhiteboardError(
        "invalid_shape",
        "screenPoint must be finite and tolerancePx must be >= 0",
      );
    }
    const worldPoint = camera.screenToWorld(screenPoint);
    const worldTol = tolerancePx / camera.zoom;
    const queryBox = {
      minX: worldPoint.x - worldTol,
      minY: worldPoint.y - worldTol,
      maxX: worldPoint.x + worldTol,
      maxY: worldPoint.y + worldTol,
    };

    const candidateIds = this.grid.query(queryBox);
    const candidates: Shape[] = [];
    for (const id of candidateIds) {
      const shape = this.liveShapes.get(id);
      if (shape !== undefined) {
        candidates.push(shape);
      }
    }
    this.lastCandidates = candidates.length;

    // Sort topmost first: descending by (z, id)
    candidates.sort((a, b) => compareShapeOrder(b, a));

    for (const shape of candidates) {
      if (hitTestShape(shape, worldPoint, worldTol)) {
        return shape.id;
      }
    }
    return null;
  }

  /**
   * Internal helper used by `selectInRect`.
   * @internal
   */
  public performSelectInRect(worldRect: Rect): string[] {
    if (
      typeof worldRect !== "object" ||
      worldRect === null ||
      !isFiniteNumber(worldRect.x) ||
      !isFiniteNumber(worldRect.y) ||
      !isFiniteNumber(worldRect.w) ||
      !isFiniteNumber(worldRect.h) ||
      worldRect.w < 0 ||
      worldRect.h < 0
    ) {
      throw new WhiteboardError(
        "invalid_shape",
        "worldRect must have finite x, y and non-negative w, h",
      );
    }
    const rMinX = worldRect.x;
    const rMinY = worldRect.y;
    const rMaxX = worldRect.x + worldRect.w;
    const rMaxY = worldRect.y + worldRect.h;

    const matched: Shape[] = [];
    for (const shape of this.liveShapes.values()) {
      const bounds = getShapeRawBounds(shape);
      if (
        bounds.minX >= rMinX &&
        bounds.minY >= rMinY &&
        bounds.maxX <= rMaxX &&
        bounds.maxY <= rMaxY
      ) {
        matched.push(shape);
      }
    }
    matched.sort(compareShapeOrder);
    return matched.map((s) => s.id);
  }

  private getRequiredLiveShape(id: string): Shape {
    const shape = this.liveShapes.get(id);
    if (shape === undefined) {
      throw new WhiteboardError("unknown_shape", `Shape '${id}' does not exist or is deleted`);
    }
    return shape;
  }

  private nextClock(): LamportClock {
    this.highestClock += 1;
    return [this.highestClock, this.clientId];
  }

  private maxZ = 0;

  private computeMaxZ(): number {
    return this.maxZ;
  }

  private pushUndoEntry(deltas: HistoryDelta[]): void {
    if (this.maxHistory === 0) {
      return;
    }
    this.undoStack.push({ deltas });
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
  }

  private applyHistoryEntry(entry: HistoryEntry): HistoryEntry {
    const clock = this.nextClock();
    const ops: Op[] = [];
    const reverseDeltas: HistoryDelta[] = [];

    for (const delta of entry.deltas) {
      const record = this.records.get(delta.shapeId);
      if (record !== undefined) {
        const currentReg = record.registers.get(delta.field);
        if (currentReg !== undefined) {
          reverseDeltas.push({
            shapeId: delta.shapeId,
            field: delta.field,
            prevValue: cloneOpValue(currentReg.value),
          });
        }
      }
      ops.push({
        shapeId: delta.shapeId,
        field: delta.field,
        value: cloneOpValue(delta.prevValue),
        clock,
      });
    }

    this.applyBatchInternal(ops);
    this.emitOps(ops);
    return { deltas: reverseDeltas };
  }

  private emitOps(ops: Op[]): void {
    if (this.onOps !== undefined) {
      this.onOps(ops.map(cloneOp));
    }
  }

  private applyBatchInternal(ops: readonly Op[]): void {
    const touchedIds = new Set<string>();

    for (const op of ops) {
      if (op.clock[0] > this.highestClock) {
        this.highestClock = op.clock[0];
      }
      let record = this.records.get(op.shapeId);
      if (record === undefined) {
        record = { id: op.shapeId, registers: new Map() };
        this.records.set(op.shapeId, record);
      }
      const existing = record.registers.get(op.field);
      if (existing === undefined || compareClocks(op.clock, existing.clock) > 0) {
        record.registers.set(op.field, {
          value: cloneOpValue(op.value),
          clock: [op.clock[0], op.clock[1]],
        });
        if (op.field === "z" && typeof op.value === "number" && op.value > this.maxZ) {
          this.maxZ = op.value;
        }
        touchedIds.add(op.shapeId);
      }
    }

    for (const id of touchedIds) {
      this.syncMaterializedShape(id);
    }
  }

  private syncMaterializedShape(id: string): void {
    const record = this.records.get(id);
    if (record === undefined) {
      return;
    }
    const materialized = materializeRecord(record);
    if (materialized === null) {
      if (this.liveShapes.has(id)) {
        this.liveShapes.delete(id);
        this.grid.remove(id);
      }
    } else {
      this.liveShapes.set(id, materialized);
      this.grid.upsert(id, getShapeExpandedBounds(materialized));
    }
  }
}

function compareShapeOrder(a: Shape, b: Shape): number {
  if (a.z !== b.z) {
    return a.z - b.z;
  }
  if (a.id < b.id) {
    return -1;
  }
  if (a.id > b.id) {
    return 1;
  }
  return 0;
}

function cloneShape(shape: Shape): Shape {
  if (shape.type === "path") {
    return {
      ...shape,
      points: clonePoints(shape.points),
    };
  }
  return { ...shape };
}

function materializeRecord(record: ShapeRecord): Shape | null {
  const regs = record.registers;
  const deleted = regs.get("deleted")?.value;
  if (deleted !== false) {
    return null;
  }
  const type = regs.get("type")?.value as ShapeType | undefined;
  const z = regs.get("z")?.value;
  const stroke = regs.get("stroke")?.value;
  const strokeWidth = regs.get("strokeWidth")?.value;

  if (typeof z !== "number" || typeof stroke !== "string" || typeof strokeWidth !== "number") {
    return null;
  }

  switch (type) {
    case "rect":
    case "ellipse": {
      const x = regs.get("x")?.value;
      const y = regs.get("y")?.value;
      const w = regs.get("w")?.value;
      const h = regs.get("h")?.value;
      const fill = regs.get("fill")?.value;
      if (
        typeof x !== "number" ||
        typeof y !== "number" ||
        typeof w !== "number" ||
        typeof h !== "number" ||
        typeof fill !== "string"
      ) {
        return null;
      }
      return {
        id: record.id,
        type,
        z,
        x,
        y,
        w,
        h,
        stroke,
        fill,
        strokeWidth,
      };
    }
    case "line": {
      const x1 = regs.get("x1")?.value;
      const y1 = regs.get("y1")?.value;
      const x2 = regs.get("x2")?.value;
      const y2 = regs.get("y2")?.value;
      if (
        typeof x1 !== "number" ||
        typeof y1 !== "number" ||
        typeof x2 !== "number" ||
        typeof y2 !== "number"
      ) {
        return null;
      }
      return {
        id: record.id,
        type: "line",
        z,
        x1,
        y1,
        x2,
        y2,
        stroke,
        strokeWidth,
      };
    }
    case "path": {
      const points = regs.get("points")?.value;
      if (!Array.isArray(points)) {
        return null;
      }
      return {
        id: record.id,
        type: "path",
        z,
        points: clonePoints(points as readonly (readonly [number, number])[]),
        stroke,
        strokeWidth,
      };
    }
    default:
      return null;
  }
}

/**
 * Returns the topmost shape ID hit at `screenPoint` within `tolerancePx` screen pixels,
 * or `null` if no shape is hit. Updates `board.stats().candidates`.
 */
export function hitTest(
  board: Whiteboard,
  camera: Camera,
  screenPoint: Point,
  tolerancePx = 4,
): string | null {
  return board.performHitTest(camera, screenPoint, tolerancePx);
}

/**
 * Returns the IDs of all live shapes whose geometric bounding box lies completely inside
 * `worldRect`, ordered by `(z, id)` ascending.
 */
export function selectInRect(board: Whiteboard, worldRect: Rect): string[] {
  return board.performSelectInRect(worldRect);
}
