/**
 * Trace Context - AsyncLocalStorage-based context propagation
 *
 * Enables automatic depth tracking and parent-child relationships
 * across function calls without explicit parameter passing.
 *
 * This is the same approach used by OpenTelemetry, Datadog, and other APM tools.
 */

import { AsyncLocalStorage } from 'async_hooks';

// Global storage for trace context
export const traceContext = new AsyncLocalStorage();

// Counter for generating unique IDs
let idCounter = 0;

/**
 * Generate a unique trace/span ID
 * @returns {string} Unique identifier
 */
export function generateId() {
  return `__${++idCounter}_${Date.now()}`;
}

/**
 * Get the current trace context
 * @returns {{ depth: number, traceId: string|null, parentId: string|null, id: string|null }}
 */
export function getContext() {
  return traceContext.getStore() || { depth: 0, traceId: null, parentId: null, id: null };
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
 * @returns {{ depth: number, traceId: string, parentId: string|null, id: string }}
 */
export function createChildContext() {
  const parent = getContext();
  const id = generateId();
  return {
    depth: parent.depth + 1,
    traceId: parent.traceId || id,
    parentId: parent.id,
    id
  };
}

/**
 * Start a new trace (for entry points like HTTP handlers)
 * @param {Function} fn - The function to run as trace root
 * @returns {*} The result of fn()
 */
export function startTrace(fn) {
  const id = generateId();
  const context = {
    depth: 0,
    traceId: id,
    parentId: null,
    id
  };
  return runWithContext(context, fn);
}

/**
 * Reset the ID counter (for testing)
 */
export function resetIdCounter() {
  idCounter = 0;
}
