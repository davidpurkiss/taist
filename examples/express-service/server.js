/**
 * Example Express Server with Taist Instrumentation
 *
 * Run with monitoring:
 *   TAIST_ENABLED=true node server.js
 *
 * Or use the CLI:
 *   taist monitor server.js
 */

// Enable Taist instrumentation (must be first import)
import { tracer, instrumentExpress, instrumentService } from '../../instrument.js';
import express from 'express';

// Example service class to instrument
class UserService {
  constructor() {
    this.users = new Map();
    this.nextId = 1;
  }

  async createUser(data) {
    // Simulate async operation
    await this.delay(50);

    if (!data.name || !data.email) {
      throw new Error('Name and email are required');
    }

    const user = {
      id: this.nextId++,
      ...data,
      createdAt: new Date()
    };

    this.users.set(user.id, user);
    return user;
  }

  async getUser(id) {
    await this.delay(20);
    const user = this.users.get(parseInt(id));
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  async listUsers() {
    await this.delay(10);
    return Array.from(this.users.values());
  }

  async updateUser(id, data) {
    await this.delay(30);
    const user = this.users.get(parseInt(id));
    if (!user) {
      throw new Error('User not found');
    }

    Object.assign(user, data, { updatedAt: new Date() });
    return user;
  }

  async deleteUser(id) {
    await this.delay(25);
    const deleted = this.users.delete(parseInt(id));
    if (!deleted) {
      throw new Error('User not found');
    }
    return { success: true };
  }

  // Intentionally slow operation for demo
  async searchUsers(query) {
    await this.delay(150); // Slow operation

    const results = Array.from(this.users.values()).filter(user =>
      user.name?.toLowerCase().includes(query.toLowerCase()) ||
      user.email?.toLowerCase().includes(query.toLowerCase())
    );

    return results;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create and instrument the service
const userService = instrumentService(new UserService(), 'UserService');

// Create Express app
const app = express();
app.use(express.json());

// Instrument the Express app
instrumentExpress(app);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    tracing: tracer.options.enabled ? 'enabled' : 'disabled'
  });
});

// Get trace insights
app.get('/trace/insights', (req, res) => {
  if (!tracer.options.enabled) {
    return res.status(404).json({ error: 'Tracing not enabled' });
  }

  const insights = tracer.getInsights();
  res.json(insights);
});

// Get formatted trace output
app.get('/trace/output', (req, res) => {
  if (!tracer.options.enabled) {
    return res.status(404).json({ error: 'Tracing not enabled' });
  }

  const format = req.query.format || 'toon';
  const originalFormat = tracer.options.outputFormat;
  tracer.options.outputFormat = format;

  const insights = tracer.getInsights();
  const output = tracer.formatOutput(insights);

  tracer.options.outputFormat = originalFormat;

  res.type('text/plain').send(output);
});

// User CRUD endpoints
app.post('/users', async (req, res) => {
  try {
    const user = await userService.createUser(req.body);
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/users', async (req, res) => {
  try {
    const users = await userService.listUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/users/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Query parameter required' });
    }

    const results = await userService.searchUsers(q);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/users/:id', async (req, res) => {
  try {
    const user = await userService.getUser(req.params.id);
    res.json(user);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.put('/users/:id', async (req, res) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body);
    res.json(user);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.delete('/users/:id', async (req, res) => {
  try {
    const result = await userService.deleteUser(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// Error simulation endpoint (for testing)
app.get('/error', (req, res) => {
  throw new Error('Intentional error for testing');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  if (tracer.options.enabled) {
    console.log('\nTracing enabled! View insights at:');
    console.log(`  http://localhost:${PORT}/trace/insights - JSON insights`);
    console.log(`  http://localhost:${PORT}/trace/output - Formatted output`);
    console.log(`  http://localhost:${PORT}/trace/output?format=toon - TOON format`);
    console.log(`  http://localhost:${PORT}/trace/output?format=json - JSON format`);
    console.log(`  http://localhost:${PORT}/trace/output?format=compact - Compact format`);
  }
});

export default app;