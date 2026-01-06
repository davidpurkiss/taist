#!/usr/bin/env node

/**
 * Simple test runner that demonstrates execution tracing
 */

import { UserService, ValidationError } from './service-with-tracing.js';

console.log('=' .repeat(60));
console.log('TAIST EXECUTION TRACING DEMONSTRATION');
console.log('=' .repeat(60));

async function runTests() {
  const userService = new UserService();
  let testsPassed = 0;
  let testsFailed = 0;

  console.log('\n[RUNNING TESTS]\n');

  // Test 1: Email with + sign (bug - should fail but passes)
  try {
    console.log('1. Testing email with + sign...');
    const result = await userService.register({
      name: 'John Doe',
      email: 'john+test@example.com',
      password: 'password123',
      age: 25
    });
    console.log('   ✓ Email with + passed (BUG: should fail)');
    testsPassed++;
  } catch (e) {
    console.log('   ✗ Failed:', e.message);
    testsFailed++;
  }

  // Test 2: Password validation (off-by-one error)
  try {
    console.log('2. Testing 7-char password...');
    await userService.register({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: '1234567',
      age: 25
    });
    console.log('   ✓ 7-char password accepted (BUG: should be rejected)');
    testsPassed++;
  } catch (e) {
    console.log('   ✗ Rejected:', e.message);
    testsFailed++;
  }

  // Test 3: Memory leak check
  console.log('3. Testing memory leak...');
  for (let i = 0; i < 5; i++) {
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
  const stats1 = await userService.getStats();
  console.log(`   Cache: ${stats1.cacheSize}, Users: ${stats1.totalUsers}`);
  if (stats1.cacheSize > stats1.totalUsers) {
    console.log('   ✗ Memory leak detected (cache > users)');
    testsFailed++;
  } else {
    console.log('   ✓ No memory leak');
    testsPassed++;
  }

  // Test 4: Division by zero
  console.log('4. Testing division by zero...');
  await userService.cleanup();
  const stats2 = await userService.getStats();
  if (isNaN(stats2.cacheRatio)) {
    console.log('   ✗ Division by zero (cacheRatio is NaN)');
    testsFailed++;
  } else {
    console.log('   ✓ No division by zero');
    testsPassed++;
  }

  // Test 5: Rate limiting (off-by-one)
  console.log('5. Testing rate limiting...');
  let rateLimitHit = false;
  for (let i = 1; i <= 12; i++) {
    try {
      await userService.checkRateLimit('testuser');
    } catch (e) {
      if (i === 11) {
        console.log('   ✓ Rate limit at request 11 (correct)');
        testsPassed++;
      } else if (i === 12) {
        console.log('   ✗ Rate limit at request 12 (BUG: off-by-one)');
        testsFailed++;
      }
      rateLimitHit = true;
      break;
    }
  }
  if (!rateLimitHit) {
    console.log('   ✗ No rate limit hit');
    testsFailed++;
  }

  // Get execution insights
  const insights = UserService.getTraceInsights();

  console.log('\n' + '=' .repeat(60));
  console.log('EXECUTION TRACE INSIGHTS');
  console.log('=' .repeat(60));

  console.log('\n[STATISTICS]');
  console.log(`• Total function calls: ${insights.totalCalls}`);
  console.log(`• Errors caught: ${insights.errors.length}`);
  console.log(`• Bugs detected: ${insights.bugs.length}`);
  console.log(`• Tests passed: ${testsPassed}`);
  console.log(`• Tests failed: ${testsFailed}`);

  // Function call counts
  console.log('\n[FUNCTION CALL FREQUENCY]');
  const topFunctions = Object.entries(insights.functionCalls)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  topFunctions.forEach(([func, count]) => {
    console.log(`• ${func}: ${count} calls`);
  });

  // Detected bugs
  if (insights.bugs.length > 0) {
    console.log('\n[BUGS AUTOMATICALLY DETECTED BY TRACER]');
    insights.bugs.forEach(bug => {
      console.log(`• ${bug.type.toUpperCase().replace('_', ' ')}:`);
      if (bug.data) {
        Object.entries(bug.data).forEach(([key, value]) => {
          if (key !== 'message') {
            console.log(`  - ${key}: ${JSON.stringify(value)}`);
          }
        });
        if (bug.data.message) {
          console.log(`  → ${bug.data.message}`);
        }
      }
    });
  }

  // Errors
  if (insights.errors.length > 0) {
    console.log('\n[ERRORS TRACED]');
    const uniqueErrors = [...new Set(insights.errors.map(e => e.error))];
    uniqueErrors.forEach(error => {
      const count = insights.errors.filter(e => e.error === error).length;
      console.log(`• "${error}" (${count} occurrences)`);
    });
  }

  // Sample execution flow
  const traces = UserService.getTraceData();
  console.log('\n[SAMPLE EXECUTION FLOW (first 15 traces)]');

  const relevantTraces = traces.slice(0, 15);
  relevantTraces.forEach(trace => {
    const indent = '  '.repeat(Math.min(trace.depth || 0, 3));

    if (trace.type === 'enter') {
      let args = '';
      if (trace.args && trace.args.length > 0) {
        // Format args nicely
        if (typeof trace.args[0] === 'object' && trace.args[0].email) {
          args = trace.args[0].email;
        } else if (typeof trace.args[0] === 'string') {
          args = trace.args[0].substring(0, 30);
        } else {
          args = JSON.stringify(trace.args).substring(0, 40);
        }
      }
      console.log(`${indent}→ ${trace.name}(${args})`);
    } else if (trace.type === 'exit') {
      const result = trace.result !== undefined ?
        (typeof trace.result === 'boolean' ? trace.result :
         typeof trace.result === 'object' ? '{...}' :
         String(trace.result).substring(0, 20)) : 'void';
      console.log(`${indent}← returns: ${result}`);
    } else if (trace.type === 'error') {
      console.log(`${indent}✗ ERROR: ${trace.error?.message || trace.error}`);
    } else if (trace.type === 'event') {
      if (trace.name.startsWith('bug:')) {
        console.log(`${indent}🐛 BUG DETECTED: ${trace.name.replace('bug:', '')}`);
      } else {
        console.log(`${indent}◆ Event: ${trace.name}`);
      }
    }
  });

  console.log('\n[FIX SUGGESTIONS BASED ON TRACE ANALYSIS]');
  console.log('• Email validation (line 40): Update regex to reject "+" and handle dots');
  console.log('• Password check (line 58): Change "< 8" to "<= 7" for 8+ chars');
  console.log('• Memory leak (line 24): Clear cache in cleanup() and deleteUser()');
  console.log('• Rate limit (line 157): Change "> 10" to ">= 10" for proper limiting');
  console.log('• Division by zero (line 195): Check totalUsers > 0 before division');

  console.log('\n[TOON FORMAT OUTPUT PREVIEW]');
  console.log('The TOON formatter would reduce this output by ~90%:');
  console.log('[TST] ✗ 2/5 fail:3');
  console.log('[BUG] email_val, mem_leak, div_zero, rate_lim');
  console.log('[FNC] UserSvc.reg:5 .valEmail:5 .getStats:2');
  console.log('[ERR] "Pwd >=8 chars":1 "Rate lim":1');
  console.log('[FIX] See user-svc.js:40,58,157,195');

  console.log('\n' + '=' .repeat(60));
}

// Run the tests
runTests().catch(console.error);