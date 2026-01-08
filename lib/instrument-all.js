/**
 * Bulk Instrumentation API
 *
 * Provides utilities to instrument multiple modules at once without
 * requiring the --import flag or manual wrapping of each service.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getContext, runWithContext, generateId } from './trace-context.js';
import { getGlobalReporter } from './trace-reporter.js';

/**
 * Simple glob pattern matching
 * Supports: *, **, ?
 */
function matchGlob(pattern, filePath) {
  // Convert glob to regex
  const regexStr = pattern
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.')
    .replace(/{{GLOBSTAR}}/g, '.*')
    .replace(/\./g, '\\.')
    .replace(/\//g, '\\/');

  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(filePath);
}

/**
 * Recursively find files matching a glob pattern
 * @param {string} baseDir - Starting directory
 * @param {string} pattern - Glob pattern
 * @returns {string[]} - Array of matching file paths
 */
function findFiles(baseDir, pattern) {
  const results = [];
  const absoluteBase = path.resolve(baseDir);

  function scan(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(absoluteBase, fullPath);

      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
          continue;
        }
        scan(fullPath);
      } else if (entry.isFile()) {
        if (matchGlob(pattern, relativePath)) {
          results.push(fullPath);
        }
      }
    }
  }

  // Extract base directory and pattern from glob
  const parts = pattern.split('/');
  let scanDir = absoluteBase;
  let remainingPattern = pattern;

  // Find the first part with glob characters
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].includes('*') || parts[i].includes('?')) {
      remainingPattern = parts.slice(i).join('/');
      break;
    }
    scanDir = path.join(scanDir, parts[i]);
    remainingPattern = parts.slice(i + 1).join('/');
  }

  scan(scanDir);

  // Filter results with full pattern if we started deeper
  if (scanDir !== absoluteBase) {
    return results.filter(f => {
      const rel = path.relative(absoluteBase, f);
      return matchGlob(pattern, rel);
    });
  }

  return results;
}

/**
 * Create a context-aware wrapper for a function
 * @param {Function} fn - Function to wrap
 * @param {string} name - Function name for tracing
 * @returns {Function} - Wrapped function
 */
function wrapWithContext(fn, name) {
  if (typeof fn !== 'function') return fn;

  const reporter = getGlobalReporter();

  const wrapped = function (...args) {
    const parentCtx = getContext();
    const id = generateId();
    const depth = parentCtx.depth;
    const newCtx = {
      depth: depth + 1,
      traceId: parentCtx.traceId || id,
      parentId: parentCtx.id,
      id
    };

    const start = performance.now();

    const reportSuccess = (result) => {
      reporter.report({
        id,
        name,
        type: 'exit',
        args,
        result,
        duration: performance.now() - start,
        timestamp: Date.now(),
        depth,
        parentId: parentCtx.id,
        traceId: newCtx.traceId
      });
      return result;
    };

    const reportError = (err) => {
      reporter.report({
        id,
        name,
        type: 'error',
        args,
        error: { name: err.name, message: err.message },
        duration: performance.now() - start,
        timestamp: Date.now(),
        depth,
        parentId: parentCtx.id,
        traceId: newCtx.traceId
      });
      throw err;
    };

    return runWithContext(newCtx, () => {
      try {
        const result = fn.apply(this, args);
        if (result && typeof result.then === 'function') {
          return result.then(reportSuccess, reportError);
        }
        return reportSuccess(result);
      } catch (err) {
        reportError(err);
      }
    });
  };

  Object.defineProperty(wrapped, 'name', { value: fn.name, configurable: true });
  return wrapped;
}

/**
 * Instrument a class instance with context-aware tracing
 * @param {Object} instance - Class instance
 * @param {string} className - Class name for tracing
 * @returns {Object} - Instrumented instance (same object, mutated)
 */
function instrumentClassWithContext(instance, className) {
  const proto = Object.getPrototypeOf(instance);

  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key === 'constructor') continue;

    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    if (descriptor && typeof descriptor.value === 'function') {
      instance[key] = wrapWithContext(descriptor.value.bind(instance), `${className}.${key}`);
    }
  }

  return instance;
}

