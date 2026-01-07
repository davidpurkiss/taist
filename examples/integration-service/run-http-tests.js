#!/usr/bin/env node

/**
 * HTTP Integration Test Runner
 *
 * Demonstrates all three Taist instrumentation approaches:
 * - loader:       node --import taist/module-patcher server-loader.js
 * - import:       node server-import.js (uses import 'taist/instrument')
 * - programmatic: node server-programmatic.js (uses ServiceTracer directly)
 *
 * Usage:
 *   node run-http-tests.js --approach=loader
 *   node run-http-tests.js --approach=import
 *   node run-http-tests.js --approach=programmatic
 *   node run-http-tests.js --approach=all
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';
import { TraceCollector, createDefaultFilter } from '../../lib/trace-collector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3456;

// Parse arguments
const args = process.argv.slice(2);
const approachArg = args.find(a => a.startsWith('--approach='));
const approach = approachArg ? approachArg.split('=')[1] : 'all';
const format = args.includes('--json') ? 'json' :
               args.includes('--compact') ? 'compact' : 'toon';

const APPROACHES = {
  loader: {
    name: 'ESM Loader Hooks',
    description: 'node --import taist/module-patcher',
    server: 'server-loader.js',
    useLoader: true,
    config: '.taistrc.json',
  },
  import: {
    name: 'Import-based',
    description: "import 'taist/instrument'",
    server: 'server-import.js',
    useLoader: false,
    config: 'Environment variables',
  },
  programmatic: {
    name: 'Fully Programmatic',
    description: 'ServiceTracer class',
    server: 'server-programmatic.js',
    useLoader: false,
    config: 'Explicit in code',
  },
};

async function waitForServer(url, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return await response.json();
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Server failed to start within timeout');
}

async function runTestsForApproach(approachKey, collector) {
  const config = APPROACHES[approachKey];
  const modulePatcherPath = path.join(__dirname, '..', '..', 'lib', 'module-patcher.js');
  const serverPath = path.join(__dirname, config.server);

  console.log(`\n[${ approachKey.toUpperCase()}] Starting server: ${config.name}`);
  console.log(`     ${config.description}`);

  // Build spawn args based on approach
  let spawnArgs;
  if (config.useLoader) {
    spawnArgs = ['--import', modulePatcherPath, serverPath];
  } else {
    spawnArgs = [serverPath];
  }

  const serverProcess = spawn('node', spawnArgs, {
    env: {
      ...process.env,
      PORT: String(PORT),
      TAIST_ENABLED: 'true',
      TAIST_COLLECTOR_SOCKET: collector.getSocketPath(),
      TAIST_DEPTH: '3',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverStderr = '';
  serverProcess.stderr.on('data', (data) => {
    serverStderr += data.toString();
    if (process.env.TAIST_DEBUG) {
      process.stderr.write(data);
    }
  });

  // Wait for server to be ready
  let healthData;
  try {
    healthData = await waitForServer(`http://localhost:${PORT}`);
    console.log(`     Server ready (approach: ${healthData.approach})`);
  } catch (err) {
    console.error(`     Server failed to start: ${err.message}`);
    if (serverStderr) console.error(`     Stderr: ${serverStderr}`);
    serverProcess.kill();
    return null;
  }

  // Run HTTP tests
  console.log(`     Running tests...`);

  const vitestArgs = ['vitest', 'run', '--config', 'vitest.http.config.js', '--reporter=json'];

  const testProcess = spawn('npx', vitestArgs, {
    env: {
      ...process.env,
      TEST_SERVER_URL: `http://localhost:${PORT}`,
    },
    cwd: __dirname,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  let testStdout = '';
  let testStderr = '';
  testProcess.stdout.on('data', (data) => testStdout += data.toString());
  testProcess.stderr.on('data', (data) => testStderr += data.toString());

  const testExitCode = await new Promise((resolve) => {
    testProcess.on('exit', (code) => resolve(code || 0));
    testProcess.on('error', () => resolve(1));
  });

  // Give traces time to arrive
  await new Promise(r => setTimeout(r, 300));

  // Stop server
  serverProcess.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 200));

  // Parse test results
  let testResults = null;
  try {
    testResults = JSON.parse(testStdout);
  } catch {
    // JSON parsing failed
  }

  return {
    approach: approachKey,
    config,
    testResults,
    testExitCode,
    healthData,
  };
}

async function runHttpTests() {
  console.log('='.repeat(60));
  console.log('Taist HTTP Integration Tests');
  console.log('='.repeat(60));
  console.log('\nKey insight: Traces are collected from the SERVER process,');
  console.log('not from the test runner. No special Vitest config needed!\n');

  const approachesToRun = approach === 'all'
    ? Object.keys(APPROACHES)
    : [approach];

  if (!APPROACHES[approach] && approach !== 'all') {
    console.error(`Unknown approach: ${approach}`);
    console.error(`Valid approaches: ${Object.keys(APPROACHES).join(', ')}, all`);
    process.exit(1);
  }

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

  const results = [];
  let overallExitCode = 0;

  for (const approachKey of approachesToRun) {
    // Get trace count before this approach
    const tracesBefore = collector.getTraces().length;

    const result = await runTestsForApproach(approachKey, collector);
    if (result) {
      // Calculate traces for this approach
      const tracesAfter = collector.getTraces().length;
      result.traceCount = tracesAfter - tracesBefore;
      results.push(result);

      if (result.testExitCode !== 0) {
        overallExitCode = 1;
      }
    } else {
      overallExitCode = 1;
    }
  }

  // Get all traces
  const allTraces = collector.getTraces();
  await collector.stop();

  // Display results
  console.log('\n' + '='.repeat(60));
  console.log('Results:');
  console.log('='.repeat(60));

  if (format === 'json') {
    console.log(JSON.stringify({ results, traces: allTraces }, null, 2));
  } else if (format === 'compact') {
    for (const result of results) {
      const passed = result.testResults?.numPassedTests || 0;
      const total = result.testResults?.numTotalTests || 0;
      const failed = result.testResults?.numFailedTests || 0;
      console.log(`[${result.approach.toUpperCase()}] ${passed}/${total} tests, ${failed} failed, ${result.traceCount} traces`);
    }
  } else {
    // TOON format
    for (const result of results) {
      const passed = result.testResults?.numPassedTests || 0;
      const total = result.testResults?.numTotalTests || 0;
      const failed = result.testResults?.numFailedTests || 0;
      const statusIcon = failed === 0 ? 'PASS' : 'FAIL';

      console.log(`\n[${result.approach.toUpperCase()}] ${result.config.name}`);
      console.log(`  Tests: ${statusIcon} ${passed}/${total}`);
      console.log(`  Traces: ${result.traceCount} from server`);
      console.log(`  Config: ${result.config.config}`);
    }

    // Trace insights
    if (allTraces.length > 0) {
      console.log('\n' + '-'.repeat(60));
      console.log('Trace Insights:');

      const uniqueFuncs = [...new Set(allTraces.map(t => t.name))];
      console.log(`  Functions traced: ${uniqueFuncs.slice(0, 10).join(', ')}`);

      const errors = allTraces.filter(t => t.type === 'error');
      if (errors.length > 0) {
        console.log(`  Errors captured: ${errors.length}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('IMPORTANT: All traces came from the SERVER process!');
    console.log('The test runner needed NO special configuration.');
    console.log('='.repeat(60));
  }

  process.exit(overallExitCode);
}

runHttpTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
