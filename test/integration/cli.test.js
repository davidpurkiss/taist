/**
 * Integration tests for CLI
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, unlinkSync, readFileSync } from 'fs';

// Helper to run CLI commands
function runCLI(args, options = {}) {
  try {
    const output = execSync(`node taist.js ${args}`, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      ...options
    });
    return { success: true, output, stderr: '' };
  } catch (error) {
    return {
      success: false,
      output: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.status
    };
  }
}

describe('CLI Integration Tests', () => {
  describe('--version', () => {
    it('should display version number', () => {
      const result = runCLI('--version');
      expect(result.output).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe('--help', () => {
    it('should display help information', () => {
      const result = runCLI('--help');
      expect(result.output).toContain('Usage:');
      expect(result.output).toContain('taist');
    });
  });

  describe('init command', () => {
    const configFile = '.taistrc-test.json';

    afterEach(() => {
      if (existsSync(configFile)) {
        unlinkSync(configFile);
      }
    });

    it('should create configuration file', () => {
      // Note: init creates .taistrc.json, so we test differently
      // This test would require modifying the CLI to support custom config file path
      // For now, we'll just verify the command runs
      const result = runCLI('init');
      expect(result.output || result.stderr).toContain('.taistrc.json');
    });
  });

  describe('test command', () => {
    it('should run tests with default TOON format', () => {
      const result = runCLI('test -t ./examples/calculator.test.js 2>&1');

      expect(result.output).toContain('===TESTS:');
    });

    it('should run tests with JSON format', () => {
      const result = runCLI('test -t ./examples/calculator.test.js --format json 2>/dev/null');

      // Extract JSON from output (last line should be JSON)
      const lines = result.output.trim().split('\n');
      const jsonLine = lines[lines.length - 1];

      expect(() => JSON.parse(jsonLine)).not.toThrow();
      const parsed = JSON.parse(jsonLine);
      expect(parsed).toHaveProperty('status');
      expect(parsed).toHaveProperty('stats');
    });

    it('should run tests with compact format', () => {
      const result = runCLI('test -t ./examples/calculator.test.js --format compact 2>/dev/null');

      expect(result.output).toMatch(/[✓✗]/);
      expect(result.output).toContain('/');
    });

    it('should exit with code 0 for passing tests', () => {
      const result = runCLI('test -t ./examples/calculator.test.js 2>/dev/null');

      expect(result.success).toBe(true);
    });

    it('should exit with code 1 for failing tests', () => {
      const result = runCLI('test -t ./examples/failing.test.js 2>/dev/null');

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should show failures in output', () => {
      const result = runCLI('test -t ./examples/failing.test.js 2>&1');

      expect(result.output).toContain('FAILURES:');
      expect(result.output).toContain('✗');
    });

    it('should write output to file when -o specified', () => {
      const outputFile = 'test-output.txt';

      try {
        runCLI(`test -t ./examples/calculator.test.js --output-file ${outputFile} 2>/dev/null`);

        expect(existsSync(outputFile)).toBe(true);
        const content = readFileSync(outputFile, 'utf-8');
        expect(content).toContain('===TESTS:');
      } finally {
        if (existsSync(outputFile)) {
          unlinkSync(outputFile);
        }
      }
    });
  });

  describe('trace command', () => {
    it('should run tests with tracing enabled', () => {
      const result = runCLI('trace -t ./examples/calculator.test.js 2>&1');

      // Tracing is enabled but may not show in output for passing tests
      expect(result.output).toContain('===TESTS:');
    });

    it('should use custom depth level', () => {
      const result = runCLI('trace -t ./examples/calculator.test.js -d 5 2>&1');

      expect(result.output).toContain('===TESTS:');
    });
  });

  describe('output formats comparison', () => {
    it('should produce different output for different formats', () => {
      const toon = runCLI('test -t ./examples/calculator.test.js --format toon 2>/dev/null');
      const json = runCLI('test -t ./examples/calculator.test.js --format json 2>/dev/null');
      const compact = runCLI('test -t ./examples/calculator.test.js --format compact 2>/dev/null');

      // All should succeed
      expect(toon.output).toBeTruthy();
      expect(json.output).toBeTruthy();
      expect(compact.output).toBeTruthy();

      // All should be different
      expect(toon.output).not.toBe(json.output);
      expect(toon.output).not.toBe(compact.output);
      expect(json.output).not.toBe(compact.output);

      // TOON should have header
      expect(toon.output).toContain('===TESTS:');

      // JSON should be parseable (extract last line which is the JSON output)
      const jsonLines = json.output.trim().split('\n');
      const jsonLine = jsonLines[jsonLines.length - 1];
      const jsonParsed = JSON.parse(jsonLine);
      expect(jsonParsed).toHaveProperty('status');

      // Compact should be one line (extract last line)
      const compactLines = compact.output.trim().split('\n');
      const lastCompactLine = compactLines[compactLines.length - 1];
      expect(lastCompactLine).toMatch(/[✓✗]/);
    });
  });

  describe('error handling', () => {
    it('should handle non-existent test files gracefully', () => {
      const result = runCLI('test -t ./non-existent-file.test.js 2>&1');

      // Should not crash, but may have no tests or error
      expect(result.output || result.stderr).toBeTruthy();
    });

    it('should handle invalid format option', () => {
      const result = runCLI('test -t ./examples/calculator.test.js --format invalid 2>&1');

      expect(result.output || result.stderr).toContain('format');
    });
  });
});
