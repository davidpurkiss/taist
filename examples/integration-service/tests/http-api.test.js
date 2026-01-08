/**
 * HTTP Integration Tests for UserService with Nested Trace Output
 *
 * This test file:
 * 1. Starts a trace session (collector + formatter)
 * 2. Starts server-import.js with instrumentation
 * 3. Runs HTTP tests against the server
 * 4. Displays nested traces showing call hierarchy
 *
 * Run with: npx vitest run tests/http-api.test.js
 *
 * The traces show the full call hierarchy with depth-based indentation:
 *   fn:Route.POST /users depth:0
 *     fn:UserService.register depth:1
 *       fn:UserService.validateEmail depth:2
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { TraceSession } from '../../../testing.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.TEST_PORT || 3458;
const BASE_URL = `http://localhost:${PORT}`;

// Shared state
let session;
let serverProcess;

// Helper for making HTTP requests
async function request(method, urlPath, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${urlPath}`, options);
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

async function waitForServer(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return await response.json();
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Server failed to start within timeout');
}

describe('UserService HTTP API with Nested Traces', () => {
  beforeAll(async () => {
    // Start trace session
    session = new TraceSession();
    await session.start();

    // Start server-import.js with tracing
    const serverPath = path.join(__dirname, '..', 'server-import.js');

    serverProcess = spawn('node', [serverPath], {
      env: {
        ...process.env,
        ...session.getEnv(),
        PORT: String(PORT),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Capture stderr for debugging
    let stderr = '';
    serverProcess.stderr.on('data', (d) => {
      stderr += d.toString();
      if (process.env.TAIST_DEBUG) process.stderr.write(d);
    });

    try {
      await waitForServer();
    } catch (err) {
      console.error('Server failed to start');
      if (stderr) console.error('Stderr:', stderr);
      throw err;
    }
  }, 15000); // 15s timeout for server start

  afterAll(async () => {
    // Wait for final traces
    await new Promise(r => setTimeout(r, 300));

    // Stop server
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 200));
    }

    // Print traces and stop session
    session.printTraces({ maxGroups: 5 });
    await session.stop();
  });

  // Reset service state before each test
  beforeEach(async () => {
    await request('POST', '/cleanup');
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const { status, data } = await request('GET', '/health');
      expect(status).toBe(200);
      expect(data.status).toBe('ok');
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

    it('should reject invalid email format', async () => {
      const { status, data } = await request('POST', '/validate-email', {
        email: 'not-an-email'
      });
      expect(status).toBe(400);
      expect(data.type).toBe('ValidationError');
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
    });

    it('should reject missing name (causes crash)', async () => {
      const { status } = await request('POST', '/users', {
        email: 'noname@test.com',
        password: 'password123',
        age: 25
      });
      expect(status).toBe(500);
    });

    it('should handle short password (off-by-one bug)', async () => {
      const { status } = await request('POST', '/users', {
        name: 'Short Pass',
        email: 'short@test.com',
        password: '1234567', // 7 characters
        age: 25
      });
      // BUG: 7-char password passes due to < instead of <=
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
      await request('POST', '/users', {
        name: 'First User',
        email: 'duplicate@test.com',
        password: 'password123',
        age: 25
      });

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
      const userId = 'ratelimit-test';
      for (let i = 0; i < 5; i++) {
        const { status } = await request('POST', `/rate-limit/${userId}`);
        expect(status).toBe(200);
      }
    });

    it('should enforce rate limits (off-by-one bug)', async () => {
      const userId = 'ratelimit-overflow';

      // Make 11 requests
      for (let i = 0; i < 11; i++) {
        await request('POST', `/rate-limit/${userId}`);
      }

      // 12th request should fail
      const { status } = await request('POST', `/rate-limit/${userId}`);
      expect(status).toBe(429);
    });
  });

  describe('Statistics', () => {
    it('should return stats', async () => {
      const { status, data } = await request('GET', '/stats');
      expect(status).toBe(200);
      expect(data.totalUsers).toBeDefined();
    });
  });

  describe('User Management', () => {
    it('should get all users', async () => {
      await request('POST', '/users', {
        name: 'Test User',
        email: 'getall@test.com',
        password: 'password123',
        age: 25
      });

      const { status, data } = await request('GET', '/users');
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });

    it('should delete user', async () => {
      await request('POST', '/users', {
        name: 'Delete Me',
        email: 'delete@test.com',
        password: 'password123',
        age: 25
      });

      const { status } = await request('DELETE', '/users/delete@test.com');
      expect(status).toBe(200);
    });
  });
});