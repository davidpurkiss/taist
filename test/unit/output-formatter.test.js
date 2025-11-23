/**
 * Unit tests for OutputFormatter
 */

import { describe, it, expect } from 'vitest';
import { OutputFormatter } from '../../lib/output-formatter.js';
import { passingResults, failingResults } from '../fixtures/results.js';

describe('OutputFormatter', () => {
  describe('constructor', () => {
    it('should create formatter with default format', () => {
      const formatter = new OutputFormatter();
      expect(formatter.formatType).toBe('toon');
    });

    it('should accept custom format', () => {
      const formatter = new OutputFormatter({ format: 'json' });
      expect(formatter.formatType).toBe('json');
    });
  });

  describe('format - TOON', () => {
    it('should format as TOON by default', () => {
      const formatter = new OutputFormatter({ format: 'toon' });
      const output = formatter.format(passingResults);

      expect(output).toContain('===TESTS:');
      expect(typeof output).toBe('string');
    });

    it('should include test statistics', () => {
      const formatter = new OutputFormatter({ format: 'toon' });
      const output = formatter.format(passingResults);

      expect(output).toContain('5/5');
    });
  });

  describe('format - JSON', () => {
    it('should format as JSON', () => {
      const formatter = new OutputFormatter({ format: 'json' });
      const output = formatter.format(passingResults);

      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('status');
      expect(parsed).toHaveProperty('stats');
      expect(parsed).toHaveProperty('failures');
    });

    it('should include pass status for passing tests', () => {
      const formatter = new OutputFormatter({ format: 'json' });
      const output = formatter.format(passingResults);

      const parsed = JSON.parse(output);
      expect(parsed.status).toBe('pass');
    });

    it('should include fail status for failing tests', () => {
      const formatter = new OutputFormatter({ format: 'json' });
      const output = formatter.format(failingResults);

      const parsed = JSON.parse(output);
      expect(parsed.status).toBe('fail');
    });

    it('should include statistics', () => {
      const formatter = new OutputFormatter({ format: 'json' });
      const output = formatter.format(passingResults);

      const parsed = JSON.parse(output);
      expect(parsed.stats.total).toBe(5);
      expect(parsed.stats.passed).toBe(5);
      expect(parsed.stats.failed).toBe(0);
    });

    it('should include failures array', () => {
      const formatter = new OutputFormatter({ format: 'json' });
      const output = formatter.format(failingResults);

      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed.failures)).toBe(true);
      expect(parsed.failures.length).toBe(3);
    });

    it('should include timestamp', () => {
      const formatter = new OutputFormatter({ format: 'json' });
      const output = formatter.format(passingResults);

      const parsed = JSON.parse(output);
      expect(parsed.timestamp).toBeDefined();
      expect(new Date(parsed.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('format - Compact', () => {
    it('should format as compact one-liner', () => {
      const formatter = new OutputFormatter({ format: 'compact' });
      const output = formatter.format(passingResults);

      expect(output).toContain('✓');
      expect(output).toContain('5/5');
      expect(output.split('\n').length).toBe(1);
    });

    it('should show failure indicator for failing tests', () => {
      const formatter = new OutputFormatter({ format: 'compact' });
      const output = formatter.format(failingResults);

      expect(output).toContain('✗');
      expect(output).toContain('2/5');
      expect(output).toContain('3 fail');
    });

    it('should include duration', () => {
      const formatter = new OutputFormatter({ format: 'compact' });
      const output = formatter.format(passingResults);

      expect(output).toContain('123ms');
    });

    it('should include coverage when present', () => {
      const formatter = new OutputFormatter({ format: 'compact' });
      const results = {
        ...passingResults,
        coverage: { percent: 85 }
      };
      const output = formatter.format(results);

      expect(output).toContain('cov:85%');
    });

    it('should include first error message for failures', () => {
      const formatter = new OutputFormatter({ format: 'compact' });
      const output = formatter.format(failingResults);

      expect(output).toContain('(');
      expect(output).toContain(')');
    });
  });

  describe('format - Invalid', () => {
    it('should throw error for invalid format', () => {
      const formatter = new OutputFormatter({ format: 'invalid' });

      expect(() => formatter.format(passingResults)).toThrow('Unknown format');
    });
  });

  describe('setFormat', () => {
    it('should allow changing format', () => {
      const formatter = new OutputFormatter({ format: 'toon' });
      formatter.setFormat('json');

      expect(formatter.formatType).toBe('json');
    });

    it('should use new format for subsequent calls', () => {
      const formatter = new OutputFormatter({ format: 'toon' });
      formatter.setFormat('json');

      const output = formatter.format(passingResults);
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('status');
    });
  });

  describe('determineStatus', () => {
    const formatter = new OutputFormatter();

    it('should return "pass" for passing tests', () => {
      const status = formatter.determineStatus(passingResults);
      expect(status).toBe('pass');
    });

    it('should return "fail" for failing tests', () => {
      const status = formatter.determineStatus(failingResults);
      expect(status).toBe('fail');
    });

    it('should return "empty" for no tests', () => {
      const status = formatter.determineStatus({
        stats: { passed: 0, total: 0, failed: 0 }
      });
      expect(status).toBe('empty');
    });
  });

  describe('extractErrorMessage', () => {
    const formatter = new OutputFormatter();

    it('should extract string error', () => {
      const failure = { error: 'Test failed' };
      const message = formatter.extractErrorMessage(failure);
      expect(message).toBe('Test failed');
    });

    it('should extract error object message', () => {
      const failure = { error: { message: 'Error occurred' } };
      const message = formatter.extractErrorMessage(failure);
      expect(message).toBe('Error occurred');
    });

    it('should handle missing error', () => {
      const failure = {};
      const message = formatter.extractErrorMessage(failure);
      expect(message).toBe('Unknown error');
    });

    it('should convert non-string errors to string', () => {
      const failure = { error: 123 };
      const message = formatter.extractErrorMessage(failure);
      expect(message).toBe('123');
    });
  });
});
