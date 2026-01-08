/**
 * TraceSession - Simplified API for test integration
 *
 * Provides a clean interface for setting up trace collection in tests
 * without needing to manage the collector and formatter directly.
 *
 * @example
 * import { TraceSession } from 'taist/testing';
 *
 * let session;
 *
 * beforeAll(async () => {
 *   session = new TraceSession();
 *   await session.start();
 *
 *   // Start your server with session.getEnv()
 *   serverProcess = spawn('node', [serverPath], {
 *     env: { ...process.env, ...session.getEnv(), PORT },
 *   });
 * });
 *
 * afterAll(async () => {
 *   serverProcess?.kill('SIGTERM');
 *   session.printTraces({ maxGroups: 5 });
 *   await session.stop();
 * });
 */

import { TraceCollector } from './trace-collector.js';
import { ToonFormatter } from './toon-formatter.js';

export class TraceSession {
  constructor(options = {}) {
    this.options = options;
    this.collector = null;
    this.formatter = new ToonFormatter(options.formatter);
  }

  /**
   * Start the trace collector
   * @returns {Promise<void>}
   */
  async start() {
    this.collector = new TraceCollector(this.options.collector);
    await this.collector.start();
  }

  /**
   * Get environment variables for enabling tracing
   * Pass these to your server process
   * @returns {Object} Environment variables
   */
  getEnv() {
    if (!this.collector) {
      throw new Error('TraceSession not started. Call start() first.');
    }
    return {
      TAIST_ENABLED: 'true',
      TAIST_COLLECTOR_SOCKET: this.collector.getSocketPath(),
    };
  }

  /**
   * Get the collector's socket path
   * @returns {string}
   */
  getSocketPath() {
    if (!this.collector) {
      throw new Error('TraceSession not started. Call start() first.');
    }
    return this.collector.getSocketPath();
  }

  /**
   * Get collected traces
   * @returns {Array} Array of trace objects
   */
  getTraces() {
    if (!this.collector) {
      return [];
    }
    return this.collector.getTraces();
  }

  /**
   * Print traces to console
   * @param {Object} options - Formatting options
   * @param {number} options.maxGroups - Max request groups to show (default: 10)
   * @param {boolean} options.showToon - Show TOON format summary (default: true)
   * @param {number} options.toonLimit - Max traces for TOON output (default: 30)
   */
  printTraces(options = {}) {
    const traces = this.getTraces();
    this.formatter.printTraceTree(traces, options);
  }

  /**
   * Format traces as string (without printing)
   * @param {Object} options - Formatting options
   * @returns {string} Formatted trace output
   */
  formatTraces(options = {}) {
    const traces = this.getTraces();
    return this.formatter.formatTraceTree(traces, options);
  }

  /**
   * Stop the trace collector
   * @returns {Promise<void>}
   */
  async stop() {
    if (this.collector) {
      await this.collector.stop();
      this.collector = null;
    }
  }
}

export default TraceSession;