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
import { extractModuleName, hasExports, transformSource } from "./transform.js";
import { logger } from "./logger.js";

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

      // Skip if no exports to instrument
      if (!hasExports(code)) {
        return null;
      }

      // Extract module name from file path
      const detectedModuleName = moduleName || extractModuleName(id);

      try {
        const transformed = transformSource(
          code,
          detectedModuleName,
          "taist/lib/service-tracer.js"
        );
        if (transformed !== code) {
          logger.log(`Instrumented: ${id}`);
          return {
            code: transformed,
            map: null, // TODO: generate source map
          };
        }
      } catch (e) {
        logger.warn(`Failed to instrument ${id}: ${e.message}`);
      }

      return null;
    },
  };
}

export default taistPlugin;
