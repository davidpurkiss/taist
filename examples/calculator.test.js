/**
 * Calculator tests
 */

import { describe, it, expect } from 'vitest';
import { Calculator } from './calculator.js';

describe('Calculator', () => {
  const calc = new Calculator();

  describe('add', () => {
    it('should add two positive numbers', () => {
      expect(calc.add(2, 3)).toBe(5);
    });

    it('should add negative numbers', () => {
      expect(calc.add(-2, -3)).toBe(-5);
    });

    it('should add zero', () => {
      expect(calc.add(5, 0)).toBe(5);
    });
  });

  describe('subtract', () => {
    it('should subtract two numbers', () => {
      expect(calc.subtract(5, 3)).toBe(2);
    });

    it('should handle negative results', () => {
      expect(calc.subtract(3, 5)).toBe(-2);
    });
  });

  describe('multiply', () => {
    it('should multiply two numbers', () => {
      expect(calc.multiply(4, 5)).toBe(20);
    });

    it('should handle zero', () => {
      expect(calc.multiply(5, 0)).toBe(0);
    });

    it('should handle negative numbers', () => {
      expect(calc.multiply(-3, 4)).toBe(-12);
    });
  });

  describe('divide', () => {
    it('should divide two numbers', () => {
      expect(calc.divide(10, 2)).toBe(5);
    });

    it('should handle decimals', () => {
      expect(calc.divide(7, 2)).toBe(3.5);
    });

    it('should throw on division by zero', () => {
      expect(() => calc.divide(5, 0)).toThrow('Division by zero');
    });
  });

  describe('power', () => {
    it('should calculate power', () => {
      expect(calc.power(2, 3)).toBe(8);
    });

    it('should handle power of zero', () => {
      expect(calc.power(5, 0)).toBe(1);
    });

    it('should handle power of one', () => {
      expect(calc.power(5, 1)).toBe(5);
    });
  });

  describe('factorial', () => {
    it('should calculate factorial', () => {
      expect(calc.factorial(5)).toBe(120);
    });

    it('should handle factorial of 0', () => {
      expect(calc.factorial(0)).toBe(1);
    });

    it('should handle factorial of 1', () => {
      expect(calc.factorial(1)).toBe(1);
    });

    it('should throw on negative numbers', () => {
      expect(() => calc.factorial(-1)).toThrow('Factorial of negative number');
    });
  });
});
