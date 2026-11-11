import fc from "fast-check";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  Camera,
  compareClocks,
  exportSvg,
  formatSvgNumber,
  hitTest,
  type Op,
  type ShapeInput,
  selectInRect,
  Whiteboard,
  WhiteboardError,
} from "../src/index.js";

describe("Camera", () => {
  it("zooms keeping the world point under screenPoint fixed and clamps zoom to [0.1, 8]", () => {
    const cam = new Camera();
    cam.zoomAt({ x: 100, y: 50 }, 2);
    expect(cam.zoom).toBe(2);
    expect(cam.offset).toEqual({ x: -100, y: -50 });
    expect(cam.screenToWorld({ x: 100, y: 50 })).toEqual({ x: 100, y: 50 });
    expect(cam.worldToScreen({ x: 100, y: 50 })).toEqual({ x: 100, y: 50 });

    cam.zoomAt({ x: 0, y: 0 }, 100);
    expect(cam.zoom).toBe(8);

    cam.zoomAt({ x: 0, y: 0 }, 0.001);
    expect(cam.zoom).toBe(0.1);
  });

  it("pans and rejects non-finite camera parameters", () => {
    const cam = new Camera();
    cam.pan(15, -25);
    expect(cam.offset).toEqual({ x: 15, y: -25 });

    expect(() => cam.worldToScreen({ x: Number.NaN, y: 0 })).toThrow(WhiteboardError);
    expect(() => cam.screenToWorld({ x: 0, y: Number.POSITIVE_INFINITY })).toThrow(WhiteboardError);
    expect(() => cam.zoomAt({ x: 0, y: 0 }, 0)).toThrow(WhiteboardError);
    expect(() => cam.zoomAt({ x: 0, y: 0 }, -1)).toThrow(WhiteboardError);
    expect(() => cam.pan(Number.NaN, 0)).toThrow(WhiteboardError);
  });
});

describe("SVG Export", () => {
  it("exports exact SVG for single rect and empty board", () => {
    const board = new Whiteboard({ clientId: "A" });
    expect(exportSvg(board)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" viewBox="0 0 0 0"></svg>',
    );

    board.addShape({
      type: "rect",
      x: 10,
      y: 20,
      w: 30,
      h: 40,
      stroke: "#000000",
      fill: "none",
      strokeWidth: 2,
    });
    expect(exportSvg(board, { padding: 0 })).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="9 19 32 42"><rect x="10" y="20" width="30" height="40" fill="none" stroke="#000000" stroke-width="2"/></svg>',
    );
  });

  it("formats numbers to 3 decimals without trailing zeros and normalizes -0", () => {
    expect(formatSvgNumber(-0)).toBe("0");
    expect(formatSvgNumber(-0.0001)).toBe("0");
    expect(formatSvgNumber(12.3456)).toBe("12.346");
    expect(formatSvgNumber(10.5)).toBe("10.5");

    const board = new Whiteboard({ clientId: "A" });
    expect(() => exportSvg(board, { padding: -1 })).toThrow(WhiteboardError);
  });

  it("exports ellipse, line, and path shapes accurately", () => {
    const board = new Whiteboard({ clientId: "A" });
    board.addShape({
      type: "ellipse",
      x: 0,
      y: 10,
      w: 20,
      h: 30,
      stroke: "#112233",
      fill: "#445566",
      strokeWidth: 4,
    });
    board.addShape({
      type: "line",
      x1: 1,
      y1: 2,
      x2: 3,
      y2: 4,
      stroke: "#abcdef",
      strokeWidth: 2,
    });
    board.addShape({
      type: "path",
      points: [
        [0, 0],
        [5.1234, 6.5],
      ],
      stroke: "#000000",
    });

    const svg = exportSvg(board, { padding: 0 });
    expect(svg).toContain(
      '<ellipse cx="10" cy="25" rx="10" ry="15" fill="#445566" stroke="#112233" stroke-width="4"/>',
    );
    expect(svg).toContain(
      '<line x1="1" y1="2" x2="3" y2="4" fill="none" stroke="#abcdef" stroke-width="2"/>',
    );
    expect(svg).toContain(
      '<polyline points="0,0 5.123,6.5" fill="none" stroke="#000000" stroke-width="1"/>',
    );
  });
});

