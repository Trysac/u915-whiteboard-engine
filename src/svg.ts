import { WhiteboardError } from "./errors.js";
import { getShapeExpandedBounds } from "./geometry.js";
import type { ExportSvgOptions, Shape } from "./types.js";
import { isFiniteNumber } from "./validation.js";
import type { Whiteboard } from "./whiteboard.js";

/**
 * Formats a number rounded to at most 3 decimals, removing trailing zeros and writing `-0` as `0`.
 */
export function formatSvgNumber(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  if (Object.is(rounded, -0) || rounded === 0) {
    return "0";
  }
  return Number(rounded.toFixed(3)).toString();
}

function renderShapeElement(shape: Shape): string {
  const sw = formatSvgNumber(shape.strokeWidth);
  switch (shape.type) {
    case "rect": {
      const x = formatSvgNumber(shape.x);
      const y = formatSvgNumber(shape.y);
      const w = formatSvgNumber(shape.w);
      const h = formatSvgNumber(shape.h);
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${shape.fill}" stroke="${shape.stroke}" stroke-width="${sw}"/>`;
    }
    case "ellipse": {
      const rxVal = shape.w / 2;
      const ryVal = shape.h / 2;
      const cx = formatSvgNumber(shape.x + rxVal);
      const cy = formatSvgNumber(shape.y + ryVal);
      const rx = formatSvgNumber(rxVal);
      const ry = formatSvgNumber(ryVal);
      return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${shape.fill}" stroke="${shape.stroke}" stroke-width="${sw}"/>`;
    }
    case "line": {
      const x1 = formatSvgNumber(shape.x1);
      const y1 = formatSvgNumber(shape.y1);
      const x2 = formatSvgNumber(shape.x2);
      const y2 = formatSvgNumber(shape.y2);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" fill="none" stroke="${shape.stroke}" stroke-width="${sw}"/>`;
    }
    case "path": {
      const pts = shape.points
        .map(([px, py]) => `${formatSvgNumber(px)},${formatSvgNumber(py)}`)
        .join(" ");
      return `<polyline points="${pts}" fill="none" stroke="${shape.stroke}" stroke-width="${sw}"/>`;
    }
  }
}

/**
 * Exports the live shapes on `board` as a deterministic SVG string.
 */
export function exportSvg(board: Whiteboard, opts?: ExportSvgOptions): string {
  const padding = opts?.padding ?? 16;
  if (!isFiniteNumber(padding) || padding < 0) {
    throw new WhiteboardError("invalid_shape", "padding must be a finite non-negative number");
  }

  const shapes = board.shapes();
  if (shapes.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" viewBox="0 0 0 0"></svg>';
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const shape of shapes) {
    const b = getShapeExpandedBounds(shape);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }

  const vx = minX - padding;
  const vy = minY - padding;
  const vw = maxX - minX + 2 * padding;
  const vh = maxY - minY + 2 * padding;

  const fvx = formatSvgNumber(vx);
  const fvy = formatSvgNumber(vy);
  const fvw = formatSvgNumber(vw);
  const fvh = formatSvgNumber(vh);

  const children = shapes.map(renderShapeElement).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${fvw}" height="${fvh}" viewBox="${fvx} ${fvy} ${fvw} ${fvh}">${children}</svg>`;
}
