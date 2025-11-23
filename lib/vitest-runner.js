/**
 * Vitest Runner - Execute tests and collect results
 * Custom runner and reporter for Vitest integration
 */

import { startVitest } from 'vitest/node';
import { ExecutionTracer } from './execution-tracer.js';

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

    try {
      if (this.options.trace?.enabled) {
        this.tracer.start();
      }

      const vitest = await startVitest(
        'test',
        [],
        vitestConfig
      );

      if (!vitest) {
        throw new Error('Failed to start Vitest');
      }

      // Wait for tests to complete
      await vitest.close();

      // Collect results
      this.results = this.collectResults(vitest);

      // Add trace data if enabled
      if (this.options.trace?.enabled) {
        this.results.trace = this.tracer.exportForToon();
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
      reporters: [],  // No reporters to suppress output
      ui: false,
      outputFile: false,
      logHeapUsage: false,
      maxConcurrency: 1,
      silent: true,
      ...config
    };

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
}

export default VitestRunner;
