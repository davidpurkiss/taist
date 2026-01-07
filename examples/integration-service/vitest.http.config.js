import { defineConfig } from 'vitest/config';

/**
 * Vitest config for HTTP integration tests
 *
 * KEY POINT: This config has NO special setup!
 * - No deps.external
 * - No poolOptions.threads.execArgv
 * - No server.deps.external
 *
 * Why? Because HTTP tests don't import user-service.js directly.
 * They make HTTP requests to a separate server process that runs
 * with instrumentation (via --import flag or import statement).
 *
 * Compare this with vitest.config.js which needs complex workarounds
 * for direct-import tests.
 */
export default defineConfig({
  test: {
    include: ['tests/http-api.test.js'],
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    // That's it! No special ESM loader configuration needed.
  }
});
