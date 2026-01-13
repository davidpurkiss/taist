/**
 * Vitest config for testing the taist reporter
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['service.test.js'],
    reporters: [['../../../lib/vitest-reporter.js', {
      format: 'toon',
      traceEnabled: true,
      traceDepth: 3,
      showTrace: true
    }]],
    // Disable default reporter output
    silent: false
  }
});
