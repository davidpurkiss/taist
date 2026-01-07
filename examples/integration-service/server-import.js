#!/usr/bin/env node

/**
 * Server using Import-based Approach
 *
 * USAGE: node server-import.js
 *
 * This approach uses the taist/instrument module:
 * - Import 'taist/instrument' at the top of your entry point
 * - Use instrumentService() and instrumentExpress() helpers
 * - Configuration via environment variables (TAIST_ENABLED, TAIST_DEPTH, etc.)
 * - Good for gradual adoption into existing projects
 */

// IMPORTANT: Import taist/instrument FIRST - before other imports
// This sets up the global tracer from environment variables
import '../../instrument.js';
import { instrumentExpress, instrumentService } from '../../instrument.js';
import { getGlobalReporter } from '../../lib/trace-reporter.js';

import express from 'express';
import { UserService, ValidationError, RateLimitError } from './user-service.js';

const app = express();
app.use(express.json());

// Get the reporter for sending traces to the collector
const reporter = getGlobalReporter();

// Add middleware to trace HTTP requests (sends to collector)
app.use((req, res, next) => {
  const start = performance.now();
  const path = req.path;
  const method = req.method;

  res.on('finish', () => {
    const duration = performance.now() - start;
    reporter.report({
      id: `req_${Date.now()}`,
      name: `HTTP.${method} ${path}`,
      type: 'exit',
      args: [{ method, path, statusCode: res.statusCode }],
      result: { statusCode: res.statusCode },
      duration,
      timestamp: Date.now(),
    });
  });

  next();
});

// Instrument Express app (wraps route handlers)
instrumentExpress(app);

// Create and instrument the UserService
const rawUserService = new UserService();
const userService = instrumentService(rawUserService, 'UserService');

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    approach: 'import',
    description: 'Import-based (import taist/instrument)',
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
  console.log(`[IMPORT] Server running on port ${PORT}`);
  console.log(`[IMPORT] Instrumentation: import 'taist/instrument'`);
  console.log(`[IMPORT] Config: Environment variables`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[IMPORT] Shutting down...');
  server.close(() => process.exit(0));
});

export { app, server };
