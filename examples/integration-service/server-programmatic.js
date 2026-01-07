#!/usr/bin/env node

/**
 * Server using Fully Programmatic Approach
 *
 * USAGE: node server-programmatic.js
 *
 * This approach gives you full control:
 * - Create ServiceTracer instance with explicit configuration
 * - Manually instrument what you want
 * - Can have multiple tracers for different components
 * - Most verbose but most flexible
 */

import express from 'express';
import { ServiceTracer } from '../../lib/service-tracer.js';
import { TraceReporter, getGlobalReporter } from '../../lib/trace-reporter.js';
import { UserService, ValidationError, RateLimitError } from './user-service.js';

// Create tracer with explicit configuration
const tracer = new ServiceTracer({
  enabled: process.env.TAIST_ENABLED !== 'false',
  depth: parseInt(process.env.TAIST_DEPTH) || 3,
  outputFormat: process.env.TAIST_FORMAT || 'toon',
});

// Set up reporter for Unix socket communication (if collector socket provided)
let reporter = null;
if (process.env.TAIST_COLLECTOR_SOCKET) {
  reporter = getGlobalReporter();
}

// Create and instrument the UserService manually
const userService = new UserService();
tracer.instrument(userService, 'UserService');

const app = express();
app.use(express.json());

// Middleware to trace all requests
app.use((req, res, next) => {
  const start = performance.now();
  const path = req.path;
  const method = req.method;

  res.on('finish', () => {
    const duration = performance.now() - start;
    if (reporter) {
      reporter.report({
        id: `req_${Date.now()}`,
        name: `HTTP.${method} ${path}`,
        type: 'exit',
        args: [{ method, path, statusCode: res.statusCode }],
        result: { statusCode: res.statusCode },
        duration,
        timestamp: Date.now(),
      });
    }
  });

  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    approach: 'programmatic',
    description: 'Fully Programmatic (ServiceTracer class)',
    timestamp: new Date().toISOString()
  });
});

// POST /users - Register a new user
app.post('/users', async (req, res) => {
  try {
    const user = await userService.register(req.body);
    res.status(201).json(user);
  } catch (error) {
    const status = error instanceof ValidationError ? 400 : 500;
    res.status(status).json({ error: error.message, type: error.name });
  }
});

// GET /users - Get all users
app.get('/users', (req, res) => {
  try {
    const users = userService.getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /users/:email - Delete user
app.delete('/users/:email', (req, res) => {
  try {
    userService.deleteUser(req.params.email);
    res.json({ success: true });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// POST /validate-email - Validate email format
app.post('/validate-email', (req, res) => {
  try {
    const valid = userService.validateEmail(req.body.email);
    res.json({ valid });
  } catch (error) {
    const status = error instanceof ValidationError ? 400 : 500;
    res.status(status).json({ error: error.message, type: error.name });
  }
});

// POST /rate-limit/:userId - Check rate limit
app.post('/rate-limit/:userId', (req, res) => {
  try {
    userService.checkRateLimit(req.params.userId);
    res.json({ allowed: true });
  } catch (error) {
    const status = error instanceof RateLimitError ? 429 : 500;
    res.status(status).json({ error: error.message, type: error.name });
  }
});

// GET /stats - Get service statistics
app.get('/stats', (req, res) => {
  try {
    const stats = userService.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /cleanup - Reset the service state
app.post('/cleanup', (req, res) => {
  userService.cleanup();
  res.json({ success: true });
});

// Start server
const PORT = process.env.PORT || 3456;
const server = app.listen(PORT, () => {
  console.log(`[PROGRAMMATIC] Server running on port ${PORT}`);
  console.log(`[PROGRAMMATIC] Instrumentation: ServiceTracer class`);
  console.log(`[PROGRAMMATIC] Config: Explicit in code`);
  console.log(`[PROGRAMMATIC] Tracer enabled: ${tracer.options.enabled}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[PROGRAMMATIC] Shutting down...');
  if (reporter) {
    reporter.flush();
  }
  server.close(() => process.exit(0));
});

export { app, server, tracer };