describe("Convergence and CRDT LWW rules", () => {
  it("breaks ties by clientId and handles concurrent delete and move", () => {
    const opsA: Op[][] = [];
    const opsB: Op[][] = [];
    const boardA = new Whiteboard({ clientId: "A", onOps: (ops) => opsA.push(ops) });
    const boardB = new Whiteboard({ clientId: "B", onOps: (ops) => opsB.push(ops) });

    const id = boardA.addShape({
      type: "rect",
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      stroke: "#000000",
      fill: "none",
    });
    const opA0 = opsA[0];
    expect(opA0).toBeDefined();
    if (!opA0) return;
    boardB.applyRemote(opA0);

    // Concurrent fill updates (both Lamport counter 2)
    boardA.updateShape(id, { fill: "#ff0000" });
    boardB.updateShape(id, { fill: "#00ff00" });

    const opA1 = opsA[1];
    const opB0 = opsB[0];
    expect(opA1).toBeDefined();
    expect(opB0).toBeDefined();
    if (!opA1 || !opB0) return;

    expect(opA1[0]?.clock).toEqual([2, "A"]);
    expect(opB0[0]?.clock).toEqual([2, "B"]);

    boardA.applyRemote(opB0);
    boardB.applyRemote(opA1);

    expect(boardA.shapes()[0]).toMatchObject({ fill: "#00ff00" });
    expect(boardB.shapes()[0]).toMatchObject({ fill: "#00ff00" });

    // Concurrent delete on A and move on B leaves the shape deleted on both
    boardA.deleteShape(id);
    boardB.updateShape(id, { x: 100 });

    const opB1 = opsB[1];
    const opA2 = opsA[2];
    expect(opB1).toBeDefined();
    expect(opA2).toBeDefined();
    if (!opB1 || !opA2) return;

    boardA.applyRemote(opB1);
    boardB.applyRemote(opA2);

    expect(boardA.shapes()).toEqual([]);
    expect(boardB.shapes()).toEqual([]);
  });

  it("converges across 3 boards with random local edits, random delivery order and duplicates (seed 5, 100 runs)", () => {
    const colorArb = fc.constantFrom("#000000", "#ff0000", "#00ff00", "#0000ff", "none");
    const coordArb = fc.double({ min: -500, max: 500, noNaN: true, noDefaultInfinity: true });
    const sizeArb = fc.double({ min: 0, max: 200, noNaN: true, noDefaultInfinity: true });

    const actionArb = fc.oneof(
      fc.record({
        kind: fc.constant("addRect" as const),
        boardIdx: fc.integer({ min: 0, max: 2 }),
        x: coordArb,
        y: coordArb,
        w: sizeArb,
        h: sizeArb,
        stroke: colorArb,
        fill: colorArb,
      }),
      fc.record({
        kind: fc.constant("updateX" as const),
        boardIdx: fc.integer({ min: 0, max: 2 }),
        shapeIdx: fc.nat(20),
        x: coordArb,
      }),
      fc.record({
        kind: fc.constant("bringToFront" as const),
        boardIdx: fc.integer({ min: 0, max: 2 }),
        shapeIdx: fc.nat(20),
      }),
      fc.record({
        kind: fc.constant("delete" as const),
        boardIdx: fc.integer({ min: 0, max: 2 }),
        shapeIdx: fc.nat(20),
      }),
    );

    fc.assert(
      fc.property(
        fc.array(actionArb, { minLength: 5, maxLength: 25 }),
        fc.array(fc.nat(100), { minLength: 30, maxLength: 60 }),
        (actions, shuffleOrder) => {
          const allBatches: Op[][] = [];
          const boards = [
            new Whiteboard({ clientId: "A", onOps: (b) => allBatches.push(b) }),
            new Whiteboard({ clientId: "B", onOps: (b) => allBatches.push(b) }),
            new Whiteboard({ clientId: "C", onOps: (b) => allBatches.push(b) }),
          ];

          for (const act of actions) {
            const b = boards[act.boardIdx];
            if (!b) continue;
            if (act.kind === "addRect") {
              b.addShape({
                type: "rect",
                x: act.x,
                y: act.y,
                w: act.w,
                h: act.h,
                stroke: act.stroke,
                fill: act.fill,
              });
            } else {
              const live = b.shapes();
              if (live.length > 0) {
                const target = live[act.shapeIdx % live.length];
                if (!target) continue;
                if (act.kind === "updateX" && target.type === "rect") {
                  b.updateShape(target.id, { x: act.x });
                } else if (act.kind === "bringToFront") {
                  b.bringToFront(target.id);
                } else if (act.kind === "delete") {
                  b.deleteShape(target.id);
                }
              }
            }
          }

          // Deliver every batch to every board in a varied order with duplicates
          for (let bIdx = 0; bIdx < boards.length; bIdx++) {
            const targetBoard = boards[bIdx];
            if (!targetBoard) continue;
            for (let i = 0; i < allBatches.length; i++) {
              const pick =
                (i + (shuffleOrder[(i + bIdx) % shuffleOrder.length] ?? 0)) % allBatches.length;
              const batch = allBatches[pick];
              if (batch) {
                targetBoard.applyRemote(batch);
              }
            }
            // Ensure all batches are delivered at least once, plus a duplicate pass
            for (const batch of allBatches) {
              targetBoard.applyRemote(batch);
            }
          }

          const s0 = JSON.stringify(boards[0]?.shapes());
          const s1 = JSON.stringify(boards[1]?.shapes());
          const s2 = JSON.stringify(boards[2]?.shapes());
          expect(s0).toBe(s1);
          expect(s1).toBe(s2);
        },
      ),
      { seed: 5, numRuns: 100 },
    );
  });
});

