/**
 * Example tests with failures to demonstrate TOON output
 */

import { describe, it, expect } from 'vitest';

describe('Failing Tests', () => {
  it('should fail with wrong expectation', () => {
    const result = 2 + 2;
    expect(result).toBe(5); // This will fail
  });

  it('should fail with object mismatch', () => {
    const user = { name: 'Alice', age: 30 };
    expect(user).toEqual({ name: 'Bob', age: 30 });
  });

  it('should pass', () => {
    expect(true).toBe(true);
  });

  it('should fail with array mismatch', () => {
    const arr = [1, 2, 3];
    expect(arr).toEqual([1, 2, 4]);
  });
});
