import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.js', '**/*.spec.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**', 'examples/**'],
      exclude: ['**/*.test.js', '**/*.spec.js', 'node_modules/**']
    }
  }
});
