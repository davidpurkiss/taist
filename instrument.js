/**
 * Taist Auto-Instrumentation Module
 *
 * This module can be used in two ways:
 *
 * 1. SIDE-EFFECT IMPORT (optional):
 *    Add `import 'taist/instrument';` at the top of your entry point.
 *    This initializes a global tracer, sets up signal handlers for graceful
 *    shutdown, and configures periodic trace output based on environment variables.
 *
 *    @example
 *    // Entry point - loads global tracer and signal handlers
 *    import 'taist/instrument';
 *    import { instrumentExpress } from 'taist/instrument';
 *
 * 2. DIRECT FUNCTION IMPORTS (no side effects):
 *    Import only the functions you need:
 *    `import { instrumentExpress, instrumentService } from 'taist/instrument';`
 *    This is useful for post-startup instrumentation or when you want more
 *    control over the tracer lifecycle.
 *
 *    @example
 *    // Direct imports for post-startup instrumentation
 *    import { instrumentService } from 'taist/instrument';
 *    const traced = instrumentService(myService, 'MyService');
 *
 * Environment Variables (used by side-effect import):
 * - TAIST_ENABLED: Enable/disable tracing (default: true)
 * - TAIST_DEPTH: Trace depth level (default: 3)
 * - TAIST_FORMAT: Output format: toon, json, compact (default: toon)
 * - TAIST_OUTPUT_FILE: Write traces to file instead of stdout
 * - TAIST_OUTPUT_INTERVAL: Output interval in ms (default: 30000)
 * - TAIST_INCLUDE: Only trace modules matching patterns (comma-separated)
 * - TAIST_EXCLUDE: Skip modules matching patterns
 * - TAIST_SLOW_THRESHOLD: Slow operation threshold in ms (default: 100)
 *
 * @module taist/instrument
 */

import { ServiceTracer, autoInstrument } from './lib/service-tracer.js';
import { logger } from './lib/logger.js';
import {
  getContext,
  runWithContext,
  generateId,
  startTrace,
  getCorrelationId,
  setCorrelationId,
  clearCorrelationId
} from './lib/trace-context.js';
import { getGlobalReporter } from './lib/trace-reporter.js';
import {
  instrumentAll,
  instrumentDirectory,
  instrumentModules,
  wrapWithContext,
  instrumentClassWithContext,
  instrumentModule
} from './lib/instrument-all.js';

// Initialize global reporter for cross-process trace collection
// This must happen BEFORE any instrumentation so traces are sent to collector
const reporter = getGlobalReporter();
if (process.env.TAIST_COLLECTOR_SOCKET) {
  logger.log(`Connecting to trace collector: ${process.env.TAIST_COLLECTOR_SOCKET}`);
  reporter.connectEager();
}

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
export { tracer, autoInstrument, reporter };

/**
 * Flush any buffered traces to the collector.
 * Call this before process exit if you want to ensure all traces are sent.
 * @returns {Promise<void>}
 */
export async function flushTraces() {
  if (reporter) {
    await reporter.flush();
  }
}

// Log initialization
if (tracer.options.enabled) {
  logger.log('Instrumentation enabled');
  logger.log(`Format: ${tracer.options.outputFormat}`);
  logger.log(`Depth: ${tracer.options.depth}`);

  if (tracer.options.outputFile) {
    logger.log(`Output: ${tracer.options.outputFile}`);
  }

  // Output stats periodically if not writing to file
  // Use unref() so this doesn't keep the process alive
  if (!tracer.options.outputFile) {
    const outputTimer = setInterval(() => {
      const output = tracer.writeOutput();
      console.log('\n' + output);
    }, tracer.options.outputInterval);
    outputTimer.unref();
  }

  // Handle shutdown gracefully - but don't force exit (let process exit naturally)
  // This allows test runners like Vitest to handle cleanup properly
  let shutdownCalled = false;
  const shutdown = () => {
    if (shutdownCalled) return;
    shutdownCalled = true;
    logger.log('Shutting down...');
    const insights = tracer.getInsights();
    const output = tracer.formatOutput(insights);
    console.log('\n=== Final Trace Summary ===');
    console.log(output);
    console.log('===========================\n');
    // Don't call process.exit() - let the process exit naturally
    // This prevents interference with test runners like Vitest
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
 * For Apollo Server integration, use bridgeContext() in your Apollo context callback.
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

  // Add early middleware to set up correlation ID for ALL requests
  // This runs before any route handlers or other middleware
  app.use((req, res, next) => {
    // Only set up if not already set (avoid double-instrumentation)
    if (!req.taistCorrelationId) {
      const correlationId = generateId();
      req.taistCorrelationId = correlationId;
      setCorrelationId(correlationId);

      // Clear correlation ID when response finishes
      res.on('finish', () => {
        clearCorrelationId();
      });
    }
    next();
  });

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
          // Use existing correlationId from early middleware, or create one
          const correlationId = req.taistCorrelationId || generateId();
          const start = performance.now();

          // Ensure correlationId is on req (in case early middleware didn't run)
          if (!req.taistCorrelationId) {
            req.taistCorrelationId = correlationId;
            setCorrelationId(correlationId);
          }

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
              traceId: id,
              correlationId
            });
          };

          // Wrap response methods to capture when response is sent
          const originalEnd = res.end;
          let responseSent = false;

          res.end = function (...args) {
            if (!responseSent) {
              responseSent = true;
              reportResult();
              // Note: correlationId is cleared by early middleware's res.on('finish')
            }
            return originalEnd.apply(this, args);
          };

          if (useContext) {
            // Run handler within a new trace context
            const ctx = {
              depth: 1, // Handler's children will be depth 1
              traceId: id,
              parentId: id,
              id,
              correlationId
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

/**
 * Bridge trace context for Apollo Server and similar GraphQL frameworks.
 *
 * Apollo Server executes resolvers in a different async context than the HTTP
 * request, breaking AsyncLocalStorage propagation. This helper extracts the
 * correlation ID from the Express request and provides it to the GraphQL context,
 * allowing traces from resolvers to be grouped with the original HTTP request.
 *
 * @param {Object} req - Express request object (from Apollo context callback)
 * @returns {{ taistCorrelationId: string|null }} - Object to spread into GraphQL context
 *
 * @example
 * // Apollo Server setup
 * import { bridgeContext } from 'taist/instrument';
 *
 * const server = new ApolloServer({
 *   typeDefs,
 *   resolvers,
 *   context: ({ req }) => ({
 *     ...bridgeContext(req),
 *     // your other context fields
 *     user: req.user,
 *   }),
 * });
 *
 * // In resolvers, the correlationId is available:
 * const resolvers = {
 *   Query: {
 *     getUser: (_, args, context) => {
 *       // context.taistCorrelationId links this trace to the HTTP request
 *       return userService.getUser(args.id);
 *     }
 *   }
 * };
 */
export function bridgeContext(req) {
  const correlationId = req?.taistCorrelationId || getCorrelationId();

  // Also set the fallback so resolvers can access it even without context prop-drilling
  if (correlationId) {
    setCorrelationId(correlationId);
  }

  return {
    taistCorrelationId: correlationId
  };
}

// Re-export bulk instrumentation functions
export {
  instrumentAll,
  instrumentDirectory,
  instrumentModules,
  instrumentModule,
  wrapWithContext,
  startTrace,
  getContext,
  runWithContext,
  generateId,
  getCorrelationId,
  setCorrelationId,
  clearCorrelationId
};

// Export default tracer
export default tracer;
