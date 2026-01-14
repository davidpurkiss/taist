/**
 * Taist Instrumentation Module Type Definitions
 *
 * This module can be used in two ways:
 *
 * 1. SIDE-EFFECT IMPORT (optional):
 *    `import 'taist/instrument';`
 *    Initializes global tracer, sets up signal handlers, configures periodic output.
 *
 * 2. DIRECT FUNCTION IMPORTS (no side effects):
 *    `import { instrumentExpress, instrumentService } from 'taist/instrument';`
 *    Useful for post-startup instrumentation or manual tracer control.
 */

import type { Application as ExpressApp } from 'express';
import type { TraceReporter } from './trace-collector';

export interface TraceContext {
  /** Call depth (0 = root) */
  depth: number;
  /** Root trace ID */
  traceId: string | null;
  /** Parent operation ID */
  parentId: string | null;
  /** Current operation ID */
  id: string | null;
}

export interface InstrumentExpressOptions {
  /** Use AsyncLocalStorage context propagation (default: true) */
  useContext?: boolean;
}

export interface InstrumentAllOptions {
  /** Service name prefix */
  name?: string;
  /** Use context-aware instrumentation */
  useContext?: boolean;
}

export interface ServiceTracerOptions {
  /** Enable tracing (default: true) */
  enabled?: boolean;
  /** Trace depth level (default: 3) */
  depth?: number;
  /** Output format */
  outputFormat?: 'toon' | 'json' | 'compact';
  /** Output file path */
  outputFile?: string;
  /** Output interval in ms */
  outputInterval?: number;
  /** Include patterns */
  includePatterns?: string[];
  /** Exclude patterns */
  excludePatterns?: string[];
  /** Slow operation threshold in ms */
  slowOpThreshold?: number;
}

/**
 * Service tracer for instrumenting classes and functions
 */
export declare class ServiceTracer {
  constructor(options?: ServiceTracerOptions);

  /** Instrument a class or object */
  instrument<T extends object>(target: T, name?: string): T;

  /** Get tracer insights */
  getInsights(): object;

  /** Format output */
  formatOutput(insights: object): string;

  /** Write output to file or return string */
  writeOutput(): string;

  /** Get traces for output */
  getTracesForOutput(): object[];

  readonly options: ServiceTracerOptions;
}

/**
 * Global tracer instance (initialized on module import)
 */
export declare const tracer: ServiceTracer;

/**
 * Global reporter instance for cross-process trace collection.
 * Automatically connects to TAIST_COLLECTOR_SOCKET if set.
 */
export declare const reporter: TraceReporter;

/**
 * Flush any buffered traces to the collector.
 * Call this before process exit to ensure all traces are sent.
 * @returns Promise that resolves when flush completes
 */
export declare function flushTraces(): Promise<void>;

/**
 * Auto-instrument a module's exports
 * @param moduleExports Module exports object
 * @param name Module name
 * @param options Instrumentation options
 */
export declare function autoInstrument<T extends object>(
  moduleExports: T,
  name: string,
  options?: object
): T;

/**
 * Instrument Express app with context-aware tracing
 *
 * Each HTTP request starts a new trace context, making the route handler
 * depth 0 (the trace root). All instrumented services called within the
 * request will inherit this context and have incrementing depths.
 *
 * @param app Express application
 * @param options Instrumentation options
 * @returns The instrumented Express app
 *
 * @example
 * const app = express();
 * instrumentExpress(app);
 *
 * app.post('/orders', async (req, res) => {
 *   // Route handler is depth 0
 *   const order = await orderService.create(req.body); // depth 1
 *   res.json(order);
 * });
 */
export declare function instrumentExpress<T extends ExpressApp>(
  app: T,
  options?: InstrumentExpressOptions
): T;

/**
 * Instrument a class or service instance with tracing
 *
 * For context-aware instrumentation (nested traces), use instrumentServiceWithContext instead.
 *
 * @param service Service instance or class
 * @param name Service name for tracing
 * @returns Instrumented service
 */
export declare function instrumentService<T extends object>(
  service: T,
  name: string
): T;

/**
 * Instrument a class or service instance with context-aware tracing
 *
 * Uses AsyncLocalStorage for automatic depth tracking across async boundaries.
 * Use this when you need nested traces across service boundaries.
 *
 * @param service Service instance
 * @param name Service name for tracing
 * @returns Instrumented service
 */
export declare function instrumentServiceWithContext<T extends object>(
  service: T,
  name: string
): T;

/**
 * Instrument all modules matching a pattern
 * @param pattern Glob pattern for modules
 * @param options Instrumentation options
 * @returns Map of module name to instrumented exports
 */
export declare function instrumentAll(
  pattern: string,
  options?: InstrumentAllOptions
): Promise<Record<string, unknown>>;

/**
 * Instrument all modules in a directory
 * @param dir Directory path
 * @param options Instrumentation options
 * @returns Map of module name to instrumented exports
 */
export declare function instrumentDirectory(
  dir: string,
  options?: InstrumentAllOptions
): Promise<Record<string, unknown>>;

/**
 * Instrument specific modules
 * @param modulePaths Array of module paths
 * @param options Instrumentation options
 * @returns Map of module name to instrumented exports
 */
export declare function instrumentModules(
  modulePaths: string[],
  options?: InstrumentAllOptions
): Promise<Record<string, unknown>>;

/**
 * Instrument all exports from a module object
 *
 * Wraps all function exports with context-aware tracing.
 * Classes are wrapped so new instances are automatically instrumented.
 *
 * @param moduleExports Module exports object (e.g., from `import * as mod from './mod.js'`)
 * @param moduleName Module name prefix for trace names
 * @returns Object with same keys but instrumented values
 *
 * @example
 * import { instrumentModule } from 'taist/instrument';
 * import * as orderServices from './services/order.js';
 *
 * export const Order = instrumentModule(orderServices, 'Order');
 * // All functions in Order will now be traced
 */
export declare function instrumentModule<T extends Record<string, unknown>>(
  moduleExports: T,
  moduleName: string
): T;

/**
 * Wrap a function with trace context
 * @param fn Function to wrap
 * @param name Name for tracing
 */
export declare function wrapWithContext<T extends (...args: unknown[]) => unknown>(
  fn: T,
  name: string
): T;

/**
 * Start a new trace and run a function within it
 * @param fn Function to execute
 * @returns Function result
 */
export declare function startTrace<T>(fn: () => T): T;

/**
 * Get the current trace context
 * @returns Current context or default context if none
 */
export declare function getContext(): TraceContext;

/**
 * Run a function within a specific trace context
 * @param context Trace context
 * @param fn Function to execute
 * @returns Function result
 */
export declare function runWithContext<T>(context: TraceContext, fn: () => T): T;

/**
 * Generate a unique trace ID
 * @returns Unique ID string
 */
export declare function generateId(): string;

export default tracer;
