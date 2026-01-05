# Taist Integration Service Example

This example demonstrates using Taist to monitor and debug a Node.js service with real-world issues. It showcases Taist's execution tracing, TOON output format, and debugging capabilities.

## Overview

The example includes:
- **UserService**: A sample service with intentional bugs and performance issues
- **Integration Tests**: Comprehensive test suite that exposes the bugs
- **Monitoring Runner**: Script that uses Taist's programmatic API for detailed monitoring
- **TOON Output**: Token-optimized format for AI-assisted debugging

## Intentional Issues

The UserService contains several intentional bugs to demonstrate Taist's monitoring capabilities:

### 1. **Email Validation Bug** (`user-service.js:40`)
- Doesn't handle emails with `+` signs or multiple dots
- **Fix**: Update regex to `/^[^\s@]+@[^\s@]+(\.[^\s@]+)+$/`

### 2. **Missing Null Check** (`user-service.js:48`)
- Crashes when name is undefined
- **Fix**: Add `if (!name || name.length < 2)`

### 3. **Password Validation Error** (`user-service.js:56`)
- Off-by-one error allows 7-character passwords
- **Fix**: Change to `if (password.length < 8)`

### 4. **Type Coercion Issue** (`user-service.js:61`)
- String ages fail comparison
- **Fix**: Use `Number(age) < 18`

### 5. **Race Condition** (`user-service.js:68`)
- Concurrent registrations can generate duplicate IDs
- **Fix**: Use atomic ID generation or mutex

### 6. **Memory Leak** (`user-service.js:24`)
- Cache array never cleared
- **Fix**: Clear cache in `cleanup()` and `deleteUser()`

### 7. **Rate Limit Bug** (`user-service.js:157`)
- Off-by-one allows 11 requests instead of 10
- **Fix**: Change to `if (recentRequests.length >= 10)`

### 8. **Division by Zero** (`user-service.js:195`)
- Stats calculation fails with no users
- **Fix**: Add `totalUsers > 0 ? cacheSize / totalUsers : 0`

### 9. **Infinite Loop** (`user-service.js:110`)
- Wrong age range causes infinite loop
- **Fix**: Validate `minAge <= maxAge` before loop

### 10. **Incomplete Cleanup** (`user-service.js:210`)
- Doesn't clear cache or rate limit map
- **Fix**: Add `this.userCache = []` and `this.rateLimitMap.clear()`

## Running the Example

### Quick Start

```bash
# Run with default settings (TOON format, trace level 3)
npm run example:integration

# Run in watch mode
npm run example:integration:watch

# Run with deep tracing
npm run example:integration:trace
```

### Manual Execution

```bash
# Basic run with TOON output
node examples/integration-service/run-monitored-tests.js

# JSON output format
node examples/integration-service/run-monitored-tests.js --json

# Compact output for CI/CD
node examples/integration-service/run-monitored-tests.js --compact

# Different trace levels
node examples/integration-service/run-monitored-tests.js --trace        # Level 2
node examples/integration-service/run-monitored-tests.js --trace-detailed # Level 3 (default)
node examples/integration-service/run-monitored-tests.js --trace-deep    # Level 4

# Watch mode
node examples/integration-service/run-monitored-tests.js --watch
```

## Understanding the Output

### TOON Format

The TOON (Token-Optimized Output Notation) format provides concise, AI-friendly output:

```
[TST] ✗ 15/25              # 15 passed, 25 total tests
[FAIL] Test Failures:
  1. email with plus sign
    [TRC] Execution trace:
      → UserSvc.register({nm:"Jane",em:"jane+test@..."})
      → UserSvc.validateEmail("jane+test@example.com")
        [ERR] Invalid email format
    [ERR] ValidationError: Invalid email format
    [LOC] Line 40
[FIX] user-service.js:40
  Issue: Email regex doesn't handle + or multiple dots
  Fix: Use: /^[^\s@]+@[^\s@]+(\.[^\s@]+)+$/
[PERF] Duration: 234ms
[MEM] Heap: 12.5MB
```

