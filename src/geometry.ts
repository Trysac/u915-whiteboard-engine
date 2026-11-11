import type { Point, Shape } from "./types.js";

export interface BoundingBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * Returns the raw geometric bounding box of a shape (without strokeWidth expansion).
 */
export function getShapeRawBounds(shape: Shape): BoundingBox {
  switch (shape.type) {
    case "rect":
    case "ellipse":
      return {
        minX: shape.x,
        minY: shape.y,
        maxX: shape.x + shape.w,
        maxY: shape.y + shape.h,
      };
    case "line":
      return {
        minX: Math.min(shape.x1, shape.x2),
        minY: Math.min(shape.y1, shape.y2),
        maxX: Math.max(shape.x1, shape.x2),
        maxY: Math.max(shape.y1, shape.y2),
      };
    case "path": {
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const [px, py] of shape.points) {
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
      return { minX, minY, maxX, maxY };
    }
  }
}

/**
 * Returns the bounding box of a shape expanded by `strokeWidth / 2`.
 */
export function getShapeExpandedBounds(shape: Shape): BoundingBox {
  const raw = getShapeRawBounds(shape);
  const pad = shape.strokeWidth / 2;
  return {
    minX: raw.minX - pad,
    minY: raw.minY - pad,
    maxX: raw.maxX + pad,
    maxY: raw.maxY + pad,
  };
}

/**
 * Computes the minimum Euclidean distance from point `p` to segment `(a, b)`.
 */
export function distToSegment(p: Point, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.hypot(p.x - ax, p.y - ay);
  }
  const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

/**
 * Tests whether a world point hits `shape` given world tolerance `t`.
 */
export function hitTestShape(shape: Shape, worldPoint: Point, t: number): boolean {
  switch (shape.type) {
    case "rect": {
      return (
        worldPoint.x >= shape.x - t &&
        worldPoint.x <= shape.x + shape.w + t &&
        worldPoint.y >= shape.y - t &&
        worldPoint.y <= shape.y + shape.h + t
      );
    }
    case "ellipse": {
      const rx = shape.w / 2;
      const ry = shape.h / 2;
      const cx = shape.x + rx;
      const cy = shape.y + ry;
      const denomX = rx + t;
      const denomY = ry + t;
      if (denomX <= 0 || denomY <= 0) {
        return worldPoint.x === cx && worldPoint.y === cy;
      }
      const nx = (worldPoint.x - cx) / denomX;
      const ny = (worldPoint.y - cy) / denomY;
      return nx * nx + ny * ny <= 1;
    }
    case "line": {
      const d = distToSegment(worldPoint, shape.x1, shape.y1, shape.x2, shape.y2);
      return d <= t + shape.strokeWidth / 2;
    }
    case "path": {
      const threshold = t + shape.strokeWidth / 2;
      const pts = shape.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        if (p1 !== undefined && p2 !== undefined) {
          if (distToSegment(worldPoint, p1[0], p1[1], p2[0], p2[1]) <= threshold) {
            return true;
          }
        }
      }
      return false;
    }
  }
}
