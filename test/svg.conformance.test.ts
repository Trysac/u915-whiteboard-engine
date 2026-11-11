import fc from "fast-check";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import { getShapeRawBounds } from "../src/geometry.js";
import { exportSvg, type ShapeInput, Whiteboard } from "../src/index.js";

describe("SVG Chromium getBBox conformance", () => {
  it("matches Chromium getBBox() against model bounds within 0.01 for 200 random shapes", async (ctx) => {
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      ctx.skip();
      return;
    }

    try {
      const colorArb = fc.constantFrom("#000000", "#123456", "#abcdef");
      const coordArb = fc.double({ min: -500, max: 500, noNaN: true, noDefaultInfinity: true });
      // Positive dimensions so Chromium SVGGraphicsElement.getBBox() is well-defined
      const dimArb = fc.double({ min: 1, max: 300, noNaN: true, noDefaultInfinity: true });
      const swArb = fc.double({ min: 1, max: 20, noNaN: true, noDefaultInfinity: true });

      const shapeInputArb: fc.Arbitrary<ShapeInput> = fc.oneof(
        fc.record({
          type: fc.constant("rect" as const),
          x: coordArb,
          y: coordArb,
          w: dimArb,
          h: dimArb,
          stroke: colorArb,
          fill: colorArb,
          strokeWidth: swArb,
        }),
        fc.record({
          type: fc.constant("ellipse" as const),
          x: coordArb,
          y: coordArb,
          w: dimArb,
          h: dimArb,
          stroke: colorArb,
          fill: colorArb,
          strokeWidth: swArb,
        }),
        fc.record({
          type: fc.constant("line" as const),
          x1: coordArb,
          y1: coordArb,
          x2: coordArb,
          y2: coordArb,
          stroke: colorArb,
          strokeWidth: swArb,
        }),
        fc.record({
          type: fc.constant("path" as const),
          points: fc.array(fc.tuple(coordArb, coordArb), { minLength: 2, maxLength: 8 }),
          stroke: colorArb,
          strokeWidth: swArb,
        }),
      );

      const [inputs] = fc.sample(fc.array(shapeInputArb, { minLength: 200, maxLength: 200 }), {
        seed: 9,
        numRuns: 1,
      });
      if (!inputs) {
        throw new Error("Failed to generate sample inputs");
      }

      const board = new Whiteboard({ clientId: "A" });
      for (const inp of inputs) {
        board.addShape(inp);
      }

      const svgString = exportSvg(board);
      const page = await browser.newPage();
      await page.setContent(`<!DOCTYPE html><html><body>${svgString}</body></html>`);

      interface BBoxItem {
        x: number;
        y: number;
        width: number;
        height: number;
      }

      const bboxes = (await page.evaluate(`(() => {
        const svg = document.querySelector("svg");
        if (!svg) return [];
        return Array.from(svg.children).map((el) => {
          const b = el.getBBox();
          return { x: b.x, y: b.y, width: b.width, height: b.height };
        });
      })()`)) as BBoxItem[];

      const shapes = board.shapes();
      expect(bboxes.length).toBe(shapes.length);

      for (let i = 0; i < shapes.length; i++) {
        const shape = shapes[i];
        const box = bboxes[i];
        expect(shape).toBeDefined();
        expect(box).toBeDefined();
        if (!shape || !box) continue;
        const raw = getShapeRawBounds(shape);
        expect(Math.abs(box.x - raw.minX)).toBeLessThanOrEqual(0.01);
        expect(Math.abs(box.y - raw.minY)).toBeLessThanOrEqual(0.01);
        expect(Math.abs(box.width - (raw.maxX - raw.minX))).toBeLessThanOrEqual(0.01);
        expect(Math.abs(box.height - (raw.maxY - raw.minY))).toBeLessThanOrEqual(0.01);
      }
    } finally {
      await browser.close();
    }
  });
});
