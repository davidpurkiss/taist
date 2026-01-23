/**
 * Taist - Main class type definitions
 */

import { EventEmitter } from 'events';

export interface TaistOptions {
  /** Output format: 'toon' | 'json' | 'compact' */
  format?: 'toon' | 'json' | 'compact';
  /** Enable execution tracing */
  trace?: boolean;
  /** Trace depth level (default: 2) */
  depth?: number;
  /** File patterns to test */
  files?: string | string[];
  /** Test patterns to run */
  tests?: string | string[];
  /** Output formatter options */
  output?: OutputFormatterOptions;
  /** Watch mode options */
  watch?: WatchHandlerOptions;
  /** Watch paths */
  paths?: string[];
}

export interface RunConfig {
  /** File patterns to test */
  files?: string | string[];
  /** Test patterns to run */
  tests?: string | string[];
  /** Test name pattern filter */
  testNamePattern?: string;
}

export interface WatchConfig extends RunConfig {
  /** Paths to watch for changes */
  paths?: string[];
  /** Callback when tests complete */
  onChange?: (results: TestResults) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

export interface TestResults {
  /** Test statistics */
  stats: TestStats;
  /** Array of test failures */
  failures: TestFailure[];
  /** Total duration in milliseconds */
  duration: number;
  /** Execution trace entries */
  trace?: TraceEntry[];
  /** Code coverage information */
  coverage?: CoverageInfo;
}

export interface TestStats {
  /** Total number of tests */
  total: number;
  /** Number of passed tests */
  passed: number;
  /** Number of failed tests */
  failed: number;
  /** Number of skipped tests */
  skipped: number;
}

export interface TestFailure {
  /** Test name or description */
  test: string;
  /** Error message */
  error?: string;
  /** File location */
  location?: string | LocationInfo;
  /** Expected vs actual diff */
  diff?: DiffInfo;
  /** Stack trace */
  stack?: string;
  /** Execution path */
  path?: string | ExecutionPathStep[];
}

export interface LocationInfo {
  /** File path */
  file: string;
  /** Line number */
  line: number;
  /** Column number */
  column?: number;
}

export interface DiffInfo {
  /** Expected value */
  expected?: unknown;
  /** Actual value */
  actual?: unknown;
}

export interface ExecutionPathStep {
  /** Function name */
  fn: string;
  /** Return value */
  result?: unknown;
}

export interface TraceEntry {
  /** Unique trace ID */
  id?: string;
  /** Function or operation name */
  name: string;
  /** Trace type: 'entry' for function start, 'exit' for completion, 'error' for exceptions */
  type: 'entry' | 'enter' | 'exit' | 'error' | 'event';
  /** Function arguments (may be truncated) */
  args?: unknown[];
  /** Return value (may be truncated) */
  result?: unknown;
  /** Error details */
  error?: { name: string; message: string } | string;
  /** Duration in milliseconds (only on exit/error traces) */
  duration?: number;
  /** Timestamp */
  timestamp: number;
  /** Call depth (0 = root) */
  depth: number;
  /** Parent trace ID */
  parentId?: string | null;
  /** Root trace ID for grouping */
  traceId?: string;
  /** Correlation ID for grouping traces across async boundaries */
  correlationId?: string;
}

export interface CoverageInfo {
  /** Coverage percentage */
  percent: number;
  /** Number of covered lines/branches */
  covered: number;
  /** Total lines/branches */
  total: number;
}

export interface OutputFormatterOptions {
  /** Output format */
  format?: 'toon' | 'json' | 'compact';
  /** Pretty print JSON */
  pretty?: boolean;
}

export interface WatchHandlerOptions {
  /** Patterns to ignore */
  ignore?: string[];
  /** Debounce delay in milliseconds */
  delay?: number;
}

/**
 * Main Taist class for programmatic usage
 */
export declare class Taist {
  constructor(options?: TaistOptions);

  /**
   * Run tests once
   * @param config Test configuration
   * @returns Test results
   */
  run(config?: RunConfig): Promise<TestResults>;

  /**
   * Format test results
   * @param results Test results
   * @returns Formatted output string
   */
  format(results: TestResults): string;

  /**
   * Run tests and get formatted output
   * @param config Test configuration
   * @returns Formatted test output
   */
  runAndFormat(config?: RunConfig): Promise<string>;

  /**
   * Start watch mode
   * @param config Watch configuration
   * @returns WatchHandler instance
   */
  watch(config?: WatchConfig): Promise<WatchHandler>;

  /**
   * Stop watch mode
   */
  stopWatch(): Promise<void>;

  /**
   * Get execution tracer
   */
  getTracer(): ExecutionTracer;

  /**
   * Set output format
   * @param format Output format
   */
  setFormat(format: 'toon' | 'json' | 'compact'): void;
}

export interface ExecutionTracerOptions {
  /** Enable tracing */
  enabled?: boolean;
  /** Trace depth level */
  depth?: number;
  /** Maximum trace entries to keep */
  maxEntries?: number;
}

/**
 * Execution tracer for recording function calls
 */
export declare class ExecutionTracer {
  constructor(options?: ExecutionTracerOptions);

  /** Start tracing */
  start(): void;

  /** Stop tracing */
  stop(): void;

  /**
   * Record function entry
   * @param name Function name
   * @param args Function arguments
   */
  enter(name: string, args?: unknown[]): void;

  /**
   * Record function exit
   * @param name Function name
   * @param result Return value
   */
  exit(name: string, result?: unknown): void;

  /**
   * Record an error
   * @param name Function name
   * @param error Error object
   */
  error(name: string, error: Error): void;

  /**
   * Wrap a function with automatic tracing
   * @param fn Function to wrap
   * @param name Name for tracing
   */
  wrap<T extends (...args: unknown[]) => unknown>(fn: T, name: string): T;

  /** Get all recorded traces */
  getTraces(): TraceEntry[];

  /** Export traces for TOON format */
  exportForToon(): TraceEntry[];
}

export declare class VitestRunner {
  constructor(options?: VitestRunnerOptions);
  run(config?: RunConfig): Promise<TestResults>;
  getResults(): TestResults | null;
}

export interface VitestRunnerOptions {
  trace?: {
    enabled?: boolean;
    depth?: number;
  };
  tracer?: ExecutionTracer;
  coverage?: boolean | object;
}

export declare class OutputFormatter {
  constructor(options?: OutputFormatterOptions);
  format(results: TestResults): string;
  setFormat(format: 'toon' | 'json' | 'compact'): void;
}

export declare class WatchHandler extends EventEmitter {
  constructor(options?: WatchHandlerOptions);
  start(paths: string[], runTests: () => Promise<TestResults>): Promise<void>;
  stop(): Promise<void>;
}

export default Taist;