describe("Hit testing", () => {
  it("examines at most 49 candidates on 5,000 rects and hits origin rect", () => {
    const board = new Whiteboard({ clientId: "A" });
    const camera = new Camera();
    let originId = "";

    for (let i = 0; i < 100; i++) {
      for (let j = 0; j < 50; j++) {
        const id = board.addShape({
          type: "rect",
          x: 40 * i,
          y: 40 * j,
          w: 10,
          h: 10,
          stroke: "#000000",
          fill: "#ffffff",
        });
        if (i === 0 && j === 0) {
          originId = id;
        }
      }
    }

    const hit = hitTest(board, camera, { x: 5, y: 5 }, 4);
    expect(hit).toBe(originId);
    expect(board.stats().candidates).toBeLessThanOrEqual(49);
  });

  it("accurately hit-tests lines, ellipses, and paths with strokeWidth and tolerance", () => {
    const board = new Whiteboard({ clientId: "A" });
    const camera = new Camera();

    const lineId = board.addShape({
      type: "line",
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
      stroke: "#000000",
      strokeWidth: 2,
    });

    // t = 4, strokeWidth / 2 = 1 => threshold = 5.0
    expect(hitTest(board, camera, { x: 50, y: 4.9 }, 4)).toBe(lineId);
    expect(hitTest(board, camera, { x: 50, y: 5.1 }, 4)).toBeNull();

    // Zero-length degenerate line segment
    const dotLineId = board.addShape({
      type: "line",
      x1: 300,
      y1: 300,
      x2: 300,
      y2: 300,
      stroke: "#000000",
      strokeWidth: 2,
    });
    expect(hitTest(board, camera, { x: 300, y: 304 }, 4)).toBe(dotLineId);

    // Ellipse hit test
    const ellipseId = board.addShape({
      type: "ellipse",
      x: 500,
      y: 500,
      w: 20,
      h: 20,
      stroke: "#000000",
      fill: "none",
    });
    // Center is (510, 510), rx = 10, ry = 10, t = 4 => radius 14
    expect(hitTest(board, camera, { x: 523.9, y: 510 }, 4)).toBe(ellipseId);
    expect(hitTest(board, camera, { x: 524.1, y: 510 }, 4)).toBeNull();

    // Path hit test
    const pathId = board.addShape({
      type: "path",
      points: [
        [800, 800],
        [850, 800],
        [850, 850],
      ],
      stroke: "#000000",
      strokeWidth: 2,
    });
    expect(hitTest(board, camera, { x: 850, y: 825 }, 4)).toBe(pathId);
    expect(hitTest(board, camera, { x: 820, y: 820 }, 4)).toBeNull();
  });
});

