# Stack

- **Language**: TypeScript (strict mode, ESM, Node.js 22+ and modern browsers).
- **Runtime Dependencies**: None.
- **Dev Dependencies**:
  - `vitest` & `@vitest/coverage-v8`: Unit and property test runner and coverage gate.
  - `fast-check`: Property-based testing for multi-peer CRDT convergence and SVG export fidelity.
  - `jsdom`: Parsing and structural verification of exported SVG documents in local tests.
  - `playwright`: Headless Chromium `getBBox()` verification in the CI conformance tier.
