/**
 * Vitest TOON Reporter Type Definitions
 *
 * A native Vitest reporter that outputs test results in TOON format.
 *
 * Usage in vitest.config.js:
 *   reporters: ['taist/vitest-reporter']
 *
 * With options:
 *   reporters: [['taist/vitest-reporter', { format: 'toon', traceDepth: 3 }]]
 */

import type { TestResults, TestFailure } from './taist';

export interface TaistReporterOptions {
  /** Output format (default: 'toon') */
  format?: 'toon' | 'json' | 'compact';
  /** Enable execution tracing (default: true) */
  traceEnabled?: boolean;
  /** Trace depth level (default: 3) */
  traceDepth?: number;
  /** Include traces in output (default: true) */
  showTrace?: boolean;
  /** Suppress output (default: false) */
  silent?: boolean;
  /** Write to file instead of stdout */
  outputFile?: string | null;
  /** Max request groups to show in trace output (default: 10) */
  maxTraceGroups?: number;
}

/**
 * Vitest TOON Reporter
 *
 * Implements Vitest's Reporter interface to output test results in TOON format.
 *
 * @example
 * // vitest.config.js
 * export default defineConfig({
 *   test: {
 *     reporters: ['taist/vitest-reporter']
 *   }
 * });
 *
 * @example
 * // With options
 * export default defineConfig({
 *   test: {
 *     reporters: [['taist/vitest-reporter', {
 *       format: 'toon',
 *       traceEnabled: true,
 *       traceDepth: 3
 *     }]]
 *   }
 * });
 */
export declare class TaistReporter {
  constructor(options?: TaistReporterOptions);

  /**
   * Called when Vitest is initialized
   */
  onInit(vitest: unknown): void;

  /**
   * Called when test run starts
   */
  onTestRunStart(specifications: unknown[]): void;

  /**
   * Called when a test module is collected
   */
  onTestModuleCollected(testModule: unknown): void;

  /**
   * Called when a test case completes
   */
  onTestCaseResult(testCase: unknown): void;

  /**
   * Called when test run ends
   */
  onTestRunEnd(
    testModules: readonly unknown[],
    unhandledErrors: readonly unknown[],
    reason: string
  ): void;

  /**
   * Get the collected results (for programmatic access)
   */
  getResults(): TestResults;

  /**
   * Get the trace collector socket path (for manual instrumentation setup)
   * @returns Socket path or null if collector not running
   */
  getSocketPath(): string | null;
}

export default TaistReporter;
