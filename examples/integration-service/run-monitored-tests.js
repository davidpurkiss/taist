#!/usr/bin/env node

/**
 * Monitoring runner for integration tests
 * Uses the new APM-style tracing architecture with Unix socket collector
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';
import { TraceCollector, createDefaultFilter } from '../../lib/trace-collector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const format = args.includes('--json') ? 'json' :
               args.includes('--compact') ? 'compact' : 'toon';
const watch = args.includes('--watch');

async function runMonitoredTests() {
  console.log('Starting Taist Integration Test Monitor\n');
  console.log(`Output Format: ${format.toUpperCase()}`);
  console.log(`Watch Mode: ${watch ? 'Enabled' : 'Disabled'}\n`);
  console.log('='.repeat(60));

  const sessionId = crypto.randomUUID();

  // Start trace collector
  const collector = new TraceCollector({
    sessionId,
    filter: createDefaultFilter(),
  });

  try {
    await collector.start();
    console.log(`Trace collector started: ${collector.getSocketPath()}`);
  } catch (err) {
    console.error('Failed to start trace collector:', err.message);
    process.exit(1);
  }

  // Set up environment for child process
  const modulePatcherPath = path.join(__dirname, '..', '..', 'lib', 'module-patcher.js');
  const env = {
    ...process.env,
    TAIST_ENABLED: 'true',
    TAIST_COLLECTOR_SOCKET: collector.getSocketPath(),
    TAIST_DEPTH: '3',
  };

  // Build vitest command - use relative path from cwd
  const vitestArgs = ['vitest', 'run', 'tests/user-service.test.js', '--reporter=json', '--config', 'vitest.config.js'];

  if (watch) {
    vitestArgs[1] = 'watch'; // Change 'run' to 'watch'
  }

  console.log(`\nRunning: npx ${vitestArgs.join(' ')}`);
  console.log('='.repeat(60) + '\n');

  // Spawn vitest with module patcher
  const child = spawn('npx', vitestArgs, {
    env: {
      ...env,
      NODE_OPTIONS: `${env.NODE_OPTIONS || ''} --import ${modulePatcherPath}`.trim(),
    },
    cwd: __dirname,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  child.stderr.on('data', (data) => {
    stderr += data.toString();
    // Show stderr in real-time for watch mode or debug mode
    if (watch || process.env.TAIST_DEBUG) {
      process.stderr.write(data);
    }
  });

  // Wait for child to exit
  const exitCode = await new Promise((resolve) => {
    child.on('exit', (code) => resolve(code || 0));
    child.on('error', (err) => {
      console.error('Failed to start vitest:', err.message);
      resolve(1);
    });
  });

  // Give traces time to arrive
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Collect traces
  const traces = collector.getTraces();
  await collector.stop();

  // Parse test results from stdout
  let testResults = null;
  try {
    testResults = JSON.parse(stdout);
  } catch {
    // If JSON parsing fails, show raw output
    if (stderr) {
      console.error(stderr);
    }
  }

  // Display results based on format
  console.log('\n' + '='.repeat(60));
  console.log('Test Results:');
  console.log('='.repeat(60) + '\n');

  if (format === 'json') {
    console.log(JSON.stringify({ testResults, traces }, null, 2));
  } else if (format === 'compact') {
    displayCompactResults(testResults, traces);
  } else {
    displayToonResults(testResults, traces);
  }

  // Display trace insights
  if (traces.length > 0 && format === 'toon') {
    displayTraceInsights(traces);
  }

  // Display fix suggestions for failures
  if (testResults?.testResults) {
    const failures = extractFailures(testResults);
    if (failures.length > 0) {
      displayFixSuggestions(failures);
    }
  }

  if (!watch) {
    process.exit(exitCode);
  }
}

/**
 * Extract failures from vitest JSON output
 */
