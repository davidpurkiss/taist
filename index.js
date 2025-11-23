/**
 * Taist - Token-Optimized Testing Framework
 * Main programmatic API
 */

import { VitestRunner } from './lib/vitest-runner.js';
import { OutputFormatter } from './lib/output-formatter.js';
import { WatchHandler } from './lib/watch-handler.js';
import { ExecutionTracer } from './lib/execution-tracer.js';
import { ToonFormatter } from './lib/toon-formatter.js';

/**
 * Main Taist class for programmatic usage
 */
export class Taist {
  constructor(options = {}) {
    this.options = {
      format: options.format || 'toon',
      trace: options.trace !== false,
      depth: options.depth || 2,
      ...options
    };

    this.tracer = new ExecutionTracer({
      enabled: this.options.trace,
      depth: this.options.depth
    });

    this.runner = new VitestRunner({
      trace: {
        enabled: this.options.trace,
        depth: this.options.depth
      },
      tracer: this.tracer
    });

    this.formatter = new OutputFormatter({
      format: this.options.format,
      ...this.options.output
    });

    this.watchHandler = null;
  }

  /**
   * Run tests once
   * @param {Object} config - Test configuration
   * @returns {Object} Test results
   */
  async run(config = {}) {
    const results = await this.runner.run({
      files: config.files || this.options.files,
      tests: config.tests || this.options.tests
    });

    return results;
  }

  /**
   * Format test results
   * @param {Object} results - Test results
   * @returns {string} Formatted output
   */
  format(results) {
    return this.formatter.format(results);
  }

  /**
   * Run tests and get formatted output
   * @param {Object} config - Test configuration
   * @returns {string} Formatted test output
   */
  async runAndFormat(config = {}) {
    const results = await this.run(config);
    return this.format(results);
  }

  /**
   * Start watch mode
   * @param {Object} config - Watch configuration
   */
  async watch(config = {}) {
    if (this.watchHandler) {
      throw new Error('Watch mode already started');
    }

    this.watchHandler = new WatchHandler({
      ...this.options.watch,
      ...config
    });

    const watchPaths = config.paths || this.options.paths || ['./src', './test'];

    // Set up event listeners if callbacks provided
    if (config.onChange) {
      this.watchHandler.on('run-complete', ({ results }) => {
        config.onChange(results);
      });
    }

    if (config.onError) {
      this.watchHandler.on('run-error', ({ error }) => {
        config.onError(error);
      });
    }

    await this.watchHandler.start(watchPaths, async () => {
      return await this.run(config);
    });

    return this.watchHandler;
  }

  /**
   * Stop watch mode
   */
  async stopWatch() {
    if (this.watchHandler) {
      await this.watchHandler.stop();
      this.watchHandler = null;
    }
  }

  /**
   * Get execution tracer
   */
  getTracer() {
    return this.tracer;
  }

  /**
   * Set output format
   */
  setFormat(format) {
    this.formatter.setFormat(format);
  }
}

// Named exports
export { VitestRunner } from './lib/vitest-runner.js';
export { OutputFormatter } from './lib/output-formatter.js';
export { WatchHandler } from './lib/watch-handler.js';
export { ExecutionTracer } from './lib/execution-tracer.js';
export { ToonFormatter } from './lib/toon-formatter.js';

// Default export
export default Taist;
