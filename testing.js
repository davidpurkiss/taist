/**
 * Taist Testing Utilities
 *
 * Provides helper classes for integrating taist tracing into test suites.
 *
 * @example
 * import { TraceSession } from 'taist/testing';
 *
 * let session;
 *
 * beforeAll(async () => {
 *   session = new TraceSession();
 *   await session.start();
 *
 *   serverProcess = spawn('node', [serverPath], {
 *     env: { ...process.env, ...session.getEnv() },
 *   });
 * });
 *
 * afterAll(async () => {
 *   serverProcess?.kill('SIGTERM');
 *   session.printTraces({ maxGroups: 5 });
 *   await session.stop();
 * });
 */

export { TraceSession } from './lib/trace-session.js';
export { TraceCollector } from './lib/trace-collector.js';
export { ToonFormatter } from './lib/toon-formatter.js';