function extractFailures(testResults) {
  const failures = [];

  if (testResults?.testResults) {
    for (const file of testResults.testResults) {
      for (const result of file.assertionResults || []) {
        if (result.status === 'failed') {
          failures.push({
            test: result.fullName || result.title,
            error: result.failureMessages?.[0] || 'Unknown error',
          });
        }
      }
    }
  }

  return failures;
}

/**
 * Display results in TOON format with trace data
 */
function displayToonResults(testResults, traces) {
  // Test stats
  if (testResults) {
    const passed = testResults.numPassedTests || 0;
    const failed = testResults.numFailedTests || 0;
    const total = testResults.numTotalTests || 0;
    const statusIcon = failed === 0 ? '✓' : '✗';

    console.log(`[TST] ${statusIcon} ${passed}/${total} tests passed`);

    if (failed > 0) {
      console.log(`\n[FAIL] ${failed} test failures:`);
      const failures = extractFailures(testResults);
      failures.forEach((f, i) => {
        console.log(`  ${i + 1}. ${f.test}`);
        // Extract just the error message, not the full stack
        const errorLine = f.error.split('\n')[0].substring(0, 80);
        console.log(`     [ERR] ${errorLine}`);
      });
    }
  } else {
    console.log('[TST] Could not parse test results');
  }

  // Trace summary
  if (traces.length > 0) {
    console.log(`\n[TRC] ${traces.length} function calls traced`);

    // Show unique functions called
    const uniqueFuncs = [...new Set(traces.map(t => t.name))];
    console.log(`[FNS] ${uniqueFuncs.join(', ')}`);

    // Show errors from traces
    const errors = traces.filter(t => t.type === 'error');
    if (errors.length > 0) {
      console.log(`\n[ERR] ${errors.length} errors captured in traces:`);
      errors.slice(0, 5).forEach(e => {
        console.log(`  • ${e.name}: ${e.error?.message || e.error}`);
      });
    }
  }

  // Performance
  if (testResults?.startTime && testResults?.endTime) {
    const duration = testResults.endTime - testResults.startTime;
    console.log(`\n[PERF] Duration: ${duration}ms`);
  }

  // Memory
  const memUsage = process.memoryUsage();
  console.log(`[MEM] Heap: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
}

/**
 * Display compact results
 */
function displayCompactResults(testResults, traces) {
  const passed = testResults?.numPassedTests || 0;
  const failed = testResults?.numFailedTests || 0;
  const total = testResults?.numTotalTests || 0;
  const errors = traces.filter(t => t.type === 'error').length;

  console.log(`TAIST: ${passed}/${total} tests, ${failed} failed, ${traces.length} traces, ${errors} errors`);
}

/**
 * Display trace insights for debugging
 */
function displayTraceInsights(traces) {
  console.log('\n' + '='.repeat(60));
  console.log('Execution Insights:');
  console.log('='.repeat(60));

  // Find slow operations (>100ms)
  const slowOps = traces.filter(t => t.duration && t.duration > 100);
  if (slowOps.length > 0) {
    console.log('\n[SLOW] Slow Operations (>100ms):');
    slowOps.forEach(op => {
      console.log(`  • ${op.name}: ${op.duration.toFixed(1)}ms`);
    });
  }

  // Find errors
  const errors = traces.filter(t => t.type === 'error');
  if (errors.length > 0) {
    console.log('\n[ERRORS] Caught Errors:');
    const uniqueErrors = new Map();
    errors.forEach(err => {
      const key = `${err.name}:${err.error?.message || err.error}`;
      if (!uniqueErrors.has(key)) {
        uniqueErrors.set(key, err);
      }
    });
    uniqueErrors.forEach(err => {
      console.log(`  • ${err.name}: ${err.error?.message || err.error}`);
    });
  }

  // Most called functions
  const callCounts = {};
  traces.forEach(t => {
    if (t.type === 'exit') {
      callCounts[t.name] = (callCounts[t.name] || 0) + 1;
    }
  });

  const topCalls = Object.entries(callCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (topCalls.length > 0) {
    console.log('\n[HOT] Most Called Functions:');
    topCalls.forEach(([fn, count]) => {
      console.log(`  • ${fn}: ${count} calls`);
    });
  }

  // Average duration by function
  const durations = {};
  const counts = {};
  traces.forEach(t => {
    if (t.duration !== undefined) {
      durations[t.name] = (durations[t.name] || 0) + t.duration;
      counts[t.name] = (counts[t.name] || 0) + 1;
    }
  });

  const avgDurations = Object.entries(durations)
    .map(([name, total]) => ({ name, avg: total / counts[name] }))
    .filter(d => d.avg > 10) // Only show if avg > 10ms
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);

  if (avgDurations.length > 0) {
    console.log('\n[AVG] Average Duration (>10ms):');
    avgDurations.forEach(({ name, avg }) => {
      console.log(`  • ${name}: ${avg.toFixed(1)}ms`);
    });
  }

  console.log('\n' + '='.repeat(60));
}

/**
 * Display fix suggestions for common issues
 */
function displayFixSuggestions(failures) {
  console.log('\nFix Suggestions:');
  console.log('='.repeat(60));

  const suggestions = new Map();

  failures.forEach(failure => {
    const error = failure.error || '';
    const test = failure.test || '';

    // Email validation issues
    if (error.includes('Invalid email') || test.includes('plus sign') || test.includes('multiple dots')) {
      suggestions.set('email', {
        file: 'user-service.js:37',
        issue: 'Email regex doesn\'t handle + or multiple dots',
        fix: 'Use: /^[^\\s@]+@[^\\s@]+(\\.[^\\s@]+)+$/'
      });
    }

    // Null/undefined issues
    if (error.includes('Cannot read properties of undefined')) {
      suggestions.set('null-check', {
        file: 'user-service.js:51',
        issue: 'Missing null check for name parameter',
        fix: 'Add: if (!name || name.length < 2)'
      });
    }

    // Password validation
    if (test.includes('password length')) {
      suggestions.set('password', {
        file: 'user-service.js:58',
        issue: 'Off-by-one error in password validation',
        fix: 'Change to: if (password.length < 8)'
      });
    }

    // Memory leak / cache issues
    if (test.includes('cache') || test.includes('cleanup')) {
      suggestions.set('memory', {
        file: 'user-service.js:22-27',
        issue: 'Cache array never cleared (memory leak)',
        fix: 'Clear cache in cleanup() and deleteUser()'
      });
    }

    // Rate limit
    if (error.includes('Rate limit') || test.includes('rate limit')) {
      suggestions.set('rate-limit', {
        file: 'user-service.js:163',
        issue: 'Off-by-one error in rate limit check',
        fix: 'Change to: if (recentRequests.length >= 10)'
      });
    }

    // Division by zero
    if (test.includes('division by zero') || error.includes('NaN')) {
      suggestions.set('division', {
        file: 'user-service.js:195',
        issue: 'Division by zero when no users',
        fix: 'Add: const cacheRatio = totalUsers > 0 ? cacheSize / totalUsers : 0'
      });
    }

    // Age validation
    if (test.includes('age as string')) {
      suggestions.set('age', {
        file: 'user-service.js:63',
        issue: 'Age comparison fails with string type coercion',
        fix: 'Add: if (typeof age !== "number" || age < 18)'
      });
    }
  });

  if (suggestions.size === 0) {
    console.log('No specific fix suggestions available.');
  } else {
    suggestions.forEach((suggestion) => {
      console.log(`\n[FIX] ${suggestion.file}`);
      console.log(`  Issue: ${suggestion.issue}`);
      console.log(`  Fix: ${suggestion.fix}`);
    });
  }

  console.log('\n' + '='.repeat(60));
}

// Run the monitored tests
runMonitoredTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
