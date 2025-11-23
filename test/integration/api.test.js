/**
 * Integration tests for programmatic API
 */

import { describe, it, expect } from 'vitest';
import { Taist } from '../../index.js';

describe('Taist Programmatic API', () => {
  describe('constructor', () => {
    it('should create Taist instance with defaults', () => {
      const taist = new Taist();

      expect(taist).toBeDefined();
      expect(taist.options.format).toBe('toon');
      expect(taist.options.trace).toBe(true);
      expect(taist.options.depth).toBe(2);
    });

    it('should accept custom options', () => {
      const taist = new Taist({
        format: 'json',
        trace: false,
        depth: 5
      });

      expect(taist.options.format).toBe('json');
      expect(taist.options.trace).toBe(false);
      expect(taist.options.depth).toBe(5);
    });
  });

  describe('run', () => {
    it('should run tests and return results', async () => {
      const taist = new Taist();

      const results = await taist.run({
        tests: ['./examples/calculator.test.js']
      });

      expect(results).toBeDefined();
      expect(results).toHaveProperty('stats');
      expect(results.stats).toHaveProperty('total');
      expect(results.stats).toHaveProperty('passed');
    });

    it('should return passing results for calculator example', async () => {
      const taist = new Taist();

      const results = await taist.run({
        tests: ['./examples/calculator.test.js']
      });

      expect(results.stats.total).toBeGreaterThan(0);
      expect(results.stats.passed).toBe(results.stats.total);
      expect(results.stats.failed).toBe(0);
    });

    it('should return failing results for failing example', async () => {
      const taist = new Taist();

      const results = await taist.run({
        tests: ['./examples/failing.test.js']
      });

      expect(results.stats.failed).toBeGreaterThan(0);
      expect(results.failures).toBeDefined();
      expect(results.failures.length).toBeGreaterThan(0);
    });
  });

  describe('format', () => {
    it('should format results using configured formatter', async () => {
      const taist = new Taist({ format: 'toon' });

      const results = await taist.run({
        tests: ['./examples/calculator.test.js']
      });

      const output = taist.format(results);

      expect(typeof output).toBe('string');
      expect(output).toContain('===TESTS:');
    });

    it('should format as JSON when configured', async () => {
      const taist = new Taist({ format: 'json' });

      const results = await taist.run({
        tests: ['./examples/calculator.test.js']
      });

      const output = taist.format(results);
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('status');
      expect(parsed).toHaveProperty('stats');
    });

    it('should format as compact when configured', async () => {
      const taist = new Taist({ format: 'compact' });

      const results = await taist.run({
        tests: ['./examples/calculator.test.js']
      });

      const output = taist.format(results);

      expect(output).toMatch(/[✓✗]/);
      expect(output.split('\n').length).toBe(1);
    });
  });

  describe('runAndFormat', () => {
    it('should run and format in one call', async () => {
      const taist = new Taist({ format: 'toon' });

      const output = await taist.runAndFormat({
        tests: ['./examples/calculator.test.js']
      });

      expect(typeof output).toBe('string');
      expect(output).toContain('===TESTS:');
    });
  });

  describe('setFormat', () => {
    it('should allow changing output format', async () => {
      const taist = new Taist({ format: 'toon' });

      const results = await taist.run({
        tests: ['./examples/calculator.test.js']
      });

      // Format as TOON
      let output = taist.format(results);
      expect(output).toContain('===TESTS:');

      // Change to JSON
      taist.setFormat('json');
      output = taist.format(results);
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('status');

      // Change to Compact
      taist.setFormat('compact');
      output = taist.format(results);
      expect(output).toMatch(/[✓✗]/);
    });
  });

  describe('getTracer', () => {
    it('should provide access to tracer', () => {
      const taist = new Taist();
      const tracer = taist.getTracer();

      expect(tracer).toBeDefined();
      expect(tracer).toHaveProperty('enter');
      expect(tracer).toHaveProperty('exit');
      expect(tracer).toHaveProperty('getTraces');
    });
  });
});
