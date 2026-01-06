/**
 * Vitest Runner - Execute tests and collect results
 * Custom runner and reporter for Vitest integration
 */

import { startVitest } from 'vitest/node';
import { ExecutionTracer } from './execution-tracer.js';
import fs from 'fs';

export class VitestRunner {
  constructor(options = {}) {
    this.options = options;
    this.tracer = options.tracer || new ExecutionTracer(options.trace || {});
    this.results = null;
  }

  /**
   * Run tests
   * @param {Object} config - Test configuration
   * @returns {Object} Test results
   */
  async run(config = {}) {
    const vitestConfig = this.buildVitestConfig(config);

    // Extract file patterns for the filter argument
    const filePatterns = config.tests || config.test || [];
    const filePatternArray = Array.isArray(filePatterns) ? filePatterns : [filePatterns];

    try {
      if (this.options.trace?.enabled) {
        this.tracer.start();
      }

      // Suppress vitest's verbose output - taist provides TOON format
      const restoreOutput = this.suppressOutput();

      const vitest = await startVitest(
        'test',
        filePatternArray,  // Pass file patterns as filter
        vitestConfig
      );

      if (!vitest) {
        restoreOutput();
        throw new Error('Failed to start Vitest');
      }

      // Wait for tests to complete
      await vitest.close();

      // Restore output
      restoreOutput();

      // Collect results
      this.results = this.collectResults(vitest);

      // Add trace data if enabled
      if (this.options.trace?.enabled) {
        // First try to read test-side trace file (from integration tests)
        const testTraces = this.readTestTraceFile();
        if (testTraces && testTraces.length > 0) {
          this.results.trace = testTraces;
        } else {
          // Fall back to execution tracer (for unit tests with instrumented code)
          this.results.trace = this.tracer.exportForToon();
        }
        this.tracer.stop();
      }

      return this.results;
    } catch (error) {
      return {
        stats: {
          total: 0,
          passed: 0,
          failed: 1,
          skipped: 0
        },
        failures: [{
          test: 'Test execution',
          error: error.message,
          stack: error.stack
        }],
        duration: 0
      };
    }
  }

  /**
   * Build Vitest configuration
   */
  buildVitestConfig(config) {
    const include = config.tests || config.test || ['**/*.test.js', '**/*.spec.js'];
    const includeArray = Array.isArray(include) ? include : [include];

    const vitestConfig = {
      include: includeArray,
      watch: false,
      ui: false,
      logHeapUsage: false,
      maxConcurrency: 1,
      // Suppress vitest output - taist provides its own TOON format
      reporter: 'dot',
      onConsoleLog: () => false,  // Suppress console.log from tests
      ...config
    };

    // Add test name pattern filter if specified
    if (config.testNamePattern) {
      vitestConfig.testNamePattern = config.testNamePattern;
    }

    // Only add coverage if explicitly enabled
    if (this.options.coverage === true) {
      vitestConfig.coverage = {
        enabled: true,
        reporter: ['json-summary'],
        all: true,
        ...this.options.coverage
      };
    }

    return vitestConfig;
  }

  /**
   * Suppress vitest output during execution
   * Taist provides its own TOON format, so we suppress vitest's verbose output
   */
  suppressOutput() {
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    const originalConsoleError = console.error.bind(console);

    // Suppress ALL stdout during vitest
    process.stdout.write = () => true;

    // Suppress vitest stderr output, but allow taist messages
    process.stderr.write = (chunk, ...args) => {
      const str = chunk.toString();
      // Allow taist status messages (from taist.js console.error calls)
      if (str.includes('Running tests') || str.includes('Formatting results') ||
          str.includes('Starting') || str.includes('Fatal error') ||
          str.includes('✓ Results')) {
        return originalStderrWrite(chunk, ...args);
      }
      // Suppress all vitest reporter output
      return true;
    };

    // Also suppress console.error during vitest (some reporters use this)
    console.error = (...args) => {
      const str = args.join(' ');
      if (str.includes('Running tests') || str.includes('Formatting results') ||
          str.includes('Starting') || str.includes('Fatal error') ||
          str.includes('✓ Results')) {
        return originalConsoleError(...args);
      }
      // Suppress vitest output
      return;
    };

    return () => {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      console.error = originalConsoleError;
    };
  }

