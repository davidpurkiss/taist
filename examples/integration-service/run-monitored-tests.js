#!/usr/bin/env node

/**
 * Monitoring runner for integration tests
 * Demonstrates using Taist's programmatic API to monitor test execution
 * with detailed tracing and TOON format output
 */

import { Taist } from '../../index.js';
import { ExecutionTracer } from '../../lib/execution-tracer.js';
import { UserService } from './user-service.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const format = args.includes('--json') ? 'json' :
               args.includes('--compact') ? 'compact' : 'toon';
const traceLevel = args.includes('--trace-deep') ? 4 :
                  args.includes('--trace-detailed') ? 3 :
                  args.includes('--trace') ? 2 : 3; // Default to detailed
const watch = args.includes('--watch');

async function runMonitoredTests() {
  console.log('Starting Taist Integration Test Monitor\n');
  console.log(`Output Format: ${format.toUpperCase()}`);
  console.log(`Trace Level: ${traceLevel}`);
  console.log(`Watch Mode: ${watch ? 'Enabled' : 'Disabled'}\n`);
  console.log('=' .repeat(60));

  // Initialize Taist with monitoring configuration
  const taist = new Taist({
    tests: [path.join(__dirname, 'tests', 'user-service.test.js')],
    format: format,
    trace: true,
    depth: traceLevel,
    output: {
      abbreviate: true,
      maxTokens: 5000
    },
    watch: watch ? {
      ignore: ['**/node_modules/**', '**/.git/**'],
      delay: 1000
    } : undefined
  });

  // Set up execution tracer for the UserService
  const tracer = new ExecutionTracer({ enabled: true, depth: traceLevel });

  // Wrap UserService methods for monitoring
  if (traceLevel >= 2) {
    console.log('Instrumenting UserService for monitoring...\n');
    instrumentUserService(tracer);
  }

  // Handle watch mode events
  if (watch) {
    taist.on('iteration', (data) => {
      console.log('\n' + '='.repeat(60));
      console.log(`Watch Iteration #${data.iteration}`);
      console.log('='.repeat(60) + '\n');
    });

    taist.on('change', (files) => {
      console.log(`Files changed: ${files.join(', ')}\n`);
    });
  }

  try {
    // Run the tests
    console.log('Running integration tests with monitoring...\n');
    const results = await taist.run();

    // Display results based on format
    if (format === 'toon') {
      displayToonResults(results, tracer);
    } else if (format === 'json') {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log(results);
    }

    // Display trace insights if enabled
    if (traceLevel >= 2 && format === 'toon') {
      displayTraceInsights(tracer);
    }

    // Display fix suggestions for failures
    if (results.failures && results.failures.length > 0) {
      displayFixSuggestions(results.failures);
    }

    // Exit with appropriate code unless in watch mode
    if (!watch) {
      process.exit(results.status === 'passed' ? 0 : 1);
    }

  } catch (error) {
    console.error('Error running monitored tests:', error);
    process.exit(1);
  }
}

/**
 * Instrument UserService methods for monitoring
 */
function instrumentUserService(tracer) {
  const proto = UserService.prototype;
  const methods = Object.getOwnPropertyNames(proto)
    .filter(name => name !== 'constructor' && typeof proto[name] === 'function');

  methods.forEach(method => {
    const original = proto[method];
    proto[method] = tracer.wrap(original, `UserService.${method}`);
  });
}

/**
 * Display results in enhanced TOON format with trace data
 */