describe("Selection, z-order, and undo/redo", () => {
  it("selects shapes inside worldRect in z-order, supports bringToFront, and local undo/redo", () => {
    const opsA: Op[][] = [];
    const opsB: Op[][] = [];
    const boardA = new Whiteboard({ clientId: "A", onOps: (ops) => opsA.push(ops) });
    const boardB = new Whiteboard({ clientId: "B", onOps: (ops) => opsB.push(ops) });
    const camera = new Camera();

    const id1 = boardA.addShape({
      type: "rect",
      x: 10,
      y: 10,
      w: 20,
      h: 20,
      stroke: "#000000",
      fill: "#ffffff",
    });
    const id2 = boardA.addShape({
      type: "rect",
      x: 15,
      y: 15,
      w: 20,
      h: 20,
      stroke: "#000000",
      fill: "#000000",
    });
    // Outside rect
    boardA.addShape({
      type: "rect",
      x: 90,
      y: 90,
      w: 20,
      h: 20,
      stroke: "#000000",
      fill: "#000000",
    });

    expect(selectInRect(boardA, { x: 0, y: 0, w: 100, h: 100 })).toEqual([id1, id2]);
    expect(hitTest(boardA, camera, { x: 20, y: 20 }, 0)).toBe(id2);

    // bringToFront makes id1 topmost for hitTest and selection
    boardA.bringToFront(id1);
    expect(hitTest(boardA, camera, { x: 20, y: 20 }, 0)).toBe(id1);
    expect(selectInRect(boardA, { x: 0, y: 0, w: 100, h: 100 })).toEqual([id2, id1]);

    // Undo/redo sequence on a fresh board
    const boardU = new Whiteboard({ clientId: "U", maxHistory: 2 });
    const sId = boardU.addShape({
      type: "rect",
      x: 10,
      y: 20,
      w: 30,
      h: 40,
      stroke: "#000000",
      fill: "none",
    });
    boardU.updateShape(sId, { x: 50 });
    expect(boardU.shapes()[0]).toMatchObject({ x: 50 });

    // First undo restores previous x
    expect(boardU.undo()).toBe(true);
    expect(boardU.shapes()[0]).toMatchObject({ x: 10 });

    // Second undo deletes the shape created by addShape
    expect(boardU.undo()).toBe(true);
    expect(boardU.shapes()).toEqual([]);
    expect(boardU.undo()).toBe(false);

    // Redo re-applies creation and update
    expect(boardU.redo()).toBe(true);
    expect(boardU.shapes()[0]).toMatchObject({ id: sId, x: 10 });
    expect(boardU.redo()).toBe(true);
    expect(boardU.shapes()[0]).toMatchObject({ id: sId, x: 50 });
    expect(boardU.redo()).toBe(false);

    // Undo never reverts another client's op on another field
    for (const batch of opsA) {
      boardB.applyRemote(batch);
    }
    const opsAAfterInit = opsA.length;
    boardA.updateShape(id1, { x: 50 });
    boardB.updateShape(id1, { fill: "#123456" });
    const patchB0 = opsB[0];
    const patchA = opsA[opsAAfterInit];
    expect(patchB0).toBeDefined();
    expect(patchA).toBeDefined();
    if (patchB0 && patchA) {
      boardA.applyRemote(patchB0);
      boardB.applyRemote(patchA);
    }

    boardA.undo(); // reverts x back to 10 on A, does not touch B's fill
    const undoOpsA = opsA[opsAAfterInit + 1];
    expect(undoOpsA).toBeDefined();
    if (undoOpsA) {
      boardB.applyRemote(undoOpsA);
    }
    expect(boardA.shapes().find((s) => s.id === id1)).toMatchObject({
      x: 10,
      fill: "#123456",
    });
    expect(boardB.shapes().find((s) => s.id === id1)).toMatchObject({
      x: 10,
      fill: "#123456",
    });
  });

  it("evicts oldest undo history beyond maxHistory", () => {
    const board = new Whiteboard({ clientId: "A", maxHistory: 2 });
    const id = board.addShape({
      type: "rect",
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      stroke: "#000000",
      fill: "none",
    });
    board.updateShape(id, { x: 1 });
    board.updateShape(id, { x: 2 });
    board.updateShape(id, { x: 3 });

    expect(board.undo()).toBe(true);
    expect(board.shapes()[0]).toMatchObject({ x: 2 });
    expect(board.undo()).toBe(true);
    expect(board.shapes()[0]).toMatchObject({ x: 1 });
    expect(board.undo()).toBe(false);
  });
});

