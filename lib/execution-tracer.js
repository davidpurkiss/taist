/**
 * Execution Tracer - Runtime execution tracing without explicit logging
 * Captures function calls, arguments, return values, and errors
 */

export class ExecutionTracer {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.depth = options.depth || 2;
    this.maxEntries = options.maxEntries || 1000;

    // Trace buffer (circular buffer)
    this.traces = [];
    this.currentIndex = 0;

    // Call stack tracking
    this.callStack = [];
    this.currentDepth = 0;

    // Performance tracking
    this.startTimes = new Map();
  }

  /**
   * Start tracing
   */
  start() {
    this.enabled = true;
    this.traces = [];
    this.currentIndex = 0;
    this.callStack = [];
    this.currentDepth = 0;
  }

  /**
   * Stop tracing
   */
  stop() {
    this.enabled = false;
  }

  /**
   * Clear all traces
   */
  clear() {
    this.traces = [];
    this.currentIndex = 0;
    this.callStack = [];
    this.currentDepth = 0;
    this.startTimes.clear();
  }

  /**
   * Get all traces
   */
  getTraces() {
    return this.traces.filter(t => t !== undefined);
  }

  /**
   * Record function entry
   */
  enter(name, args = []) {
    if (!this.enabled) return;
    if (this.currentDepth >= this.depth) return;

    const traceId = this.generateId();
    const entry = {
      id: traceId,
      name,
      type: 'enter',
      args: this.shouldCaptureArgs() ? this.sanitizeArgs(args) : undefined,
      depth: this.currentDepth,
      timestamp: Date.now()
    };

    this.callStack.push(traceId);
    this.currentDepth++;
    this.startTimes.set(traceId, performance.now());

    this.addTrace(entry);

    return traceId;
  }

  /**
   * Record function exit
   */
  exit(name, result) {
    if (!this.enabled) return;
    if (this.callStack.length === 0) return;

    const traceId = this.callStack.pop();
    this.currentDepth = Math.max(0, this.currentDepth - 1);

    const startTime = this.startTimes.get(traceId);
    const duration = startTime ? performance.now() - startTime : 0;
    this.startTimes.delete(traceId);

    const entry = {
      id: traceId,
      name,
      type: 'exit',
      result: this.shouldCaptureResult() ? this.sanitizeValue(result) : undefined,
      duration,
      depth: this.currentDepth,
      timestamp: Date.now()
    };

    this.addTrace(entry);
  }

  /**
   * Record an error
   */
  error(name, error) {
    if (!this.enabled) return;

    const traceId = this.callStack.length > 0 ? this.callStack[this.callStack.length - 1] : this.generateId();

    const entry = {
      id: traceId,
      name,
      type: 'error',
      error: this.sanitizeError(error),
      depth: this.currentDepth,
      timestamp: Date.now()
    };

    this.addTrace(entry);
  }

  /**
   * Record a custom event
   */
  event(name, data = {}) {
    if (!this.enabled) return;

    const entry = {
      id: this.generateId(),
      name,
      type: 'event',
      data: this.sanitizeValue(data),
      depth: this.currentDepth,
      timestamp: Date.now()
    };

    this.addTrace(entry);
  }

  /**
   * Wrap a function with tracing
   */
  wrap(fn, name) {
    if (!this.enabled) return fn;

    const tracer = this;
    return new Proxy(fn, {
      apply(target, thisArg, args) {
        tracer.enter(name || fn.name || 'anonymous', args);

        try {
          const result = Reflect.apply(target, thisArg, args);

          // Handle promises
          if (result && typeof result.then === 'function') {
            return result
              .then(value => {
                tracer.exit(name || fn.name || 'anonymous', value);
                return value;
              })
              .catch(error => {
                tracer.error(name || fn.name || 'anonymous', error);
                throw error;
              });
          }

          tracer.exit(name || fn.name || 'anonymous', result);
          return result;
        } catch (error) {
          tracer.error(name || fn.name || 'anonymous', error);
          throw error;
        }
      }
    });
  }

  /**
   * Add trace to buffer (circular buffer)
   */
  addTrace(entry) {
    if (this.traces.length < this.maxEntries) {
      this.traces.push(entry);
    } else {
      this.traces[this.currentIndex] = entry;
      this.currentIndex = (this.currentIndex + 1) % this.maxEntries;
    }
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return `t${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Determine if should capture args based on depth level
   */
  shouldCaptureArgs() {
    return this.depth >= 3;
  }

  /**
   * Determine if should capture result based on depth level
   */
  shouldCaptureResult() {
    return this.depth >= 2;
  }

  /**
   * Sanitize arguments for storage
   */
  sanitizeArgs(args) {
    if (!Array.isArray(args)) return [];
    return args.map(arg => this.sanitizeValue(arg));
  }

  /**
   * Sanitize a value for storage
   */
  sanitizeValue(value, maxDepth = 2, currentDepth = 0) {
    if (currentDepth >= maxDepth) {
      return '[deep]';
    }

    if (value === null) return null;
    if (value === undefined) return undefined;

    const type = typeof value;

    if (type === 'string') {
      return value.length > 100 ? value.slice(0, 100) + '...' : value;
    }

    if (type === 'number' || type === 'boolean') {
      return value;
    }

    if (type === 'function') {
      return `[Function: ${value.name || 'anonymous'}]`;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return [];
      if (value.length > 5) {
        return [
          ...value.slice(0, 5).map(v => this.sanitizeValue(v, maxDepth, currentDepth + 1)),
          `...(${value.length - 5} more)`
        ];
      }
      return value.map(v => this.sanitizeValue(v, maxDepth, currentDepth + 1));
    }

    if (type === 'object') {
      if (value instanceof Error) {
        return this.sanitizeError(value);
      }

      if (value instanceof Date) {
        return value.toISOString();
      }

      // Regular object
      const keys = Object.keys(value);
      if (keys.length === 0) return {};
      if (keys.length > 5) {
        const result = {};
        keys.slice(0, 5).forEach(key => {
          result[key] = this.sanitizeValue(value[key], maxDepth, currentDepth + 1);
        });
        result['...'] = `(${keys.length - 5} more)`;
        return result;
      }

      const result = {};
      keys.forEach(key => {
        result[key] = this.sanitizeValue(value[key], maxDepth, currentDepth + 1);
      });
      return result;
    }

    return String(value).slice(0, 50);
  }

  /**
   * Sanitize error object
   */
  sanitizeError(error) {
    if (typeof error === 'string') {
      return { message: error };
    }

    return {
      name: error.name || 'Error',
      message: error.message || String(error),
      stack: error.stack ? error.stack.split('\n').slice(0, 3) : undefined
    };
  }

  /**
   * Get summary of traces
   */
  getSummary() {
    const traces = this.getTraces();

    return {
      total: traces.length,
      byType: {
        enter: traces.filter(t => t.type === 'enter').length,
        exit: traces.filter(t => t.type === 'exit').length,
        error: traces.filter(t => t.type === 'error').length,
        event: traces.filter(t => t.type === 'event').length
      },
      errors: traces.filter(t => t.type === 'error'),
      duration: traces.length > 0
        ? traces[traces.length - 1].timestamp - traces[0].timestamp
        : 0
    };
  }

  /**
   * Export traces in TOON-friendly format
   */
  exportForToon() {
    const traces = this.getTraces();

    return traces
      .filter(t => t.type === 'exit' || t.type === 'error')
      .map(t => ({
        name: t.name,
        duration: t.duration,
        args: t.args,
        result: t.result,
        error: t.error
      }));
  }
}

export default ExecutionTracer;
