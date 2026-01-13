/**
 * Unit tests for ToonFormatter
 */

import { describe, it, expect } from 'vitest';
import { ToonFormatter } from '../../lib/toon-formatter.js';
import { passingResults, failingResults, resultsWithTrace, resultsWithCoverage } from '../fixtures/results.js';

describe('ToonFormatter', () => {
  describe('constructor', () => {
    it('should create formatter with default options', () => {
      const formatter = new ToonFormatter();
      expect(formatter.options.abbreviate).toBe(true);
      expect(formatter.options.maxTokens).toBe(1000);
    });

    it('should accept custom options', () => {
      const formatter = new ToonFormatter({
        abbreviate: false,
        maxTokens: 500
      });
      expect(formatter.options.abbreviate).toBe(false);
      expect(formatter.options.maxTokens).toBe(500);
    });
  });

  describe('formatHeader', () => {
    it('should format passing test header', () => {
      const formatter = new ToonFormatter();
      const header = formatter.formatHeader(passingResults);
      expect(header).toBe('===TESTS: 5/5===');
    });

    it('should format failing test header', () => {
      const formatter = new ToonFormatter();
      const header = formatter.formatHeader(failingResults);
      expect(header).toBe('===TESTS: 2/5===');
    });

    it('should handle missing stats', () => {
      const formatter = new ToonFormatter();
      const header = formatter.formatHeader({});
      expect(header).toBe('===TESTS: 0/0===');
    });
  });

  describe('formatValue', () => {
    const formatter = new ToonFormatter();

    it('should format null as "nil"', () => {
      expect(formatter.formatValue(null)).toBe('nil');
    });

    it('should format undefined as "undef"', () => {
      expect(formatter.formatValue(undefined)).toBe('undef');
    });

    it('should format strings with quotes', () => {
      expect(formatter.formatValue('hello')).toBe('"hello"');
    });

    it('should format numbers', () => {
      expect(formatter.formatValue(42)).toBe('42');
      expect(formatter.formatValue(3.14)).toBe('3.14');
    });

    it('should format booleans', () => {
      expect(formatter.formatValue(true)).toBe('true');
      expect(formatter.formatValue(false)).toBe('false');
    });

    it('should format arrays', () => {
      expect(formatter.formatValue([1, 2, 3])).toContain('[');
      expect(formatter.formatValue([])).toBe('[]');
    });

    it('should format objects with keys', () => {
      const result = formatter.formatValue({ name: 'Alice', age: 30 });
      expect(result).toContain('name');
      expect(result).toContain('age');
    });

    it('should truncate long strings', () => {
      const longString = 'a'.repeat(100);
      const result = formatter.formatValue(longString);
      expect(result.length).toBeLessThan(longString.length);
      expect(result).toContain('...');
    });

    it('should limit array items', () => {
      const longArray = Array.from({ length: 10 }, (_, i) => i);
      const result = formatter.formatValue(longArray);
      expect(result).toContain('...');
    });
  });

  describe('formatFailure', () => {
    const formatter = new ToonFormatter();

    it('should format a basic failure', () => {
      const failure = {
        test: 'should add numbers',
        location: 'test.js:10',
        error: 'expected 5 to be 6'
      };
      const lines = formatter.formatFailure(failure);
      expect(lines).toContain('✗ should add numbers');
      expect(lines.some(l => l.includes('test.js'))).toBe(true);
      expect(lines.some(l => l.includes('expected 5 to be 6'))).toBe(true);
    });

    it('should include expected and actual values', () => {
      const failure = {
        test: 'test',
        error: 'mismatch',
        diff: {
          expected: 10,
          actual: 5
        }
      };
      const lines = formatter.formatFailure(failure);
      expect(lines.some(l => l.includes('exp:'))).toBe(true);
      expect(lines.some(l => l.includes('got:'))).toBe(true);
    });
  });

  describe('formatTraceEntry', () => {
    const formatter = new ToonFormatter();

    it('should format trace with duration', () => {
      const entry = {
        name: 'add',
        duration: 5.123
      };
      const result = formatter.formatTraceEntry(entry);
      expect(result).toContain('fn:add');
      expect(result).toContain('ms:5');
    });

    it('should include arguments', () => {
      const entry = {
        name: 'multiply',
        args: [2, 3]
      };
      const result = formatter.formatTraceEntry(entry);
      expect(result).toContain('args:');
    });

    it('should include return value', () => {
      const entry = {
        name: 'divide',
        result: 5
      };
      const result = formatter.formatTraceEntry(entry);
      expect(result).toContain('ret:5');
    });

    it('should include error', () => {
      const entry = {
        name: 'badFunction',
        error: 'Something went wrong'
      };
      const result = formatter.formatTraceEntry(entry);
      expect(result).toContain('err:');
    });
  });

  describe('formatCoverage', () => {
    const formatter = new ToonFormatter();

    it('should format coverage information', () => {
      const coverage = {
        percent: 85.5,
        covered: 45,
        total: 53
      };
      const result = formatter.formatCoverage(coverage);
      expect(result).toBe('COV: 86% (45/53)');
    });

    it('should handle zero coverage', () => {
      const coverage = {
        percent: 0,
        covered: 0,
        total: 100
      };
      const result = formatter.formatCoverage(coverage);
      expect(result).toBe('COV: 0% (0/100)');
    });
  });

  describe('format', () => {
    it('should format passing results', () => {
      const formatter = new ToonFormatter();
      const output = formatter.format(passingResults);

      expect(output).toContain('===TESTS: 5/5===');
      expect(output).not.toContain('FAILURES:');
    });

    it('should format failing results', () => {
      const formatter = new ToonFormatter();
      const output = formatter.format(failingResults);

      expect(output).toContain('===TESTS: 2/5===');
      expect(output).toContain('FAILURES:');
      expect(output).toContain('✗');
    });

    it('should include trace when present', () => {
      const formatter = new ToonFormatter();
      const output = formatter.format(resultsWithTrace);

      expect(output).toContain('TRACE:');
      expect(output).toContain('fn:add');
    });

    it('should include coverage when present', () => {
      const formatter = new ToonFormatter();
      const output = formatter.format(resultsWithCoverage);

      expect(output).toContain('COV:');
      expect(output).toContain('86%');
    });
  });

  describe('abbreviatePath', () => {
    const formatter = new ToonFormatter();

    it('should abbreviate node_modules paths', () => {
      const path = '/home/user/project/node_modules/some-lib/index.js';
      const result = formatter.abbreviatePath(path);
      expect(result).toContain('npm/');
    });

    it('should abbreviate src paths', () => {
      const path = '/home/user/project/src/components/Button.js';
      const result = formatter.abbreviatePath(path);
      expect(result).toContain('src/');
    });

    it('should abbreviate test paths', () => {
      const path = '/home/user/project/test/unit/formatter.test.js';
      const result = formatter.abbreviatePath(path);
      expect(result).toContain('test/');
    });

    it('should shorten long paths to filename', () => {
      const path = '/very/long/path/that/should/be/shortened/file.js';
      const result = formatter.abbreviatePath(path);
      expect(result).toBe('file.js');
    });
  });

  describe('cleanErrorMessage', () => {
    const formatter = new ToonFormatter();

    it('should remove ANSI codes', () => {
      const message = '\u001b[31mError\u001b[0m: something failed';
      const result = formatter.cleanErrorMessage(message);
      expect(result).not.toContain('\u001b[');
    });

    it('should remove timestamps', () => {
      const message = '[12:34:56] Error occurred';
      const result = formatter.cleanErrorMessage(message);
      expect(result).not.toContain('[12:34:56]');
    });

    it('should handle error objects', () => {
      const error = new Error('Test error');
      const result = formatter.cleanErrorMessage(error);
      expect(result).toBe('Test error');
    });

    it('should truncate long messages', () => {
      const message = 'x'.repeat(100);
      const result = formatter.cleanErrorMessage(message);
      expect(result.length).toBeLessThanOrEqual(50);
    });
  });

  describe('truncate', () => {
    const formatter = new ToonFormatter();

    it('should not truncate short strings', () => {
      const str = 'short';
      expect(formatter.truncate(str)).toBe('short');
    });

    it('should truncate long strings', () => {
      const str = 'a'.repeat(100);
      const result = formatter.truncate(str, 20);
      expect(result).toContain('...');
      expect(result.length).toBeLessThanOrEqual(20);
    });

    it('should handle empty strings', () => {
      expect(formatter.truncate('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(formatter.truncate(null)).toBe('');
      expect(formatter.truncate(undefined)).toBe('');
    });
  });

  describe('shortenTestName', () => {
    const formatter = new ToonFormatter();

    it('should extract last part from hierarchical name', () => {
      const name = 'Suite > Nested > actual test name';
      expect(formatter.shortenTestName(name)).toBe('actual test name');
    });

    it('should return simple name unchanged', () => {
      const name = 'should work correctly';
      expect(formatter.shortenTestName(name)).toBe('should work correctly');
    });

    it('should handle empty string', () => {
      expect(formatter.shortenTestName('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(formatter.shortenTestName(null)).toBe('');
      expect(formatter.shortenTestName(undefined)).toBe('');
    });
  });

  describe('enhanced output for small test runs', () => {
    const formatter = new ToonFormatter();

    it('should show passing tests when running ≤10 tests', () => {
      const results = {
        stats: { total: 2, passed: 2, failed: 0, skipped: 0 },
        tests: [
          { name: 'Suite > test one', duration: 150, state: 'pass' },
          { name: 'Suite > test two', duration: 200, state: 'pass' }
        ],
        failures: []
      };

      const output = formatter.format(results);

      expect(output).toContain('===TESTS: 2/2===');
      expect(output).toContain('✓ test one (150ms)');
      expect(output).toContain('✓ test two (200ms)');
    });

    it('should not show individual tests when running >10 tests', () => {
      const tests = Array.from({ length: 15 }, (_, i) => ({
        name: `test ${i}`,
        duration: 100,
        state: 'pass'
      }));

      const results = {
        stats: { total: 15, passed: 15, failed: 0, skipped: 0 },
        tests,
        failures: []
      };

      const output = formatter.format(results);

      expect(output).toContain('===TESTS: 15/15===');
      expect(output).not.toContain('✓ test 0');
    });

    it('should only show passing tests (failures shown separately)', () => {
      const results = {
        stats: { total: 2, passed: 1, failed: 1, skipped: 0 },
        tests: [
          { name: 'passing test', duration: 100, state: 'pass' },
          { name: 'failing test', duration: 50, state: 'fail' }
        ],
        failures: [{ test: 'failing test', error: 'oops' }]
      };

      const output = formatter.format(results);

      expect(output).toContain('✓ passing test (100ms)');
      expect(output).not.toContain('✓ failing test');
      expect(output).toContain('FAILURES:');
    });
  });
});
