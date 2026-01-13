/**
 * Taist Testing Utilities Type Definitions
 *
 * Provides helper classes for integrating taist tracing into test suites.
 *
 * @example
 * import { TraceSession } from 'taist/testing';
 *
 * let session: TraceSession;
 *
 * beforeAll(async () => {
 *   session = new TraceSession();
 *   await session.start();
 *
 *   serverProcess = spawn('node', [serverPath], {
 *     env: { ...process.env, ...session.getEnv() },
 *   });
 * });
 *
 * afterAll(async () => {
 *   serverProcess?.kill('SIGTERM');
 *   session.printTraces({ maxGroups: 5 });
 *   await session.stop();
 * });
 */

import type { TraceCollector, TraceCollectorOptions, TraceObject } from './trace-collector';
import type { ToonFormatter, ToonFormatterOptions, FormatTraceTreeOptions } from './toon-formatter';

export { TraceCollector, TraceCollectorOptions, TraceObject, createDefaultFilter } from './trace-collector';
export { ToonFormatter, ToonFormatterOptions, FormatTraceTreeOptions } from './toon-formatter';

export interface TraceSessionOptions {
  /** Trace collector options */
  collector?: TraceCollectorOptions;
  /** TOON formatter options */
  formatter?: ToonFormatterOptions;
}

export interface PrintTracesOptions extends FormatTraceTreeOptions {
  /** Show TOON format summary (default: true) */
  showToon?: boolean;
  /** Max traces for TOON output (default: 30) */
  toonLimit?: number;
}

/**
 * TraceSession - Simplified API for test integration
 *
 * Provides a clean interface for setting up trace collection in tests
 * without needing to manage the collector and formatter directly.
 */
export declare class TraceSession {
  constructor(options?: TraceSessionOptions);

  /**
   * Start the trace collector
   */
  start(): Promise<void>;

  /**
   * Get environment variables for enabling tracing
   * Pass these to your server process
   * @returns Environment variables object
   */
  getEnv(): Record<string, string>;

  /**
   * Get the collector's socket path
   */
  getSocketPath(): string;

  /**
   * Get collected traces
   * @returns Array of trace objects
   */
  getTraces(): TraceObject[];

  /**
   * Print traces to console
   * @param options Formatting options
   */
  printTraces(options?: PrintTracesOptions): void;

  /**
   * Format traces as string (without printing)
   * @param options Formatting options
   * @returns Formatted trace output
   */
  formatTraces(options?: PrintTracesOptions): string;

  /**
   * Stop the trace collector
   */
  stop(): Promise<void>;
}

export default TraceSession;
