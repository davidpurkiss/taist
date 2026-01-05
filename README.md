# Taist - AI Test Runner
## Token-Optimized Testing Framework for AI-Assisted Development

Version: 1.0.0
Date: November 2024
Status: Draft Specification

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Solution Overview](#solution-overview)
4. [System Architecture](#system-architecture)
5. [Core Components](#core-components)
6. [Implementation Details](#implementation-details)
7. [API Reference](#api-reference)
8. [Usage Examples](#usage-examples)
9. [Performance Considerations](#performance-considerations)
10. [Future Enhancements](#future-enhancements)

---

## Executive Summary

Taist (Token-Optimized AI Testing) is a standalone Node.js testing framework designed to facilitate AI-assisted test-driven development (TDD) by providing token-efficient, structured output optimized for consumption by AI tools like Claude Code, GitHub Copilot CLI, and other LLM-based development assistants.

### Key Features
- **Token-efficient output formats** (TOON - Token-Optimized Output Notation)
- **Runtime execution tracing** without explicit logging
- **Production service monitoring** with zero-config instrumentation
- **Vitest integration** for modern testing capabilities
- **Watch mode** for iterative AI-assisted development
- **AI-agnostic design** - works with any AI tool
- **Minimal context windows** through intelligent summarization

---

## Problem Statement

### Current Challenges in AI-Assisted Development

1. **Token Consumption**
   - Traditional test outputs are verbose and unstructured
   - Multiple iterations consume entire context windows
   - Log files contain redundant information
   - Stack traces include irrelevant details

2. **Lack of Observability**
   - Developers must add explicit console.log statements
   - Execution flow is opaque without debugging
   - Variable states are not captured automatically
   - Async operations are difficult to trace

3. **Inefficient Feedback Loops**
   - AI tools receive unstructured test output
   - Error messages lack context about execution
   - Previous iteration history is lost
   - Coverage information is not integrated

4. **Tool Integration Issues**
   - No standard format for AI consumption
   - Manual copying of test results
   - Poor integration with existing test runners
   - Difficult to use in CI/CD pipelines

### Requirements

- **R1**: Reduce token usage by 70% compared to standard test output
- **R2**: Provide execution visibility without code modification
- **R3**: Support iterative development with history tracking
- **R4**: Integrate seamlessly with existing Node.js projects
- **R5**: Output structured, parseable formats for AI tools

---

## Solution Overview

### Design Principles

1. **Compression First**: Every byte of output must provide value
2. **AI-Optimized**: Structure output for LLM pattern recognition
3. **Zero Configuration**: Work out-of-the-box with sensible defaults
4. **Progressive Disclosure**: Show only what's needed, when it's needed
5. **Tool Agnostic**: No vendor lock-in or AI service dependencies

### High-Level Architecture

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

### Output Format Comparison

#### Traditional Output (450 tokens)
```
FAIL  test/calculator.test.js > Calculator > should add two numbers
AssertionError: expected 5 to be 6
  Expected: 6
  Received: 5
    at /Users/dev/project/test/calculator.test.js:15:23
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
    at Module._compile (node:internal/modules/cjs/loader:1376:14)
    at Module._extensions..js (node:internal/modules/cjs/loader:1435:10)
```

#### TOON Output (45 tokens)
```
✗ calc.add
  @test:15
  exp:6 got:5
  path:add(2,3)→5
```

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

---

## Production Service Monitoring

Taist provides zero-configuration instrumentation for production Node.js services, capturing execution traces, performance metrics, and errors in real-time.

### Quick Start

#### 1. Add to Your Service

```javascript
// Add at the top of your service entry point
import 'taist/instrument';
// Or: require('taist/instrument');
```

#### 2. Run with Monitoring

```bash
# Enable via environment variable
TAIST_ENABLED=true node server.js

# Or use the CLI
taist monitor server.js

# With configuration
TAIST_ENABLED=true \
TAIST_FORMAT=toon \
TAIST_DEPTH=3 \
TAIST_OUTPUT_FILE=traces.log \
node server.js
```

### Express Integration Example

```javascript
import { instrumentExpress, instrumentService } from 'taist/instrument';
import express from 'express';

// Instrument service classes
class UserService {
  async createUser(data) { /* ... */ }
  async getUser(id) { /* ... */ }
}

const userService = instrumentService(new UserService(), 'UserService');

// Instrument Express app
const app = express();
instrumentExpress(app);

// Routes are automatically traced
app.get('/users/:id', async (req, res) => {
  const user = await userService.getUser(req.params.id);
  res.json(user);
});

// Add trace endpoints
app.get('/trace/insights', (req, res) => {
  res.json(tracer.getInsights());
});
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TAIST_ENABLED` | Enable/disable tracing | `true` |
| `TAIST_FORMAT` | Output format (toon/json/compact/human) | `toon` |
| `TAIST_DEPTH` | Trace depth level (1-5) | `3` |
| `TAIST_OUTPUT_FILE` | File to write traces | - |
| `TAIST_OUTPUT_INTERVAL` | Output interval in ms | `30000` |
| `TAIST_INCLUDE` | Patterns to include (comma-separated) | - |
| `TAIST_EXCLUDE` | Patterns to exclude (comma-separated) | - |
| `TAIST_SLOW_THRESHOLD` | Slow operation threshold in ms | `100` |

### Output Formats

#### TOON Format (Token-Optimized)
```
[TAIST] up:120s calls:5432 err:3
[SLOW] 12 ops >100ms
[BUGS] 2 detected
  • email_validation
  • division_by_zero
[TOP] getUser:234 createUser:123 listUsers:89
[ERR] User not found, Invalid email
```

#### JSON Format (Structured)
```json
{
  "stats": {
    "totalCalls": 5432,
    "totalErrors": 3,
    "slowOperations": 12,
    "bugsDetected": 2
  },
  "traces": {
    "topFunctions": {
      "UserService.getUser": 234,
      "UserService.createUser": 123
    }
  }
}
```

### Verification

Test your instrumentation with the included verification script:

```bash
# Terminal 1: Start service with tracing
cd examples/express-service
npm install express
npm run start:traced

# Terminal 2: Run verification
node test-api.js
```

Expected output:
- ✓ Function call tracking
- ✓ Error capture
- ✓ Slow operation detection
- ✓ Real-time insights
- ✓ TOON formatted output

### Production Best Practices

1. **Performance Impact**: Tracing adds ~2-5% overhead at depth 3
2. **Memory Usage**: Circular buffer limits memory to ~10MB
3. **Security**: Exclude sensitive patterns with `TAIST_EXCLUDE`
4. **Output**: Write to file for production (`TAIST_OUTPUT_FILE`)
5. **Sampling**: Use depth 1-2 for high-traffic services

### API Reference

```javascript
import { tracer, autoInstrument } from 'taist/instrument';

// Instrument a class
const instrumented = autoInstrument(MyClass, 'MyClass');

// Get insights programmatically
const insights = tracer.getInsights();

// Format output
const output = tracer.formatOutput(insights);

// Clear traces
tracer.clearTraces();

// Enable/disable at runtime
tracer.setEnabled(false);
```

---

### Data Flow

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

**Options**:
| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--file` | `-f` | Source file(s) to test | `./src` |
| `--test` | `-t` | Test file(s) to run | `./test` |
| `--format` | | Output format (toon\|json\|compact) | `toon` |
| `--watch` | `-w` | Enable watch mode | `false` |
| `--trace` | | Enable execution tracing | `false` |
| `--depth` | `-d` | Trace depth level (1-5) | `2` |
| `--output` | `-o` | Output file path | `stdout` |
| `--config` | `-c` | Config file path | `.aitestrc` |

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

## Implementation Details

### Installation & Setup

```bash
# Global installation
npm install -g taist

# Project installation
npm install --save-dev taist

# Configuration file (.taistrc.json)
{
  "format": "toon",
  "trace": {
    "enabled": false,
    "depth": 2
  },
  "watch": {
    "ignore": ["node_modules", ".git"],
    "delay": 500
  },
  "output": {
    "abbreviate": true,
    "maxTokens": 1000
  }
}
```

### Node.js Loader Hook Integration

```javascript
// loader.mjs - For instrumentation without modification
export async function load(url, context, defaultLoad) {
  const result = await defaultLoad(url, context);

  if (result.format === 'module') {
    const source = result.source.toString();
    const instrumented = await instrumentCode(source, url);

    return {
      format: 'module',
      source: instrumented,
      shortCircuit: true
    };
  }

  return result;
}
```

### Integration with Existing Projects

```json
// package.json
{
  "scripts": {
    "test": "vitest",
    "test:ai": "taist test --format toon",
    "test:watch": "taist watch",
    "test:trace": "taist test --trace --depth 3"
  }
}
```

---

## API Reference

### JavaScript API

```javascript
import { Taist } from 'taist';

const runner = new Taist({
  format: 'toon',
  trace: true,
  depth: 2
});

// Run tests programmatically
const results = await runner.run({
  files: ['./src/*.js'],
  tests: ['./test/*.test.js']
});

// Access formatted output
const output = runner.format(results);

// Watch mode with callback
runner.watch({
  onChange: (results) => {
    console.log('Tests updated:', results.summary);
  }
});
```

### Output Stream API

```javascript
// Stream results for real-time processing
const stream = runner.stream();

stream.on('test:pass', (test) => {
  console.log(`✓ ${test.name}`);
});

stream.on('test:fail', (test) => {
  console.log(`✗ ${test.name}: ${test.error}`);
});

stream.on('complete', (summary) => {
  console.log(`Total: ${summary.passed}/${summary.total}`);
});
```

---

## Usage Examples

### Basic Testing
```bash
# Run all tests with TOON output
taist test

# Test specific files
taist test -f ./src/email.js -t ./test/email.test.js

# JSON output for tooling
taist test --format json > results.json
```

### With AI Tools

#### Claude Code
```bash
# Iterative development with Claude
taist watch -f ./src -t ./test

# In another terminal
claude-code "Fix the failing test based on this output: $(cat .taist-output)"
```

#### GitHub Copilot CLI
```bash
# Get fix suggestions
taist test --format toon | gh copilot explain

# Generate missing tests
taist trace -d 3 | gh copilot suggest "Add tests for uncovered paths"
```

#### Custom AI Integration
```bash
# Pipe to any AI tool
taist test --format json | curl -X POST https://ai-api.example.com/fix \
  -H "Content-Type: application/json" \
  -d @-
```

### CI/CD Integration

```yaml
# GitHub Actions
- name: Run AI-friendly tests
  run: |
    npm install -g taist
    taist test --format compact

- name: Store test results
  if: failure()
  run: taist test --format json > test-results.json

- name: Get AI suggestions
  if: failure()
  run: |
    echo "Test failures detected. AI Analysis:"
    taist test --format toon | your-ai-tool analyze
```

---

## Performance Considerations

### Token Usage Optimization

| Output Type | Traditional | TOON | Reduction |
|-------------|------------|------|-----------|
| Single test failure | 450 tokens | 45 tokens | 90% |
| 10 test suite | 3,500 tokens | 350 tokens | 90% |
| With execution trace | 8,000 tokens | 800 tokens | 90% |
| Full coverage report | 2,000 tokens | 200 tokens | 90% |

### Memory Management

- Trace buffer: Circular buffer of 1000 entries
- History storage: Last 10 iterations only
- Streaming output: No full result accumulation
- Lazy evaluation: Traces computed on-demand

### Performance Targets

- Overhead: < 5% vs native Vitest
- Memory: < 50MB additional usage
- Output latency: < 100ms
- Watch mode reaction: < 500ms

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

---

## Appendix

### A. TOON Grammar (BNF)

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

### B. Error Code Reference

| Code | Description | Solution |
|------|-------------|----------|
| T001 | Trace buffer overflow | Increase buffer size or reduce depth |
| T002 | Invalid format specified | Use: toon, json, or compact |
| T003 | No tests found | Check test file patterns |
| T004 | Instrumentation failed | Verify Node.js version >= 18 |
| T005 | Watch mode error | Check file permissions |

### C. Benchmarks

Test scenario: 100 test files, 10 tests each, 20% failure rate

| Metric | Baseline (Vitest) | AI Test Runner | Difference |
|--------|------------------|----------------|------------|
| Execution time | 2.5s | 2.6s | +4% |
| Memory usage | 120MB | 145MB | +21% |
| Output size | 45KB | 4.5KB | -90% |
| Token count | 15,000 | 1,500 | -90% |

---

## License

MIT License - Open source and free for commercial use

## Contributing

See CONTRIBUTING.md for guidelines on submitting improvements.

## Support

- Documentation: https://taist.dev
- Issues: https://github.com/taist/taist/issues
- Discord: https://discord.gg/taist

---

*End of Specification Document v1.0.0*
