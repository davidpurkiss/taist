/**
 * Taist Vite Plugin - Build-time instrumentation for bundled code
 *
 * Vite uses Rollup under the hood, so this re-exports the Rollup plugin.
 *
 * Usage:
 *   import taistPlugin from 'taist/vite-plugin';
 *
 *   export default defineConfig({
 *     plugins: [
 *       taistPlugin({
 *         include: ['src/**\/*.js'],
 *         exclude: ['**\/*.test.js']
 *       })
 *     ]
 *   });
 */

import { taistPlugin } from './rollup-plugin.js';

export { taistPlugin };
export default taistPlugin;
