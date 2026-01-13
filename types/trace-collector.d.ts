/**
 * TraceCollector Type Definitions
 *
 * Unix domain socket server for aggregating traces from multiple worker processes.
 */

import { EventEmitter } from 'events';

export interface TraceCollectorOptions {
  /** Session ID for the collector */
  sessionId?: string;
  /** Custom socket path */
  socketPath?: string;
  /** Filter function to include/exclude traces */
  filter?: (trace: TraceObject) => boolean;
  /** Maximum traces to keep (circular buffer) */
  maxTraces?: number;
}

export interface TraceObject {
  /** Unique trace ID */
  id?: string;
  /** Function or operation name */
  name: string;
  /** Trace type */
  type: 'enter' | 'exit' | 'error' | 'event';
  /** Function arguments */
  args?: unknown[];
  /** Return value */
  result?: unknown;
  /** Error details */
  error?: { name: string; message: string } | string;
  /** Duration in milliseconds */
  duration?: number;
  /** Timestamp */
  timestamp: number;
  /** Call depth (0 = root) */
  depth: number;
  /** Parent trace ID */
  parentId?: string | null;
  /** Root trace ID for grouping */
  traceId?: string;
}

export interface TraceCollectorEvents {
  started: { socketPath: string };
  stopped: void;
  trace: TraceObject;
  flush: { workerId: string };
  error: Error;
  connectionError: Error;
  parseError: { error: Error; line: string };
}

/**
 * TraceCollector - Unix domain socket server for aggregating traces
 *
 * Architecture:
 * - Main process starts the collector before spawning test workers
 * - Workers connect via Unix socket and send NDJSON trace messages
 * - Collector aggregates, deduplicates, and filters traces
 * - After tests complete, main process retrieves aggregated traces
 */
export declare class TraceCollector extends EventEmitter {
  constructor(options?: TraceCollectorOptions);

  /**
   * Start the collector server
   */
  start(): Promise<void>;

  /**
   * Stop the collector server
   */
  stop(): Promise<void>;

  /**
   * Get all collected traces
   * @returns Copy of the traces array
   */
  getTraces(): TraceObject[];

  /**
   * Get the number of collected traces
   */
  getTraceCount(): number;

  /**
   * Clear all collected traces
   */
  clearTraces(): void;

  /**
   * Get the socket path for this collector
   */
  getSocketPath(): string;

  /**
   * Check if the collector is running
   */
  isRunning(): boolean;

  // EventEmitter overloads for type safety
  on<K extends keyof TraceCollectorEvents>(
    event: K,
    listener: (arg: TraceCollectorEvents[K]) => void
  ): this;
  emit<K extends keyof TraceCollectorEvents>(
    event: K,
    arg: TraceCollectorEvents[K]
  ): boolean;
}

export interface CreateDefaultFilterOptions {
  /** Patterns to exclude from traces */
  exclude?: string[];
}

/**
 * Create a default filter that excludes taist's own traces
 * @param options Filter options
 * @returns Filter function
 */
export declare function createDefaultFilter(
  options?: CreateDefaultFilterOptions
): (trace: TraceObject) => boolean;

export default TraceCollector;
