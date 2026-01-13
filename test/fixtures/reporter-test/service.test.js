/**
 * Test file for the reporter integration test
 * Uses instrumented service to verify trace collection
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { CalculatorService } from './service.js';
import { instrumentService } from '../../../instrument.js';

// Instrument the service - traces should be collected by the reporter
const calculator = instrumentService(new CalculatorService(), 'CalculatorService');

describe('CalculatorService', () => {
  describe('add', () => {
    it('should add two numbers', () => {
      const result = calculator.add(2, 3);
      expect(result).toBe(5);
    });

    it('should handle negative numbers', () => {
      const result = calculator.add(-1, 5);
      expect(result).toBe(4);
    });
  });

  describe('subtract', () => {
    it('should subtract two numbers', () => {
      const result = calculator.subtract(10, 4);
      expect(result).toBe(6);
    });
  });

  describe('multiply', () => {
    it('should multiply two numbers', () => {
      const result = calculator.multiply(3, 4);
      expect(result).toBe(12);
    });
  });

  describe('divide', () => {
    it('should divide two numbers', () => {
      const result = calculator.divide(10, 2);
      expect(result).toBe(5);
    });

    it('should fail when dividing by zero', () => {
      expect(() => calculator.divide(10, 0)).toThrow('Division by zero');
    });
  });
});
