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

// Helper function to instrument Express app
export function instrumentExpress(app) {
  if (!tracer.options.enabled) return app;

  // Add middleware
  app.use(tracer.expressMiddleware());

  // Instrument route handlers
  const originalGet = app.get;
  const originalPost = app.post;
  const originalPut = app.put;
  const originalDelete = app.delete;

  ['get', 'post', 'put', 'delete', 'patch'].forEach(method => {
    const original = app[method];
    if (original) {
      app[method] = function(path, ...handlers) {
        const instrumentedHandlers = handlers.map(handler => {
          if (typeof handler === 'function') {
            return tracer.wrapMethod(handler, `Route.${method.toUpperCase()} ${path}`, method);
          }
          return handler;
        });
        return original.call(this, path, ...instrumentedHandlers);
      };
    }
  });

  logger.log('Express app instrumented');
  return app;
}

// Helper to instrument a class or service
export function instrumentService(service, name) {
  return tracer.instrument(service, name);
}

// Export default tracer
export default tracer;