function displayToonResults(results, tracer) {
  console.log('\nTest Results (TOON Format):\n');
  console.log('=' .repeat(60));

  // Overall status
  const statusIcon = results.status === 'passed' ? '✓' : '✗';
  console.log(`[TST] ${statusIcon} ${results.stats.passed}/${results.stats.total}`);

  // Display failures with trace context
  if (results.failures && results.failures.length > 0) {
    console.log('\n[FAIL] Test Failures:');
    results.failures.forEach((failure, idx) => {
      console.log(`  ${idx + 1}. ${failure.test}`);

      // Get relevant trace for this failure
      const relevantTrace = tracer.getTraces().filter(t => t.type === 'error');
      if (relevantTrace && relevantTrace.length > 0) {
        console.log('    [TRC] Execution trace:');
        relevantTrace.slice(-3).forEach(entry => {
          const args = entry.args ? JSON.stringify(entry.args).substring(0, 30) : '';
          console.log(`      → ${entry.name}(${args})`);
          if (entry.error) {
            console.log(`        [ERR] ${entry.error.message}`);
          }
        });
      }

      console.log(`    [ERR] ${failure.error || 'Unknown error'}`);
      if (failure.stack) {
        const line = failure.stack.split('\n')[1];
        const match = line.match(/:(\d+):/);
        if (match) {
          console.log(`    [LOC] Line ${match[1]}`);
        }
      }
    });
  }

  // Performance metrics
  if (results.duration) {
    console.log(`\n[PERF] Duration: ${results.duration}ms`);
  }

  // Memory usage
  const memUsage = process.memoryUsage();
  console.log(`[MEM] Heap: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);

  console.log('=' .repeat(60));
}

/**
 * Display trace insights for debugging
 */
function displayTraceInsights(tracer) {
  console.log('\nExecution Insights:\n');
  console.log('=' .repeat(60));

  const trace = tracer.getTraces();

  // Find slow operations
  const slowOps = trace.filter(t => t.duration && t.duration > 100);
  if (slowOps.length > 0) {
    console.log('[SLOW] Slow Operations (>100ms):');
    slowOps.forEach(op => {
      console.log(`  • ${op.name}: ${op.duration}ms`);
    });
  }

  // Find errors
  const errors = trace.filter(t => t.error);
  if (errors.length > 0) {
    console.log('\n[ERRORS] Caught Errors:');
    errors.forEach(err => {
      console.log(`  • ${err.name}: ${err.error.message}`);
    });
  }

  // Memory leaks indicator
  const memoryOps = trace.filter(t => t.memory);
  if (memoryOps.length > 1) {
    const firstMem = memoryOps[0].memory;
    const lastMem = memoryOps[memoryOps.length - 1].memory;
    const increase = lastMem - firstMem;
    if (increase > 5) { // More than 5MB increase
      console.log(`\n[LEAK] Potential memory leak detected: +${increase.toFixed(2)}MB`);
    }
  }

  // Most called functions
  const callCounts = {};
  trace.forEach(t => {
    callCounts[t.name] = (callCounts[t.name] || 0) + 1;
  });

  const topCalls = Object.entries(callCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (topCalls.length > 0) {
    console.log('\n[HOT] Most Called Functions:');
    topCalls.forEach(([fn, count]) => {
      console.log(`  • ${fn}: ${count} calls`);
    });
  }

  console.log('=' .repeat(60));
}

/**
 * Display fix suggestions for common issues
 */
function displayFixSuggestions(failures) {
  console.log('\nFix Suggestions:\n');
  console.log('=' .repeat(60));

  const suggestions = new Map();

  failures.forEach(failure => {
    const error = failure.error || '';

    // Email validation issues
    if (error.includes('Invalid email format')) {
      suggestions.set('email', {
        file: 'user-service.js:40',
        issue: 'Email regex doesn\'t handle + or multiple dots',
        fix: 'Use: /^[^\s@]+@[^\s@]+(\.[^\s@]+)+$/'
      });
    }

    // Null/undefined issues
    if (error.includes('Cannot read properties of undefined')) {
      suggestions.set('null-check', {
        file: 'user-service.js:48',
        issue: 'Missing null check for name parameter',
        fix: 'Add: if (!name || name.length < 2)'
      });
    }

    // Password validation
    if (failure.test && failure.test.includes('password length')) {
      suggestions.set('password', {
        file: 'user-service.js:56',
        issue: 'Off-by-one error in password validation',
        fix: 'Change to: if (password.length < 8)'
      });
    }

    // Memory leak
    if (failure.test && failure.test.includes('cache')) {
      suggestions.set('memory', {
        file: 'user-service.js:24',
        issue: 'Cache array never cleared (memory leak)',
        fix: 'Clear cache in cleanup() and deleteUser()'
      });
    }

    // Rate limit
    if (error.includes('Rate limit')) {
      suggestions.set('rate-limit', {
        file: 'user-service.js:157',
        issue: 'Off-by-one error in rate limit check',
        fix: 'Change to: if (recentRequests.length >= 10)'
      });
    }

    // Division by zero
    if (failure.test && failure.test.includes('division by zero')) {
      suggestions.set('division', {
        file: 'user-service.js:195',
        issue: 'Division by zero when no users',
        fix: 'Add: const cacheRatio = totalUsers > 0 ? cacheSize / totalUsers : 0'
      });
    }
  });

  suggestions.forEach((suggestion, key) => {
    console.log(`[FIX] ${suggestion.file}`);
    console.log(`  Issue: ${suggestion.issue}`);
    console.log(`  Fix: ${suggestion.fix}\n`);
  });

  console.log('=' .repeat(60));
}

// Run the monitored tests
runMonitoredTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});