/**
 * Taist Rollup Plugin for build-time function instrumentation
 *
 * Usage in extension.config.js:
 *
 *   import { taistPlugin } from 'taist/lib/rollup-plugin.js';
 *
 *   export default {
 *     plugins: [
 *       taistPlugin({
 *         include: ['**\/services\/**', '**\/helpers\/**'],
 *         exclude: ['**\/node_modules\/**'],
 *       }),
 *     ],
 *   };
 */

import { createFilter } from "@rollup/pluginutils";

/**
 * Create the taist instrumentation plugin
 * @param {Object} options
 * @param {string|string[]} options.include - Patterns to include
 * @param {string|string[]} options.exclude - Patterns to exclude
 * @param {string} options.moduleName - Base module name for traces (auto-detected if not provided)
 * @param {boolean} options.enabled - Enable instrumentation (default: based on TAIST_ENABLED env var)
 */
export function taistPlugin(options = {}) {
  const {
    include = ["**/*.ts", "**/*.js"],
    exclude = ["**/node_modules/**"],
    moduleName,
    enabled = process.env.TAIST_ENABLED === "true",
  } = options;

  const filter = createFilter(include, exclude);

  return {
    name: "taist-instrumentation",

    transform(code, id) {
      // Skip if not enabled or doesn't match filter
      if (!enabled || !filter(id)) {
        return null;
      }

      // Skip declaration files
      if (id.endsWith(".d.ts")) {
        return null;
      }

      // Extract module name from file path
      const detectedModuleName = moduleName || extractModuleName(id);

      try {
        const transformed = instrumentCode(code, detectedModuleName, id);
        if (transformed !== code) {
          console.log(`[TAIST] Instrumented: ${id}`);
          return {
            code: transformed,
            map: null, // TODO: generate source map
          };
        }
      } catch (e) {
        console.warn(`[TAIST] Failed to instrument ${id}: ${e.message}`);
      }

      return null;
    },
  };
}

/**
 * Extract module name from file path
 */
function extractModuleName(filePath) {
  const parts = filePath.split("/");
  const filename = parts[parts.length - 1].replace(/\.(ts|js|mjs)$/, "");

  // Capitalize first letter
  return filename.charAt(0).toUpperCase() + filename.slice(1);
}

/**
 * Instrument code by wrapping exported functions
 */
function instrumentCode(code, moduleName, filePath) {
  // Check if there are any exports to instrument
  if (!hasExports(code)) {
    return code;
  }

  // Add the tracer import and wrapper helper at the top
  const tracerImport = `
// --- TAIST BUILD-TIME INSTRUMENTATION ---
import { getGlobalTracer as __taist_getTracer } from "taist/lib/service-tracer.js";
const __taist_tracer = __taist_getTracer();
const __taist_wrap = (fn, name) => {
  if (!__taist_tracer?.options?.enabled || typeof fn !== 'function') return fn;
  return __taist_tracer.wrapMethod(fn, name, name.split('.').pop());
};
// --- END TAIST ---
`;

  let transformed = code;
  const exports = [];

  // Find and transform exported function declarations
  // export function name(...) or export async function name(...)
  transformed = transformed.replace(
    /export\s+(async\s+)?function\s+(\w+)\s*\(/g,
    (match, async, name) => {
      exports.push(name);
      return `${async || ""}function __taist_unwrapped_${name}(`;
    }
  );

  // Find and transform exported arrow functions
  // export const name = (...) => or export const name = async (...) =>
  transformed = transformed.replace(
    /export\s+const\s+(\w+)\s*=\s*(async\s*)?\(/g,
    (match, name, async) => {
      exports.push(name);
      return `const __taist_unwrapped_${name} = ${async || ""}(`;
    }
  );

  // Find and transform exported function expressions
  // export const name = function(...) or export const name = async function(...)
  transformed = transformed.replace(
    /export\s+const\s+(\w+)\s*=\s*(async\s+)?function\s*\(/g,
    (match, name, async) => {
      exports.push(name);
      return `const __taist_unwrapped_${name} = ${async || ""}function(`;
    }
  );

  // If no exports were found, return original
  if (exports.length === 0) {
    return code;
  }

  // Add wrapped exports at the end
  const wrappedExports = exports
    .map(
      (name) =>
        `export const ${name} = __taist_wrap(__taist_unwrapped_${name}, "${moduleName}.${name}");`
    )
    .join("\n");

  // Combine: import + transformed code + wrapped exports
  return tracerImport + transformed + "\n\n" + wrappedExports + "\n";
}

/**
 * Check if code has any exports
 */
function hasExports(code) {
  return /export\s+(async\s+)?(function|const)\s+\w+/.test(code);
}

export default taistPlugin;