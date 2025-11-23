/**
 * Test fixtures - sample test results for testing
 */

export const passingResults = {
  stats: {
    total: 5,
    passed: 5,
    failed: 0,
    skipped: 0
  },
  failures: [],
  duration: 123
};

export const failingResults = {
  stats: {
    total: 5,
    passed: 2,
    failed: 3,
    skipped: 0
  },
  failures: [
    {
      test: 'Calculator > add > should add two numbers',
      location: {
        file: '/home/user/test/calculator.test.js',
        line: 10,
        column: 5
      },
      error: 'expected 5 to be 6',
      diff: {
        expected: 6,
        actual: 5
      },
      stack: `AssertionError: expected 5 to be 6
    at /home/user/test/calculator.test.js:10:23
    at processTicksAndRejections (node:internal/process/task_queues:95:5)`
    },
    {
      test: 'User validation > should validate email',
      location: 'test/user.test.js:25',
      error: 'Invalid email format',
      diff: {
        expected: true,
        actual: false
      }
    },
    {
      test: 'Array operations > should filter correctly',
      location: 'test/array.test.js:42',
      error: {
        message: 'Arrays not equal',
        name: 'AssertionError'
      },
      diff: {
        expected: [1, 2, 3],
        actual: [1, 2, 4]
      }
    }
  ],
  duration: 456
};

export const resultsWithTrace = {
  stats: {
    total: 3,
    passed: 3,
    failed: 0,
    skipped: 0
  },
  failures: [],
  trace: [
    {
      name: 'add',
      duration: 1.5,
      args: [2, 3],
      result: 5
    },
    {
      name: 'multiply',
      duration: 0.8,
      args: [4, 5],
      result: 20
    },
    {
      name: 'divide',
      duration: 2.1,
      args: [10, 2],
      error: {
        message: 'Division by zero',
        name: 'Error'
      }
    }
  ],
  duration: 234
};

export const resultsWithCoverage = {
  stats: {
    total: 10,
    passed: 8,
    failed: 2,
    skipped: 0
  },
  failures: [],
  coverage: {
    percent: 85.5,
    covered: 45,
    total: 53
  },
  duration: 567
};

export const complexResults = {
  stats: {
    total: 20,
    passed: 15,
    failed: 5,
    skipped: 0
  },
  failures: [
    {
      test: 'Complex object comparison',
      location: 'test/complex.test.js:100',
      error: 'Deep equality check failed',
      diff: {
        expected: { name: 'Alice', age: 30, tags: ['developer', 'remote'] },
        actual: { name: 'Alice', age: 30, tags: ['developer', 'onsite'] }
      }
    }
  ],
  trace: [
    {
      name: 'processUser',
      duration: 5.2,
      args: [{ id: 1, name: 'Alice' }],
      result: { id: 1, name: 'Alice', processed: true }
    }
  ],
  coverage: {
    percent: 72.3,
    covered: 89,
    total: 123
  },
  duration: 1234
};
