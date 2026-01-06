# Taist Technical Specification

Version: 1.1.0
Date: January 2026

This document contains technical specifications and implementation details for Taist. For usage instructions, see [README.md](./README.md).

---

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Core Components](#core-components)
3. [Data Flow](#data-flow)
4. [TOON Format Specification](#toon-format-specification)
5. [Error Code Reference](#error-code-reference)
6. [Benchmarks](#benchmarks)

---

## System Architecture

### Component Diagram

```
┌──────────────────────────────────────────────────────┐
│                   CLI Interface                       │
│                  (Commander.js)                       │
└─────────────┬────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────┐
│                 Test Orchestrator                     │
│         (Coordination & State Management)             │
└──────┬───────────────┬──────────────┬────────────────┘
       │               │              │
       ▼               ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   Vitest    │ │  Execution  │ │   Output    │
│   Runner    │ │   Tracer    │ │  Formatter  │
└─────────────┘ └─────────────┘ └─────────────┘
```

### High-Level Flow

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  Source Code    │────►│  AI Test     │────►│   TOON      │
│  + Test Files   │     │   Runner     │     │   Output    │
└─────────────────┘     └──────────────┘     └─────────────┘
                              │                      │
                              ▼                      ▼
                        ┌──────────────┐      ┌────────────┐
                        │  Execution   │      │ AI Tools   │
                        │   Tracer     │      │ (Claude,   │
                        └──────────────┘      │  Copilot)  │
                                              └────────────┘
```

---

## Core Components

### 1. CLI Interface (`taist.js`)

**Purpose**: Entry point for all user interactions

**Responsibilities**:
- Parse command-line arguments
- Initialize components
- Handle process lifecycle
- Stream output to appropriate destinations

**Commands**:
```bash
taist test [options]    # Run tests once
taist watch [options]   # Run tests in watch mode
taist trace [options]   # Run with deep execution tracing
```

### 2. TOON Formatter (`lib/toon-formatter.js`)

**Purpose**: Convert test results to token-optimized format

**Format Specification**:

```
===TESTS: {passed}/{total}===
[FAILURES:]
✗ {test_name}
  @{file}:{line}
  {error_message}
  [exp: {expected}]
  [got: {actual}]
  [path: {execution_path}]

[TRACE:]
  {function_trace_entries}

[COV: {percent}% ({covered}/{total})]
```

**Abbreviation Dictionary**:
| Full Term | Abbreviation |
|-----------|--------------|
| function | fn |
| error | err |
| expected | exp |
| received/got | got |
| undefined | undef |
| null | nil |
| test/testing | tst |
| passed | pass |
| failed | fail |
| arguments | args |
| return/result | ret |

**Truncation Rules**:
- String values: Max 50 characters
- Object representations: Show keys only (first 3)
- Arrays: Show length and first 2 items
- Stack traces: First 2 frames only
- Error messages: Remove timestamps and absolute paths

### 3. Execution Tracer (`lib/execution-tracer.js`)

**Purpose**: Capture runtime execution without explicit logging

**Features**:
- Function call interception
- Async operation tracking
- Memory usage monitoring
- Error capture with context
- Variable state snapshots

**Tracing Levels**:
1. **Level 1 - Minimal**: Test entry/exit, pass/fail
2. **Level 2 - Standard**: + Function calls, return values
3. **Level 3 - Detailed**: + Arguments, async operations
4. **Level 4 - Deep**: + Variable mutations, memory
5. **Level 5 - Complete**: Full execution replay

**Implementation Strategy**:
```javascript
// Proxy-based function wrapping
const wrap = (fn, name) => new Proxy(fn, {
  apply(target, thisArg, args) {
    tracer.enter(name, args);
    const result = Reflect.apply(target, thisArg, args);
    tracer.exit(name, result);
    return result;
  }
});

// AST transformation for automatic instrumentation
// Inject at build time or runtime via loader hooks
```

### 4. Vitest Runner (`lib/vitest-runner.js`)

**Purpose**: Execute tests and collect results

**Configuration**:
```javascript
{
  watch: false,
  reporters: ['ai-reporter'],
  ui: false,
  color: false,
  coverage: {
    enabled: true,
    reporter: ['json-summary'],
    all: true
  },
  logHeapUsage: true,
  maxConcurrency: 1  // Sequential for consistent traces
}
```

**Custom Reporter Features**:
- Suppress decorative output
- Capture only essential data
- Track memory per test
- Record execution time
- Extract simplified diffs

### 5. Watch Handler (`lib/watch-handler.js`)

**Purpose**: Enable iterative development with AI tools

**Features**:
- File change detection
- Incremental test runs
- History management
- Smart diffing between iterations
- Automatic result summarization

**History Format**:
```javascript
{
  iteration: number,
  timestamp: ISO8601,
  changes: string[],  // Changed files
  summary: {
    pass: number,
    fail: number,
    new_failures: string[],
    fixed: string[],
    key_errors: string[]  // Top 3 error messages
  }
}
```

### 6. Output Formatter (`lib/output-formatter.js`)

**Purpose**: Support multiple output formats

**Supported Formats**:

#### TOON (Default)
Optimized for AI consumption with aggressive compression

#### JSON
```json
{
  "status": "pass|fail",
  "stats": {
    "total": 10,
    "passed": 8,
    "failed": 2,
    "skipped": 0
  },
  "failures": [{
    "test": "should validate email",
    "error": "Invalid format",
    "location": "test.js:15",
    "diff": {
      "expected": true,
      "actual": false
    }
  }],
  "trace": [...],
  "coverage": {
    "percent": 85,
    "lines": [45, 58]
  }
}
```

#### Compact
One-line summaries for CI/CD integration

---

## Data Flow

1. **Input Phase**
   - CLI parses command arguments
   - Configuration loaded from file/defaults
   - Source and test files identified

2. **Instrumentation Phase**
   - Code transformed with tracing hooks
   - Test files prepared for execution
   - Coverage instrumentation added

3. **Execution Phase**
   - Tests run via Vitest
   - Execution traces collected
   - Memory and performance metrics gathered

4. **Output Phase**
   - Results formatted according to format type
   - History compressed and stored
   - Output streamed to stdout/file

---

## TOON Format Specification

### Grammar (BNF)

```bnf
<output> ::= <header> <failures>? <trace>? <coverage>?
<header> ::= "===TESTS:" <number> "/" <number> "===" <newline>
<failures> ::= "FAILURES:" <newline> <failure>+
<failure> ::= "✗" <name> <newline>
              "@" <location> <newline>
              <error_detail>+
<error_detail> ::= <indent> <key> ":" <value> <newline>
<trace> ::= "TRACE:" <newline> <trace_entry>+
<trace_entry> ::= <indent> "fn:" <name> "," "ms:" <number>
                  ["," "args:" <args>] ["," "err:" <message>] <newline>
<coverage> ::= "COV:" <number> "%" "(" <number> "/" <number> ")" <newline>
```

### Design Principles

1. **Compression First**: Every byte of output must provide value
2. **AI-Optimized**: Structure output for LLM pattern recognition
3. **Progressive Disclosure**: Show only what's needed, when it's needed

---

## Error Code Reference

| Code | Description | Solution |
|------|-------------|----------|
| T001 | Trace buffer overflow | Increase buffer size or reduce depth |
| T002 | Invalid format specified | Use: toon, json, or compact |
| T003 | No tests found | Check test file patterns |
| T004 | Instrumentation failed | Verify Node.js version >= 18 |
| T005 | Watch mode error | Check file permissions |

---

## Benchmarks

Test scenario: 100 test files, 10 tests each, 20% failure rate

| Metric | Baseline (Vitest) | Taist | Difference |
|--------|------------------|-------|------------|
| Execution time | 2.5s | 2.6s | +4% |
| Memory usage | 120MB | 145MB | +21% |
| Output size | 45KB | 4.5KB | -90% |
| Token count | 15,000 | 1,500 | -90% |

### Performance Targets

- Overhead: < 5% vs native Vitest
- Memory: < 50MB additional usage
- Output latency: < 100ms
- Watch mode reaction: < 500ms

### Memory Management

- Trace buffer: Circular buffer of 1000 entries
- History storage: Last 10 iterations only
- Streaming output: No full result accumulation
- Lazy evaluation: Traces computed on-demand

---

## Future Enhancements

### Phase 1 (v1.1)
- [ ] Browser/Deno support
- [ ] Custom abbreviation dictionaries
- [ ] Test result caching
- [ ] Parallel test execution with trace merging

### Phase 2 (v1.2)
- [ ] Language model-specific formats (Claude, GPT, Gemini)
- [ ] Intelligent test prioritization
- [ ] Automatic test generation from traces
- [ ] Visual trace explorer

### Phase 3 (v2.0)
- [ ] Multi-language support (Python, Go, Rust)
- [ ] Distributed tracing
- [ ] AI feedback integration
- [ ] Learning from fix patterns

### Potential Integrations
- **Test Frameworks**: Jest, Mocha, Playwright
- **AI Platforms**: OpenAI, Anthropic, Google, Local LLMs
- **CI/CD**: GitHub Actions, GitLab CI, Jenkins
- **IDEs**: VSCode, Cursor, Zed
