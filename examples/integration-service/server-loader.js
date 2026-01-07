#!/usr/bin/env node

/**
 * Server using ESM Loader Hooks Approach
 *
 * USAGE: node --import ../../lib/module-patcher.js server-loader.js
 *
 * This is the cleanest approach:
 * - No taist imports needed in this file
 * - Instrumentation happens automatically via ESM loader hooks
 * - Configuration via .taistrc.json (include/exclude patterns)
 * - Zero code changes to your service
 */

import express from 'express';
import { UserService, ValidationError, RateLimitError } from './user-service.js';

const app = express();
app.use(express.json());

// Create a shared UserService instance
// When loaded via --import taist/module-patcher, this is auto-instrumented
const userService = new UserService();

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    approach: 'loader',
    description: 'ESM Loader Hooks (node --import)',
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
  console.log(`[LOADER] Server running on port ${PORT}`);
  console.log(`[LOADER] Instrumentation: ESM Loader Hooks`);
  console.log(`[LOADER] Config: .taistrc.json`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[LOADER] Shutting down...');
  server.close(() => process.exit(0));
});

export { app, server };
