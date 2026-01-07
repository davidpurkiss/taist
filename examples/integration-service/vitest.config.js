import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modulePatcherPath = path.join(__dirname, '..', '..', 'lib', 'module-patcher.js');

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    // Pass loader hooks to worker threads
    poolOptions: {
      threads: {
        execArgv: ['--import', modulePatcherPath],
      },
      forks: {
        execArgv: ['--import', modulePatcherPath],
      },
    },
    // Make vitest use Node's native module resolution for these deps
    // This allows our ESM loader hooks to intercept them
    deps: {
      external: [/user-service\.js$/],
    },
    server: {
      deps: {
        external: [/user-service\.js$/],
      },
    },
  }
});
