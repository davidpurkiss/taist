/**
 * Vitest TOON Reporter
 *
 * A native Vitest reporter that outputs test results in TOON format
 * with integrated trace collection for execution visibility.
 *
 * The reporter automatically:
 * - Starts a TraceCollector to receive traces from instrumented code
 * - Sets environment variables so instrumented code can connect
 * - Collects and outputs execution traces alongside test results
 *
 * Usage in vitest.config.js:
 *   reporters: ['taist/vitest-reporter']
 *
 * With options:
 *   reporters: [['taist/vitest-reporter', { format: 'toon', traceDepth: 3 }]]
 *
 * Your test setup should instrument code that will be tested:
 *   import { instrumentService } from 'taist/instrument';
 *   const service = instrumentService(new MyService(), 'MyService');
 */

import { ToonFormatter } from './toon-formatter.js';
import { TraceCollector } from './trace-collector.js';
import fs from 'fs';

/**
 * @typedef {Object} TaistReporterOptions
 * @property {'toon' | 'json' | 'compact'} [format='toon'] - Output format
 * @property {boolean} [traceEnabled=true] - Enable execution tracing
 * @property {number} [traceDepth=3] - Trace depth level
 * @property {boolean} [showTrace=true] - Include traces in output
 * @property {boolean} [silent=false] - Suppress output
 * @property {string | null} [outputFile=null] - Write to file instead of stdout
 * @property {number} [maxTraceGroups=10] - Max request groups to show in trace output
 */

export class TaistReporter {
  /**
   * @param {TaistReporterOptions} options
   */
  constructor(options = {}) {
    this.options = {
      format: options.format || 'toon',
      traceEnabled: options.traceEnabled !== false,
      traceDepth: options.traceDepth || 3,
      showTrace: options.showTrace !== false,
      silent: options.silent || false,
      outputFile: options.outputFile || null,
      maxTraceGroups: options.maxTraceGroups || 10,
      ...options
    };

    this.formatter = new ToonFormatter(this.options);
    this.vitest = null;
    this.startTime = 0;
    this.collector = null;
    this.collectorReady = null;
    this.taskResults = new Map(); // Map task id to result
    this.results = {
      stats: { total: 0, passed: 0, failed: 0, skipped: 0 },
      failures: [],
      duration: 0,
      trace: []
    };
  }

  /**
   * Called when Vitest is initialized
   * @param {import('vitest/node').Vitest} vitest
   */
  onInit(vitest) {
    this.vitest = vitest;
    this.startTime = performance.now();

    // Start trace collector if tracing is enabled
    if (this.options.traceEnabled) {
      this.collector = new TraceCollector({
        maxTraces: 10000
      });

      // Start collector and store the promise
      this.collectorReady = this.collector.start().then(() => {
        // Set environment variables so instrumented code can connect
        process.env.TAIST_ENABLED = 'true';
        process.env.TAIST_DEPTH = String(this.options.traceDepth);
        process.env.TAIST_COLLECTOR_SOCKET = this.collector.getSocketPath();
      }).catch(err => {
        console.error('[taist] Failed to start trace collector:', err.message);
        this.collector = null;
      });
    }
  }

  /**
   * Called when task results are updated (Vitest 2.x)
   * @param {Array} packs - Array of [taskId, result, meta]
   */
  onTaskUpdate(packs) {
    if (!packs) return;

    for (const pack of packs) {
      const [taskId, result] = pack;
      if (result) {
        this.taskResults.set(taskId, result);
      }
    }
  }

  /**
   * Called when test run finishes (Vitest 2.x)
   * @param {Array} files - Test files with results
   * @param {Array} errors - Unhandled errors
   */
  async onFinished(files, errors) {
    this.results.duration = performance.now() - this.startTime;

    // Reset stats
    this.results.stats = { total: 0, passed: 0, failed: 0, skipped: 0 };
    this.results.failures = [];

    // Process all test files
    if (files) {
      for (const file of files) {
        this._processFile(file);
      }
    }

    // Add unhandled errors as failures
    if (errors) {
      for (const error of errors) {
        this.results.failures.push({
          test: 'Unhandled Error',
          error: error.message || String(error),
          stack: error.stack
        });
        this.results.stats.total++;
        this.results.stats.failed++;
      }
    }

    // Collect traces if enabled
    if (this.options.traceEnabled && this.collector) {
      // Wait for collector to be ready
      if (this.collectorReady) {
        await this.collectorReady;
      }

      // Give a small delay for any final traces to arrive
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get collected traces
      if (this.options.showTrace) {
        this.results.trace = this.collector.getTraces();
      }

      // Stop the collector
      await this.collector.stop();
      this.collector = null;
    }

    // Output results
    this._outputResults();
  }

  /**
   * Process a test file and its tasks recursively
   * @private
   */
  _processFile(file) {
    if (file.tasks) {
      for (const task of file.tasks) {
        this._processTask(task, file);
      }
    }
  }

  /**
   * Process a task (test or suite) recursively
   * @private
   */
  _processTask(task, file) {
    if (task.type === 'test') {
      this.results.stats.total++;

      const state = task.result?.state;
      if (state === 'pass') {
        this.results.stats.passed++;
      } else if (state === 'fail') {
        this.results.stats.failed++;
        this.results.failures.push(this._formatFailure(task, file));
      } else if (state === 'skip') {
        this.results.stats.skipped++;
      }
    } else if (task.type === 'suite' && task.tasks) {
      // Process nested tasks
      for (const subtask of task.tasks) {
        this._processTask(subtask, file);
      }
    }
  }

  /**
   * Format a test failure for TOON output
   * @private
   */
  _formatFailure(task, file) {
    const failure = {
      test: this._getTestName(task),
      location: this._getLocation(task, file)
    };

    const error = task.result?.errors?.[0];
    if (error) {
      failure.error = error.message || String(error);
      failure.stack = error.stack;

      // Extract diff if available
      if (error.expected !== undefined || error.actual !== undefined) {
        failure.diff = {
          expected: error.expected,
          actual: error.actual
        };
      }
    }

    return failure;
  }

  /**
   * Get full test name including suite hierarchy
   * @private
   */
  _getTestName(task) {
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
   * @private
   */
  _getLocation(task, file) {
    if (task.location) {
      return {
        file: file?.filepath || file?.name || '',
        line: task.location.line,
        column: task.location.column
      };
    }
    return file?.filepath || file?.name || '';
  }

  /**
   * Output formatted results
   * @private
   */
  _outputResults() {
    if (this.options.silent) {
      return;
    }

    // Format test results
    let output = this.formatter.format(this.results);

    // Add trace tree if we have traces
    if (this.options.showTrace && this.results.trace && this.results.trace.length > 0) {
      output += '\n\n';
      output += this.formatter.formatTraceTree(this.results.trace, {
        maxGroups: this.options.maxTraceGroups,
        showHeader: true
      });
    }

    if (this.options.outputFile) {
      fs.writeFileSync(this.options.outputFile, output);
    } else {
      console.log(output);
    }
  }

  /**
   * Get the collected results (for programmatic access)
   * @returns {Object} Test results
   */
  getResults() {
    return this.results;
  }

  /**
   * Get the trace collector socket path (for manual instrumentation setup)
   * @returns {string|null} Socket path or null if collector not running
   */
  getSocketPath() {
    return this.collector?.getSocketPath() || null;
  }
}

// Default export for Vitest reporter configuration
export default TaistReporter;
