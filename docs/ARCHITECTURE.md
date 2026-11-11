# Architecture

`@trysac/whiteboard-engine` is a zero-runtime-dependency, framework-free headless core for 2D whiteboard applications.

## Modules

- `src/types.ts`: Immutable data types for shapes, operations, Lamport clocks, and options.
- `src/errors.ts`: `WhiteboardError` with machine-readable error codes and bounded messages.
- `src/validation.ts`: Strict validation of shape geometries, color syntax (`#rrggbb` lowercase or `'none'`), stroke widths (`0..100`), path bounds (`2..10,000` points), and remote operation batches (`<= 10,000` ops).
- `src/camera.ts`: `Camera` transform (`screen = world * zoom + offset`) with fixed-point zooming clamped to `[0.1, 8]`.
- `src/geometry.ts`: Bounding-box calculation and exact shape hit-test predicates (expanded rect bounds, normalized ellipse tolerance equation, and point-to-segment distance for lines and polylines).
- `src/grid.ts`: `SpatialGrid` dividing world space into 256x256 cells, updated incrementally whenever a live shape is added, modified, or deleted.
- `src/whiteboard.ts`: `Whiteboard` state machine, per-field LWW register map, local undo/redo stacks, `hitTest`, and `selectInRect`.
- `src/svg.ts`: `exportSvg` deterministic serializer with 3-decimal rounding.

## Replication & Convergence

Each shape is stored as a map of field registers (`type`, `z`, `deleted`, plus geometry and style fields). Every local mutation advances the Lamport counter `max(local, highestSeen) + 1` and emits a batch of `Op` records sharing that clock `[counter, clientId]`. A register accepts an incoming operation iff its clock is strictly greater (ordered by `counter`, then `clientId` UTF-16 code units). Tombstones (`deleted: true`) remain in the register map so out-of-order and duplicate deliveries always converge; deleted shapes count toward `maxShapes`.
