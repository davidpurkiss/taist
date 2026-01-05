/**
 * UserService wrapped with execution tracing
 * This module exports an instrumented version of UserService that captures all method calls
 */

import { UserService as OriginalUserService, ValidationError, RateLimitError } from './user-service.js';
import { ExecutionTracer } from '../../lib/execution-tracer.js';

// Create a global tracer that will capture all executions
const tracer = new ExecutionTracer({
  enabled: true,
  depth: 5,
  maxEntries: 5000
});

// Create an instrumented version of UserService
class UserService extends OriginalUserService {
  constructor() {
    super();

    // Get all method names from the prototype
    const proto = OriginalUserService.prototype;
    const methods = Object.getOwnPropertyNames(proto)
      .filter(name => name !== 'constructor' && typeof proto[name] === 'function');

    // Wrap each method with tracing
    methods.forEach(methodName => {
      const originalMethod = this[methodName];

      this[methodName] = async (...args) => {
        const traceId = tracer.enter(`UserService.${methodName}`, args);

        try {
          // Log entry for debugging
          if (methodName === 'register' || methodName === 'validateEmail' || methodName === 'checkRateLimit') {
            tracer.event(`${methodName}:start`, {
              args: args.slice(0, 1), // Just first arg to avoid too much data
              timestamp: Date.now()
            });
          }

          const result = await originalMethod.apply(this, args);

          // Log successful completion
          tracer.exit(`UserService.${methodName}`, result);

          // Track specific issues
          if (methodName === 'validateEmail' && args[0]?.includes('+')) {
            tracer.event('bug:email_validation', {
              email: args[0],
              message: 'Email with + passed validation (should fail)'
            });
          }

          if (methodName === 'getStats') {
            if (isNaN(result.cacheRatio)) {
              tracer.event('bug:division_by_zero', {
                totalUsers: result.totalUsers,
                cacheSize: result.cacheSize,
                cacheRatio: result.cacheRatio
              });
            }
            if (result.cacheSize > result.totalUsers && result.totalUsers > 0) {
              tracer.event('bug:memory_leak', {
                cacheSize: result.cacheSize,
                totalUsers: result.totalUsers,
                leak: result.cacheSize - result.totalUsers
              });
            }
          }

          return result;
        } catch (error) {
          // Log the error
          tracer.error(`UserService.${methodName}`, error);

          // Track specific error patterns
          if (error.message?.includes('Password must be at least 8')) {
            tracer.event('bug:password_validation', {
              message: 'Off-by-one error in password validation'
            });
          }

          if (error.message?.includes('Rate limit exceeded')) {
            tracer.event('bug:rate_limit', {
              message: 'Rate limit off-by-one error'
            });
          }

          throw error;
        }
      };
    });
  }

  // Add a method to get the trace data
  static getTraceData() {
    return tracer.getTraces();
  }

  // Add a method to get formatted insights
  static getTraceInsights() {
    const traces = tracer.getTraces();

    const insights = {
      totalCalls: 0,
      errors: [],
      bugs: [],
      slowOperations: [],
      memoryLeaks: [],
      functionCalls: {}
    };

    traces.forEach(trace => {
      if (trace.type === 'enter') {
        insights.totalCalls++;
        insights.functionCalls[trace.name] = (insights.functionCalls[trace.name] || 0) + 1;
      }

      if (trace.type === 'error') {
        insights.errors.push({
          function: trace.name,
          error: trace.error?.message || trace.error,
          timestamp: trace.timestamp
        });
      }

      if (trace.type === 'event' && trace.name?.startsWith('bug:')) {
        insights.bugs.push({
          type: trace.name.replace('bug:', ''),
          data: trace.data,
          timestamp: trace.timestamp
        });
      }

      if (trace.type === 'exit' && trace.duration > 100) {
        insights.slowOperations.push({
          function: trace.name,
          duration: trace.duration,
          timestamp: trace.timestamp
        });
      }
    });

    return insights;
  }

  // Clear trace data
  static clearTraces() {
    tracer.clear();
  }
}

// Export the instrumented version
export { UserService, ValidationError, RateLimitError };