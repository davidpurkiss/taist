# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/davidpurkiss/taist/releases/tag/v1.0.0
