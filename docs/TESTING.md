# Testing

## Unit & Property Tests

Located in `test/index.test.ts`, tests cover:
- **Camera**: Zoom clamping `[0.1, 8]`, coordinate transform accuracy, and panning.
- **Convergence**: Tie-breaking with Lamport clocks, handling concurrent delete/move, and 3-peer randomized network delivery using `fast-check`.
- **Spatial Indexing**: Verification of candidate counts in the 256-unit grid on 5,000 rectangles.
- **History**: Undo/redo persistence and history eviction.
- **Validation**: Error code compliance and atomic batch rejection.
- **SVG**: Fidelity of output for various shapes, including empty board serialization.

## Conformance Tier

Available under `FABRICA_CI=1`, the conformance test suite uses Playwright to launch Chromium and verify that exported SVG elements match the model geometric bounds within a 0.01 tolerance.