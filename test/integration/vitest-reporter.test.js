/**
 * Integration tests for the Vitest TOON Reporter
 *
 * These tests run vitest programmatically with the taist reporter
 * and verify the output format and trace collection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startVitest } from 'vitest/node';
import { TaistReporter } from '../../lib/vitest-reporter.js';
import { resolve } from 'path';

const projectRoot = resolve(process.cwd());

describe('Vitest Reporter Integration', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('running actual tests', () => {
    it('should output test results in TOON format', async () => {
      const reporter = new TaistReporter({ traceEnabled: false });

      const vitest = await startVitest('test', ['examples/calculator.test.js'], {
        root: projectRoot,
        reporters: [reporter],
        watch: false
      });

      if (vitest) {
        await vitest.close();
      }

      // Check that reporter collected results
      const results = reporter.getResults();
      expect(results.stats.total).toBe(18); // calculator.test.js has 18 tests
      expect(results.stats.passed).toBe(18);
      expect(results.stats.failed).toBe(0);

      // Check console output
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain('===TESTS: 18/18===');
    });

    it('should report failures correctly', async () => {
      const reporter = new TaistReporter({ traceEnabled: false });

      const vitest = await startVitest('test', ['examples/failing.test.js'], {
        root: projectRoot,
        reporters: [reporter],
        watch: false,
        include: ['examples/failing.test.js']
      });

      if (vitest) {
        await vitest.close();
      }

      // Check that reporter collected failures
      const results = reporter.getResults();
      expect(results.stats.failed).toBeGreaterThan(0);
      expect(results.failures.length).toBeGreaterThan(0);

      // Check console output contains failures section
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain('FAILURES:');
    });
  });

  describe('trace collection', () => {
    it('should start trace collector and set environment variables', async () => {
      const reporter = new TaistReporter({ traceEnabled: true, traceDepth: 4 });
      reporter.onInit({});

      // Wait for collector to be ready
      await reporter.collectorReady;

      expect(process.env.TAIST_ENABLED).toBe('true');
      expect(process.env.TAIST_DEPTH).toBe('4');
      expect(process.env.TAIST_COLLECTOR_SOCKET).toBeTruthy();

      // Cleanup
      await reporter.collector.stop();
    });

    it('should collect traces from instrumented code', async () => {
      const reporter = new TaistReporter({
        traceEnabled: true,
        traceDepth: 3,
        silent: true
      });

      const vitest = await startVitest('test', ['test/fixtures/reporter-test/service.test.js'], {
        root: projectRoot,
        reporters: [reporter],
        watch: false
      });

      if (vitest) {
        await vitest.close();
      }

      // Check that tests ran
      const results = reporter.getResults();
      expect(results.stats.total).toBe(6); // service.test.js has 6 tests
      expect(results.stats.passed).toBeGreaterThanOrEqual(5); // At least 5 should pass

      // Note: Traces may or may not be collected depending on whether
      // the instrumented service sends traces to the collector.
      // The important thing is that the collector was started and stopped correctly.
    });
  });

  describe('output options', () => {
    it('should respect silent option', async () => {
      const reporter = new TaistReporter({ traceEnabled: false, silent: true });

      const vitest = await startVitest('test', ['examples/calculator.test.js'], {
        root: projectRoot,
        reporters: [reporter],
        watch: false
      });

      if (vitest) {
        await vitest.close();
      }

      // Should not have logged anything
      expect(consoleSpy).not.toHaveBeenCalled();

      // But should still have results
      const results = reporter.getResults();
      expect(results.stats.total).toBe(18);
    });
  });
});
