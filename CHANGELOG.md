# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.0]: https://github.com/davidpurkiss/taist/releases/tag/v0.1.0