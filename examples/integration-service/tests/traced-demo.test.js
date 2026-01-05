/**
 * Demo test file that uses the instrumented UserService
 * This demonstrates how execution tracing captures service behavior
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { UserService, ValidationError, RateLimitError } from '../service-with-tracing.js';

describe('UserService with Execution Tracing Demo', () => {
  let userService;

  beforeEach(() => {
    UserService.clearTraces();
    userService = new UserService();
  });

  afterEach(() => {
    userService.cleanup();
  });

  afterAll(() => {
    // Output the trace insights at the end
    const insights = UserService.getTraceInsights();
    console.log('\n' + '='.repeat(60));
    console.log('EXECUTION TRACE INSIGHTS');
    console.log('='.repeat(60));

    console.log('\n[STATISTICS]');
    console.log(`Total function calls: ${insights.totalCalls}`);
    console.log(`Errors caught: ${insights.errors.length}`);
    console.log(`Bugs detected: ${insights.bugs.length}`);

    if (Object.keys(insights.functionCalls).length > 0) {
      console.log('\n[FUNCTION CALLS]');
      Object.entries(insights.functionCalls)
        .sort((a, b) => b[1] - a[1])
        .forEach(([func, count]) => {
          console.log(`  ${func}: ${count} calls`);
        });
    }

    if (insights.bugs.length > 0) {
      console.log('\n[BUGS DETECTED]');
      insights.bugs.forEach(bug => {
        console.log(`  • ${bug.type}:`);
        if (bug.data) {
          Object.entries(bug.data).forEach(([key, value]) => {
            console.log(`    - ${key}: ${JSON.stringify(value)}`);
          });
        }
      });
    }

    if (insights.errors.length > 0) {
      console.log('\n[ERRORS CAPTURED]');
      insights.errors.forEach(error => {
        console.log(`  • ${error.function}: ${error.error}`);
      });
    }

    if (insights.slowOperations.length > 0) {
      console.log('\n[SLOW OPERATIONS]');
      insights.slowOperations.forEach(op => {
        console.log(`  • ${op.function}: ${op.duration.toFixed(2)}ms`);
      });
    }

    // Output detailed trace for debugging
    const traces = UserService.getTraceData();
    console.log('\n[SAMPLE EXECUTION FLOW]');
    const sampleTraces = traces.slice(0, 20);
    sampleTraces.forEach(trace => {
      const indent = '  '.repeat((trace.depth || 0) + 1);
      if (trace.type === 'enter') {
        const args = trace.args ? JSON.stringify(trace.args).substring(0, 50) : '';
        console.log(`${indent}→ ${trace.name}(${args})`);
      } else if (trace.type === 'exit') {
        const result = trace.result !== undefined ?
          JSON.stringify(trace.result).substring(0, 30) : 'void';
        console.log(`${indent}← ${result}`);
      } else if (trace.type === 'error') {
        console.log(`${indent}✗ ${trace.error?.message || trace.error}`);
      } else if (trace.type === 'event') {
        console.log(`${indent}◆ ${trace.name}`);
      }
    });

    console.log('\n' + '='.repeat(60));
  });

  describe('Trace Email Validation Bug', () => {
    it('should detect email with + passing validation', async () => {
      const user = {
        name: 'Test User',
        email: 'test+tag@example.com',
        password: 'password123',
        age: 25
      };

      // This should fail but doesn't (bug)
      const result = await userService.register(user);
      expect(result.email).toBe('test+tag@example.com');

      // Check that the bug was detected in traces
      const insights = UserService.getTraceInsights();
      const emailBug = insights.bugs.find(b => b.type === 'email_validation');
      expect(emailBug).toBeDefined();
    });
  });

  describe('Trace Password Validation Bug', () => {
    it('should detect off-by-one error in password validation', async () => {
      const user = {
        name: 'Test User',
        email: 'test@example.com',
        password: '1234567', // 7 characters
        age: 25
      };

      // This should pass but fails due to off-by-one error
      await expect(userService.register(user)).rejects.toThrow(ValidationError);

      // Check that the error was traced
      const insights = UserService.getTraceInsights();
      const passwordError = insights.errors.find(e =>
        e.error.includes('Password must be at least 8')
      );
      expect(passwordError).toBeDefined();
    });
  });

  describe('Trace Memory Leak', () => {
    it('should detect cache memory leak', async () => {
      // Register multiple users
      for (let i = 0; i < 3; i++) {
        try {
          await userService.register({
            name: `User ${i}`,
            email: `user${i}@test.com`,
            password: 'password123',
            age: 25
          });
        } catch (e) {
          // Ignore occasional failures
        }
      }

      const stats = userService.getStats();

      // Check that memory leak was detected
      const insights = UserService.getTraceInsights();
      const memoryLeak = insights.bugs.find(b => b.type === 'memory_leak');

      if (stats.totalUsers > 0) {
        expect(memoryLeak).toBeDefined();
        expect(stats.cacheSize).toBeGreaterThan(stats.totalUsers);
      }
    });
  });

  describe('Trace Division by Zero', () => {
    it('should detect division by zero in stats', () => {
      const stats = userService.getStats();

      // With no users, cacheRatio will be NaN (0/0)
      expect(isNaN(stats.cacheRatio)).toBe(true);

      // Check that the bug was detected
      const insights = UserService.getTraceInsights();
      const divisionBug = insights.bugs.find(b => b.type === 'division_by_zero');
      expect(divisionBug).toBeDefined();
    });
  });

  describe('Trace Rate Limiting Bug', () => {
    it('should detect off-by-one error in rate limiting', () => {
      const userId = 'testuser';
      let failedAt = 0;

      // Make 12 requests to find where it fails
      for (let i = 1; i <= 12; i++) {
        try {
          userService.checkRateLimit(userId);
        } catch (error) {
          if (!failedAt) failedAt = i;
        }
      }

      // Should fail at request 11 but fails at 12 due to bug
      expect(failedAt).toBe(12);

      // Check that rate limit errors were traced
      const insights = UserService.getTraceInsights();
      const rateLimitErrors = insights.errors.filter(e =>
        e.error.includes('Rate limit')
      );
      expect(rateLimitErrors.length).toBeGreaterThan(0);
    });
  });
});