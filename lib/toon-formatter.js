/**
 * TOON Formatter - Token-Optimized Output Notation
 * Converts test results to a token-efficient format for AI consumption
 */

export class ToonFormatter {
  constructor(options = {}) {
    this.options = {
      abbreviate: options.abbreviate !== false,
      maxTokens: options.maxTokens || 1000,
      maxStringLength: options.maxStringLength || 50,
      maxStackFrames: options.maxStackFrames || 2,
      maxObjectKeys: options.maxObjectKeys || 3,
      maxArrayItems: options.maxArrayItems || 2,
      ...options
    };

    // Abbreviation dictionary
    this.abbrev = {
      function: 'fn',
      error: 'err',
      expected: 'exp',
      received: 'got',
      actual: 'got',
      undefined: 'undef',
      null: 'nil',
      test: 'tst',
      testing: 'tst',
      passed: 'pass',
      failed: 'fail',
      arguments: 'args',
      return: 'ret',
      result: 'ret',
      message: 'msg',
      location: 'loc',
      line: 'ln',
      column: 'col'
    };
  }

  /**
   * Format test results in TOON format
   * @param {Object} results - Test results object
   * @returns {string} - Formatted TOON output
   */
  format(results) {
    const lines = [];

    // Header
    lines.push(this.formatHeader(results));

    // Failures
    if (results.failures && results.failures.length > 0) {
      lines.push('');
      lines.push('FAILURES:');
      results.failures.forEach(failure => {
        lines.push(...this.formatFailure(failure));
      });
    }

    // Trace
    if (results.trace && results.trace.length > 0) {
      lines.push('');
      lines.push('TRACE:');
      results.trace.forEach(entry => {
        lines.push(this.formatTraceEntry(entry));
      });
    }

    // Coverage
    if (results.coverage) {
      lines.push('');
      lines.push(this.formatCoverage(results.coverage));
    }

    return lines.join('\n');
  }

  /**
   * Format test result header
   */
  formatHeader(results) {
    const passed = results.stats?.passed || 0;
    const total = results.stats?.total || 0;
    return `===TESTS: ${passed}/${total}===`;
  }

  /**
   * Format a single test failure
   */
  formatFailure(failure) {
    const lines = [];

    // Test name
    lines.push(`✗ ${this.truncate(failure.test || failure.name)}`);

    // Location
    if (failure.location) {
      lines.push(`  @${this.formatLocation(failure.location)}`);
    }

    // Error message
    if (failure.error) {
      const msg = this.cleanErrorMessage(failure.error);
      lines.push(`  ${msg}`);
    }

    // Expected vs Actual
    if (failure.diff) {
      if (failure.diff.expected !== undefined) {
        lines.push(`  exp: ${this.formatValue(failure.diff.expected)}`);
      }
      if (failure.diff.actual !== undefined) {
        lines.push(`  got: ${this.formatValue(failure.diff.actual)}`);
      }
    }

    // Execution path
    if (failure.path) {
      lines.push(`  path: ${this.formatPath(failure.path)}`);
    }

    // Stack trace (abbreviated)
    if (failure.stack && this.options.maxStackFrames > 0) {
      const stack = this.formatStack(failure.stack);
      if (stack) {
        lines.push(`  ${stack}`);
      }
    }

    return lines;
  }

  /**
   * Format trace entry with depth-based indentation for execution tree
   */
  formatTraceEntry(entry) {
    const parts = [];

    // Function name
    parts.push(`fn:${this.abbreviateFunctionName(entry.name)}`);

    // Duration
    if (entry.duration !== undefined) {
      parts.push(`ms:${Math.round(entry.duration)}`);
    }

    // Arguments (if present)
    if (entry.args && entry.args.length > 0) {
      const args = entry.args
        .slice(0, this.options.maxArrayItems)
        .map(arg => this.formatValue(arg))
        .join(',');
      parts.push(`args:[${args}]`);
    }

    // Return value (if present and not undefined)
    if (entry.result !== undefined) {
      parts.push(`ret:${this.formatValue(entry.result)}`);
    }

    // Error (if present)
    if (entry.error) {
      parts.push(`err:${this.cleanErrorMessage(entry.error)}`);
    }

    // Calculate indentation based on depth (2 spaces base + 2 per depth level)
    const depth = entry.depth || 0;
    const indent = '  ' + '  '.repeat(depth);

    return `${indent}${parts.join(' ')}`;
  }

