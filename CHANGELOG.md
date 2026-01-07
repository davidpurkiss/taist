# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2025-01-07

### Added
- **APM-style tracing architecture** with Unix socket-based trace collection
  - `TraceCollector` for aggregating traces from multiple processes
  - `TraceReporter` client for sending traces to collector
  - Enables cross-process trace collection (server → collector)
- **HTTP integration testing example** demonstrating three instrumentation approaches:
  - ESM Loader Hooks (`node --import taist/module-patcher`)
  - Import-based (`import 'taist/instrument'`)
  - Fully Programmatic (`ServiceTracer` class)
- **Named exports support** - transforms now handle `export { Name }` pattern
- **Express server examples** with HTTP API tests using native `fetch()`

### Changed
- Transform now preserves shebang lines (`#!/usr/bin/env node`) at file top
- Transform filters out non-function/class exports (variables, instances)
- Module hooks use full file:// paths for trace-reporter imports
- Integration example restructured with multiple server variants

### Fixed
- Shebang handling - instrumentation no longer breaks executable scripts
- Named export detection for classes with `extends` keyword
- ESM loader now works correctly from any directory (not just taist root)

### Documentation
- New HTTP integration testing example in `examples/integration-service/`
- Comparison table for all three instrumentation approaches
- Scripts for testing each approach: `npm run test:http:loader`, etc.

## [1.1.0] - 2025-01-06

### Added
- **ESM Loader** for automatic function instrumentation (`node --import taist/loader app.js`)
- **Vite/Rollup plugin** for build-time instrumentation in bundled applications
- **Class instrumentation** support - automatically traces class methods
- **Debug logging** with `TAIST_DEBUG` environment variable
- **Shared transformation module** (`lib/transform.js`) for consistent code instrumentation
- **SPEC.md** technical specification document

### Changed
- **README restructured** - "Why Taist?" and "Execution Tree Output" now prominently featured
- README reduced from 1100+ lines to ~350 lines (technical content moved to SPEC.md)
- Improved logger API with generic methods (`log`, `debug`, `warn`, `error`)
- Environment variables consolidated into single reference table

### Fixed
- Sync methods no longer incorrectly return Promises when wrapped
- Self-instrumentation prevented (taist lib files excluded from tracing)
- Vitest plugin configuration now works correctly with TAIST_ENABLED

### Documentation
- New "Why Taist?" section highlighting core objectives (token reduction + debugging)
- Execution Tree Output moved to prominent position with detailed explanation
- Quick Start section with all three integration methods
- Separate SPEC.md for architecture, BNF grammar, benchmarks, and internals

## [1.0.0] - 2024-11-23

### Added
- Initial release of Taist (Token-Optimized AI Testing)
- TOON (Token-Optimized Output Notation) formatter with 90% token reduction
- Multiple output formats: TOON, JSON, and Compact
- CLI interface with commands: test, watch, trace, init
- Vitest integration for modern testing capabilities
- Watch mode for iterative AI-assisted development
- Execution tracer for runtime visibility without explicit logging
- Programmatic API for Node.js integration
- Comprehensive README with full specification
- Example test suites demonstrating usage
- Configuration file support (.taistrc.json)

### Features
- Token-efficient test output optimized for AI tools (Claude, Copilot, etc.)
- Real-time file watching with history tracking
- Configurable trace depth levels (1-5)
- Smart error message formatting and truncation
- Circular buffer for memory-efficient tracing
- Support for multiple test file patterns

### Documentation
- Complete API reference
- Usage examples for different scenarios
- Integration guides for CI/CD
- Performance benchmarks and considerations

[1.2.0]: https://github.com/davidpurkiss/taist/releases/tag/v1.2.0
[1.1.0]: https://github.com/davidpurkiss/taist/releases/tag/v1.1.0
[1.0.0]: https://github.com/davidpurkiss/taist/releases/tag/v1.0.0
