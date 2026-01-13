/**
 * Production-ready service tracer for Node.js applications
 * Provides automatic instrumentation and monitoring capabilities
 */

import { ExecutionTracer } from './execution-tracer.js';
import { ToonFormatter } from './toon-formatter.js';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

export class ServiceTracer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      enabled: options.enabled !== false && process.env.TAIST_ENABLED !== 'false',
      depth: options.depth || parseInt(process.env.TAIST_DEPTH) || 3,
      maxEntries: options.maxEntries || parseInt(process.env.TAIST_MAX_ENTRIES) || 10000,
      outputFormat: options.outputFormat || process.env.TAIST_FORMAT || 'toon',
      outputFile: options.outputFile || process.env.TAIST_OUTPUT_FILE,
      outputInterval: options.outputInterval || parseInt(process.env.TAIST_OUTPUT_INTERVAL) || 30000,
      includePatterns: options.includePatterns || this.parsePatterns(process.env.TAIST_INCLUDE),
      excludePatterns: options.excludePatterns || this.parsePatterns(process.env.TAIST_EXCLUDE),
      captureErrors: options.captureErrors !== false,
      captureSlowOps: options.captureSlowOps !== false,
      slowOpThreshold: options.slowOpThreshold || parseInt(process.env.TAIST_SLOW_THRESHOLD) || 100,
      detectBugs: options.detectBugs !== false,
      bugPatterns: options.bugPatterns || {},
      ...options
    };

    this.tracer = new ExecutionTracer({
      enabled: this.options.enabled,
      depth: this.options.depth,
      maxEntries: this.options.maxEntries
    });

    this.formatter = new ToonFormatter();
    this.stats = {
      startTime: Date.now(),
      totalCalls: 0,
      totalErrors: 0,
      slowOperations: 0,
      bugsDetected: 0
    };

    this.setupOutputInterval();
    this.setupProcessHandlers();
  }

  /**
   * Parse comma-separated patterns from environment variable
   */
  parsePatterns(envVar) {
    if (!envVar) return [];
    return envVar.split(',').map(p => p.trim()).filter(Boolean);
  }

  /**
   * Setup automatic output interval
   */
  setupOutputInterval() {
    if (this.options.outputInterval > 0 && this.options.outputFile) {
      this.outputTimer = setInterval(() => {
        this.writeOutput();
      }, this.options.outputInterval);
      // Don't keep process alive just for output
      this.outputTimer.unref();
    }
  }

  /**
   * Setup process handlers for graceful shutdown
   */
  setupProcessHandlers() {
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (this.outputTimer) {
        clearInterval(this.outputTimer);
      }
      this.writeOutput();
      this.emit('shutdown');
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('beforeExit', cleanup);
    // Also handle 'exit' for worker threads that may not trigger beforeExit
    process.on('exit', cleanup);
  }

  /**
   * Instrument a class or object with tracing
   */
  instrument(target, name = target.constructor?.name || 'Unknown') {
    if (!this.options.enabled) return target;

    // Check if should instrument based on patterns
    if (!this.shouldInstrument(name)) return target;

    const isClass = typeof target === 'function';
    const obj = isClass ? target.prototype : target;

    const methods = this.getInstrumentableMethods(obj);

    methods.forEach(methodName => {
      const original = obj[methodName];
      if (typeof original !== 'function') return;

      obj[methodName] = this.wrapMethod(original, `${name}.${methodName}`, methodName);
    });

    // Instrument static methods if it's a class
    if (isClass) {
      const staticMethods = this.getInstrumentableMethods(target);
      staticMethods.forEach(methodName => {
        if (methodName === 'prototype' || methodName === 'name' || methodName === 'length') return;
        const original = target[methodName];
        if (typeof original !== 'function') return;
        target[methodName] = this.wrapMethod(original, `${name}.${methodName}`, methodName);
      });
    }

    return target;
  }

  /**
   * Check if should instrument based on include/exclude patterns
   */
  shouldInstrument(name) {
    // Check exclude patterns first
    if (this.options.excludePatterns.length > 0) {
      if (this.options.excludePatterns.some(pattern => name.includes(pattern))) {
        return false;
      }
    }

    // Check include patterns
    if (this.options.includePatterns.length > 0) {
      return this.options.includePatterns.some(pattern => name.includes(pattern));
    }

    // Default to include if no patterns specified
    return true;
  }

  /**
   * Get methods that should be instrumented
   */
  getInstrumentableMethods(obj) {
    const methods = [];

    // Get own properties
    methods.push(...Object.getOwnPropertyNames(obj));

    // Get prototype chain methods
    let proto = Object.getPrototypeOf(obj);
    while (proto && proto !== Object.prototype) {
      methods.push(...Object.getOwnPropertyNames(proto));
      proto = Object.getPrototypeOf(proto);
    }

    return [...new Set(methods)].filter(name => {
      // Skip constructor and private methods
      if (name === 'constructor' || name.startsWith('_')) return false;
      // Skip restricted properties that can't be accessed in strict mode
      if (name === 'caller' || name === 'callee' || name === 'arguments') return false;
      try {
        return typeof obj[name] === 'function';
      } catch (e) {
        // Some properties throw when accessed
        return false;
      }
    });
  }

  /**
   * Wrap a method with tracing
   */
  wrapMethod(method, fullName, methodName) {
    const tracer = this.tracer;
    const options = this.options;
    const stats = this.stats;
    const emit = this.emit.bind(this);

    // Helper to handle result (sync or async)
    function handleResult(result, startTime) {
      const duration = performance.now() - startTime;
      tracer.exit(fullName, result);

      // Track slow operations
      if (options.captureSlowOps && duration > options.slowOpThreshold) {
        stats.slowOperations++;
        tracer.event('slow_operation', {
          method: fullName,
          duration,
          args: [] // Args not available here
        });
        emit('slow-operation', { method: fullName, duration });
      }

      return result;
    }

    function handleError(error) {
      stats.totalErrors++;
      tracer.error(fullName, error);

      if (options.captureErrors) {
        emit('error', { method: fullName, error });
      }

      throw error;
    }

    // Return a wrapper that preserves sync/async behavior
    return function(...args) {
      if (!options.enabled) {
        return method.apply(this, args);
      }

      const startTime = performance.now();
      tracer.enter(fullName, args);
      stats.totalCalls++;

      try {
        const result = method.apply(this, args);

        // Check if result is a Promise (async method)
        if (result && typeof result.then === 'function') {
          return result
            .then(res => handleResult(res, startTime))
            .catch(handleError);
        }

        // Sync method - return result directly
        return handleResult(result, startTime);
      } catch (error) {
        handleError(error);
      }
    };
  }

  /**
   * Create Express middleware
   */
  expressMiddleware() {
    const tracer = this.tracer;
    const options = this.options;

    return (req, res, next) => {
      if (!options.enabled) return next();

      const startTime = Date.now();
      const traceId = tracer.enter(`HTTP ${req.method} ${req.path}`, {
        method: req.method,
        path: req.path,
        query: req.query
      });

      // Wrap res.json and res.send
      const originalJson = res.json;
      const originalSend = res.send;

      res.json = function(data) {
        const duration = Date.now() - startTime;
        tracer.exit(`HTTP ${req.method} ${req.path}`, {
          status: res.statusCode,
          duration
        });
        return originalJson.call(this, data);
      };

      res.send = function(data) {
        const duration = Date.now() - startTime;
        tracer.exit(`HTTP ${req.method} ${req.path}`, {
          status: res.statusCode,
          duration
        });
        return originalSend.call(this, data);
      };

      next();
    };
  }

  /**
   * Get current insights
   */
  getInsights() {
    const traces = this.tracer.getTraces();
    const insights = {
      stats: { ...this.stats },
      uptime: Date.now() - this.stats.startTime,
      traces: {
        total: traces.length,
        byType: {},
        topFunctions: {},
        errors: [],
        slowOps: [],
        bugs: []
      }
    };

    // Analyze traces
    traces.forEach(trace => {
      insights.traces.byType[trace.type] = (insights.traces.byType[trace.type] || 0) + 1;

      if (trace.type === 'enter') {
        insights.traces.topFunctions[trace.name] = (insights.traces.topFunctions[trace.name] || 0) + 1;
      }

      if (trace.type === 'error') {
        insights.traces.errors.push({
          method: trace.name,
          error: trace.error?.message || trace.error,
          timestamp: trace.timestamp
        });
      }

      if (trace.type === 'event' && trace.name === 'slow_operation') {
        insights.traces.slowOps.push(trace.data);
      }

      if (trace.type === 'event' && trace.name?.startsWith('bug:')) {
        insights.traces.bugs.push({
          type: trace.name.replace('bug:', ''),
          data: trace.data,
          timestamp: trace.timestamp
        });
      }
    });

    // Sort top functions
    insights.traces.topFunctions = Object.entries(insights.traces.topFunctions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .reduce((obj, [key, val]) => ({ ...obj, [key]: val }), {});

    return insights;
  }

  /**
   * Format output based on configured format
   */
  formatOutput(insights) {
    switch (this.options.outputFormat) {
      case 'toon':
        return this.formatToon(insights);
      case 'json':
        return JSON.stringify(insights, null, 2);
      case 'compact':
        return this.formatCompact(insights);
      default:
        return this.formatHuman(insights);
    }
  }

  /**
   * Format as TOON
   */
  formatToon(insights) {
    const lines = [];
    const s = insights.stats;

    lines.push(`[TAIST] up:${Math.floor(insights.uptime/1000)}s calls:${s.totalCalls} err:${s.totalErrors}`);

    if (s.slowOperations > 0) {
      lines.push(`[SLOW] ${s.slowOperations} ops >${this.options.slowOpThreshold}ms`);
    }

    if (s.bugsDetected > 0) {
      lines.push(`[BUGS] ${s.bugsDetected} detected`);
      insights.traces.bugs.slice(0, 3).forEach(bug => {
        lines.push(`  • ${bug.type}`);
      });
    }

    const topFuncs = Object.entries(insights.traces.topFunctions).slice(0, 3);
    if (topFuncs.length > 0) {
      lines.push(`[TOP] ${topFuncs.map(([fn, cnt]) => `${fn.split('.').pop()}:${cnt}`).join(' ')}`);
    }

    if (insights.traces.errors.length > 0) {
      lines.push(`[ERR] ${insights.traces.errors.slice(0, 3).map(e => e.error.substring(0, 20)).join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Format as compact
   */
  formatCompact(insights) {
    const s = insights.stats;
    return `TAIST: ${s.totalCalls} calls, ${s.totalErrors} errors, ${s.slowOperations} slow, ${s.bugsDetected} bugs (${Math.floor(insights.uptime/1000)}s)`;
  }

  /**
   * Format as human-readable
   */
  formatHuman(insights) {
    const lines = [];
    lines.push('='.repeat(60));
    lines.push('TAIST SERVICE MONITORING');
    lines.push('='.repeat(60));
    lines.push(`Uptime: ${Math.floor(insights.uptime/1000)} seconds`);
    lines.push(`Total Calls: ${insights.stats.totalCalls}`);
    lines.push(`Errors: ${insights.stats.totalErrors}`);
    lines.push(`Slow Operations: ${insights.stats.slowOperations}`);
    lines.push(`Bugs Detected: ${insights.stats.bugsDetected}`);

    if (Object.keys(insights.traces.topFunctions).length > 0) {
      lines.push('\nTop Functions:');
      Object.entries(insights.traces.topFunctions).forEach(([fn, count]) => {
        lines.push(`  ${fn}: ${count}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Write output to file or console
   */
  writeOutput() {
    const insights = this.getInsights();

    // If writing to file, write JSON format for vitest-runner to read
    if (this.options.outputFile) {
      try {
        const traces = this.getTracesForOutput();
        const jsonOutput = JSON.stringify({ traces, insights }, null, 2);
        fs.writeFileSync(this.options.outputFile, jsonOutput);
        this.emit('output-written', this.options.outputFile);
      } catch (error) {
        this.emit('output-error', error);
      }
    } else {
      // Console output uses formatted version
      const output = this.formatOutput(insights);
      console.log(output);
    }

    return this.formatOutput(insights);
  }

  /**
   * Get traces formatted for output (with execution tree structure)
   */
  getTracesForOutput() {
    const rawTraces = this.tracer.getTraces();

    // Build execution tree from enter/exit pairs
    const traces = [];
    const stack = [];

    for (const trace of rawTraces) {
      if (trace.type === 'enter') {
        const entry = {
          name: trace.name,
          args: trace.args,
          depth: trace.depth,
          timestamp: trace.timestamp,
          id: trace.id
        };
        stack.push(entry);
      } else if (trace.type === 'exit') {
        // Find matching entry
        const entry = stack.pop();
        if (entry) {
          traces.push({
            name: entry.name,
            duration: trace.duration,
            args: entry.args,
            result: trace.result,
            depth: entry.depth
          });
        }
      } else if (trace.type === 'error') {
        traces.push({
          name: trace.name,
          error: trace.error?.message || trace.error,
          depth: trace.depth
        });
      }
    }

    // Sort by timestamp order and return
    return traces;
  }

  /**
   * Get trace data
   */
  getTraces() {
    return this.tracer.getTraces();
  }

  /**
   * Clear traces
   */
  clearTraces() {
    this.tracer.clear();
    this.stats.totalCalls = 0;
    this.stats.totalErrors = 0;
    this.stats.slowOperations = 0;
    this.stats.bugsDetected = 0;
  }

  /**
   * Enable/disable tracing
   */
  setEnabled(enabled) {
    this.options.enabled = enabled;
    this.tracer.enabled = enabled;
  }
}

// Singleton instance for global usage
let globalTracer = null;

/**
 * Get or create global tracer instance
 */
export function getGlobalTracer(options) {
  if (!globalTracer) {
    // When running in a worker/forked process with tracing enabled,
    // automatically set up file-based trace output for aggregation
    if (process.env.TAIST_ENABLED === 'true' && !process.env.TAIST_OUTPUT_FILE) {
      const traceDir = process.env.TAIST_TRACE_DIR || '/tmp';
      process.env.TAIST_OUTPUT_FILE = `${traceDir}/taist-trace-${process.pid}.json`;
    }
    globalTracer = new ServiceTracer(options);
  }
  return globalTracer;
}

/**
 * Auto-instrument a module
 */
export function autoInstrument(moduleExports, name, options = {}) {
  const tracer = getGlobalTracer(options);
  return tracer.instrument(moduleExports, name);
}

export default ServiceTracer;