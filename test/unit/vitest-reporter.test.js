/**
 * Unit tests for TaistReporter (Vitest TOON Reporter)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaistReporter } from '../../lib/vitest-reporter.js';

describe('TaistReporter', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should create reporter with default options', () => {
      const reporter = new TaistReporter();
      expect(reporter.options.format).toBe('toon');
      expect(reporter.options.traceEnabled).toBe(true);
      expect(reporter.options.traceDepth).toBe(3);
      expect(reporter.options.showTrace).toBe(true);
      expect(reporter.options.silent).toBe(false);
      expect(reporter.options.outputFile).toBe(null);
      expect(reporter.options.maxTraceGroups).toBe(10);
    });

    it('should accept custom options', () => {
      const reporter = new TaistReporter({
        format: 'json',
        traceEnabled: false,
        traceDepth: 5,
        showTrace: false,
        silent: true,
        outputFile: '/tmp/output.txt',
        maxTraceGroups: 20
      });
      expect(reporter.options.format).toBe('json');
      expect(reporter.options.traceEnabled).toBe(false);
      expect(reporter.options.traceDepth).toBe(5);
      expect(reporter.options.showTrace).toBe(false);
      expect(reporter.options.silent).toBe(true);
      expect(reporter.options.outputFile).toBe('/tmp/output.txt');
      expect(reporter.options.maxTraceGroups).toBe(20);
    });

    it('should initialize empty results', () => {
      const reporter = new TaistReporter();
      expect(reporter.results.stats.total).toBe(0);
      expect(reporter.results.stats.passed).toBe(0);
      expect(reporter.results.stats.failed).toBe(0);
      expect(reporter.results.stats.skipped).toBe(0);
      expect(reporter.results.failures).toEqual([]);
      expect(reporter.results.trace).toEqual([]);
    });
  });

  describe('onInit', () => {
    it('should store vitest instance', () => {
      const reporter = new TaistReporter({ traceEnabled: false });
      const mockVitest = { config: {} };
      reporter.onInit(mockVitest);
      expect(reporter.vitest).toBe(mockVitest);
    });

    it('should record start time', () => {
      const reporter = new TaistReporter({ traceEnabled: false });
      reporter.onInit({});
      expect(reporter.startTime).toBeGreaterThan(0);
    });

    it('should start TraceCollector when traceEnabled is true', async () => {
      const reporter = new TaistReporter({ traceEnabled: true });
      reporter.onInit({});

      // Wait for collector to be ready
      await reporter.collectorReady;

      expect(reporter.collector).not.toBeNull();
      expect(reporter.collector.isRunning()).toBe(true);
      expect(process.env.TAIST_ENABLED).toBe('true');
      expect(process.env.TAIST_COLLECTOR_SOCKET).toBeTruthy();

      // Cleanup
      await reporter.collector.stop();
    });

    it('should set TAIST_DEPTH from options', async () => {
      const reporter = new TaistReporter({ traceEnabled: true, traceDepth: 5 });
      reporter.onInit({});

      await reporter.collectorReady;

      expect(process.env.TAIST_DEPTH).toBe('5');

      // Cleanup
      await reporter.collector.stop();
    });

    it('should not start collector when traceEnabled is false', () => {
      const reporter = new TaistReporter({ traceEnabled: false });
      reporter.onInit({});

      expect(reporter.collector).toBeNull();
      expect(reporter.collectorReady).toBeNull();
    });
  });

  describe('onTaskUpdate', () => {
    it('should store task results', () => {
      const reporter = new TaistReporter({ traceEnabled: false });

      reporter.onTaskUpdate([
        ['task-1', { state: 'pass', duration: 10 }],
        ['task-2', { state: 'fail', duration: 20 }]
      ]);

      expect(reporter.taskResults.get('task-1')).toEqual({ state: 'pass', duration: 10 });
      expect(reporter.taskResults.get('task-2')).toEqual({ state: 'fail', duration: 20 });
    });

    it('should handle null packs', () => {
      const reporter = new TaistReporter({ traceEnabled: false });
      expect(() => reporter.onTaskUpdate(null)).not.toThrow();
    });
  });

  describe('onFinished', () => {
    it('should calculate duration', async () => {
      const reporter = new TaistReporter({ traceEnabled: false, silent: true });
      reporter.startTime = performance.now() - 100; // 100ms ago

      await reporter.onFinished([], []);

      expect(reporter.results.duration).toBeGreaterThanOrEqual(100);
    });

    it('should process test files and count results', async () => {
      const reporter = new TaistReporter({ traceEnabled: false, silent: true });
      reporter.startTime = performance.now();

      const mockFiles = [{
        filepath: 'test.js',
        tasks: [{
          type: 'suite',
          name: 'MyTests',
          tasks: [
            { type: 'test', name: 'test1', result: { state: 'pass' } },
            { type: 'test', name: 'test2', result: { state: 'pass' } },
            { type: 'test', name: 'test3', result: { state: 'fail', errors: [{ message: 'fail' }] } },
            { type: 'test', name: 'test4', result: { state: 'skip' } }
          ]
        }]
      }];

      await reporter.onFinished(mockFiles, []);

      expect(reporter.results.stats.total).toBe(4);
      expect(reporter.results.stats.passed).toBe(2);
      expect(reporter.results.stats.failed).toBe(1);
      expect(reporter.results.stats.skipped).toBe(1);
      expect(reporter.results.failures.length).toBe(1);
    });

    it('should add unhandled errors as failures', async () => {
      const reporter = new TaistReporter({ traceEnabled: false, silent: true });
      reporter.startTime = performance.now();

      await reporter.onFinished([], [
        { message: 'Unhandled rejection', stack: 'Error stack' }
      ]);

      expect(reporter.results.stats.failed).toBe(1);
      expect(reporter.results.failures.length).toBe(1);
      expect(reporter.results.failures[0].test).toBe('Unhandled Error');
      expect(reporter.results.failures[0].error).toBe('Unhandled rejection');
    });

    it('should collect traces when traceEnabled', async () => {
      const reporter = new TaistReporter({ traceEnabled: true, silent: true });
      reporter.onInit({});

      // Wait for collector to start
      await reporter.collectorReady;

      // Simulate a trace being collected (manually add to collector)
      reporter.collector._addTrace({
        name: 'TestService.method',
        type: 'exit',
        timestamp: Date.now(),
        depth: 0,
        duration: 50
      });

      await reporter.onFinished([], []);

      expect(reporter.results.trace.length).toBe(1);
      expect(reporter.results.trace[0].name).toBe('TestService.method');
    });

    it('should stop collector after collecting traces', async () => {
      const reporter = new TaistReporter({ traceEnabled: true, silent: true });
      reporter.onInit({});

      await reporter.collectorReady;
      const collector = reporter.collector;

      await reporter.onFinished([], []);

      expect(reporter.collector).toBeNull();
      expect(collector.isRunning()).toBe(false);
    });
  });

  describe('_processTask', () => {
    it('should count passed tests', () => {
      const reporter = new TaistReporter({ traceEnabled: false });

      reporter._processTask(
        { type: 'test', name: 'test', result: { state: 'pass' } },
        { filepath: 'test.js' }
      );

      expect(reporter.results.stats.total).toBe(1);
      expect(reporter.results.stats.passed).toBe(1);
    });

    it('should count failed tests and add to failures', () => {
      const reporter = new TaistReporter({ traceEnabled: false });

      reporter._processTask(
        { type: 'test', name: 'test', result: { state: 'fail', errors: [{ message: 'fail' }] } },
        { filepath: 'test.js' }
      );

      expect(reporter.results.stats.total).toBe(1);
      expect(reporter.results.stats.failed).toBe(1);
      expect(reporter.results.failures.length).toBe(1);
    });

    it('should process nested suites recursively', () => {
      const reporter = new TaistReporter({ traceEnabled: false });

      reporter._processTask({
        type: 'suite',
        name: 'outer',
        tasks: [{
          type: 'suite',
          name: 'inner',
          tasks: [
            { type: 'test', name: 't1', result: { state: 'pass' } },
            { type: 'test', name: 't2', result: { state: 'pass' } }
          ]
        }]
      }, { filepath: 'test.js' });

      expect(reporter.results.stats.total).toBe(2);
      expect(reporter.results.stats.passed).toBe(2);
    });
  });

  describe('_formatFailure', () => {
    it('should format failure with error message', () => {
      const reporter = new TaistReporter({ traceEnabled: false });

      const failure = reporter._formatFailure(
        { name: 'should work', result: { errors: [{ message: 'Expected true to be false' }] } },
        { filepath: 'test.js' }
      );

      expect(failure.test).toBe('should work');
      expect(failure.error).toBe('Expected true to be false');
    });

    it('should include diff when available', () => {
      const reporter = new TaistReporter({ traceEnabled: false });

      const failure = reporter._formatFailure({
        name: 'should equal',
        result: {
          errors: [{
            message: 'not equal',
            expected: 'foo',
            actual: 'bar'
          }]
        }
      }, { filepath: 'test.js' });

      expect(failure.diff).toEqual({ expected: 'foo', actual: 'bar' });
    });

    it('should include location when available', () => {
      const reporter = new TaistReporter({ traceEnabled: false });

      const failure = reporter._formatFailure({
        name: 'test',
        location: { line: 42, column: 10 },
        result: { errors: [{ message: 'fail' }] }
      }, { filepath: 'test.js' });

      expect(failure.location).toEqual({
        file: 'test.js',
        line: 42,
        column: 10
      });
    });
  });

  describe('_getTestName', () => {
    it('should return simple test name', () => {
      const reporter = new TaistReporter({ traceEnabled: false });

      const name = reporter._getTestName({ name: 'should work', type: 'test' });

      expect(name).toBe('should work');
    });

    it('should build hierarchical test name', () => {
      const reporter = new TaistReporter({ traceEnabled: false });

      const name = reporter._getTestName({
        name: 'should work',
        type: 'test',
        suite: {
          name: 'describe block',
          type: 'suite',
          suite: {
            name: 'outer describe',
            type: 'suite',
            suite: null
          }
        }
      });

      expect(name).toBe('outer describe > describe block > should work');
    });
  });

  describe('getResults', () => {
    it('should return current results', async () => {
      const reporter = new TaistReporter({ traceEnabled: false, silent: true });
      reporter.startTime = performance.now();

      await reporter.onFinished([{
        filepath: 'test.js',
        tasks: [{
          type: 'test',
          name: 'test',
          result: { state: 'pass' }
        }]
      }], []);

      const results = reporter.getResults();

      expect(results.stats.passed).toBe(1);
      expect(results).toBe(reporter.results);
    });
  });

  describe('getSocketPath', () => {
    it('should return null when collector not running', () => {
      const reporter = new TaistReporter({ traceEnabled: false });

      expect(reporter.getSocketPath()).toBeNull();
    });

    it('should return socket path when collector is running', async () => {
      const reporter = new TaistReporter({ traceEnabled: true });
      reporter.onInit({});

      await reporter.collectorReady;

      const socketPath = reporter.getSocketPath();
      expect(socketPath).toBeTruthy();
      expect(socketPath).toContain('taist-collector');

      // Cleanup
      await reporter.collector.stop();
    });
  });

  describe('output formatting', () => {
    it('should output TOON format by default', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const reporter = new TaistReporter({ traceEnabled: false });
      reporter.startTime = performance.now();

      await reporter.onFinished([{
        filepath: 'test.js',
        tasks: [{
          type: 'suite',
          name: 'Tests',
          tasks: [
            { type: 'test', name: 'pass', result: { state: 'pass' } },
            { type: 'test', name: 'pass2', result: { state: 'pass' } },
            { type: 'test', name: 'fail', result: { state: 'fail', errors: [{ message: 'assertion failed' }] } }
          ]
        }]
      }], []);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain('===TESTS: 2/3===');
      expect(output).toContain('FAILURES:');

      consoleSpy.mockRestore();
    });

    it('should include trace tree when traces are collected', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const reporter = new TaistReporter({ traceEnabled: false, showTrace: true });
      reporter.startTime = performance.now();
      reporter.results = {
        stats: { total: 1, passed: 1, failed: 0, skipped: 0 },
        failures: [],
        duration: 100,
        trace: [{
          name: 'TestService.method',
          type: 'exit',
          timestamp: Date.now(),
          depth: 0,
          traceId: 'trace-1',
          duration: 50
        }]
      };

      reporter._outputResults();

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain('TRACE OUTPUT');
      expect(output).toContain('TestService.method');

      consoleSpy.mockRestore();
    });

    it('should not output when silent is true', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const reporter = new TaistReporter({ traceEnabled: false, silent: true });
      reporter.startTime = performance.now();

      await reporter.onFinished([], []);

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
