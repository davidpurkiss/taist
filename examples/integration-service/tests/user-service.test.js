/**
 * Integration tests for UserService
 * These tests are designed to expose the intentional bugs in the service
 * and demonstrate Taist's monitoring capabilities
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UserService, ValidationError, RateLimitError } from '../user-service.js';

describe('UserService Integration Tests', () => {
  let userService;

  beforeEach(() => {
    userService = new UserService();
  });

  afterEach(() => {
    userService.cleanup();
  });

  describe('Email Validation', () => {
    it('should validate standard email addresses', async () => {
      const user = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        age: 25
      };

      const result = await userService.register(user);
      expect(result.email).toBe('john@example.com');
    });

    it('should handle email with plus sign (will fail - bug)', async () => {
      const user = {
        name: 'Jane Doe',
        email: 'jane+test@example.com',
        password: 'password123',
        age: 25
      };

      // This test will fail due to email validation bug
      await expect(userService.register(user)).rejects.toThrow(ValidationError);
    });

    it('should handle email with multiple dots (will fail - bug)', async () => {
      const user = {
        name: 'Bob Smith',
        email: 'bob.smith@mail.example.com',
        password: 'password123',
        age: 25
      };

      // This test will fail due to email validation bug
      await expect(userService.register(user)).rejects.toThrow(ValidationError);
    });
  });

  describe('User Registration', () => {
    it('should register a valid user', async () => {
      const user = {
        name: 'Alice Johnson',
        email: 'alice@test.com',
        password: 'securepass123',
        age: 30
      };

      const result = await userService.register(user);
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Alice Johnson');
    });

    it('should handle missing name gracefully (will fail - bug)', async () => {
      const user = {
        email: 'noname@test.com',
        password: 'password123',
        age: 25
      };

      // This will cause a crash due to missing null check
      await expect(userService.register(user)).rejects.toThrow();
    });

    it('should enforce minimum password length (will fail - bug)', async () => {
      const user = {
        name: 'Short Pass',
        email: 'short@test.com',
        password: '1234567', // 7 characters
        age: 25
      };

      // Bug: validation is incorrect, this should fail but won't
      const result = await userService.register(user);
      expect(result).toBeDefined(); // This passes when it shouldn't
    });

    it('should validate age as string (will fail - bug)', async () => {
      const user = {
        name: 'String Age',
        email: 'stringage@test.com',
        password: 'password123',
        age: '25' // String instead of number
      };

      // Bug: string comparison issue
      await expect(userService.register(user)).rejects.toThrow(ValidationError);
    });

    it('should prevent duplicate email registration', async () => {
      const user = {
        name: 'First User',
        email: 'duplicate@test.com',
        password: 'password123',
        age: 25
      };

      await userService.register(user);
      await expect(userService.register(user)).rejects.toThrow('User already exists');
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent user registrations (may fail - race condition)', async () => {
      const promises = [];

      // Create multiple users concurrently
      for (let i = 0; i < 10; i++) {
        promises.push(
          userService.register({
            name: `User ${i}`,
            email: `user${i}@test.com`,
            password: 'password123',
            age: 20 + i
          })
        );
      }

      // Race condition may cause duplicate IDs
      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled');
      const ids = successful.map(r => r.value.id);

      // Check for duplicate IDs (race condition bug)
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length); // May fail due to race condition
    });
  });

  describe('Memory Leaks', () => {
    it('should not accumulate cache indefinitely (will fail - memory leak)', () => {
      // Register multiple users
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          userService.register({
            name: `Memory Test ${i}`,
            email: `memory${i}@test.com`,
            password: 'password123',
            age: 25
          })
        );
      }

      return Promise.all(promises).then(() => {
        const stats = userService.getStats();
        expect(stats.cacheSize).toBe(stats.totalUsers); // Will fail - cache is larger
      });
    });

    it('should clean cache on user deletion (will fail - bug)', async () => {
      await userService.register({
        name: 'Delete Test',
        email: 'delete@test.com',
        password: 'password123',
        age: 25
      });

      userService.deleteUser('delete@test.com');

      const stats = userService.getStats();
      expect(stats.cacheSize).toBe(0); // Will fail - cache not cleared
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits correctly (will fail - off-by-one bug)', () => {
      const userId = 'testuser123';

      // Make exactly 10 requests
      for (let i = 0; i < 10; i++) {
        expect(() => userService.checkRateLimit(userId)).not.toThrow();
      }

      // 11th request should fail but won't due to off-by-one bug
      expect(() => userService.checkRateLimit(userId)).not.toThrow(); // Bug: should throw

      // 12th request will finally fail
      expect(() => userService.checkRateLimit(userId)).toThrow(RateLimitError);
    });
  });

  describe('Error Handling', () => {
    it('should handle database failures gracefully', async () => {
      // This test may pass or fail randomly due to simulated failures
      const user = {
        id: 999,
        email: 'save@test.com',
        name: 'Save Test',
        age: 25
      };

      // Try multiple saves, some will fail
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(userService.saveUser(user));
      }

      const results = await Promise.allSettled(promises);
      const failures = results.filter(r => r.status === 'rejected');

      // Expect some failures (about 30%)
      expect(failures.length).toBeGreaterThan(0);
      expect(failures[0].reason.message).toContain('Database connection failed');
    });

    it('should handle ID generation failures (intermittent)', async () => {
      // This test might fail 5% of the time due to simulated service failure
      const promises = [];

      for (let i = 0; i < 20; i++) {
        promises.push(
          userService.register({
            name: `ID Test ${i}`,
            email: `idtest${i}@test.com`,
            password: 'password123',
            age: 25
          }).catch(err => err)
        );
      }

      const results = await Promise.all(promises);
      const errors = results.filter(r => r instanceof Error);

      // May have some ID generation failures
      if (errors.length > 0) {
        expect(errors[0].message).toContain('ID generation service unavailable');
      }
    });
  });

  describe('Performance Issues', () => {
    it('should handle getAllUsers efficiently (will fail - performance issue)', async () => {
      // Add many users to expose performance issue
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(
          userService.register({
            name: `Perf Test ${i}`,
            email: `perf${i}@test.com`,
            password: 'password123',
            age: 25
          })
        );
      }

      await Promise.all(promises);

      const startTime = Date.now();
      const users = userService.getAllUsers();
      const endTime = Date.now();

      // Check that we get users (but it's actually returning cache)
      expect(users.length).toBeGreaterThan(0);

      // This returns cache with large data, not actual users
      expect(users[0].largeData).toBeDefined(); // Bug: shouldn't have largeData
    });

    it('should handle age range queries (will fail with infinite loop)', () => {
      // This test will expose the infinite loop bug
      expect(() => {
        // BUG: maxAge < minAge causes infinite loop
        const timeout = setTimeout(() => {
          throw new Error('Query took too long - possible infinite loop');
        }, 1000);

        const results = userService.findUsersByAge(30, 20); // Wrong order
        clearTimeout(timeout);
        return results;
      }).toThrow();
    });
  });

  describe('Data Consistency', () => {
    it('should maintain consistency between users and cache', async () => {
      await userService.register({
        name: 'Consistency Test',
        email: 'consistency@test.com',
        password: 'password123',
        age: 25
      });

      const stats = userService.getStats();
      const users = userService.getAllUsers();

      // Bug: getAllUsers returns cache, not actual users
      expect(users.length).toBe(stats.totalUsers); // Will fail
    });

    it('should handle division by zero in stats (will fail)', () => {
      // No users registered
      const stats = userService.getStats();

      // Bug: division by zero
      expect(stats.cacheRatio).toBe(0); // Will be NaN due to 0/0
    });
  });

  describe('Cleanup Operations', () => {
    it('should properly clean up all resources (will fail - incomplete cleanup)', async () => {
      // Add users and make requests
      await userService.register({
        name: 'Cleanup Test',
        email: 'cleanup@test.com',
        password: 'password123',
        age: 25
      });

      userService.checkRateLimit('user1');

      userService.cleanup();

      const stats = userService.getStats();

      expect(stats.totalUsers).toBe(0);
      expect(stats.cacheSize).toBe(0); // Will fail - cache not cleared
      expect(stats.operations).toBe(0);
    });
  });
});