/**
 * Taist Rollup Plugin - Build-time instrumentation for bundled code
 *
 * Transforms source files during build to add tracing, BEFORE bundling
 * collapses them into a single file. This enables deep tracing of internal
 * functions within bundled applications.
 *
 * Usage:
 *   import taistPlugin from 'taist/rollup-plugin';
 *
 *   export default {
 *     plugins: [
 *       taistPlugin({
 *         include: ['src/**\/*.js'],
 *         exclude: ['**\/*.test.js']
 *       })
 *     ]
 *   };
 */

import { transformSource } from './transform.js';
import { shouldInstrument, matchGlob, loadConfig } from './config-loader.js';
import path from 'node:path';

/**
 * Create a Taist Rollup plugin
 * @param {Object} options - Plugin options
 * @param {string[]} [options.include] - Glob patterns for files to instrument
 * @param {string[]} [options.exclude] - Glob patterns for files to skip
 * @param {string[]} [options.excludeFunctions] - Function names to skip wrapping (e.g., ['log', 'debug', 'toString'])
 * @param {number} [options.maxDepth] - Maximum trace depth (0 = unlimited)
 * @param {boolean} [options.enabled] - Enable/disable plugin (default: true, or TAIST_ENABLED env)
 * @returns {import('rollup').Plugin}
 */
export function taistPlugin(options = {}) {
  // Determine if enabled
  const enabled = options.enabled ?? (process.env.TAIST_ENABLED !== 'false');

  if (!enabled) {
    return {
      name: 'taist',
      // No-op plugin when disabled
    };
  }

  // Build config from options or load from file
  let config;

  return {
    name: 'taist',

    async buildStart() {
      if (options.include || options.exclude) {
        // Use provided options
        config = {
          include: options.include || ['**/*.js', '**/*.ts'],
          exclude: options.exclude || ['**/node_modules/**', '**/*.test.*', '**/*.spec.*'],
          excludeFunctions: options.excludeFunctions || [],
          maxDepth: options.maxDepth || 0,
        };
      } else {
        // Load from .taistrc.json
        config = await loadConfig();
        if (config.include.length === 0) {
          // Default to instrumenting src/ if no config
          config.include = ['src/**/*.js', 'src/**/*.ts'];
        }
        // Merge in any function exclusions from options
        config.excludeFunctions = options.excludeFunctions || config.excludeFunctions || [];
        config.maxDepth = options.maxDepth || config.maxDepth || 0;
      }
    },

    transform(code, id) {
      // Skip if no config yet
      if (!config) {
        return null;
      }

      // Skip node_modules
      if (id.includes('node_modules')) {
        return null;
      }

      // Skip non-JS/TS files
      if (!id.match(/\.[jt]sx?$/)) {
        return null;
      }

      // Get relative path for matching
      const relativePath = path.relative(process.cwd(), id);

      // Check include patterns
      const included = config.include.some(pattern => matchGlob(relativePath, pattern));
      if (!included) {
        return null;
      }

      // Check exclude patterns
      const excluded = config.exclude.some(pattern => matchGlob(relativePath, pattern));
      if (excluded) {
        return null;
      }

      try {
        // Transform the source
        const transformed = transformSource(code, {
          filename: id,
          useReporter: true,
          // Use package paths - these should be externalized or bundled with the app
          traceReporterPath: null, // Uses default 'taist/lib/trace-reporter.js'
          traceContextPath: null,  // Uses default 'taist/lib/trace-context.js'
          excludeFunctions: config.excludeFunctions,
          maxDepth: config.maxDepth,
        });

        return {
          code: transformed,
          map: null, // TODO: Add sourcemap support
        };
      } catch (err) {
        this.warn(`Failed to transform ${relativePath}: ${err.message}`);
        return null;
      }
    },
  };
}

export default taistPlugin;
