/**
 * User Service - Example service with intentional issues for testing monitoring
 *
 * This service contains several intentional bugs and issues:
 * 1. Email validation bug (line 40)
 * 2. Race condition in concurrent user creation (line 68)
 * 3. Memory leak in user cache (line 24)
 * 4. Unhandled promise rejection (line 85)
 * 5. Infinite loop potential (line 110)
 */

class UserService {
  constructor() {
    this.users = new Map();
    this.userCache = []; // Intentional memory leak - never cleared
    this.nextId = 1;
    this.operations = 0;
    this.rateLimitMap = new Map();
  }

  // Memory leak issue - cache grows indefinitely
  _addToCache(user) {
    this.userCache.push({
      ...user,
      cached: new Date(),
      largeData: new Array(1000).fill('x').join('') // Intentional memory waste
    });
  }

  // Email validation with bug - doesn't handle special cases correctly
  validateEmail(email) {
    if (!email) {
      throw new Error('Email is required');
    }

    // BUG: Doesn't handle emails with + or multiple dots correctly
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      throw new ValidationError(`Invalid email format: ${email}`);
    }

    return true;
  }

  // User registration with validation issues
  async register(userData) {
    const { name, email, password, age } = userData;

    // Missing null checks for name
    if (name.length < 2) { // BUG: Will crash if name is undefined
      throw new ValidationError('Name must be at least 2 characters');
    }

    this.validateEmail(email);

    // Password validation with off-by-one error
    if (password.length < 8) { // BUG: Should be <= 8 for minimum 8 chars
      throw new ValidationError('Password must be at least 8 characters');
    }

    // Age validation with type coercion issue
    if (age < 18) { // BUG: String ages like "20" will fail comparison
      throw new ValidationError('Must be 18 or older');
    }

    // Race condition issue when generating IDs
    const userId = await this._generateUserId();

    const user = {
      id: userId,
      name,
      email,
      password: this._hashPassword(password), // Weak hashing
      age,
      createdAt: new Date()
    };

    // Another race condition - concurrent writes can overwrite
    if (this.users.has(email)) {
      throw new Error('User already exists');
    }

    await this._simulateDelay(50); // Simulate DB operation

    this.users.set(email, user);
    this._addToCache(user); // Memory leak

    return user;
  }

  // Async operation with potential unhandled rejection
  async _generateUserId() {
    await this._simulateDelay(10);

    // BUG: Not thread-safe, can generate duplicate IDs
    if (Math.random() > 0.95) {
      // Unhandled promise rejection 5% of the time
      throw new Error('ID generation service unavailable');
    }

    return this.nextId++;
  }

  // Weak password hashing
  _hashPassword(password) {
    // BUG: Using simple reverse instead of proper hashing
    return password.split('').reverse().join('');
  }

  // Find users with potential infinite loop
  async findUsersByAge(minAge, maxAge) {
    const results = [];

    // BUG: Infinite loop if maxAge < minAge
    for (let age = minAge; age <= maxAge; age++) {
      for (const [email, user] of this.users) {
        if (user.age === age) {
          results.push(user);
        }
      }

      // This could run forever if parameters are wrong
      if (minAge > maxAge) {
        age = minAge - 1; // Reset, causing infinite loop
      }
    }

    return results;
  }

  // Async operation that can fail
  async saveUser(user) {
    this.operations++;

    // Simulate random failures
    if (Math.random() > 0.7) {
      await this._simulateDelay(150);
      throw new Error('Database connection failed');
    }

    await this._simulateDelay(50);
    this.users.set(user.email, user);
    this._addToCache(user);

    return true;
  }

  // Rate limiting with bug
  checkRateLimit(userId) {
    const now = Date.now();
    const userLimits = this.rateLimitMap.get(userId) || [];

    // BUG: Never cleans up old entries, memory leak
    userLimits.push(now);
    this.rateLimitMap.set(userId, userLimits);

    // Check last minute
    const oneMinuteAgo = now - 60000;
    const recentRequests = userLimits.filter(time => time > oneMinuteAgo);

    // BUG: Off-by-one, allows 11 requests instead of 10
    if (recentRequests.length > 10) {
      throw new RateLimitError('Rate limit exceeded');
    }

    return true;
  }

  // Get all users with performance issue
  getAllUsers() {
    // BUG: Returns the cache which can be huge, not the actual users
    return Array.from(this.userCache); // Performance issue with large cache
  }

  // Clear specific user with bug
  deleteUser(email) {
    // BUG: Deletes from Map but not from cache, causing inconsistency
    if (!this.users.has(email)) {
      throw new Error('User not found');
    }

    this.users.delete(email);
    // Forgot to remove from cache - memory leak and data inconsistency

    return true;
  }

  // Stats with potential division by zero
  getStats() {
    const totalUsers = this.users.size;
    const cacheSize = this.userCache.length;

    // BUG: Division by zero if no users
    const cacheRatio = cacheSize / totalUsers;

    return {
      totalUsers,
      cacheSize,
      cacheRatio,
      operations: this.operations,
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024 // MB
    };
  }

  // Helper to simulate async operations
  _simulateDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Cleanup method that doesn't actually clean properly
  cleanup() {
    // BUG: Only clears users, not cache or rateLimitMap
    this.users.clear();
    this.operations = 0;
    // Should also clear: this.userCache = [] and this.rateLimitMap.clear()
  }
}

// Custom error classes
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export { UserService, ValidationError, RateLimitError };