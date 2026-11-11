# Security & Threat Model

`@trysac/whiteboard-engine` processes untrusted operations and input with the following limits:

- **Batch Size**: `applyRemote(ops)` rejects batches larger than 10,000 operations (`input_too_large`).
- **Shape Capacity**: Total distinct shapes, including deleted tombstones, are limited by `maxShapes` (default 10,000, `too_many_shapes`).
- **Path Complexity**: `path` shapes are limited to between 2 and 10,000 coordinates (`invalid_shape`).
- **History**: Local undo/redo stacks are capped at `maxHistory` (default 200).
- **Input Validation**: All shape inputs and operations are strictly validated for finite coordinates, valid hex colors, and allowed fields. Invalid operations cause an immediate `WhiteboardError` and prevent partial state application.
- **SVG Safety**: SVG output uses rounded, validated coordinates and restricted color sets to prevent injection.