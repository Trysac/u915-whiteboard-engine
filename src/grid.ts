import type { BoundingBox } from "./geometry.js";

const CELL_SIZE = 256;

function cellKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

/**
 * Uniform spatial grid with 256-unit cells for fast incremental bounding-box indexing.
 */
export class SpatialGrid {
  private readonly cells = new Map<string, Set<string>>();
  private readonly shapeCells = new Map<string, string[]>();

  /**
   * Inserts or updates a shape's occupied grid cells using its expanded bounds.
   */
  public upsert(id: string, bounds: BoundingBox): void {
    this.remove(id);
    const minCx = Math.floor(bounds.minX / CELL_SIZE);
    const maxCx = Math.floor(bounds.maxX / CELL_SIZE);
    const minCy = Math.floor(bounds.minY / CELL_SIZE);
    const maxCy = Math.floor(bounds.maxY / CELL_SIZE);

    const keys: string[] = [];
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = cellKey(cx, cy);
        keys.push(key);
        let bucket = this.cells.get(key);
        if (bucket === undefined) {
          bucket = new Set<string>();
          this.cells.set(key, bucket);
        }
        bucket.add(id);
      }
    }
    this.shapeCells.set(id, keys);
  }

  /**
   * Removes a shape from all grid cells it occupies.
   */
  public remove(id: string): void {
    const keys = this.shapeCells.get(id);
    if (keys === undefined) {
      return;
    }
    for (const key of keys) {
      const bucket = this.cells.get(key);
      if (bucket !== undefined) {
        bucket.delete(id);
        if (bucket.size === 0) {
          this.cells.delete(key);
        }
      }
    }
    this.shapeCells.delete(id);
  }

  /**
   * Queries unique candidate shape IDs overlapping the given bounding box.
   */
  public query(bounds: BoundingBox): Set<string> {
    const minCx = Math.floor(bounds.minX / CELL_SIZE);
    const maxCx = Math.floor(bounds.maxX / CELL_SIZE);
    const minCy = Math.floor(bounds.minY / CELL_SIZE);
    const maxCy = Math.floor(bounds.maxY / CELL_SIZE);

    const result = new Set<string>();
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this.cells.get(cellKey(cx, cy));
        if (bucket !== undefined) {
          for (const id of bucket) {
            result.add(id);
          }
        }
      }
    }
    return result;
  }
}
