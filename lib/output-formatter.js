/**
 * Output Formatter - Multi-format test result formatter
 * Supports TOON, JSON, and Compact output formats
 */

import { ToonFormatter } from './toon-formatter.js';

export class OutputFormatter {
  constructor(options = {}) {
    this.formatType = options.format || 'toon';
    this.options = options;
    this.toonFormatter = new ToonFormatter(options);
  }

  /**
   * Format test results based on configured format
   * @param {Object} results - Test results object
   * @returns {string} - Formatted output
   */
  format(results) {
    switch (this.formatType.toLowerCase()) {
      case 'toon':
        return this.formatToon(results);
      case 'json':
        return this.formatJson(results);
      case 'compact':
        return this.formatCompact(results);
      default:
        throw new Error(`Unknown format: ${this.formatType}. Use: toon, json, or compact`);
    }
  }

  /**
   * Format as TOON
   */
  formatToon(results) {
    return this.toonFormatter.format(results);
  }

  /**
   * Format as JSON
   */
  formatJson(results) {
    const output = {
      status: this.determineStatus(results),
      stats: results.stats || {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0
      },
      failures: (results.failures || []).map(f => this.formatFailureForJson(f)),
      trace: results.trace || [],
      coverage: results.coverage || null,
      duration: results.duration || 0,
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(output, null, this.options.pretty ? 2 : 0);
  }

  /**
   * Format as compact one-liner
   */
  formatCompact(results) {
    const stats = results.stats || {};
    const passed = stats.passed || 0;
    const total = stats.total || 0;
    const failed = stats.failed || 0;

    const status = failed === 0 ? '✓' : '✗';
    const parts = [`${status} ${passed}/${total}`];

    if (failed > 0) {
      parts.push(`${failed} fail`);
      if (results.failures && results.failures.length > 0) {
        const firstError = results.failures[0];
        const errorMsg = this.extractErrorMessage(firstError);
        parts.push(`(${errorMsg})`);
      }
    }

    if (results.coverage) {
      parts.push(`cov:${Math.round(results.coverage.percent)}%`);
    }

    if (results.duration) {
      parts.push(`${Math.round(results.duration)}ms`);
    }

    return parts.join(' ');
  }

  /**
   * Determine overall status
   */
  determineStatus(results) {
    const stats = results.stats || {};
    if (stats.failed > 0) return 'fail';
    if (stats.passed === 0 && stats.total === 0) return 'empty';
    return 'pass';
  }

  /**
   * Format failure for JSON output
   */
  formatFailureForJson(failure) {
    return {
      test: failure.test || failure.name,
      error: this.extractErrorMessage(failure),
      location: failure.location || null,
      diff: failure.diff || null,
      stack: this.formatStackForJson(failure.stack),
      path: failure.path || null
    };
  }

  /**
   * Extract error message
   */
  extractErrorMessage(failure) {
    if (failure.error) {
      if (typeof failure.error === 'string') return failure.error;
      if (failure.error.message) return failure.error.message;
      return String(failure.error);
    }
    return 'Unknown error';
  }

  /**
   * Format stack trace for JSON
   */
  formatStackForJson(stack) {
    if (!stack) return null;
    if (typeof stack === 'string') {
      return stack.split('\n')
        .filter(line => line.trim())
        .slice(0, 5);
    }
    return stack;
  }

  /**
   * Set format type
   */
  setFormat(format) {
    this.formatType = format;
  }
}

export default OutputFormatter;
