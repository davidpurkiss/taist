/**
 * Trace Context - AsyncLocalStorage-based context propagation
 *
 * Enables automatic depth tracking and parent-child relationships
 * across function calls without explicit parameter passing.
 *
 * This is the same approach used by OpenTelemetry, Datadog, and other APM tools.
 *
 * IMPORTANT: Uses globalThis to share context across bundled modules.
 * Without this, each bundle would have its own AsyncLocalStorage instance,
 * breaking context propagation across bundle boundaries.
 */

import { AsyncLocalStorage } from 'async_hooks';

// Use globalThis to share context across all bundles/modules
// This ensures trace context propagates even when code is bundled separately
const TAIST_CONTEXT_KEY = '__taist_trace_context__';
const TAIST_COUNTER_KEY = '__taist_id_counter__';
const TAIST_CORRELATION_KEY = '__taist_correlation_id__';

if (!globalThis[TAIST_CONTEXT_KEY]) {
  globalThis[TAIST_CONTEXT_KEY] = new AsyncLocalStorage();
}
if (globalThis[TAIST_COUNTER_KEY] === undefined) {
  globalThis[TAIST_COUNTER_KEY] = 0;
}
// Fallback correlation ID storage for when AsyncLocalStorage breaks (e.g., Apollo)
if (!globalThis[TAIST_CORRELATION_KEY]) {
  globalThis[TAIST_CORRELATION_KEY] = { current: null };
}

// Global storage for trace context (shared via globalThis)
export const traceContext = globalThis[TAIST_CONTEXT_KEY];

/**
 * Generate a unique trace/span ID
 * @returns {string} Unique identifier
 */
export function generateId() {
  return `__${++globalThis[TAIST_COUNTER_KEY]}_${Date.now()}`;
}

/**
 * Get the current trace context
 * @returns {{ depth: number, traceId: string|null, parentId: string|null, id: string|null, correlationId: string|null }}
 */
export function getContext() {
  const store = traceContext.getStore();
  if (store) return store;

  // Return default context without global fallback - global causes race conditions
  // with concurrent requests. Resolvers should get correlationId from function args.
  return { depth: 0, traceId: null, parentId: null, id: null, correlationId: null };
}

/**
 * Get the current correlation ID (works even when AsyncLocalStorage breaks)
 *
 * This is useful for frameworks like Apollo Server where resolver execution
 * happens in a different async context than the HTTP request.
 *
 * @returns {string|null} - The correlation ID for the current request
 */
export function getCorrelationId() {
  const ctx = traceContext.getStore();
  if (ctx?.correlationId) return ctx.correlationId;
  return globalThis[TAIST_CORRELATION_KEY].current;
}

/**
 * Set the fallback correlation ID for the current request.
 *
 * Call this at the start of each HTTP request (e.g., in Express middleware).
 * This provides a fallback for frameworks where AsyncLocalStorage doesn't propagate.
 *
 * @param {string|null} id - The correlation ID to set
 */
export function setCorrelationId(id) {
  globalThis[TAIST_CORRELATION_KEY].current = id;
}

/**
 * Clear the fallback correlation ID.
 * Call this at the end of each HTTP request to prevent leakage.
 */
export function clearCorrelationId() {
  globalThis[TAIST_CORRELATION_KEY].current = null;
}

/**
 * Run a function within a new trace context
 * @param {Object} context - The context to use
 * @param {Function} fn - The function to run
 * @returns {*} The result of fn()
 */
export function runWithContext(context, fn) {
  return traceContext.run(context, fn);
}

/**
 * Create a child context from the current context
 * @returns {{ depth: number, traceId: string, parentId: string|null, id: string, correlationId: string|null }}
 */
export function createChildContext() {
  const parent = getContext();
  const id = generateId();
  // Inherit correlationId from parent context or fallback
  const correlationId = parent.correlationId || getCorrelationId();
  return {
    depth: parent.depth + 1,
    traceId: parent.traceId || id,
    parentId: parent.id,
    id,
    correlationId
  };
}

/**
 * Start a new trace (for entry points like HTTP handlers)
 * @param {Function} fn - The function to run as trace root
 * @param {Object} options - Optional configuration
 * @param {string} options.correlationId - Correlation ID for grouping across async boundaries
 * @returns {*} The result of fn()
 */
export function startTrace(fn, options = {}) {
  const id = generateId();
  const correlationId = options.correlationId || id;
  const context = {
    depth: 0,
    traceId: id,
    parentId: null,
    id,
    correlationId
  };
  return runWithContext(context, fn);
}

/**
 * Reset the ID counter (for testing)
 */
export function resetIdCounter() {
  globalThis[TAIST_COUNTER_KEY] = 0;
}
