import { WhiteboardError } from "./errors.js";
import type { Point } from "./types.js";
import { isFiniteNumber } from "./validation.js";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

/**
 * Manages 2D affine transformation between world coordinates and screen coordinates.
 *
 * Relation: `screen = world * zoom + offset`.
 */
export class Camera {
  public zoom = 1;
  public offset: { x: number; y: number } = { x: 0, y: 0 };

  /**
   * Converts a point from world coordinates to screen coordinates.
   */
  public worldToScreen(p: Point): { x: number; y: number } {
    if (!isFiniteNumber(p.x) || !isFiniteNumber(p.y)) {
      throw new WhiteboardError("invalid_shape", "Point coordinates must be finite numbers");
    }
    return {
      x: p.x * this.zoom + this.offset.x,
      y: p.y * this.zoom + this.offset.y,
    };
  }

  /**
   * Converts a point from screen coordinates to world coordinates.
   */
  public screenToWorld(p: Point): { x: number; y: number } {
    if (!isFiniteNumber(p.x) || !isFiniteNumber(p.y)) {
      throw new WhiteboardError("invalid_shape", "Point coordinates must be finite numbers");
    }
    return {
      x: (p.x - this.offset.x) / this.zoom,
      y: (p.y - this.offset.y) / this.zoom,
    };
  }

  /**
   * Zooms the camera by `factor` while keeping the world point under `screenPoint` fixed.
   * Clamps zoom to `[0.1, 8]`.
   */
  public zoomAt(screenPoint: Point, factor: number): void {
    if (
      !isFiniteNumber(screenPoint.x) ||
      !isFiniteNumber(screenPoint.y) ||
      !isFiniteNumber(factor) ||
      factor <= 0
    ) {
      throw new WhiteboardError(
        "invalid_shape",
        "screenPoint must be finite and factor must be a positive finite number",
      );
    }
    const worldPoint = this.screenToWorld(screenPoint);
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    this.zoom = nextZoom;
    this.offset = {
      x: screenPoint.x - worldPoint.x * nextZoom,
      y: screenPoint.y - worldPoint.y * nextZoom,
    };
  }

  /**
   * Pans the camera offset by `(dx, dy)` in screen pixels.
   */
  public pan(dx: number, dy: number): void {
    if (!isFiniteNumber(dx) || !isFiniteNumber(dy)) {
      throw new WhiteboardError("invalid_shape", "Pan deltas must be finite numbers");
    }
    this.offset = {
      x: this.offset.x + dx,
      y: this.offset.y + dy,
    };
  }
}
