/**
 * HTTP Integration Tests for UserService
 *
 * KEY POINT: These tests make HTTP requests to a separate server process.
 * The server runs with instrumentation, so traces are collected FROM THE SERVER,
 * not from the test runner.
 *
 * This means Vitest needs NO special configuration:
 * - No deps.external
 * - No poolOptions.execArgv
 * - No server.deps.external
 *
 * These tests work identically against all three server variants:
 * - server-loader.js (ESM loader hooks)
 * - server-import.js (import-based)
 * - server-programmatic.js (programmatic)
 */

import { describe, it, expect, beforeEach } from 'vitest';

const BASE_URL = process.env.TEST_SERVER_URL || 'http://localhost:3456';

// Helper for making HTTP requests
async function request(method, path, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${path}`, options);
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

describe('UserService HTTP API Tests', () => {
  // Reset service state before each test
  beforeEach(async () => {
    await request('POST', '/cleanup');
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const { status, data } = await request('GET', '/health');
      expect(status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.approach).toBeDefined();
    });
  });

  describe('Email Validation', () => {
    it('should validate standard email addresses', async () => {
      const { status, data } = await request('POST', '/validate-email', {
        email: 'john@example.com'
      });
      expect(status).toBe(200);
      expect(data.valid).toBe(true);
    });

    it('should reject email with plus sign (known bug)', async () => {
      const { status, data } = await request('POST', '/validate-email', {
        email: 'jane+test@example.com'
      });
      // BUG: Current regex incorrectly rejects valid + emails
      expect(status).toBe(400);
      expect(data.type).toBe('ValidationError');
    });

    it('should handle email with multiple dots', async () => {
      const { status, data } = await request('POST', '/validate-email', {
        email: 'bob.smith@mail.example.com'
      });
      expect(status).toBe(200);
      expect(data.valid).toBe(true);
    });

    it('should reject invalid email format', async () => {
      const { status, data } = await request('POST', '/validate-email', {
        email: 'not-an-email'
      });
      expect(status).toBe(400);
      expect(data.type).toBe('ValidationError');
    });

    it('should reject empty email', async () => {
      const { status } = await request('POST', '/validate-email', {});
      expect(status).toBe(500);
    });
  });

  describe('User Registration', () => {
    it('should register a valid user', async () => {
      const { status, data } = await request('POST', '/users', {
        name: 'Alice Johnson',
        email: 'alice@test.com',
        password: 'securepass123',
        age: 30
      });
      expect(status).toBe(201);
      expect(data.id).toBeDefined();
      expect(data.name).toBe('Alice Johnson');
      expect(data.email).toBe('alice@test.com');
    });

    it('should reject missing name (known crash bug)', async () => {
      const { status } = await request('POST', '/users', {
        email: 'noname@test.com',
        password: 'password123',
        age: 25
      });
      // BUG: Will crash with "Cannot read properties of undefined"
      expect(status).toBe(500);
    });

    it('should handle short password (known off-by-one bug)', async () => {
      const { status } = await request('POST', '/users', {
        name: 'Short Pass',
        email: 'short@test.com',
        password: '1234567', // 7 characters
        age: 25
      });
      // BUG: 7-char password passes due to < instead of <=
      // When fixed, this should return 400
      expect(status).toBe(201); // Incorrectly succeeds
    });

    it('should handle string age (known type coercion bug)', async () => {
      const { status } = await request('POST', '/users', {
        name: 'String Age',
        email: 'stringage@test.com',
        password: 'password123',
        age: '25' // String instead of number
      });
      expect(status).toBe(201);
    });

    it('should reject underage user', async () => {
      const { status, data } = await request('POST', '/users', {
        name: 'Young User',
        email: 'young@test.com',
        password: 'password123',
        age: 16
      });
      expect(status).toBe(400);
      expect(data.type).toBe('ValidationError');
    });

    it('should prevent duplicate registration', async () => {
      // First registration
      await request('POST', '/users', {
        name: 'First User',
        email: 'duplicate@test.com',
        password: 'password123',
        age: 25
      });

      // Second registration with same email
      const { status, data } = await request('POST', '/users', {
        name: 'Second User',
        email: 'duplicate@test.com',
        password: 'password123',
        age: 25
      });
      expect(status).toBe(500);
      expect(data.error).toContain('already exists');
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      const userId = 'ratelimit-test-1';

      // Make 5 requests (well within limit)
      for (let i = 0; i < 5; i++) {
        const { status } = await request('POST', `/rate-limit/${userId}`);
        expect(status).toBe(200);
      }
    });

    it('should enforce rate limits (known off-by-one bug)', async () => {
      const userId = 'ratelimit-test-2';

      // Make 10 requests (should all succeed)
      for (let i = 0; i < 10; i++) {
        const { status } = await request('POST', `/rate-limit/${userId}`);
        expect(status).toBe(200);
      }

      // 11th request - BUG: should fail but succeeds due to > instead of >=
      const { status: status11 } = await request('POST', `/rate-limit/${userId}`);
      expect(status11).toBe(200); // Incorrectly succeeds

      // 12th request will finally fail
      const { status: status12 } = await request('POST', `/rate-limit/${userId}`);
      expect(status12).toBe(429);
    });
  });

  describe('Statistics', () => {
    it('should handle division by zero when no users (known bug)', async () => {
      const { status, data } = await request('GET', '/stats');
      expect(status).toBe(200);
      // BUG: Division by zero causes NaN/Infinity
      expect(data.totalUsers).toBe(0);
      // cacheRatio will be NaN or Infinity
    });

    it('should return valid stats with users', async () => {
      // Create a user first
      await request('POST', '/users', {
        name: 'Stats Test',
        email: 'stats@test.com',
        password: 'password123',
        age: 25
      });

      const { status, data } = await request('GET', '/stats');
      expect(status).toBe(200);
      expect(data.totalUsers).toBe(1);
      expect(data.cacheSize).toBeGreaterThanOrEqual(1);
    });
  });

  describe('User Management', () => {
    it('should get all users', async () => {
      // Create a user
      await request('POST', '/users', {
        name: 'Test User',
        email: 'getall@test.com',
        password: 'password123',
        age: 25
      });

      const { status, data } = await request('GET', '/users');
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });

    it('should delete user', async () => {
      // Create a user
      await request('POST', '/users', {
        name: 'Delete Me',
        email: 'delete@test.com',
        password: 'password123',
        age: 25
      });

      const { status } = await request('DELETE', '/users/delete@test.com');
      expect(status).toBe(200);
    });

    it('should return 404 for non-existent user deletion', async () => {
      const { status } = await request('DELETE', '/users/nonexistent@test.com');
      expect(status).toBe(404);
    });
  });

  describe('Cleanup', () => {
    it('should clean up users (known incomplete cleanup bug)', async () => {
      // Create a user
      await request('POST', '/users', {
        name: 'Cleanup Test',
        email: 'cleanup@test.com',
        password: 'password123',
        age: 25
      });

      // Cleanup
      const { status } = await request('POST', '/cleanup');
      expect(status).toBe(200);

      // Check stats
      const { data } = await request('GET', '/stats');
      expect(data.totalUsers).toBe(0);
      // BUG: cache is not cleared
      expect(data.cacheSize).toBeGreaterThan(0); // Should be 0 but isn't
    });
  });
});