/**
 * Instrument all exports from a module
 * @param {Object} moduleExports - Module exports object
 * @param {string} moduleName - Module name for tracing
 * @returns {Object} - Object with instrumented exports
 */
function instrumentModule(moduleExports, moduleName) {
  const result = {};

  for (const [name, value] of Object.entries(moduleExports)) {
    if (typeof value === 'function') {
      // Check if it's a class (has prototype with methods)
      const hasClassMethods = value.prototype &&
        Object.getOwnPropertyNames(value.prototype).length > 1;

      if (hasClassMethods) {
        // It's a class - create a wrapper that instruments instances
        result[name] = class extends value {
          constructor(...args) {
            super(...args);
            instrumentClassWithContext(this, name);
          }
        };
      } else {
        // It's a regular function
        result[name] = wrapWithContext(value, `${moduleName}.${name}`);
      }
    } else {
      // Pass through non-function exports
      result[name] = value;
    }
  }

  return result;
}

/**
 * Instrument all modules matching a glob pattern
 *
 * @param {string} pattern - Glob pattern (e.g., "./services/*.js", "src/**\/*.js")
 * @param {Object} options - Options
 * @param {string} options.cwd - Working directory (defaults to process.cwd())
 * @returns {Promise<Object>} - Object with all instrumented exports keyed by export name
 *
 * @example
 * const services = await instrumentAll('./services/*.js');
 * const user = await services.UserService.getUser(123);
 */
export async function instrumentAll(pattern, options = {}) {
  const cwd = options.cwd || process.cwd();
  const result = {};

  // Find all matching files
  const files = findFiles(cwd, pattern);

  for (const file of files) {
    try {
      // Convert to file URL for ESM import
      const fileUrl = pathToFileURL(file).href;
      const module = await import(fileUrl);

      // Extract module name from file path
      const moduleName = path.basename(file, path.extname(file));

      // Instrument each export
      const instrumented = instrumentModule(module, moduleName);

      // Merge into result, prefixing duplicates with module name
      for (const [name, value] of Object.entries(instrumented)) {
        if (result[name]) {
          // Duplicate export name - prefix with module name
          result[`${moduleName}.${name}`] = value;
        } else {
          result[name] = value;
        }
      }
    } catch (err) {
      // Log but continue with other files
      console.warn(`[taist] Failed to instrument ${file}: ${err.message}`);
    }
  }

  return result;
}

/**
 * Instrument all modules in a directory
 *
 * @param {string} dir - Directory path
 * @param {Object} options - Options (passed to instrumentAll)
 * @returns {Promise<Object>} - Object with all instrumented exports
 *
 * @example
 * const { UserService, OrderService } = await instrumentDirectory('./services');
 */
export async function instrumentDirectory(dir, options = {}) {
  const absoluteDir = path.resolve(options.cwd || process.cwd(), dir);
  return instrumentAll('**/*.js', { ...options, cwd: absoluteDir });
}

/**
 * Instrument specific modules by path
 *
 * @param {string[]} modulePaths - Array of module paths to instrument
 * @param {Object} options - Options
 * @returns {Promise<Object>} - Object with all instrumented exports
 *
 * @example
 * const services = await instrumentModules([
 *   './services/user-service.js',
 *   './services/order-service.js'
 * ]);
 */
export async function instrumentModules(modulePaths, options = {}) {
  const cwd = options.cwd || process.cwd();
  const result = {};

  for (const modulePath of modulePaths) {
    const absolutePath = path.resolve(cwd, modulePath);

    try {
      const fileUrl = pathToFileURL(absolutePath).href;
      const module = await import(fileUrl);

      const moduleName = path.basename(modulePath, path.extname(modulePath));
      const instrumented = instrumentModule(module, moduleName);

      for (const [name, value] of Object.entries(instrumented)) {
        if (result[name]) {
          result[`${moduleName}.${name}`] = value;
        } else {
          result[name] = value;
        }
      }
    } catch (err) {
      console.warn(`[taist] Failed to instrument ${modulePath}: ${err.message}`);
    }
  }

  return result;
}

export { wrapWithContext, instrumentClassWithContext, instrumentModule };
