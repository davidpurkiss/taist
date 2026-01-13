/**
 * Taist - Token-Optimized Testing Framework
 * Main type definitions
 */

// Main entry point exports
export {
  Taist,
  TaistOptions,
  RunConfig,
  WatchConfig,
  TestResults,
  TestStats,
  TestFailure,
  TraceEntry,
  CoverageInfo,
  LocationInfo,
  DiffInfo
} from './taist';

export { VitestRunner, VitestRunnerOptions } from './vitest-runner';
export { OutputFormatter, OutputFormatterOptions } from './output-formatter';
export { WatchHandler, WatchHandlerOptions } from './watch-handler';
export { ExecutionTracer, ExecutionTracerOptions } from './execution-tracer';
export {
  ToonFormatter,
  ToonFormatterOptions,
  FormatTraceTreeOptions
} from './toon-formatter';

// Re-export instrument types
export * from './instrument';

// Re-export testing types
export * from './testing';

// Re-export trace-collector types
export * from './trace-collector';

// Re-export vitest-reporter types
export { TaistReporter, TaistReporterOptions } from './vitest-reporter';
