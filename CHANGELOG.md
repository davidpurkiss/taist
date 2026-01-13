# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2025-01-13

### Changed
- **Enhanced TOON output for filtered test runs** - When running a subset of tests (e.g., `vitest -t "specific test"`):
  - Header now shows `passed/ran` instead of `passed/discovered` (e.g., `===TESTS: 1/1===` instead of `===TESTS: 1/96===`)
  - Passing test names with duration shown when running ≤10 tests (e.g., `✓ should create order (2041ms)`)
  - Test names shortened for readability (last part of hierarchical name)
- Tests without a pass/fail state (filtered out, pending) are no longer counted in total

### Added
- `tests` array in reporter results for individual test tracking
- `shortenTestName()` method in ToonFormatter

### Fixed
- Timer and interval handles now use `unref()` to prevent blocking process exit
- Removed `process.exit(0)` from signal handlers to avoid interfering with test runners like Vitest

## [0.1.2] - 2025-01-13

### Fixed
- **Cross-process trace collection** - `taist/instrument` now eagerly connects to `TAIST_COLLECTOR_SOCKET` when the environment variable is set, enabling traces from spawned processes to be collected by `TraceSession`/`TraceCollector`

### Added
- `reporter` export from `taist/instrument` - the global `TraceReporter` instance
- `flushTraces()` function to manually flush buffered traces before process exit
- `TraceReporter` and `TraceReporterOptions` TypeScript types

## [0.1.1] - 2025-01-13

### Added
- **TypeScript type definitions** - Full type support for all exports
  - `taist/types` export path for type-only imports
  - Types for `Taist`, `TestResults`, `TraceSession`, `TraceCollector`, etc.
  - Conditional exports with `types` field in package.json
- **Native Vitest reporter plugin** (`taist/vitest-reporter`)
  - Outputs test results in TOON format (90% fewer tokens)
  - Integrated `TraceCollector` for automatic trace collection
  - Configurable options: `traceEnabled`, `traceDepth`, `showTrace`, etc.
  - Works with `vitest.config.js`: `reporters: ['taist/vitest-reporter']`
- **Comprehensive test coverage** for Vitest reporter (29 unit tests, 5 integration tests)

### Documentation
- Clarified side-effect import (`import 'taist/instrument'`) vs direct function imports
- Added "Vitest Reporter Plugin" section with step-by-step setup guide
- Added "TypeScript Support" section showing typed usage examples

## [0.1.0] - 2025-01-08

Initial pre-release with context-aware deep instrumentation.

### Added
- **Context-aware tracing** using AsyncLocalStorage for automatic parent-child trace relationships
  - Traces now show proper depth-based nesting (depth 0, 1, 2, etc.)
  - Each HTTP request becomes a trace root with nested service calls
- **`TraceSession`** class for simplified test integration
  - `start()` / `stop()` lifecycle management
  - `getEnv()` returns environment variables for traced processes
  - `printTraces()` / `formatTraces()` for trace output
- **`taist/testing`** module export for test suite integration
- **`instrumentExpress(app)`** - Wraps Express routes as trace roots (depth 0)
- **`instrumentServiceWithContext(service, name)`** - Context-aware service instrumentation
- **Bulk instrumentation API**:
  - `instrumentAll(pattern)` - Instrument all modules matching glob pattern
  - `instrumentDirectory(dir)` - Instrument all modules in a directory
  - `instrumentModules(paths)` - Instrument specific module paths
- **APM-style trace collection** with Unix socket-based collector
  - `TraceCollector` aggregates traces from instrumented processes
  - `TraceReporter` sends traces to collector
- **`ToonFormatter`** trace tree formatting:
  - `formatTraceTree()` - Format traces grouped by HTTP request
  - `printTraceTree()` - Print formatted trace output

### Changed
- Version reset to 0.1.0 (pre-release) - previous 1.x tags removed
- Traces now include `traceId`, `parentId`, and `depth` fields
- Express instrumentation creates fresh trace context per request

### Documentation
- README updated with Test Integration section
- TraceSession API documentation
- Example output showing nested trace hierarchy

[0.1.3]: https://github.com/davidpurkiss/taist/releases/tag/v0.1.3
[0.1.2]: https://github.com/davidpurkiss/taist/releases/tag/v0.1.2
[0.1.1]: https://github.com/davidpurkiss/taist/releases/tag/v0.1.1
[0.1.0]: https://github.com/davidpurkiss/taist/releases/tag/v0.1.0