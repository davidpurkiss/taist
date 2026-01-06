/**
 * Vitest Runner - Execute tests and collect results
 * Custom runner and reporter for Vitest integration
 */

import { startVitest } from 'vitest/node';
import { ExecutionTracer } from './execution-tracer.js';
import { getGlobalTracer } from './service-tracer.js';
import fs from 'fs';

export class VitestRunner {
  constructor(options = {}) {
    this.options = options;
    this.tracer = options.tracer || new ExecutionTracer(options.trace || {});
    this.results = null;

    // Set environment variables early so vitest.config.js can use them
    if (options.trace?.enabled) {
      process.env.TAIST_ENABLED = 'true';
      process.env.TAIST_DEPTH = String(options.trace.depth || 3);
    }
  }

  /**
   * Run tests
   * @param {Object} config - Test configuration
   * @returns {Object} Test results
   */
  async run(config = {}) {
    const vitestConfig = this.buildVitestConfig(config);

    // Extract file patterns for the filter argument
    // Note: Vitest's filter argument uses substring matching, not glob patterns
    // So we only pass specific file paths, not glob patterns like '**/*.test.js'
    const filePatterns = config.tests || config.test || [];
    const filePatternArray = Array.isArray(filePatterns) ? filePatterns : [filePatterns];

    // Filter out glob patterns - vitest's filter doesn't support them
    // Glob patterns should be handled by vitest.config.js include option
    const filterPatterns = filePatternArray.filter(p => !p.includes('*'));

    // Setup tracing if enabled
    let globalTracer = null;
    if (this.options.trace?.enabled) {
      // Get the global tracer that will collect traces
      globalTracer = getGlobalTracer({
        enabled: true,
        depth: this.options.trace.depth || 3
      });

      this.tracer.start();
    }

    try {
      // Suppress vitest's verbose output - taist provides TOON format
      const restoreOutput = this.suppressOutput();

      const vitest = await startVitest(
        'test',
        filterPatterns,  // Pass only specific file paths, not glob patterns
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
        // First try to get traces from the global ServiceTracer (auto-instrumented code)
        if (globalTracer) {
          const serviceTraces = globalTracer.getTracesForOutput();
          if (serviceTraces && serviceTraces.length > 0) {
            this.results.trace = serviceTraces;
          }
        }

        // If no service traces, try reading from trace files written by workers
        if (!this.results.trace || this.results.trace.length === 0) {
          const testTraces = this.readTestTraceFile();
          if (testTraces && testTraces.length > 0) {
            this.results.trace = testTraces;
          }
        }

        // Fall back to local execution tracer
        if (!this.results.trace || this.results.trace.length === 0) {
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
      // Use the vitest.config.js in the current working directory
      root: process.cwd(),
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
   * Read and aggregate trace files from all worker processes
   * The service-tracer writes traces to /tmp/taist-trace-{pid}.json
   */
  readTestTraceFile() {
    const traceDir = process.env.TAIST_TRACE_DIR || '/tmp';
    const allTraces = [];

    try {
      // Find all taist trace files in the temp directory
      const files = fs.readdirSync(traceDir);
      const traceFiles = files.filter(f => f.startsWith('taist-trace-') && f.endsWith('.json'));

      for (const fileName of traceFiles) {
        const traceFile = `${traceDir}/${fileName}`;
        try {
          const content = fs.readFileSync(traceFile, 'utf-8');
          const data = JSON.parse(content);

          // Aggregate traces
          if (data.traces && Array.isArray(data.traces)) {
            allTraces.push(...data.traces);
          } else if (Array.isArray(data)) {
            allTraces.push(...data);
          }

          // Clean up the trace file after reading
          fs.unlinkSync(traceFile);
        } catch (error) {
          // Skip invalid files
          continue;
        }
      }
    } catch (error) {
      // Directory read failed, fall back to specific file locations
      const specificFiles = [
        process.env.TAIST_TEST_TRACE_FILE,
        process.env.TAIST_OUTPUT_FILE,
        '/tmp/taist-trace-internal.json',
        '/tmp/taist-trace-api.json',
        '/tmp/taist-test-traces.json',
      ].filter(Boolean);

      for (const traceFile of specificFiles) {
        try {
          if (!fs.existsSync(traceFile)) continue;

          const content = fs.readFileSync(traceFile, 'utf-8');
          if (content.startsWith('[TAIST]')) {
            continue; // Skip TOON format files
          }

          const data = JSON.parse(content);
          fs.unlinkSync(traceFile);

          if (data.traces) {
            allTraces.push(...data.traces);
          } else if (Array.isArray(data)) {
            allTraces.push(...data);
          }
        } catch (e) {
          continue;
        }
      }
    }

    return allTraces.length > 0 ? allTraces : null;
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
