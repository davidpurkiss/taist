# Taist - AI Test Runner
## Token-Optimized Testing Framework for AI-Assisted Development

Version: 0.1.0 | January 2025 | [Technical Specification](./SPEC.md)

---

## Table of Contents
1. [Why Taist?](#why-taist)
2. [Execution Tree Output](#execution-tree-output)
3. [Quick Start](#quick-start)
4. [Integration Methods](#integration-methods)
5. [Test Integration](#test-integration)
6. [Configuration Reference](#configuration-reference)
7. [Usage Examples](#usage-examples)

---

## Why Taist?

Taist solves two critical problems when using LLMs for development and testing:

### 1. Token Reduction (90%)

Traditional test output wastes tokens on verbose formatting, redundant stack traces, and decorative elements. Taist compresses output using TOON (Token-Optimized Output Notation):

**Traditional Output (450 tokens)**
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

**TOON Output (45 tokens)**
```
✗ calc.add
  @test:15
  exp:6 got:5
  path:add(2,3)→5
```

### 2. Execution Visibility Without Code Changes

Instead of littering your code with `console.log` statements, Taist automatically traces function calls, arguments, return values, and errors. This gives LLMs the context they need to debug issues.

---

## Execution Tree Output

The execution tree is Taist's key debugging feature. It shows the complete call hierarchy with timing, arguments, return values, and errors - all without modifying your source code.

### Example Output

```
===TESTS: 5/12===

FAILURES:
✗ Order Creation > should create order with valid data
  @order.spec.ts:45
  expected 500 to be 200 // Object.is equality
  exp: "200"
  got: "500"

TRACE:
  fn:Route.POST /order/create ms:245 args:[{email:"test@..."}] ret:{status:500}
    fn:OrderService.createOrder ms:180 ret:{status:"error"}
      fn:ValidationService.validate ms:10 err:Invalid email format
      fn:AllocationService.allocate ms:45 (not called - previous error)
    fn:StripeService.createPaymentIntent ms:0 (not called)
```

### Reading the Trace

| Field | Meaning |
|-------|---------|
| `fn:` | Function name (Module.method format) |
| `ms:` | Execution duration in milliseconds |
| `args:` | Function arguments (truncated for readability) |
| `ret:` | Return value (truncated) |
| `err:` | Error message (if function threw) |

### Depth-Based Indentation

Indentation reveals the call hierarchy:
- **No indent**: Entry point (e.g., route handler)
- **2 spaces**: Called by entry point
- **4 spaces**: Nested call
- And so on...

In the example above, you can immediately see that:
1. The route handler called `OrderService.createOrder`
2. Which called `ValidationService.validate`
3. Which threw "Invalid email format"
4. This caused `AllocationService.allocate` and `StripeService.createPaymentIntent` to never be called

**This gives LLMs exactly the context they need to fix the bug.**

---

## Quick Start

### Option 1: ESM Loader (Recommended)
```bash
# Run any Node.js app with automatic tracing
node --import taist/module-patcher your-app.js
```

### Option 2: Manual Instrumentation
```javascript
// Add at the top of your service
import 'taist/instrument';
import { instrumentService } from 'taist/instrument';

const myService = instrumentService(new MyService(), 'MyService');
```

### Option 3: Programmatic API
```javascript
import { ServiceTracer } from 'taist';

const tracer = new ServiceTracer({ enabled: true, depth: 3 });
tracer.instrument(MyClass, 'MyClass');
```

---

## Integration Methods

| Method | Use Case | Setup |
|--------|----------|-------|
| **ESM Loader** | Node.js apps, automatic tracing | `node --import taist/module-patcher app.js` |
| **Import-based** | Express apps, selective tracing | `import 'taist/instrument'` |
| **Programmatic** | Full control, multiple tracers | `new ServiceTracer()` |

### ESM Loader Integration (Recommended)

The ESM Loader provides automatic instrumentation for Node.js applications without requiring code changes. Configure which modules to trace via `.taistrc.json`.

```bash
# Run any Node.js app with automatic tracing
node --import taist/module-patcher your-app.js

# With environment variables
TAIST_ENABLED=true TAIST_DEPTH=3 node --import taist/module-patcher your-app.js

# Debug mode (shows what's being instrumented)
TAIST_DEBUG=1 node --import taist/module-patcher your-app.js
```

**Configuration (`.taistrc.json`):**
```json
{
  "include": ["src/**/*.js", "services/**/*.js"],
  "exclude": ["**/node_modules/**", "**/*.test.js"],
  "depth": 3
}
```

**When to use:**
- Node.js applications (v18.19+ or v20.6+)
- Quick debugging without code changes
- Development and testing environments

### Import-based Instrumentation

For Express apps or when you want explicit control without CLI flags:

```javascript
// Add at the top of your entry point
import 'taist/instrument';
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
```

**Run with tracing:**
```bash
TAIST_ENABLED=true node server.js
```

**When to use:**
- Express/Fastify applications
- Gradual adoption into existing projects
- When you can't use `--import` flag

### Programmatic API

For full control over tracing configuration:

```javascript
import { ServiceTracer } from 'taist';

// Create tracer with explicit configuration
const tracer = new ServiceTracer({
  enabled: true,
  depth: 3,
  outputFormat: 'toon'
});

// Instrument classes
class UserService {
  async getUser(id) { /* ... */ }
}

const userService = new UserService();
tracer.instrument(userService, 'UserService');

// Or wrap individual functions
const tracedFn = tracer.wrapMethod(myFunction, 'myFunction');
```

**When to use:**
- Complex scenarios with multiple tracers
- Custom trace collection logic
- Maximum flexibility needed

---

## Test Integration

Use `TraceSession` to collect and display execution traces in your test suites. This provides visibility into what your code is doing during tests without modifying application code.

### Vitest / Jest Integration

```javascript
import { describe, it, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { TraceSession } from 'taist/testing';

let session;
let serverProcess;

beforeAll(async () => {
  // Start trace session
  session = new TraceSession();
  await session.start();

  // Start your server with tracing enabled
  serverProcess = spawn('node', ['server.js'], {
    env: {
      ...process.env,
      ...session.getEnv(),  // Adds TAIST_ENABLED and TAIST_COLLECTOR_SOCKET
      PORT: '3000',
    },
  });

  await waitForServer();
});

afterAll(async () => {
  // Stop server
  serverProcess?.kill('SIGTERM');

  // Print collected traces and stop session
  session.printTraces({ maxGroups: 5 });
  await session.stop();
});

describe('API Tests', () => {
  it('should create user', async () => {
    const res = await fetch('http://localhost:3000/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice' }),
    });
    expect(res.status).toBe(201);
  });
});
```

### TraceSession API

| Method | Description |
|--------|-------------|
| `start()` | Start the trace collector |
| `getEnv()` | Get environment variables for enabling tracing |
| `getTraces()` | Get collected trace objects |
| `printTraces(options)` | Format and print trace tree to console |
| `formatTraces(options)` | Format traces as string (without printing) |
| `stop()` | Stop the trace collector |

### Print Options

```javascript
session.printTraces({
  maxGroups: 10,    // Max request groups to show (default: 10)
  showToon: true,   // Also show TOON format summary (default: true)
  toonLimit: 30,    // Max traces for TOON output (default: 30)
});
```

### Example Output

When tests complete, you'll see the execution tree grouped by HTTP request:

```
============================================================
TRACE OUTPUT
============================================================
Traces: 45 | Requests: 12

--- Route.POST /users ---
  fn:Route.POST /users depth:0 45ms
    fn:UserService.register depth:1 30ms
      fn:UserService.validateEmail depth:2 5ms
      fn:UserService._hashPassword depth:2 10ms

--- Route.GET /users/:id ---
  fn:Route.GET /users/:id depth:0 12ms
    fn:UserService.getUser depth:1 8ms
      fn:Cache.get depth:2 2ms

... and 10 more requests
```

---

## Configuration Reference

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TAIST_ENABLED` | Enable/disable tracing | `true` (when loader used) |
| `TAIST_DEBUG` | Show internal taist operations | `false` |
| `TAIST_FORMAT` | Output format: `toon`, `json`, `compact` | `toon` |
| `TAIST_DEPTH` | Trace depth level (1-5) | `3` |
| `TAIST_INCLUDE` | Only trace modules matching patterns (comma-separated) | All files |
| `TAIST_EXCLUDE` | Skip modules matching patterns | `node_modules` |
| `TAIST_OUTPUT_FILE` | Write traces to file | stdout |
| `TAIST_OUTPUT_INTERVAL` | Output interval in ms | `30000` |
| `TAIST_SLOW_THRESHOLD` | Slow operation threshold in ms | `100` |

### CLI Options

```bash
taist test [options]    # Run tests once
taist watch [options]   # Run tests in watch mode
```

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--file` | `-f` | Source file(s) to test | `./src` |
| `--test` | `-t` | Test file(s) to run | `./test` |
| `--format` | | Output format | `toon` |
| `--watch` | `-w` | Enable watch mode | `false` |
| `--trace` | | Enable execution tracing | `false` |
| `--depth` | `-d` | Trace depth level (1-5) | `2` |
| `--output` | `-o` | Output file path | `stdout` |

### Output Formats

**TOON (Default)** - Token-optimized for AI consumption
```
[TAIST] up:120s calls:5432 err:3
[SLOW] 12 ops >100ms
[TOP] getUser:234 createUser:123
```

**JSON** - Structured for tooling
```json
{
  "stats": { "totalCalls": 5432, "totalErrors": 3 },
  "traces": { "topFunctions": { "UserService.getUser": 234 } }
}
```

**Compact** - One-line summaries for CI/CD

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

# With execution tracing
taist test --trace --depth 3
```

### With AI Tools

```bash
# Iterative development with Claude Code
taist watch -f ./src -t ./test

# Pipe to AI tools
taist test --format toon | gh copilot explain

# Generate fix suggestions
taist test --trace | your-ai-tool analyze
```

### CI/CD Integration

```yaml
# GitHub Actions
- name: Run AI-friendly tests
  run: |
    npm install -g taist
    taist test --format compact

- name: Store detailed results on failure
  if: failure()
  run: taist test --trace --format json > test-results.json
```

### Integration with package.json

```json
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

## Installation

```bash
# Global installation
npm install -g taist

# Project installation
npm install --save-dev taist
```

---

## License

MIT License - Open source and free for commercial use

## Support

- Issues: https://github.com/taist/taist/issues
- Technical Specification: [SPEC.md](./SPEC.md)
