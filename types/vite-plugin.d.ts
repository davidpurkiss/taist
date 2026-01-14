/**
 * Taist Vite Plugin Type Definitions
 *
 * Re-exports the Rollup plugin types since Vite uses Rollup internally.
 */

import type { Plugin } from 'vite';
import type { TaistPluginOptions } from './rollup-plugin';

export type { TaistPluginOptions };

/**
 * Create a Taist Vite plugin for build-time instrumentation.
 *
 * Transforms source files during build to add tracing, BEFORE bundling
 * collapses them into a single file. This enables deep tracing of internal
 * functions within bundled applications like Directus extensions.
 *
 * @param options - Plugin options
 * @returns Vite plugin
 *
 * @example
 * // vite.config.js
 * import { defineConfig } from 'vite';
 * import taistPlugin from 'taist/vite-plugin';
 *
 * export default defineConfig({
 *   plugins: [
 *     taistPlugin({
 *       include: ['src/**\/*.js'],
 *       exclude: ['**\/*.test.js']
 *     })
 *   ]
 * });
 */
export function taistPlugin(options?: TaistPluginOptions): Plugin;

export default taistPlugin;
