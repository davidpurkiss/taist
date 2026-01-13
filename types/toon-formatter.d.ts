/**
 * ToonFormatter Type Definitions
 *
 * Token-Optimized Output Notation formatter for AI consumption.
 */

import type { TestResults, TestFailure, TraceEntry, CoverageInfo, LocationInfo } from './taist';
import type { TraceObject } from './trace-collector';

export interface ToonFormatterOptions {
  /** Enable abbreviations (default: true) */
  abbreviate?: boolean;
  /** Maximum tokens for output */
  maxTokens?: number;
  /** Maximum string length before truncation */
  maxStringLength?: number;
  /** Maximum stack frames to show */
  maxStackFrames?: number;
  /** Maximum object keys to display */
  maxObjectKeys?: number;
  /** Maximum array items to display */
  maxArrayItems?: number;
}

export interface FormatTraceTreeOptions {
  /** Maximum request groups to show (default: 10) */
  maxGroups?: number;
  /** Show header with stats (default: true) */
  showHeader?: boolean;
}

export interface PrintTraceTreeOptions extends FormatTraceTreeOptions {
  /** Show TOON format summary (default: true) */
  showToon?: boolean;
  /** Max traces for TOON output (default: 30) */
  toonLimit?: number;
}

/**
 * TOON Formatter - Token-Optimized Output Notation
 *
 * Converts test results to a token-efficient format for AI consumption.
 */
export declare class ToonFormatter {
  constructor(options?: ToonFormatterOptions);

  /**
   * Format test results in TOON format
   * @param results Test results object
   * @returns Formatted TOON output
   */
  format(results: TestResults): string;

  /**
   * Format test result header
   * @param results Test results
   * @returns Header string
   */
  formatHeader(results: TestResults): string;

  /**
   * Format a single test failure
   * @param failure Test failure object
   * @returns Array of formatted lines
   */
  formatFailure(failure: TestFailure): string[];

  /**
   * Format trace entry with depth-based indentation
   * @param entry Trace entry
   * @returns Formatted trace line
   */
  formatTraceEntry(entry: TraceEntry): string;

  /**
   * Format coverage information
   * @param coverage Coverage info
   * @returns Formatted coverage string
   */
  formatCoverage(coverage: CoverageInfo): string;

  /**
   * Format a location reference
   * @param location Location string or object
   * @returns Formatted location string
   */
  formatLocation(location: string | LocationInfo): string;

  /**
   * Format a value for output
   * @param value Any value
   * @returns Formatted value string
   */
  formatValue(value: unknown): string;

  /**
   * Format stack trace
   * @param stack Stack trace string
   * @returns Abbreviated stack string
   */
  formatStack(stack: string): string;

  /**
   * Group traces by traceId (each HTTP request becomes a group)
   * @param traces Array of trace objects
   * @returns Map of traceId to traces
   */
  groupTracesByRequest(traces: TraceObject[]): Map<string, TraceObject[]>;

  /**
   * Format a trace tree showing nested call hierarchy
   * @param traces Array of trace objects with depth, traceId
   * @param options Formatting options
   * @returns Formatted trace tree output
   */
  formatTraceTree(traces: TraceObject[], options?: FormatTraceTreeOptions): string;

  /**
   * Print trace tree to console with optional TOON summary
   * @param traces Array of trace objects
   * @param options Options
   */
  printTraceTree(traces: TraceObject[], options?: PrintTraceTreeOptions): void;

  /**
   * Abbreviate file path
   * @param path File path
   * @returns Abbreviated path
   */
  abbreviatePath(path: string): string;

  /**
   * Clean error message (remove ANSI codes, timestamps, etc.)
   * @param error Error message or object
   * @returns Cleaned message string
   */
  cleanErrorMessage(error: string | Error | { message: string }): string;

  /**
   * Truncate string to max length
   * @param str String to truncate
   * @param maxLength Maximum length
   * @returns Truncated string
   */
  truncate(str: string | null | undefined, maxLength?: number): string;
}

export default ToonFormatter;
