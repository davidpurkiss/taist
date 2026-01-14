/**
 * Taist Rollup Plugin Type Definitions
 */

import type { Plugin } from 'rollup';

/**
 * Options for the Taist Rollup/Vite plugin
 */
export interface TaistPluginOptions {
  /**
   * Glob patterns for files to instrument.
   * If not provided, loads from .taistrc.json or defaults to ['src/**\/*.js', 'src/**\/*.ts']
   */
  include?: string[];

  /**
   * Glob patterns for files to skip.
   * Defaults to ['**\/node_modules/**', '**\/*.test.*', '**\/*.spec.*']
   */
  exclude?: string[];

  /**
   * Enable/disable the plugin.
   * Defaults to true, or respects TAIST_ENABLED environment variable.
   */
  enabled?: boolean;
}

/**
 * Create a Taist Rollup plugin for build-time instrumentation.
 *
 * Transforms source files during build to add tracing, BEFORE bundling
 * collapses them into a single file. This enables deep tracing of internal
 * functions within bundled applications like Directus extensions.
 *
 * @param options - Plugin options
 * @returns Rollup plugin
 *
 * @example
 * // rollup.config.js
 * import taistPlugin from 'taist/rollup-plugin';
 *
 * export default {
 *   input: 'src/index.js',
 *   output: { file: 'dist/bundle.js', format: 'es' },
 *   plugins: [
 *     taistPlugin({
 *       include: ['src/**\/*.js'],
 *       exclude: ['**\/*.test.js']
 *     })
 *   ]
 * };
 */
export function taistPlugin(options?: TaistPluginOptions): Plugin;

export default taistPlugin;