  /**
   * Abbreviate function name for compact output
   */
  abbreviateFunctionName(name) {
    if (!name) return 'anonymous';

    // Keep the last part of dotted names, but preserve HTTP method info
    if (name.startsWith('HTTP ') || name.startsWith('Route.')) {
      return name;
    }

    // For service methods like "OrderService.createOrder", keep both parts but abbreviate
    const parts = name.split('.');
    if (parts.length === 2) {
      return name; // Keep as-is for readability
    }

    // For longer paths, just keep the last two parts
    if (parts.length > 2) {
      return parts.slice(-2).join('.');
    }

    return name;
  }

  /**
   * Format coverage information
   */
  formatCoverage(coverage) {
    const percent = Math.round(coverage.percent || 0);
    const covered = coverage.covered || 0;
    const total = coverage.total || 0;
    return `COV: ${percent}% (${covered}/${total})`;
  }

  /**
   * Format a location reference
   */
  formatLocation(location) {
    if (typeof location === 'string') {
      return this.abbreviatePath(location);
    }

    const file = this.abbreviatePath(location.file || '');
    const line = location.line || '';
    const col = location.column || '';

    if (col) {
      return `${file}:${line}:${col}`;
    } else if (line) {
      return `${file}:${line}`;
    }
    return file;
  }

  /**
   * Format an execution path
   */
  formatPath(path) {
    if (Array.isArray(path)) {
      return path
        .map(step => {
          if (typeof step === 'string') return step;
          if (step.fn && step.result !== undefined) {
            return `${step.fn}(...)→${this.formatValue(step.result)}`;
          }
          return step.fn || String(step);
        })
        .join('→');
    }
    return String(path);
  }

  /**
   * Format a value for output
   */
  formatValue(value) {
    if (value === null) return 'nil';
    if (value === undefined) return 'undef';

    const type = typeof value;

    if (type === 'string') {
      return `"${this.truncate(value)}"`;
    }

    if (type === 'number' || type === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      const items = value
        .slice(0, this.options.maxArrayItems)
        .map(v => this.formatValue(v))
        .join(',');
      const more = value.length > this.options.maxArrayItems
        ? `...+${value.length - this.options.maxArrayItems}`
        : '';
      return `[${items}${more}]`;
    }

    if (type === 'object') {
      const keys = Object.keys(value).slice(0, this.options.maxObjectKeys);
      if (keys.length === 0) return '{}';
      const more = Object.keys(value).length > this.options.maxObjectKeys
        ? '...'
        : '';
      return `{${keys.join(',')}${more}}`;
    }

    return String(value).slice(0, 20);
  }

  /**
   * Format stack trace
   */
  formatStack(stack) {
    if (typeof stack === 'string') {
      const lines = stack.split('\n')
        .filter(line => line.trim() && !line.includes('node_modules'))
        .slice(0, this.options.maxStackFrames);

      return lines
        .map(line => {
          // Extract file:line:col from stack frame
          const match = line.match(/\((.+):(\d+):(\d+)\)/) ||
                       line.match(/at (.+):(\d+):(\d+)/);
          if (match) {
            const [, file, line, col] = match;
            return `@${this.abbreviatePath(file)}:${line}`;
          }
          return line.trim().slice(0, 50);
        })
        .join(' ');
    }
    return '';
  }

  /**
   * Clean error message
   */
  cleanErrorMessage(error) {
    if (typeof error === 'object' && error.message) {
      error = error.message;
    }

    let msg = String(error);

    // Remove ANSI codes
    msg = msg.replace(/\u001b\[\d+m/g, '');

    // Remove timestamps
    msg = msg.replace(/\[\d{2}:\d{2}:\d{2}\]/g, '');

    // Remove absolute paths
    msg = msg.replace(/\/[^\s]+\//g, match => {
      const parts = match.split('/');
      return parts[parts.length - 1] || match;
    });

    // Truncate
    msg = this.truncate(msg);

    return msg;
  }

