import { defineConfig } from 'vitest/config';

export default defineConfig({
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
