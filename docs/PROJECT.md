# Project Record

## Objective

Provide a headless whiteboard engine core with LWW CRDT convergence, camera math, 256-unit spatial grid hit-testing, selection, local undo/redo, and exact SVG export.

## Scope

The library implements the core scene logic for 2D shapes, replication, and export. It includes geometric calculations for hit testing, a spatial indexing system for performance, and a deterministic SVG serialization path.

## Out-of-scope

- UI rendering (Canvas/DOM).
- Pointer gesture handling.
- Network transport layers.
- Text, images, rotation, groups, arrows, or connectors.
- Garbage collection of tombstone (deleted) shapes.

## Factory run u915 (measured from API usage)

| Date (UTC) | Phase | Model | Batch | Input | Output | Cache write | Cache read | Cost (USD) |
|---|---|---|---|---|---|---|---|---|
| 2026-11-11 | generation | google/gemini-4-argon | yes | 6355 | 26486 | 0 | 0 | 0.5551 |
| 2026-11-11 | fix-2 | google/gemini-3.8-flash | no | 73652 | 116 | 0 | 90954 | 0.0625 |
| 2026-11-11 | fix-3 | google/gemini-3.8-flash | no | 580011 | 5082 | 0 | 2047880 | 0.6077 |
| 2026-11-11 | audit | google/gemini-3.8-flash | no | 367672 | 1042 | 0 | 717572 | 0.3335 |
| 2026-11-11 | docs | google/gemini-3.1-flash-lite | no | 26220 | 1296 | 0 | 0 | 0.0085 |

Total: $1.5673. Prices: vertex line, as measured by its adapter. Providers serve the current version of each model id, so the date tells which version answered; versions, launch stages and price sources per line are in the factory's model register (docs/MODELS.md).
