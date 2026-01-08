/**
 * Taist Auto-Instrumentation Module
 *
 * Add this line at the top of your service to enable tracing:
 * import 'taist/instrument';
 *
 * Or use require:
 * require('taist/instrument');
 */

import { ServiceTracer, autoInstrument } from './lib/service-tracer.js';
import { logger } from './lib/logger.js';
import { getContext, runWithContext, generateId, startTrace } from './lib/trace-context.js';
import { getGlobalReporter } from './lib/trace-reporter.js';
import {
  instrumentAll,
  instrumentDirectory,
  instrumentModules,
  wrapWithContext,
  instrumentClassWithContext
} from './lib/instrument-all.js';

// Initialize global tracer from environment variables
const tracer = new ServiceTracer({
  enabled: process.env.TAIST_ENABLED !== 'false',
  depth: parseInt(process.env.TAIST_DEPTH) || 3,
  outputFormat: process.env.TAIST_FORMAT || 'toon',
  outputFile: process.env.TAIST_OUTPUT_FILE,
  outputInterval: parseInt(process.env.TAIST_OUTPUT_INTERVAL) || 30000,
  includePatterns: process.env.TAIST_INCLUDE?.split(',') || [],
  excludePatterns: process.env.TAIST_EXCLUDE?.split(',') || [],
  slowOpThreshold: parseInt(process.env.TAIST_SLOW_THRESHOLD) || 100
});

// Export for manual instrumentation
export { tracer, autoInstrument };

// Log initialization
if (tracer.options.enabled) {
  logger.log('Instrumentation enabled');
  logger.log(`Format: ${tracer.options.outputFormat}`);
  logger.log(`Depth: ${tracer.options.depth}`);

  if (tracer.options.outputFile) {
    logger.log(`Output: ${tracer.options.outputFile}`);
  }

  // Output stats periodically if not writing to file
  if (!tracer.options.outputFile) {
    setInterval(() => {
      const output = tracer.writeOutput();
      console.log('\n' + output);
    }, tracer.options.outputInterval);
  }

  // Handle shutdown gracefully
  const shutdown = () => {
    logger.log('Shutting down...');
    const insights = tracer.getInsights();
    const output = tracer.formatOutput(insights);
    console.log('\n=== Final Trace Summary ===');
    console.log(output);
    console.log('===========================\n');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Instrument Express app with context-aware tracing
 *
 * Each HTTP request starts a new trace context, making the route handler
 * depth 0 (the trace root). All instrumented services called within the
 * request will inherit this context and have incrementing depths.
 *
 * @param {Object} app - Express application
 * @param {Object} options - Options
 * @param {boolean} options.useContext - Use AsyncLocalStorage context (default: true)
 * @returns {Object} - The instrumented Express app
 *
 * @example
 * const app = express();
 * instrumentExpress(app);
 *
 * // Now all routes automatically start a trace context
 * app.post('/orders', async (req, res) => {
 *   // Route handler is depth 0
 *   const order = await orderService.create(req.body); // depth 1
 *   res.json(order);
 * });
 */
export function instrumentExpress(app, options = {}) {
  if (!tracer.options.enabled) return app;

  const useContext = options.useContext !== false;
  const reporter = getGlobalReporter();

  // Instrument route handlers
  ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].forEach(method => {
    const original = app[method];
    if (!original) return;

    app[method] = function (path, ...handlers) {
      const wrappedHandlers = handlers.map(handler => {
        if (typeof handler !== 'function') return handler;

        // Create a wrapper that starts a trace context for each request
        return async function (req, res, next) {
          const traceName = `Route.${method.toUpperCase()} ${path}`;
          const id = generateId();
          const start = performance.now();

          // Report function for success/error
          const reportResult = (error = null) => {
            const duration = performance.now() - start;
            reporter.report({
              id,
              name: traceName,
              type: error ? 'error' : 'exit',
              args: [{
                method: req.method,
                path: req.path,
                params: req.params,
                query: Object.keys(req.query || {}).length > 0 ? req.query : undefined
              }],
              result: error ? undefined : { statusCode: res.statusCode },
              error: error ? { name: error.name, message: error.message } : undefined,
              duration,
              timestamp: Date.now(),
              depth: 0,
              parentId: null,
              traceId: id
            });
          };

          // Wrap response methods to capture when response is sent
          const originalEnd = res.end;
          let responseSent = false;

          res.end = function (...args) {
            if (!responseSent) {
              responseSent = true;
              reportResult();
            }
            return originalEnd.apply(this, args);
          };

          if (useContext) {
            // Run handler within a new trace context
            const ctx = {
              depth: 1, // Handler's children will be depth 1
              traceId: id,
              parentId: id,
              id
            };

            try {
              return await runWithContext(ctx, async () => {
                return handler.call(this, req, res, next);
              });
            } catch (err) {
              if (!responseSent) {
                responseSent = true;
                reportResult(err);
              }
              throw err;
            }
          } else {
            // Original behavior without context
            try {
              return await handler.call(this, req, res, next);
            } catch (err) {
              if (!responseSent) {
                responseSent = true;
                reportResult(err);
              }
              throw err;
            }
          }
        };
      });

      return original.call(this, path, ...wrappedHandlers);
    };
  });

  logger.log('Express app instrumented with context propagation');
  return app;
}

/**
 * Instrument a class or service instance with tracing
 *
 * For context-aware instrumentation (nested traces), use instrumentServiceWithContext instead.
 *
 * @param {Object} service - Service instance or class
 * @param {string} name - Service name for tracing
 * @returns {Object} - Instrumented service
 */
export function instrumentService(service, name) {
  return tracer.instrument(service, name);
}

/**
 * Instrument a class or service instance with context-aware tracing
 *
 * This version uses AsyncLocalStorage for automatic depth tracking.
 * Use this when you need nested traces across service boundaries.
 *
 * @param {Object} service - Service instance
 * @param {string} name - Service name for tracing
 * @returns {Object} - Instrumented service
 */
export function instrumentServiceWithContext(service, name) {
  return instrumentClassWithContext(service, name);
}

// Re-export bulk instrumentation functions
export {
  instrumentAll,
  instrumentDirectory,
  instrumentModules,
  wrapWithContext,
  startTrace,
  getContext,
  runWithContext,
  generateId
};

// Export default tracer
export default tracer;