  /**
   * Collect results from Vitest
   */
  collectResults(vitest) {
    const state = vitest.state;
    const files = state.getFiles();

    const stats = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0
    };

    const failures = [];
    let totalDuration = 0;

    // Process all test files
    for (const file of files) {
      const tasks = this.getAllTasks(file);

      for (const task of tasks) {
        if (task.type !== 'test') continue;

        stats.total++;

        if (task.result?.state === 'pass') {
          stats.passed++;
        } else if (task.result?.state === 'fail') {
          stats.failed++;
          failures.push(this.formatFailure(task, file));
        } else if (task.result?.state === 'skip') {
          stats.skipped++;
        }

        if (task.result?.duration) {
          totalDuration += task.result.duration;
        }
      }
    }

    const results = {
      stats,
      failures,
      duration: totalDuration
    };

    // Add coverage if available
    if (vitest.coverageProvider) {
      results.coverage = this.extractCoverage(vitest);
    }

    return results;
  }

  /**
   * Get all tasks from a file recursively
   */
  getAllTasks(file) {
    const tasks = [];

    const collect = (task) => {
      tasks.push(task);
      if (task.tasks) {
        task.tasks.forEach(collect);
      }
    };

    collect(file);
    return tasks;
  }

  /**
   * Format a test failure
   */
  formatFailure(task, file) {
    const error = task.result?.errors?.[0] || task.result?.error;

    const failure = {
      test: this.getTestName(task),
      location: this.getLocation(task, file)
    };

    if (error) {
      failure.error = error.message || String(error);
      failure.stack = error.stack;

      // Extract diff if available
      if (error.actual !== undefined || error.expected !== undefined) {
        failure.diff = {
          expected: error.expected,
          actual: error.actual
        };
      }
    }

    return failure;
  }

  /**
   * Get full test name
   */
  getTestName(task) {
    const names = [];
    let current = task;

    while (current) {
      if (current.name && current.type !== 'file') {
        names.unshift(current.name);
      }
      current = current.suite;
    }

    return names.join(' > ') || task.name;
  }

  /**
   * Get test location
   */
  getLocation(task, file) {
    if (task.location) {
      return {
        file: file.filepath || file.name,
        line: task.location.line,
        column: task.location.column
      };
    }

    return file.filepath || file.name;
  }

  /**
   * Extract coverage information
   */
  extractCoverage(vitest) {
    // This would extract coverage from vitest.coverageProvider
    // For now, return placeholder
    return {
      percent: 0,
      covered: 0,
      total: 0
    };
  }

  /**
   * Get results
   */
  getResults() {
    return this.results;
  }

  /**
   * Read trace file written by service code (Directus extensions)
   * The service-tracer writes traces to TAIST_OUTPUT_FILE
   */
  readTestTraceFile() {
    // Check multiple possible trace file locations
    const traceFiles = [
      process.env.TAIST_TEST_TRACE_FILE,
      process.env.TAIST_OUTPUT_FILE,
      '/tmp/taist-trace-internal.json',  // Default for internal service
      '/tmp/taist-trace-api.json',        // Default for API service
      '/tmp/taist-test-traces.json',      // Legacy default
    ].filter(Boolean);

    for (const traceFile of traceFiles) {
      try {
        if (!fs.existsSync(traceFile)) {
          continue;
        }

        const content = fs.readFileSync(traceFile, 'utf-8');

        // Handle both raw trace format and TOON summary format
        // If it starts with [TAIST], it's the summary format - parse it
        if (content.startsWith('[TAIST]')) {
          return this.parseServiceTracerOutput(content);
        }

        // Try JSON format
        const data = JSON.parse(content);

        // Clean up the trace file after reading
        fs.unlinkSync(traceFile);

        return data.traces || data || [];
      } catch (error) {
        // Try next file
        continue;
      }
    }

    return null;
  }

  /**
   * Parse service-tracer TOON output format into trace entries
   */
  parseServiceTracerOutput(content) {
    // The service-tracer writes a summary format, but we want the raw traces
    // This is a fallback - ideally service-tracer should write JSON
    return [];
  }
}

export default VitestRunner;
