/**
 * Comprehensive integration tests for the trace collection protocol.
 *
 * These tests verify:
 * - NDJSON protocol parsing (including chunk boundary handling)
 * - Reporter → Collector communication
 * - High throughput / backpressure handling
 * - Shutdown timing (traces sent just before shutdown)
 * - Build-time instrumentation (transformSource → import → execute → collect)
 * - Resolver pattern (outermost trace completing last)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TraceCollector } from '../../lib/trace-collector.js';
import { TraceReporter, resetGlobalReporter } from '../../lib/trace-reporter.js';
import { transformSource } from '../../lib/transform.js';

// Helper to wait for a specified time
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to wait for socket connection
const waitForConnection = (socket) => new Promise((resolve, reject) => {
  socket.once('connect', resolve);
  socket.once('error', reject);
});

describe('Trace Protocol Integration', () => {
  // ============================================================
  // NDJSON Protocol Tests
  // ============================================================
  describe('NDJSON Protocol', () => {
    let collector;

    beforeEach(async () => {
      collector = new TraceCollector();
      await collector.start();
    });

    afterEach(async () => {
      if (collector?.isRunning()) {
        await collector.stop();
      }
    });

    it('should parse complete NDJSON messages', async () => {
      const socket = net.createConnection(collector.getSocketPath());
      await waitForConnection(socket);

      const message = JSON.stringify({
        type: 'batch',
        data: [{ name: 'test-trace', depth: 0, timestamp: Date.now() }]
      }) + '\n';

      socket.write(message);
      await delay(50);

      socket.end();
      await delay(50);
      await collector.stop();

      const traces = collector.getTraces();
      expect(traces).toHaveLength(1);
      expect(traces[0].name).toBe('test-trace');
    });

    it('should handle messages split across chunk boundaries', async () => {
      const socket = net.createConnection(collector.getSocketPath());
      await waitForConnection(socket);

      const message = JSON.stringify({
        type: 'batch',
        data: [{ name: 'split-test', depth: 0, timestamp: Date.now() }]
      }) + '\n';

      // Split message in the middle
      const mid = Math.floor(message.length / 2);
      socket.write(message.slice(0, mid));
      await delay(10);
      socket.write(message.slice(mid));
      await delay(50);

      socket.end();
      await delay(50);
      await collector.stop();

      const traces = collector.getTraces();
      expect(traces).toHaveLength(1);
      expect(traces[0].name).toBe('split-test');
    });

    it('should handle newline at chunk boundary', async () => {
      const socket = net.createConnection(collector.getSocketPath());
      await waitForConnection(socket);

      const json = JSON.stringify({
        type: 'batch',
        data: [{ name: 'newline-boundary', depth: 0, timestamp: Date.now() }]
      });

      // Send JSON without newline
      socket.write(json);
      await delay(10);
      // Send newline separately
      socket.write('\n');
      await delay(50);

      socket.end();
      await delay(50);
      await collector.stop();

      const traces = collector.getTraces();
      expect(traces).toHaveLength(1);
      expect(traces[0].name).toBe('newline-boundary');
    });

    it('should handle multiple messages in one chunk', async () => {
      const socket = net.createConnection(collector.getSocketPath());
      await waitForConnection(socket);

      const msg1 = JSON.stringify({ type: 'batch', data: [{ name: 'msg1', id: 'id1' }] }) + '\n';
      const msg2 = JSON.stringify({ type: 'batch', data: [{ name: 'msg2', id: 'id2' }] }) + '\n';
      const msg3 = JSON.stringify({ type: 'batch', data: [{ name: 'msg3', id: 'id3' }] }) + '\n';

      // Send all messages in one write
      socket.write(msg1 + msg2 + msg3);
      await delay(50);

      socket.end();
      await delay(50);
      await collector.stop();

      const traces = collector.getTraces();
      expect(traces).toHaveLength(3);
      expect(traces.map(t => t.name)).toEqual(['msg1', 'msg2', 'msg3']);
    });

    it('should handle empty lines gracefully', async () => {
      const socket = net.createConnection(collector.getSocketPath());
      await waitForConnection(socket);

      const msg1 = JSON.stringify({ type: 'batch', data: [{ name: 'before-empty', id: 'id1' }] }) + '\n';
      const msg2 = JSON.stringify({ type: 'batch', data: [{ name: 'after-empty', id: 'id2' }] }) + '\n';

      socket.write(msg1 + '\n\n' + msg2);
      await delay(50);

      socket.end();
      await delay(50);
      await collector.stop();

      const traces = collector.getTraces();
      expect(traces).toHaveLength(2);
    });

    it('should emit parseError for malformed JSON', async () => {
      const socket = net.createConnection(collector.getSocketPath());
      await waitForConnection(socket);

      let parseErrorEmitted = false;
      collector.on('parseError', () => {
        parseErrorEmitted = true;
      });

      socket.write('not valid json\n');
      await delay(50);

      socket.end();
      await delay(50);
      await collector.stop();

      expect(parseErrorEmitted).toBe(true);
      expect(collector.getTraces()).toHaveLength(0);
    });
  });

  // ============================================================
  // Reporter → Collector Tests
  // ============================================================
  describe('Reporter → Collector', () => {
    let collector;
    let reporter;

    beforeEach(async () => {
      collector = new TraceCollector();
      await collector.start();
      reporter = new TraceReporter({
        socketPath: collector.getSocketPath(),
        flushImmediate: true
      });
    });

    afterEach(async () => {
      if (reporter) {
        reporter.close();
      }
      if (collector?.isRunning()) {
        await collector.stop();
      }
    });

    it('should connect and send traces', async () => {
      reporter.report({
        name: 'reporter-test',
        depth: 0,
        timestamp: Date.now(),
        id: 'unique-1'
      });

      await delay(100);
      await collector.stop();

      const traces = collector.getTraces();
      expect(traces).toHaveLength(1);
      expect(traces[0].name).toBe('reporter-test');
    });

    it('should handle flushImmediate mode', async () => {
      // Send multiple traces rapidly
      for (let i = 0; i < 10; i++) {
        reporter.report({
          name: `trace-${i}`,
          depth: 0,
          timestamp: Date.now(),
          id: `unique-${i}`
        });
      }

      await delay(200);
      await collector.stop();

      const traces = collector.getTraces();
      expect(traces).toHaveLength(10);
    });

    it('should track pending writes', async () => {
      expect(reporter.pendingWrites).toBe(0);

      // Start a write
      reporter.report({
        name: 'pending-test',
        depth: 0,
        timestamp: Date.now(),
        id: 'pending-1'
      });

      // pendingWrites should be > 0 briefly, then back to 0
      await delay(100);
      expect(reporter.pendingWrites).toBe(0);

      await collector.stop();
    });
  });

  // ============================================================
  // High Throughput Tests
  // ============================================================
  describe('High Throughput', () => {
    let collector;
    let reporter;

    beforeEach(async () => {
      collector = new TraceCollector({ maxTraces: 10000 });
      await collector.start();
      reporter = new TraceReporter({
        socketPath: collector.getSocketPath(),
        flushImmediate: true
      });
    });

    afterEach(async () => {
      if (reporter) {
        reporter.close();
      }
      if (collector?.isRunning()) {
        await collector.stop();
      }
    });

    it('should handle 1000 traces without loss', async () => {
      const count = 1000;

      for (let i = 0; i < count; i++) {
        reporter.report({
          name: `trace-${i}`,
          depth: i % 10,
          timestamp: Date.now(),
          id: `unique-${i}`
        });
      }

      // Wait for all writes to complete
      await delay(1000);
      await collector.stop();

      const traces = collector.getTraces();
      expect(traces).toHaveLength(count);
    });

    it('should handle rapid consecutive writes', async () => {
      const count = 100;

      // Send traces as fast as possible (no await between)
      for (let i = 0; i < count; i++) {
        reporter.report({
          name: `rapid-${i}`,
          depth: 0,
          timestamp: Date.now(),
          id: `rapid-${i}`
        });
      }

      await delay(500);
      await collector.stop();

      const traces = collector.getTraces();
      expect(traces).toHaveLength(count);
    });
  });

  // ============================================================
  // Shutdown Timing Tests
  // ============================================================
  describe('Shutdown Timing', () => {
    let collector;
    let reporter;

    beforeEach(async () => {
      collector = new TraceCollector();
      await collector.start();
      reporter = new TraceReporter({
        socketPath: collector.getSocketPath(),
        flushImmediate: true
      });
    });

    afterEach(async () => {
      if (reporter) {
        reporter.close();
      }
      if (collector?.isRunning()) {
        await collector.stop();
      }
    });

    it('should collect traces sent just before shutdown', async () => {
      // Send a trace
      reporter.report({
        name: 'final-trace',
        depth: 0,
        timestamp: Date.now(),
        id: 'final-1'
      });

      // Very short delay then shutdown
      await delay(50);
      await collector.stop();

      const traces = collector.getTraces();
      expect(traces.find(t => t.name === 'final-trace')).toBeDefined();
    });

    it('should wait for pending writes before closing', async () => {
      // Send multiple traces
      for (let i = 0; i < 5; i++) {
        reporter.report({
          name: `pending-${i}`,
          depth: 0,
          timestamp: Date.now(),
          id: `pending-${i}`
        });
      }

      // Small delay to allow connection + initial writes
      // Then stop (should wait for any remaining pending writes)
      await delay(100);
      await collector.stop();

      const traces = collector.getTraces();
      expect(traces).toHaveLength(5);
    });
  });

  // ============================================================
  // Build-Time Instrumentation Tests (CRITICAL)
  // ============================================================
  describe('Build-Time Instrumentation', () => {
    let collector;
    let tempFiles = [];

    beforeEach(async () => {
      // Reset the global reporter to ensure clean state for each test
      resetGlobalReporter();

      collector = new TraceCollector();
      await collector.start();
      process.env.TAIST_COLLECTOR_SOCKET = collector.getSocketPath();
    });

    afterEach(async () => {
      delete process.env.TAIST_COLLECTOR_SOCKET;

      // Reset global reporter before stopping collector
      resetGlobalReporter();

      if (collector?.isRunning()) {
        await collector.stop();
      }

      // Clean up temp files
      for (const file of tempFiles) {
        try {
          fs.unlinkSync(file);
        } catch {
          // Ignore
        }
      }
      tempFiles = [];
    });

    it('should collect traces from transformed nested object exports', async () => {
      // 1. Source code mimicking GraphQL resolver pattern
      const source = `
        export const resolver = {
          Mutation: {
            async upsertOrder(parent, args, context) {
              const result = await this.processOrder(args);
              return result;
            },
            async processOrder(args) {
              return { id: args?.id || '123', status: 'created' };
            }
          }
        };
      `;

      // 2. Transform at BUILD TIME
      const transformed = transformSource(source, {
        moduleName: 'TestResolver',
        useReporter: true,
        traceReporterPath: path.resolve(process.cwd(), 'lib/trace-reporter.js'),
        traceContextPath: path.resolve(process.cwd(), 'lib/trace-context.js')
      });

      // 3. Write to temp file and import
      const tempFile = path.join(os.tmpdir(), `taist-test-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
      fs.writeFileSync(tempFile, transformed);
      tempFiles.push(tempFile);

      // 4. Import and execute transformed code
      const { resolver } = await import(tempFile);

      // 5. Call the resolver
      const result = await resolver.Mutation.upsertOrder(null, { id: '999' }, {});
      expect(result.id).toBe('999');
      expect(result.status).toBe('created');

      // 6. Wait for traces to be sent
      await delay(300);

      // 7. Stop collector and verify
      await collector.stop();

      const traces = collector.getTraces();

      // Should have traces for both methods
      expect(traces.length).toBeGreaterThanOrEqual(2);

      const upsertTrace = traces.find(t => t.name.includes('upsertOrder'));
      const processTrace = traces.find(t => t.name.includes('processOrder'));

      expect(upsertTrace).toBeDefined();
      expect(processTrace).toBeDefined();

      // processOrder should have higher depth (called by upsertOrder)
      expect(processTrace.depth).toBeGreaterThan(upsertTrace.depth);
    });

    it('should handle deeply nested resolver calls', async () => {
      const source = `
        export const resolver = {
          Mutation: {
            async createOrder(p, args, ctx) {
              return await this.validateOrder(args);
            },
            async validateOrder(args) {
              return await this.processPayment(args);
            },
            async processPayment(args) {
              return await this.saveOrder(args);
            },
            async saveOrder(args) {
              return { id: args?.id || '1', saved: true };
            }
          }
        };
      `;

      const transformed = transformSource(source, {
        moduleName: 'DeepResolver',
        useReporter: true,
        traceReporterPath: path.resolve(process.cwd(), 'lib/trace-reporter.js'),
        traceContextPath: path.resolve(process.cwd(), 'lib/trace-context.js')
      });

      const tempFile = path.join(os.tmpdir(), `taist-deep-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
      fs.writeFileSync(tempFile, transformed);
      tempFiles.push(tempFile);

      const { resolver } = await import(tempFile);
      const result = await resolver.Mutation.createOrder(null, { id: '42' }, {});

      expect(result.saved).toBe(true);

      await delay(300);
      await collector.stop();

      const traces = collector.getTraces();

      // Should have 4 traces (createOrder, validateOrder, processPayment, saveOrder)
      expect(traces.length).toBeGreaterThanOrEqual(4);

      // Verify depth increases with each nested call
      const createTrace = traces.find(t => t.name.includes('createOrder'));
      const validateTrace = traces.find(t => t.name.includes('validateOrder'));
      const paymentTrace = traces.find(t => t.name.includes('processPayment'));
      const saveTrace = traces.find(t => t.name.includes('saveOrder'));

      expect(createTrace).toBeDefined();
      expect(validateTrace).toBeDefined();
      expect(paymentTrace).toBeDefined();
      expect(saveTrace).toBeDefined();

      // Each nested call should have higher depth
      expect(validateTrace.depth).toBeGreaterThan(createTrace.depth);
      expect(paymentTrace.depth).toBeGreaterThan(validateTrace.depth);
      expect(saveTrace.depth).toBeGreaterThan(paymentTrace.depth);
    });
  });

  // ============================================================
  // Resolver Pattern Tests (GraphQL simulation)
  // ============================================================
  describe('Resolver Pattern (GraphQL)', () => {
    let collector;
    let reporter;

    beforeEach(async () => {
      collector = new TraceCollector();
      await collector.start();
      reporter = new TraceReporter({
        socketPath: collector.getSocketPath(),
        flushImmediate: true
      });
    });

    afterEach(async () => {
      if (reporter) {
        reporter.close();
      }
      if (collector?.isRunning()) {
        await collector.stop();
      }
    });

    it('should collect outermost resolver trace that completes last', async () => {
      const correlationId = 'test-correlation-' + Date.now();

      // Send child traces first (simulating nested function calls completing before resolver)
      for (let i = 0; i < 50; i++) {
        reporter.report({
          name: `child-${i}`,
          depth: Math.floor(Math.random() * 5) + 1,
          timestamp: Date.now(),
          correlationId,
          id: `child-${i}`
        });
      }

      // Small delay (simulating async work)
      await delay(50);

      // Send resolver trace LAST (like real GraphQL scenario)
      reporter.report({
        name: 'OrderUpsert.resolver.Mutation.upsertOrder',
        depth: 0,
        timestamp: Date.now(),
        correlationId,
        id: 'resolver-main'
      });

      // Wait for writes
      await delay(200);
      await collector.stop();

      const traces = collector.getTraces();
      expect(traces).toHaveLength(51);

      // Verify resolver is present
      const resolver = traces.find(t => t.name.includes('resolver'));
      expect(resolver).toBeDefined();
      expect(resolver.depth).toBe(0);
    });

    it('should maintain correct correlationId across all traces', async () => {
      const correlationId = 'correlation-' + Date.now();

      // Send traces with same correlationId
      reporter.report({ name: 'auth', depth: 0, correlationId, id: 'auth-1', timestamp: Date.now() });
      reporter.report({ name: 'resolver', depth: 0, correlationId, id: 'resolver-1', timestamp: Date.now() });
      reporter.report({ name: 'child1', depth: 1, correlationId, id: 'child-1', timestamp: Date.now() });
      reporter.report({ name: 'child2', depth: 2, correlationId, id: 'child-2', timestamp: Date.now() });

      await delay(100);
      await collector.stop();

      const traces = collector.getTraces();
      expect(traces).toHaveLength(4);

      // All traces should have the same correlationId
      for (const trace of traces) {
        expect(trace.correlationId).toBe(correlationId);
      }
    });

    it('should preserve depth hierarchy', async () => {
      const correlationId = 'depth-test-' + Date.now();

      // Send traces with specific depths (out of order to simulate async completion)
      reporter.report({ name: 'depth-2', depth: 2, correlationId, id: 'd2', timestamp: Date.now() });
      reporter.report({ name: 'depth-3', depth: 3, correlationId, id: 'd3', timestamp: Date.now() });
      reporter.report({ name: 'depth-1', depth: 1, correlationId, id: 'd1', timestamp: Date.now() });
      reporter.report({ name: 'depth-0', depth: 0, correlationId, id: 'd0', timestamp: Date.now() });

      await delay(100);
      await collector.stop();

      const traces = collector.getTraces();
      expect(traces).toHaveLength(4);

      // Verify depths are preserved
      expect(traces.find(t => t.name === 'depth-0').depth).toBe(0);
      expect(traces.find(t => t.name === 'depth-1').depth).toBe(1);
      expect(traces.find(t => t.name === 'depth-2').depth).toBe(2);
      expect(traces.find(t => t.name === 'depth-3').depth).toBe(3);
    });
  });
});
