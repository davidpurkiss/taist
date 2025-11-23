#!/usr/bin/env node

/**
 * Taist CLI - Token-Optimized Testing Framework
 * Main entry point for the command-line interface
 */

import { Command } from 'commander';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { VitestRunner } from './lib/vitest-runner.js';
import { OutputFormatter } from './lib/output-formatter.js';
import { WatchHandler } from './lib/watch-handler.js';
import { ExecutionTracer } from './lib/execution-tracer.js';

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
 * Trace command (alias for test with tracing enabled)
 */
program
  .command('trace')
  .description('Run tests with deep execution tracing')
  .option('-f, --file <files...>', 'Source file(s) to test', ['./src'])
  .option('-t, --test <tests...>', 'Test file(s) to run', ['./test/**/*.test.js', './src/**/*.test.js'])
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
    console.log(`✓ Created configuration file: ${configPath}`);
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
      tests: options.test
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

// Parse arguments
program.parse();
