# @trysac/whiteboard-engine

Whiteboard and diagram apps need the same hard core: a scene that two clients can edit and still converge, screen-to-world transforms, hit testing that stays cheap with thousands of shapes, undo that does not undo other people's work and an SVG export that matches the model. This library provides a headless core for 2D whiteboard applications.

## Installation

```bash
npm install @trysac/whiteboard-engine
```

## Usage

```ts
import { Camera, Whiteboard, exportSvg, hitTest } from "@trysac/whiteboard-engine";

const board = new Whiteboard({ clientId: "A" });
board.addShape({
  type: "rect",
  x: 10, y: 20, w: 30, h: 40,
  stroke: "#000000", fill: "none", strokeWidth: 2,
});
console.log(hitTest(board, new Camera(), { x: 15, y: 25 }));
console.log(exportSvg(board, { padding: 0 }));
```

## Public API

- `Whiteboard`: Scene store with `addShape`, `updateShape`, `deleteShape`, `bringToFront`, `applyRemote`, `undo`, `redo`, `shapes`, and `stats`.
- `Camera`: Screen/world affine transformation with `worldToScreen`, `screenToWorld`, `zoomAt` (clamped to `[0.1, 8]`), and `pan`.
- `hitTest(board, camera, screenPoint, tolerancePx?)`: Queries the 256-unit spatial grid and returns the topmost shape ID hit.
- `selectInRect(board, worldRect)`: Returns IDs of live shapes whose bounds lie completely within `worldRect`, in `(z, id)` order.
- `exportSvg(board, opts?)`: Deterministic SVG serializer.
- `WhiteboardError`: Typed error with `.code` (`invalid_shape`, `too_many_shapes`, `input_too_large`, `invalid_op`, `unknown_shape`).

## Why not <best-known alternative>?

Unlike tldraw or Excalidraw internals, this engine is a framework-free core with an explicit convergence rule and exact, deterministic SVG export, optimized for headless Node.js/browser environments without DOM dependence.

## Security

See [docs/SECURITY.md](docs/SECURITY.md) for the threat model and resource limits.