describe("Validation and Errors", () => {
  it("enforces all error codes and atomic batch validation", () => {
    const board = new Whiteboard({ clientId: "A" });

    // fill 'red' throws invalid_shape
    expect(() =>
      board.addShape({
        type: "rect",
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        stroke: "#000000",
        fill: "red",
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid_shape" }));

    // Adversarial color strings
    for (const badColor of ["#GGGGGG", "#FF0000", "#0000001", "#000", "none "]) {
      expect(() =>
        board.addShape({
          type: "rect",
          x: 0,
          y: 0,
          w: 10,
          h: 10,
          stroke: badColor,
          fill: "none",
        }),
      ).toThrowError(expect.objectContaining({ code: "invalid_shape" }));
    }

    // Path with 10_001 points throws invalid_shape
    const tooManyPoints = Array.from({ length: 10_001 }, (_, i) => [i, i] as const);
    expect(() =>
      board.addShape({
        type: "path",
        points: tooManyPoints,
        stroke: "#000000",
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid_shape" }));

    // Path with 1 point throws invalid_shape
    expect(() =>
      board.addShape({
        type: "path",
        points: [[0, 0]],
        stroke: "#000000",
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid_shape" }));

    // 10_001st shape id throws too_many_shapes
    const fullBoard = new Whiteboard({ clientId: "A", maxShapes: 10_000 });
    for (let i = 0; i < 10_000; i++) {
      fullBoard.addShape({
        type: "line",
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        stroke: "#000000",
      });
    }
    expect(() =>
      fullBoard.addShape({
        type: "line",
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        stroke: "#000000",
      }),
    ).toThrowError(expect.objectContaining({ code: "too_many_shapes" }));

    // Also check remote op creating a 10_001st shape id throws too_many_shapes
    expect(() =>
      fullBoard.applyRemote([{ shapeId: "B:1", field: "deleted", value: false, clock: [1, "B"] }]),
    ).toThrowError(expect.objectContaining({ code: "too_many_shapes" }));

    // applyRemote with 10_001 ops throws input_too_large
    const hugeOps: Op[] = Array.from({ length: 10_001 }, (_, i) => ({
      shapeId: "A:1",
      field: "x",
      value: i,
      clock: [i + 1, "A"],
    }));
    expect(() => board.applyRemote(hugeOps)).toThrowError(
      expect.objectContaining({ code: "input_too_large" }),
    );

    // A batch containing one invalid op throws invalid_op and applies none of the batch
    const validId = board.addShape({
      type: "rect",
      x: 10,
      y: 10,
      w: 10,
      h: 10,
      stroke: "#000000",
      fill: "none",
    });
    const mixedBatch: Op[] = [
      { shapeId: validId, field: "x", value: 999, clock: [10, "B"] },
      { shapeId: validId, field: "fill", value: "NOT_A_COLOR", clock: [10, "B"] },
    ];
    expect(() => board.applyRemote(mixedBatch)).toThrowError(
      expect.objectContaining({ code: "invalid_op" }),
    );
    expect(board.shapes()[0]).toMatchObject({ x: 10 });

    // Unknown shape errors
    expect(() => board.updateShape("nonexistent", { x: 1 })).toThrowError(
      expect.objectContaining({ code: "unknown_shape" }),
    );
    expect(() => board.deleteShape("nonexistent")).toThrowError(
      expect.objectContaining({ code: "unknown_shape" }),
    );
    expect(() => board.bringToFront("nonexistent")).toThrowError(
      expect.objectContaining({ code: "unknown_shape" }),
    );
  });

  it("validates constructor options, patch fields, selectInRect, hitTest, and compareClocks", () => {
    expect(() => new Whiteboard({ clientId: "" })).toThrow(WhiteboardError);
    expect(() => new Whiteboard({ clientId: "A", maxShapes: 0 })).toThrow(WhiteboardError);
    expect(() => new Whiteboard({ clientId: "A", maxHistory: -1 })).toThrow(WhiteboardError);

    const board = new Whiteboard({ clientId: "A", maxHistory: 0 });
    const id = board.addShape({
      type: "line",
      x1: 0,
      y1: 0,
      x2: 10,
      y2: 10,
      stroke: "#000000",
    });
    // No-op empty patch
    board.updateShape(id, {});
    // Invalid field for line
    expect(() => board.updateShape(id, { fill: "#000000" } as Partial<ShapeInput>)).toThrow(
      WhiteboardError,
    );
    expect(() => selectInRect(board, { x: 0, y: 0, w: -5, h: 10 })).toThrow(WhiteboardError);
    expect(() => hitTest(board, new Camera(), { x: 0, y: 0 }, -1)).toThrow(WhiteboardError);
    expect(compareClocks([1, "A"], [1, "A"])).toBe(0);
  });
});

describe("Export fidelity (fast-check seed 9, 200 random shapes with jsdom)", () => {
  it("exports 200 random shapes whose parsed SVG elements match the model in z-order", () => {
    const colorArb = fc.constantFrom("#000000", "#123456", "#abcdef", "none");
    const coordArb = fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true });
    const dimArb = fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true });
    const swArb = fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true });

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
        points: fc.array(fc.tuple(coordArb, coordArb), { minLength: 2, maxLength: 10 }),
        stroke: colorArb,
        strokeWidth: swArb,
      }),
    );

    fc.assert(
      fc.property(fc.array(shapeInputArb, { minLength: 200, maxLength: 200 }), (inputs) => {
        const board = new Whiteboard({ clientId: "A" });
        for (const inp of inputs) {
          board.addShape(inp);
        }

        const svgText = exportSvg(board);
        const dom = new JSDOM(svgText, { contentType: "image/svg+xml" });
        const svgEl = dom.window.document.querySelector("svg");
        expect(svgEl).not.toBeNull();

        const children = svgEl ? Array.from(svgEl.children) : [];
        const modelShapes = board.shapes();
        expect(children.length).toBe(modelShapes.length);

        for (let i = 0; i < modelShapes.length; i++) {
          const s = modelShapes[i];
          const el = children[i];
          expect(s).toBeDefined();
          expect(el).toBeDefined();
          if (!s || !el) continue;
          expect(el.getAttribute("stroke")).toBe(s.stroke);
          expect(el.getAttribute("stroke-width")).toBe(formatSvgNumber(s.strokeWidth));

          if (s.type === "rect") {
            expect(el.tagName).toBe("rect");
            expect(el.getAttribute("x")).toBe(formatSvgNumber(s.x));
            expect(el.getAttribute("y")).toBe(formatSvgNumber(s.y));
            expect(el.getAttribute("width")).toBe(formatSvgNumber(s.w));
            expect(el.getAttribute("height")).toBe(formatSvgNumber(s.h));
            expect(el.getAttribute("fill")).toBe(s.fill);
          } else if (s.type === "ellipse") {
            expect(el.tagName).toBe("ellipse");
            expect(el.getAttribute("cx")).toBe(formatSvgNumber(s.x + s.w / 2));
            expect(el.getAttribute("cy")).toBe(formatSvgNumber(s.y + s.h / 2));
            expect(el.getAttribute("rx")).toBe(formatSvgNumber(s.w / 2));
            expect(el.getAttribute("ry")).toBe(formatSvgNumber(s.h / 2));
            expect(el.getAttribute("fill")).toBe(s.fill);
          } else if (s.type === "line") {
            expect(el.tagName).toBe("line");
            expect(el.getAttribute("x1")).toBe(formatSvgNumber(s.x1));
            expect(el.getAttribute("y1")).toBe(formatSvgNumber(s.y1));
            expect(el.getAttribute("x2")).toBe(formatSvgNumber(s.x2));
            expect(el.getAttribute("y2")).toBe(formatSvgNumber(s.y2));
            expect(el.getAttribute("fill")).toBe("none");
          } else if (s.type === "path") {
            expect(el.tagName).toBe("polyline");
            const expectedPts = s.points
              .map(([px, py]) => `${formatSvgNumber(px)},${formatSvgNumber(py)}`)
              .join(" ");
            expect(el.getAttribute("points")).toBe(expectedPts);
            expect(el.getAttribute("fill")).toBe("none");
          }
        }
      }),
      { seed: 9, numRuns: 1 },
    );
  });
});
