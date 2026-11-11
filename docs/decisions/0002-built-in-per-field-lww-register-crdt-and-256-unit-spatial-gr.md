# Built-in Per-Field LWW Register CRDT and 256-Unit Spatial Grid Index

Status: accepted (generated, pending human review)

## Context

Whiteboard applications require a deterministic, framework-free core where concurrent edits from multiple peers converge without a central coordinator, hit testing stays fast with thousands of shapes, local undo never reverts remote peers' work, and SVG export matches the geometric model.

## Decision

Represent each shape as a map of per-field Last-Writer-Wins registers keyed by Lamport clocks [counter, clientId], maintain an incremental 256-unit uniform grid over strokeWidth-expanded bounding boxes for O(1) cell candidate lookups during hitTest, implement undo/redo by recording prior field values and emitting new LWW op batches, and use dev-only fast-check, jsdom, and playwright for property and conformance verification.

## Consequences

Zero runtime dependencies and deterministic convergence under arbitrary op reordering and duplication. Deleted shapes remain as tombstones and count toward maxShapes. Hit testing on 5,000 distributed shapes examines at most a single grid cell's candidates (<= 49).