Key abbreviations:
- `TST`: Test results
- `TRC`: Execution trace
- `ERR`: Error message
- `LOC`: Source location
- `FIX`: Fix suggestion
- `PERF`: Performance metrics
- `MEM`: Memory usage
- `VAR`: Variable state
- `SLOW`: Slow operations

### JSON Format

Structured output for programmatic consumption:

```json
{
  "status": "failed",
  "stats": {
    "total": 25,
    "passed": 15,
    "failed": 10
  },
  "failures": [...],
  "trace": [...],
  "duration": 234,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Compact Format

Single-line output for CI/CD pipelines:

```
✗ 15/25 fail:10 (ValidationError) cov:85% 234ms
```

## Integration with Node.js Services

### Programmatic API

```javascript
import { Taist } from 'taist';
import { ExecutionTracer } from 'taist/lib/execution-tracer.js';

// Initialize Taist
const taist = new Taist({
  format: 'toon',
  trace: { enabled: true, depth: 3 }
});

// Run tests with monitoring
const results = await taist.runTests();

// Process results
if (results.failures.length > 0) {
  console.log('Tests failed:', results.failures);
}
```

### Wrapping Functions for Monitoring

```javascript
const tracer = new ExecutionTracer(3);

// Wrap individual functions
const wrappedFunction = tracer.wrapFunction(originalFunction, 'functionName');

// Wrap class methods
const proto = MyClass.prototype;
Object.getOwnPropertyNames(proto).forEach(method => {
  if (typeof proto[method] === 'function') {
    proto[method] = tracer.wrapFunction(proto[method], `MyClass.${method}`);
  }
});
```

### Watch Mode Integration

```javascript
const taist = new Taist({ watch: true });

taist.on('iteration', (data) => {
  console.log(`Iteration ${data.iteration}: ${data.status}`);
});

taist.on('change', (files) => {
  console.log('Files changed:', files);
});

await taist.runTests();
```

## Debugging Workflow

1. **Run tests with monitoring** to identify failures
2. **Examine TOON output** for execution traces and error context
3. **Check fix suggestions** for common issues
4. **Enable deeper tracing** if needed (level 4-5)
5. **Use watch mode** for iterative debugging
6. **Apply fixes** based on insights
7. **Re-run tests** to verify fixes

## Configuration

The `.taistrc.json` file configures Taist for this example:

```json
{
  "format": "toon",          // Output format
  "trace": {
    "enabled": true,         // Enable execution tracing
    "depth": 3              // Trace depth (1-5)
  },
  "watch": {
    "ignore": ["**/node_modules/**"],
    "delay": 1000           // Debounce delay
  },
  "output": {
    "abbreviate": true,     // Use abbreviations
    "maxTokens": 5000      // Token limit for AI tools
  }
}
```

## Benefits for AI-Assisted Development

1. **90% Token Reduction**: TOON format uses minimal tokens
2. **Contextual Traces**: Shows execution path leading to failures
3. **Fix Suggestions**: Provides specific fixes for common issues
4. **Performance Insights**: Identifies slow operations and memory leaks
5. **Real-time Monitoring**: Watch mode for continuous feedback

## Extending the Example

To add your own issues for testing:

1. Add new methods or bugs to `user-service.js`
2. Create corresponding tests in `tests/user-service.test.js`
3. Update fix suggestions in `run-monitored-tests.js`
4. Document the issue in this README

## Troubleshooting

- **Tests not running**: Ensure Vitest is installed (`npm install`)
- **No trace output**: Check trace level is 2 or higher
- **Memory issues**: Reduce trace depth or limit test scope
- **Watch mode not working**: Check file patterns in `.taistrc.json`

## Learn More

- [Taist Documentation](../../README.md)
- [TOON Format Specification](../../docs/toon-format.md)
- [Execution Tracer API](../../docs/execution-tracer.md)
- [Vitest Integration](https://vitest.dev)