#!/usr/bin/env node

/**
 * Taist CLI - Token-Optimized Testing Framework
 * Main entry point for the command-line interface
 */

// Set TAIST_ENABLED early if --trace flag is present
// This needs to happen before vitest.config.js is loaded
if (process.argv.includes('--trace')) {
  process.env.TAIST_ENABLED = 'true';
}

import { Command } from 'commander';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { VitestRunner } from './lib/vitest-runner.js';
import { OutputFormatter } from './lib/output-formatter.js';
import { WatchHandler } from './lib/watch-handler.js';
import { ExecutionTracer } from './lib/execution-tracer.js';
import { ServiceTracer } from './lib/service-tracer.js';
import { TraceCollector, createDefaultFilter } from './lib/trace-collector.js';
import { loadConfig as loadTaistConfig } from './lib/config-loader.js';
import { spawn } from 'child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const program = new Command();

// Package info
const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8')
);

program
  .name('taist')
  .description('Token-Optimized Testing Framework for AI-Assisted Development')
  .version(packageJson.version);

/**
 * Test command
 */
program
  .command('test')
  .description('Run tests once')
  .option('-f, --file <files...>', 'Source file(s) to test', ['./src'])
  .option('-t, --test <tests...>', 'Test file(s) to run', ['./test/**/*.test.js', './src/**/*.test.js'])
  .option('-n, --name <pattern>', 'Filter tests by name pattern (regex)')
  .option('--format <format>', 'Output format (toon|json|compact)', 'toon')
  .option('--trace', 'Enable execution tracing', false)
  .option('-d, --depth <level>', 'Trace depth level (1-5)', '2')
  .option('-o, --output-file <file>', 'Output file path (defaults to stdout)')
  .option('-c, --config <file>', 'Config file path', '.taistrc.json')
  .action(async (options) => {
    try {
      const config = loadConfig(options.config);
      const mergedOptions = { ...config, ...options };

      await runTests(mergedOptions);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

/**
 * Watch command
 */
program
  .command('watch')
  .description('Run tests in watch mode')
  .option('-f, --file <files...>', 'Source file(s) to watch', ['./src'])
  .option('-t, --test <tests...>', 'Test file(s) to run', ['./test/**/*.test.js', './src/**/*.test.js'])
  .option('--format <format>', 'Output format (toon|json|compact)', 'toon')
  .option('--trace', 'Enable execution tracing', false)
  .option('-d, --depth <level>', 'Trace depth level (1-5)', '2')
  .option('-c, --config <file>', 'Config file path', '.taistrc.json')
  .action(async (options) => {
    try {
      const config = loadConfig(options.config);
      const mergedOptions = { ...config, ...options };

      await runWatch(mergedOptions);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

/**
 * Monitor command - Run a Node.js service with tracing
 */
program
  .command('monitor <script>')
  .description('Monitor a Node.js service with execution tracing')
  .option('--format <format>', 'Output format (toon|json|compact|human)', 'toon')
  .option('-d, --depth <level>', 'Trace depth level (1-5)', '3')
  .option('-o, --output <file>', 'Output file for traces')
  .option('-i, --interval <ms>', 'Output interval in milliseconds', '30000')
  .option('--include <patterns>', 'Comma-separated patterns to include')
  .option('--exclude <patterns>', 'Comma-separated patterns to exclude')
  .option('--slow-threshold <ms>', 'Threshold for slow operations', '100')
  .action(async (script, options) => {
    try {
      await runMonitor(script, options);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

/**
 * Trace command (alias for test with tracing enabled)
 */
program
  .command('trace')
  .description('Run tests with deep execution tracing')
  .option('-f, --file <files...>', 'Source file(s) to test', ['./src'])
  .option('-t, --test <tests...>', 'Test file(s) to run', ['./test/**/*.test.js', './src/**/*.test.js'])
  .option('-n, --name <pattern>', 'Filter tests by name pattern (regex)')
  .option('--format <format>', 'Output format (toon|json|compact)', 'toon')
  .option('-d, --depth <level>', 'Trace depth level (1-5)', '3')
  .option('-o, --output-file <file>', 'Output file path (defaults to stdout)')
  .option('-c, --config <file>', 'Config file path', '.taistrc.json')
  .action(async (options) => {
    try {
      const config = loadConfig(options.config);
      const mergedOptions = { ...config, ...options, trace: true };

      await runTests(mergedOptions);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

/**
 * Run command - Execute any test command with tracing
 * This is the new universal approach that works with any test runner
 */
program
  .command('run')
  .description('Run any test command with tracing (e.g., taist run -- vitest run)')
  .option('--format <format>', 'Output format (toon|json|compact)', 'toon')
  .option('-d, --depth <level>', 'Trace depth level (1-5)', '3')
  .option('-o, --output-file <file>', 'Output file path (defaults to stdout)')
  .allowUnknownOption(true)
  .action(async (options, command) => {
    try {
      // Get the command to run (everything after --)
      const args = command.args;
      if (args.length === 0) {
        console.error('Error: No command specified. Usage: taist run -- <command>');
        console.error('Example: taist run -- vitest run');
        console.error('Example: taist run -- jest');
        process.exit(1);
      }

      await runWithCollector(args, options);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

/**
 * Init command - create configuration file
 */
program
  .command('init')
  .description('Initialize taist configuration file')
  .action(() => {
    const configPath = '.taistrc.json';

    if (existsSync(configPath)) {
      console.error(`Configuration file already exists: ${configPath}`);
      process.exit(1);
    }

    const defaultConfig = {
      include: ['src/**/*.js', 'src/**/*.ts', 'lib/**/*.js', 'lib/**/*.ts'],
      exclude: ['**/node_modules/**', '**/*.test.*', '**/*.spec.*'],
      depth: 3,
      format: 'toon',
      trace: {
        enabled: false,
        depth: 2
      },
      watch: {
        ignore: ['node_modules', '.git', 'dist', 'build'],
        delay: 500
      },
      output: {
        abbreviate: true,
        maxTokens: 1000
      }
    };

    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(`Created configuration file: ${configPath}`);
  });

/**
 * Load configuration file
 */
function loadConfig(configPath) {
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Warning: Failed to parse config file: ${error.message}`);
      return {};
    }
  }
  return {};
}

/**
 * Run tests once
 */
async function runTests(options) {
  try {
    const tracer = new ExecutionTracer({
      enabled: options.trace,
      depth: parseInt(options.depth)
    });

    const runner = new VitestRunner({
      trace: {
        enabled: options.trace,
        depth: parseInt(options.depth)
      },
      tracer
    });

    const formatter = new OutputFormatter({
      format: options.format
    });

    console.error('Running tests...\n');

    const results = await runner.run({
      tests: options.test,
      testNamePattern: options.name
    });

    console.error('Formatting results...\n');

    if (!formatter || typeof formatter.format !== 'function') {
      throw new Error('Formatter is not properly initialized');
    }

    const output = formatter.format(results);

    // Write output
    if (options.outputFile) {
      writeFileSync(options.outputFile, output);
      console.error(`✓ Results written to: ${options.outputFile}`);
    } else {
      console.log(output);
    }

    // Exit with appropriate code
    const exitCode = results.stats?.failed > 0 ? 1 : 0;
    process.exit(exitCode);
  } catch (error) {
    console.error('Fatal error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

/**
 * Run tests in watch mode
 */
async function runWatch(options) {
  console.error('Starting watch mode...\n');

  const tracer = new ExecutionTracer({
    enabled: options.trace,
    depth: parseInt(options.depth)
  });

  const runner = new VitestRunner({
    trace: {
      enabled: options.trace,
      depth: parseInt(options.depth)
    },
    tracer
  });

  const formatter = new OutputFormatter({
    format: options.format,
    ...options.output
  });

  const watchHandler = new WatchHandler({
    ...options.watch,
    delay: options.watch?.delay || 500
  });

  // Watch paths
  const watchPaths = [...(options.file || []), ...(options.test || [])];

  watchHandler.on('ready', () => {
    console.error('✓ Watching for changes...\n');
  });

  watchHandler.on('run-start', ({ iteration, changes }) => {
    console.error(`\n[${iteration}] Running tests...`);
    if (changes.length > 0) {
      console.error(`Changed: ${changes.join(', ')}`);
    }
  });

  watchHandler.on('run-complete', ({ iteration, results, duration, history }) => {
    const output = formatter.format(results);
    console.log('\n' + output);

    console.error(`\n[${iteration}] Completed in ${duration}ms`);

    // Show summary
    if (history.summary.new_failures.length > 0) {
      console.error(`⚠ New failures: ${history.summary.new_failures.join(', ')}`);
    }
    if (history.summary.fixed.length > 0) {
      console.error(`✓ Fixed: ${history.summary.fixed.join(', ')}`);
    }

    console.error('\nWaiting for changes...');
  });

  watchHandler.on('run-error', ({ error }) => {
    console.error(`\n✗ Error: ${error.message}`);
  });

  watchHandler.on('error', (error) => {
    console.error(`\nWatch error: ${error.message}`);
  });

  // Start watching
  await watchHandler.start(watchPaths, async () => {
    return await runner.run({
      tests: options.test
    });
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.error('\n\nShutting down...');
    await watchHandler.stop();
    process.exit(0);
  });
}

/**
 * Run a service with monitoring
 */
async function runMonitor(script, options) {
  console.log('Starting service monitoring...');
  console.log(`Script: ${script}`);
  console.log(`Format: ${options.format}`);
  console.log(`Depth: ${options.depth}`);

  // Set environment variables for the child process
  const env = {
    ...process.env,
    TAIST_ENABLED: 'true',
    TAIST_DEPTH: options.depth || '3',
    TAIST_FORMAT: options.format || 'toon',
    TAIST_OUTPUT_FILE: options.output || '',
    TAIST_OUTPUT_INTERVAL: options.interval || '30000',
    TAIST_INCLUDE: options.include || '',
    TAIST_EXCLUDE: options.exclude || '',
    TAIST_SLOW_THRESHOLD: options.slowThreshold || '100'
  };

  // For now, run directly with instrumentation via require
  // In production, would use a loader
  console.log('\nNote: For production use, add instrumentation to your service.');
  console.log('See examples/express-service for implementation details.\n');

  // Spawn the service
  const child = spawn('node', [script], {
    env,
    stdio: 'inherit'
  });

  // Handle exit
  child.on('exit', (code) => {
    console.log(`\nService exited with code ${code}`);
    process.exit(code);
  });

  // Handle errors
  child.on('error', (error) => {
    console.error('Failed to start service:', error);
    process.exit(1);
  });

  // Forward signals
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
}

/**
 * Run any command with the new collector-based tracing
 * This is the universal approach that works with any test runner
 */
async function runWithCollector(args, options) {
  const sessionId = crypto.randomUUID();

  // Load taist config for include/exclude patterns
  const taistConfig = await loadTaistConfig();

  if (!taistConfig.include || taistConfig.include.length === 0) {
    console.error('Warning: No include patterns in .taistrc.json');
    console.error('Create a .taistrc.json with include patterns to enable tracing.');
    console.error('Example: { "include": ["src/**/*.js"] }');
  }

  // Start trace collector
  const collector = new TraceCollector({
    sessionId,
    filter: createDefaultFilter(),
  });

  try {
    await collector.start();
    console.error(`Trace collector started: ${collector.getSocketPath()}`);
  } catch (err) {
    console.error('Failed to start trace collector:', err.message);
    process.exit(1);
  }

  // Set up environment for child process
  const env = {
    ...process.env,
    TAIST_ENABLED: 'true',
    TAIST_COLLECTOR_SOCKET: collector.getSocketPath(),
    TAIST_DEPTH: options.depth || '3',
  };

  // Build the command - prepend with node and module hooks
  const modulePatcherPath = join(__dirname, 'lib', 'module-patcher.js');
  const [cmd, ...cmdArgs] = args;

  // Determine if we need to inject --import
  let spawnCmd;
  let spawnArgs;

  if (cmd === 'node' || cmd.endsWith('/node')) {
    // Direct node command - add --import flag
    spawnCmd = cmd;
    spawnArgs = ['--import', modulePatcherPath, ...cmdArgs];
  } else if (cmd === 'vitest' || cmd === 'jest' || cmd === 'mocha' || cmd === 'npx' || cmd === 'yarn' || cmd === 'npm') {
    // Test runner commands - use NODE_OPTIONS to inject
    env.NODE_OPTIONS = `${env.NODE_OPTIONS || ''} --import ${modulePatcherPath}`.trim();
    spawnCmd = cmd;
    spawnArgs = cmdArgs;
  } else {
    // Unknown command - try NODE_OPTIONS approach
    env.NODE_OPTIONS = `${env.NODE_OPTIONS || ''} --import ${modulePatcherPath}`.trim();
    spawnCmd = cmd;
    spawnArgs = cmdArgs;
  }

  console.error(`Running: ${spawnCmd} ${spawnArgs.join(' ')}`);
  console.error('');

  // Spawn the test runner
  const child = spawn(spawnCmd, spawnArgs, {
    env,
    stdio: 'inherit',
  });

  // Wait for child to exit
  const exitCode = await new Promise((resolve) => {
    child.on('exit', (code) => resolve(code || 0));
    child.on('error', (err) => {
      console.error('Failed to start command:', err.message);
      resolve(1);
    });
  });

  // Give traces time to arrive (socket writes are async)
  // The child process may exit before all socket data is transmitted
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Collect traces
  const traces = collector.getTraces();
  await collector.stop();

  console.error('');
  console.error(`Collected ${traces.length} traces`);

  // Format and output results
  if (traces.length > 0) {
    const formatter = new OutputFormatter({
      format: options.format,
    });

    // Build results object similar to VitestRunner output
    const results = {
      stats: { total: 0, passed: 0, failed: 0 },
      tests: [],
      trace: traces,
    };

    const output = formatter.format(results);

    if (options.outputFile) {
      writeFileSync(options.outputFile, output);
      console.error(`Results written to: ${options.outputFile}`);
    } else {
      console.log(output);
    }
  }

  process.exit(exitCode);
}

// Parse arguments
program.parse();
