#!/usr/bin/env node

/**
 * Server using Import-based Approach with Context-Aware Tracing
 *
 * USAGE: node server-import.js
 *
 * This approach demonstrates the simplified instrumentation API:
 * - instrumentExpress() automatically creates trace roots for each HTTP request
 * - instrumentServiceWithContext() wraps services with depth-aware tracing
 * - All traces within a request share the same traceId and show proper nesting
 *
 * Example trace output:
 *   fn:Route.POST /users ms:45 depth:0
 *     fn:UserService.register ms:30 depth:1
 *       fn:UserService.validateEmail ms:5 depth:2
 */

// IMPORTANT: Import taist/instrument FIRST - before other imports
import '../../instrument.js';
import { instrumentExpress, instrumentServiceWithContext } from '../../instrument.js';

import express from 'express';
import { UserService, ValidationError, RateLimitError } from './user-service.js';

const app = express();
app.use(express.json());

// Instrument Express app - each request becomes a trace root (depth 0)
// All routes registered AFTER this call will have context-aware tracing
instrumentExpress(app);

// Create and instrument the UserService with context propagation
// When called from a route handler, UserService methods will be depth 1+
const userService = instrumentServiceWithContext(new UserService(), 'UserService');

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    approach: 'import-context',
    description: 'Import-based with context-aware tracing',
    timestamp: new Date().toISOString()
  });
});

// POST /users - Register a new user
// Trace: Route.POST /users (depth 0) -> UserService.register (depth 1) -> UserService.validateEmail (depth 2)
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
  console.log(`[IMPORT] Context-aware tracing enabled`);
  console.log(`[IMPORT] Routes will show nested traces`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[IMPORT] Shutting down...');
  server.close(() => process.exit(0));
});

export { app, server };
