/**
 * Unit tests for ExecutionTracer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionTracer } from '../../lib/execution-tracer.js';

describe('ExecutionTracer', () => {
  let tracer;

  beforeEach(() => {
    tracer = new ExecutionTracer({ enabled: true, depth: 3 });
  });

  describe('constructor', () => {
    it('should create tracer with default options', () => {
      const t = new ExecutionTracer();
      expect(t.enabled).toBe(true);
      expect(t.depth).toBe(2);
      expect(t.maxEntries).toBe(1000);
    });

    it('should accept custom options', () => {
      const t = new ExecutionTracer({
        enabled: false,
        depth: 5,
        maxEntries: 500
      });
      expect(t.enabled).toBe(false);
      expect(t.depth).toBe(5);
      expect(t.maxEntries).toBe(500);
    });
  });

  describe('start and stop', () => {
    it('should start tracing', () => {
      const t = new ExecutionTracer({ enabled: false });
      t.start();
      expect(t.enabled).toBe(true);
    });

    it('should stop tracing', () => {
      tracer.stop();
      expect(tracer.enabled).toBe(false);
    });

    it('should clear traces when starting', () => {
      tracer.enter('test', []);
      tracer.start();
      expect(tracer.getTraces()).toHaveLength(0);
    });
  });

  describe('enter and exit', () => {
    it('should record function entry', () => {
      tracer.enter('testFunction', [1, 2, 3]);
      const traces = tracer.getTraces();

      expect(traces.length).toBeGreaterThan(0);
      const entry = traces[0];
      expect(entry.name).toBe('testFunction');
      expect(entry.type).toBe('enter');
    });

    it('should record function exit', () => {
      tracer.enter('testFunction', []);
      tracer.exit('testFunction', 42);

      const traces = tracer.getTraces();
      const exitTrace = traces.find(t => t.type === 'exit');

      expect(exitTrace).toBeDefined();
      expect(exitTrace.name).toBe('testFunction');
      expect(exitTrace.type).toBe('exit');
    });

    it('should track call depth', () => {
      tracer.enter('outer', []);
      expect(tracer.currentDepth).toBe(1);

      tracer.enter('inner', []);
      expect(tracer.currentDepth).toBe(2);

      tracer.exit('inner', null);
      expect(tracer.currentDepth).toBe(1);

      tracer.exit('outer', null);
      expect(tracer.currentDepth).toBe(0);
    });

    it('should not trace beyond max depth', () => {
      const t = new ExecutionTracer({ enabled: true, depth: 2 });

      t.enter('level1', []);
      t.enter('level2', []);
      t.enter('level3', []); // Should not be recorded

      const traces = t.getTraces();
      expect(traces.every(tr => tr.depth < 2)).toBe(true);
    });

    it('should capture duration', () => {
      tracer.enter('timedFunction', []);
      tracer.exit('timedFunction', 42);

      const traces = tracer.getTraces();
      const exitTrace = traces.find(t => t.type === 'exit');

      expect(exitTrace.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('error', () => {
    it('should record errors', () => {
      tracer.error('failedFunction', new Error('Test error'));

      const traces = tracer.getTraces();
      const errorTrace = traces.find(t => t.type === 'error');

      expect(errorTrace).toBeDefined();
      expect(errorTrace.name).toBe('failedFunction');
      expect(errorTrace.error.message).toBe('Test error');
    });

    it('should sanitize error objects', () => {
      const error = new Error('Complex error');
      error.stack = 'Line 1\nLine 2\nLine 3\nLine 4';

      tracer.error('fn', error);

      const traces = tracer.getTraces();
      const errorTrace = traces.find(t => t.type === 'error');

      expect(errorTrace.error).toHaveProperty('name');
      expect(errorTrace.error).toHaveProperty('message');
      expect(errorTrace.error).toHaveProperty('stack');
    });
  });

  describe('event', () => {
    it('should record custom events', () => {
      tracer.event('customEvent', { key: 'value' });

      const traces = tracer.getTraces();
      const eventTrace = traces.find(t => t.type === 'event');

      expect(eventTrace).toBeDefined();
      expect(eventTrace.name).toBe('customEvent');
      expect(eventTrace.data).toEqual({ key: 'value' });
    });
  });

  describe('wrap', () => {
    it('should wrap and trace function calls', () => {
      const add = (a, b) => a + b;
      const wrapped = tracer.wrap(add, 'add');

      const result = wrapped(2, 3);

      expect(result).toBe(5);
      const traces = tracer.getTraces();
      expect(traces.length).toBeGreaterThan(0);
      expect(traces.some(t => t.name === 'add')).toBe(true);
    });

    it('should handle async functions', async () => {
      const asyncFn = async (x) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return x * 2;
      };

      const wrapped = tracer.wrap(asyncFn, 'asyncFn');
      const result = await wrapped(5);

      expect(result).toBe(10);
      const traces = tracer.getTraces();
      expect(traces.some(t => t.name === 'asyncFn')).toBe(true);
    });

    it('should trace errors in wrapped functions', () => {
      const throwingFn = () => {
        throw new Error('Test error');
      };

      const wrapped = tracer.wrap(throwingFn, 'throwingFn');

      expect(() => wrapped()).toThrow('Test error');
      const traces = tracer.getTraces();
      expect(traces.some(t => t.type === 'error')).toBe(true);
    });
  });

  describe('sanitizeValue', () => {
    it('should handle primitive values', () => {
      expect(tracer.sanitizeValue(42)).toBe(42);
      expect(tracer.sanitizeValue('test')).toBe('test');
      expect(tracer.sanitizeValue(true)).toBe(true);
      expect(tracer.sanitizeValue(null)).toBe(null);
      expect(tracer.sanitizeValue(undefined)).toBe(undefined);
    });

    it('should truncate long strings', () => {
      const longString = 'a'.repeat(200);
      const result = tracer.sanitizeValue(longString);
      expect(result.length).toBeLessThan(longString.length);
      expect(result).toContain('...');
    });

    it('should handle arrays', () => {
      const arr = [1, 2, 3];
      const result = tracer.sanitizeValue(arr);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should limit large arrays', () => {
      const largeArray = Array.from({ length: 10 }, (_, i) => i);
      const result = tracer.sanitizeValue(largeArray);
      expect(result.length).toBeLessThan(largeArray.length);
    });

    it('should handle objects', () => {
      const obj = { name: 'Alice', age: 30 };
      const result = tracer.sanitizeValue(obj);
      expect(result).toEqual({ name: 'Alice', age: 30 });
    });

    it('should limit object keys', () => {
      const largeObj = Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [`key${i}`, i])
      );
      const result = tracer.sanitizeValue(largeObj);
      const keys = Object.keys(result);
      expect(keys.length).toBeLessThanOrEqual(6); // 5 keys + '...'
    });

    it('should handle nested objects with max depth', () => {
      const deepObj = { a: { b: { c: { d: 'too deep' } } } };
      const result = tracer.sanitizeValue(deepObj, 2);
      expect(result.a.b).toBe('[deep]');
    });

    it('should handle functions', () => {
      function testFunc() {}
      const result = tracer.sanitizeValue(testFunc);
      expect(result).toContain('Function');
      expect(result).toContain('testFunc');
    });

    it('should handle dates', () => {
      const date = new Date('2024-01-01');
      const result = tracer.sanitizeValue(date);
      expect(result).toBe(date.toISOString());
    });

    it('should handle errors', () => {
      const error = new Error('Test error');
      const result = tracer.sanitizeValue(error);
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('message');
    });
  });

  describe('clear', () => {
    it('should clear all traces', () => {
      tracer.enter('fn1', []);
      tracer.enter('fn2', []);
      expect(tracer.getTraces().length).toBeGreaterThan(0);

      tracer.clear();
      expect(tracer.getTraces()).toHaveLength(0);
      expect(tracer.currentDepth).toBe(0);
    });
  });

  describe('getSummary', () => {
    it('should provide summary of traces', () => {
      tracer.enter('fn1', []);
      tracer.exit('fn1', 42);
      tracer.error('fn2', new Error('Test'));

      const summary = tracer.getSummary();

      expect(summary).toHaveProperty('total');
      expect(summary).toHaveProperty('byType');
      expect(summary).toHaveProperty('errors');
      expect(summary).toHaveProperty('duration');
    });

    it('should count traces by type', () => {
      tracer.enter('fn1', []);
      tracer.exit('fn1', 42);
      tracer.error('fn2', new Error('Test'));

      const summary = tracer.getSummary();

      expect(summary.byType.enter).toBe(1);
      expect(summary.byType.exit).toBe(1);
      expect(summary.byType.error).toBe(1);
    });
  });

  describe('exportForToon', () => {
    it('should export traces in TOON-friendly format', () => {
      tracer.enter('add', [2, 3]);
      tracer.exit('add', 5);

      const exported = tracer.exportForToon();

      expect(Array.isArray(exported)).toBe(true);
      expect(exported.length).toBeGreaterThan(0);
      expect(exported[0]).toHaveProperty('name');
    });

    it('should only include exit and error traces', () => {
      tracer.enter('fn1', []);
      tracer.exit('fn1', 42);
      tracer.event('custom', {});

      const exported = tracer.exportForToon();

      expect(exported.every(t => !t.type || t.type === 'exit' || t.type === 'error')).toBe(true);
    });
  });

  describe('circular buffer behavior', () => {
    it('should respect maxEntries limit', () => {
      const t = new ExecutionTracer({ enabled: true, maxEntries: 5 });

      for (let i = 0; i < 10; i++) {
        t.enter(`fn${i}`, []);
      }

      const traces = t.getTraces();
      expect(traces.length).toBeLessThanOrEqual(5);
    });
  });

  describe('disabled tracer', () => {
    it('should not record when disabled', () => {
      const t = new ExecutionTracer({ enabled: false });

      t.enter('fn', []);
      t.exit('fn', 42);

      expect(t.getTraces()).toHaveLength(0);
    });

    it('should return original function when wrapping while disabled', () => {
      const t = new ExecutionTracer({ enabled: false });
      const fn = () => 42;
      const wrapped = t.wrap(fn, 'fn');

      expect(wrapped()).toBe(42);
      expect(t.getTraces()).toHaveLength(0);
    });
  });
});
