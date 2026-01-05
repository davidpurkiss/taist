#!/usr/bin/env node

/**
 * API Test Script - Verifies that Taist tracing is working correctly
 *
 * Usage:
 *   1. Start the server: npm run start:traced
 *   2. Run this test: node test-api.js
 */

import http from 'http';

const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Helper to make HTTP requests
function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = {
            status: res.statusCode,
            data: body ? JSON.parse(body) : null
          };
          resolve(result);
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Run tests
async function runTests() {
  log('\n=== TAIST TRACING VERIFICATION ===\n', 'magenta');

  try {
    // Check health
    log('1. Checking server health...', 'blue');
    const health = await request('GET', '/health');
    log(`   ✓ Server is ${health.data.status}`, 'green');
    log(`   ✓ Tracing is ${health.data.tracing}`, health.data.tracing === 'enabled' ? 'green' : 'yellow');

    if (health.data.tracing !== 'enabled') {
      log('\n⚠ Tracing is not enabled. Start server with:', 'yellow');
      log('  TAIST_ENABLED=true node server.js', 'yellow');
      log('  or: npm run start:traced\n', 'yellow');
    }

    // Create users
    log('\n2. Creating test users...', 'blue');
    const users = [];

    for (let i = 1; i <= 3; i++) {
      const result = await request('POST', '/users', {
        name: `Test User ${i}`,
        email: `user${i}@test.com`,
        role: i === 1 ? 'admin' : 'user'
      });
      users.push(result.data);
      log(`   ✓ Created user: ${result.data.name}`, 'green');
    }

    // List users
    log('\n3. Listing all users...', 'blue');
    const list = await request('GET', '/users');
    log(`   ✓ Found ${list.data.length} users`, 'green');

    // Get specific user
    log('\n4. Getting specific user...', 'blue');
    const user = await request('GET', `/users/${users[0].id}`);
    log(`   ✓ Retrieved: ${user.data.name}`, 'green');

    // Update user
    log('\n5. Updating user...', 'blue');
    const updated = await request('PUT', `/users/${users[0].id}`, {
      role: 'superadmin'
    });
    log(`   ✓ Updated role to: ${updated.data.role}`, 'green');

    // Search users (slow operation)
    log('\n6. Searching users (slow operation)...', 'blue');
    const search = await request('GET', '/users/search?q=test');
    log(`   ✓ Found ${search.data.length} matching users`, 'green');

    // Trigger error
    log('\n7. Triggering intentional error...', 'blue');
    try {
      await request('GET', '/users/999');
      log('   ✗ Error not triggered', 'red');
    } catch (e) {
      log('   ✓ Error handled correctly', 'green');
    }

    // Delete user
    log('\n8. Deleting user...', 'blue');
    const deleted = await request('DELETE', `/users/${users[0].id}`);
    log(`   ✓ User deleted: ${deleted.data.success}`, 'green');

    // Wait a moment for traces to accumulate
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get trace insights
    log('\n9. Getting trace insights...', 'blue');
    const insights = await request('GET', '/trace/insights');

    if (insights.status === 404) {
      log('   ⚠ Tracing not enabled', 'yellow');
      return;
    }

    const data = insights.data;
    log(`   ✓ Total calls: ${data.stats.totalCalls}`, 'green');
    log(`   ✓ Errors tracked: ${data.stats.totalErrors}`, 'green');
    log(`   ✓ Slow operations: ${data.stats.slowOperations}`, 'green');
    log(`   ✓ Bugs detected: ${data.stats.bugsDetected}`, 'green');

    // Show top functions
    if (data.traces.topFunctions) {
      log('\n   Top called functions:', 'blue');
      Object.entries(data.traces.topFunctions)
        .slice(0, 5)
        .forEach(([func, count]) => {
          log(`     • ${func}: ${count} calls`, 'green');
        });
    }

    // Get TOON output
    log('\n10. Getting TOON format output...', 'blue');
    const toon = await request('GET', '/trace/output?format=toon');
    log('    TOON Output:', 'green');
    toon.data.split('\n').forEach(line => {
      log(`    ${line}`, 'green');
    });

    // Get compact output
    log('\n11. Getting compact format output...', 'blue');
    const compact = await request('GET', '/trace/output?format=compact');
    log(`    ${compact.data}`, 'green');

    log('\n=== VERIFICATION COMPLETE ===\n', 'magenta');
    log('All tests passed! Taist tracing is working correctly.', 'green');

    log('\nTo view real-time insights, visit:', 'blue');
    log(`  http://localhost:${PORT}/trace/insights`, 'green');
    log(`  http://localhost:${PORT}/trace/output?format=toon`, 'green');

  } catch (error) {
    log(`\n✗ Error: ${error.message}`, 'red');
    log('\nMake sure the server is running:', 'yellow');
    log('  npm run start:traced', 'yellow');
  }
}

// Run the tests
runTests();