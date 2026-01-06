import { defineConfig } from 'vitest/config';
import { taistPlugin } from './lib/rollup-plugin.js';

// Conditionally add taist plugin for instrumentation when tracing is enabled
const plugins = [];
if (process.env.TAIST_ENABLED === 'true') {
  plugins.push(
    taistPlugin({
      enabled: true,
      // Only instrument example source files - not taist's own lib files
      include: ['examples/**/*.js'],
      exclude: [
        '**/node_modules/**',
        '**/*.test.js',
        '**/*.spec.js',
        '**/test/**',
        '**/lib/**'  // Don't instrument taist's own library
      ]
    })
  );
}

export default defineConfig({
  plugins,
  test: {
    include: ['test/**/*.test.js', 'examples/calculator.test.js'],
    exclude: ['node_modules/**', 'dist/**'],
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['lib/**/*.js', 'index.js', 'taist.js'],
      exclude: [
        '**/*.test.js',
        '**/*.spec.js',
        'node_modules/**',
        'test/**',
        'examples/**'
      ]
    }
  }
});
