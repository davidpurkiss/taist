# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.11] - 2025-01-15

### Fixed
- **Glob matcher bug with multi-level directory patterns** - Patterns like `src/**/*.ts` now correctly match files in nested directories (e.g., `src/resolvers/ecomm/orderUpsert.ts`)
  - Root cause: Replacement order caused `*` inside `(?:.*\/)?` to be incorrectly replaced
  - Fix: Use placeholders to prevent double-replacement during regex conversion
- **Duplicate trace output** - Removed redundant TRACE section from `format()` method
  - `formatTraceTree()` is now the sole trace output, providing grouped-by-request output with stats
- **Build-time instrumentation not connecting to trace collector** - Added `connectEager()` call to injected code
  - Transformed code now automatically connects to the collector when `TAIST_COLLECTOR_SOCKET` is set
  - Fixes issue where `calls:0` was shown even though instrumented code was executing

## [0.1.10] - 2025-01-14

### Fixed
- **Class hoisting issue with circular dependencies** - Classes are now instrumented in-place instead of being renamed and re-exported
  - `export class Foo` stays as-is (preserves JavaScript hoisting)
  - `__taist_instrumentClass(Foo, ...)` is called after the class definition
  - Fixes "Cannot access 'X' before initialization" errors in bundled code with circular deps
  - Functions still use the rename/re-export pattern (hoisting not an issue for function expressions)

## [0.1.9] - 2025-01-14

### Added
- **Rollup/Vite plugin for build-time instrumentation** - Enables deep tracing in bundled applications
  - `taist/rollup-plugin` - Rollup plugin for build-time instrumentation
  - `taist/vite-plugin` - Vite plugin (re-exports Rollup plugin)
  - Transforms source files during build, before bundling collapses them
  - Solves the bundled code problem where ESM loader only sees the bundle
  - TypeScript type definitions included

## [0.1.8] - 2025-01-14

### Added
- **`instrumentModule` export** - Now exported from `taist/instrument` for convenient module-level instrumentation
  - Wraps all function exports with context-aware tracing
  - Classes are wrapped so new instances are automatically instrumented
  - Usage: `const traced = instrumentModule(myModuleExports, 'MyModule')`
- TypeScript type definition for `instrumentModule`

## [0.1.7] - 2025-01-14

### Fixed
- **Race condition between shutdown signal and SIGTERM** - Fixed issue where SIGTERM handler could call `close()` while `_handleShutdown` was still flushing traces
  - Added `shuttingDown` flag to prevent exit handlers from interfering with graceful shutdown
  - Exit handlers now skip cleanup if shutdown is already in progress

## [0.1.6] - 2025-01-14

### Fixed
- **Reliable cross-process trace delivery** - Fixed race condition where traces were written to OS kernel buffer but not read by collector before socket closed
  - Reporter now waits for drain event before closing socket
  - Reporter uses graceful socket.end() instead of destroy
  - Collector gives 100ms grace period after socket.end() for data to be read
  - Added `_gracefulClose()` method with proper TCP shutdown sequence
- Fixes issue where traces from child processes (e.g., GraphQL resolvers in Directus) were lost

## [0.1.5] - 2025-01-13

### Fixed
- **Graceful shutdown protocol for trace collection** - Collector now sends shutdown signal to workers and waits for them to flush traces before closing, instead of relying on arbitrary timeouts
- TraceReporter now handles shutdown signal by immediately flushing buffered traces
- Removed arbitrary 100ms delay in vitest reporter, replaced with proper 2s graceful shutdown

## [0.1.4] - 2025-01-13

### Fixed
- Timer and interval handles now use `unref()` to prevent blocking process exit
- Removed `process.exit(0)` from signal handlers to avoid interfering with test runners like Vitest
- Fixes "close timed out" warning when running tests with taist instrumentation

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

[0.1.11]: https://github.com/davidpurkiss/taist/releases/tag/v0.1.11
[0.1.10]: https://github.com/davidpurkiss/taist/releases/tag/v0.1.10
[0.1.9]: https://github.com/davidpurkiss/taist/releases/tag/v0.1.9
[0.1.8]: https://github.com/davidpurkiss/taist/releases/tag/v0.1.8
[0.1.7]: https://github.com/davidpurkiss/taist/releases/tag/v0.1.7
[0.1.6]: https://github.com/davidpurkiss/taist/releases/tag/v0.1.6
[0.1.5]: https://github.com/davidpurkiss/taist/releases/tag/v0.1.5
[0.1.4]: https://github.com/davidpurkiss/taist/releases/tag/v0.1.4
[0.1.3]: https://github.com/davidpurkiss/taist/releases/tag/v0.1.3
[0.1.2]: https://github.com/davidpurkiss/taist/releases/tag/v0.1.2
[0.1.1]: https://github.com/davidpurkiss/taist/releases/tag/v0.1.1
[0.1.0]: https://github.com/davidpurkiss/taist/releases/tag/v0.1.0