  /**
   * Abbreviate file path
   */
  abbreviatePath(path) {
    if (!path) return '';

    // Remove common prefixes
    path = path.replace(/^.*\/node_modules\//, 'npm/');
    path = path.replace(/^.*\/src\//, 'src/');
    path = path.replace(/^.*\/test\//, 'test/');
    path = path.replace(/^.*\/lib\//, 'lib/');

    // Get just filename if still too long
    if (path.length > 30) {
      const parts = path.split('/');
      path = parts[parts.length - 1];
    }

    return path;
  }

  /**
   * Truncate string
   */
  truncate(str, maxLength = this.options.maxStringLength) {
    if (!str) return '';
    str = String(str);
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + '...';
  }

  /**
   * Apply abbreviations
   */
  abbreviate(text) {
    if (!this.options.abbreviate) return text;

    let result = text;
    for (const [full, abbr] of Object.entries(this.abbrev)) {
      const regex = new RegExp(`\\b${full}\\b`, 'gi');
      result = result.replace(regex, abbr);
    }
    return result;
  }

  /**
   * Group traces by traceId (each HTTP request becomes a group)
   * @param {Array} traces - Array of trace objects
   * @returns {Map<string, Array>} - Map of traceId to traces
   */
  groupTracesByRequest(traces) {
    const groups = new Map();
    for (const trace of traces) {
      const id = trace.traceId || 'unknown';
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(trace);
    }
    return groups;
  }

  /**
   * Format a trace tree showing nested call hierarchy
   * Groups traces by traceId and shows depth-based indentation
   *
   * @param {Array} traces - Array of trace objects with depth, traceId
   * @param {Object} options - Formatting options
   * @param {number} options.maxGroups - Max request groups to show (default: 10)
   * @param {boolean} options.showHeader - Show header with stats (default: true)
   * @returns {string} - Formatted trace tree output
   */
  formatTraceTree(traces, options = {}) {
    const maxGroups = options.maxGroups ?? 10;
    const showHeader = options.showHeader !== false;
    const lines = [];

    if (!traces || traces.length === 0) {
      return 'No traces collected';
    }

    // Sort by timestamp
    const sorted = [...traces].sort((a, b) => a.timestamp - b.timestamp);

    // Group by traceId
    const groups = this.groupTracesByRequest(sorted);

    if (showHeader) {
      lines.push('='.repeat(60));
      lines.push('TRACE OUTPUT');
      lines.push('='.repeat(60));
      lines.push(`Traces: ${traces.length} | Requests: ${groups.size}`);
      lines.push('');
    }

    // Show each request's trace tree
    let shown = 0;
    for (const [, groupTraces] of groups) {
      if (shown >= maxGroups) {
        lines.push(`... and ${groups.size - maxGroups} more requests`);
        break;
      }

      // Sort within group
      groupTraces.sort((a, b) => a.timestamp - b.timestamp);

      // Find root trace (depth 0)
      const root = groupTraces.find(t => t.depth === 0);
      const rootName = root?.name || 'Request';

      lines.push(`--- ${rootName} ---`);

      for (const trace of groupTraces) {
        const indent = '  '.repeat((trace.depth || 0) + 1);
        const ms = trace.duration != null ? `${Math.round(trace.duration)}ms` : '';
        const err = trace.error ? `ERR: ${this.truncate(trace.error.message || trace.error, 40)}` : '';
        const ret = !err && trace.result != null
          ? this.truncate(JSON.stringify(trace.result), 40)
          : '';

        lines.push(`${indent}fn:${trace.name} depth:${trace.depth} ${ms} ${err || ret}`.trimEnd());
      }
      lines.push('');
      shown++;
    }

    return lines.join('\n');
  }

  /**
   * Print trace tree to console with optional TOON summary
   * Convenience method for test afterAll hooks
   *
   * @param {Array} traces - Array of trace objects
   * @param {Object} options - Options
   * @param {boolean} options.showToon - Also show TOON format (default: true)
   * @param {number} options.toonLimit - Max traces for TOON output (default: 30)
   */
  printTraceTree(traces, options = {}) {
    const showToon = options.showToon !== false;
    const toonLimit = options.toonLimit ?? 30;

    // Print the tree format
    console.log('\n' + this.formatTraceTree(traces, options));

    // Optionally print TOON format
    if (showToon && traces.length > 0) {
      console.log('='.repeat(60));
      console.log('TOON FORMAT');
      console.log('='.repeat(60));
      console.log(this.format({
        stats: { passed: 0, total: 0 },
        trace: traces.slice(0, toonLimit)
      }));
      console.log('='.repeat(60));
    }
  }
}

export default ToonFormatter;
