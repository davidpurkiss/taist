/**
 * Taist Debug Logger
 * Centralized logging utility that respects TAIST_DEBUG environment variable
 */

const PREFIX = '[TAIST]';

/**
 * Check if debug mode is enabled
 */
function isDebugEnabled() {
  return process.env.TAIST_DEBUG === '1' || process.env.TAIST_DEBUG === 'true';
}

/**
 * Debug log - only outputs when TAIST_DEBUG is enabled
 * Uses console.log
 * @param {...any} args - Arguments to log
 */
function log(...args) {
  if (isDebugEnabled()) {
    console.log(PREFIX, ...args);
  }
}

/**
 * Debug log to stderr - only outputs when TAIST_DEBUG is enabled
 * Uses console.error (outputs to stderr)
 * @param {...any} args - Arguments to log
 */
function debug(...args) {
  if (isDebugEnabled()) {
    console.error(PREFIX, ...args);
  }
}

/**
 * Warning log - always outputs
 * @param {...any} args - Arguments to log
 */
function warn(...args) {
  console.warn(PREFIX, ...args);
}

/**
 * Error log - always outputs
 * @param {...any} args - Arguments to log
 */
function error(...args) {
  console.error(PREFIX, ...args);
}

export const logger = {
  log,
  debug,
  warn,
  error,
  isDebugEnabled
};

export default logger;
