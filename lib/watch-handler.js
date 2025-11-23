/**
 * Watch Handler - File watching and incremental test runs
 * Enables iterative development with AI tools
 */

import chokidar from 'chokidar';
import { EventEmitter } from 'events';

export class WatchHandler extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      ignore: options.ignore || ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
      delay: options.delay || 500,
      maxHistory: options.maxHistory || 10,
      ...options
    };

    this.watcher = null;
    this.history = [];
    this.iteration = 0;
    this.isRunning = false;
    this.debounceTimer = null;
    this.changedFiles = new Set();
    this.lastResults = null;
  }

  /**
   * Start watching files
   * @param {Array} paths - Paths to watch
   * @param {Function} onRun - Callback to run tests
   */
  async start(paths, onRun) {
    if (this.watcher) {
      throw new Error('Watch handler already started');
    }

    this.onRun = onRun;

    const watchPaths = Array.isArray(paths) ? paths : [paths];

    this.watcher = chokidar.watch(watchPaths, {
      ignored: this.options.ignore,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100
      }
    });

    this.watcher
      .on('change', (path) => this.handleChange(path))
      .on('add', (path) => this.handleChange(path))
      .on('unlink', (path) => this.handleChange(path))
      .on('error', (error) => this.emit('error', error));

    // Run initial tests
    await this.runTests([]);

    this.emit('ready');
  }

  /**
   * Stop watching
   */
  async stop() {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Handle file change
   */
  handleChange(path) {
    this.changedFiles.add(path);

    // Debounce test runs
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      const changes = Array.from(this.changedFiles);
      this.changedFiles.clear();
      this.runTests(changes);
    }, this.options.delay);
  }

  /**
   * Run tests
   */
  async runTests(changes) {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.iteration++;

    const startTime = Date.now();

    try {
      this.emit('run-start', { iteration: this.iteration, changes });

      const results = await this.onRun();

      const duration = Date.now() - startTime;

      // Create history entry
      const entry = this.createHistoryEntry(results, changes, duration);
      this.addToHistory(entry);

      // Store results for comparison
      this.lastResults = results;

      this.emit('run-complete', {
        iteration: this.iteration,
        results,
        changes,
        duration,
        history: entry
      });
    } catch (error) {
      this.emit('run-error', {
        iteration: this.iteration,
        error,
        changes
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Create history entry
   */
  createHistoryEntry(results, changes, duration) {
    const summary = {
      pass: results.stats?.passed || 0,
      fail: results.stats?.failed || 0,
      total: results.stats?.total || 0
    };

    // Compare with previous results
    if (this.lastResults) {
      summary.new_failures = this.findNewFailures(results, this.lastResults);
      summary.fixed = this.findFixedTests(results, this.lastResults);
    } else {
      summary.new_failures = [];
      summary.fixed = [];
    }

    // Extract key errors (top 3)
    summary.key_errors = (results.failures || [])
      .slice(0, 3)
      .map(f => this.extractErrorMessage(f));

    return {
      iteration: this.iteration,
      timestamp: new Date().toISOString(),
      changes,
      summary,
      duration
    };
  }

  /**
   * Find new failures
   */
  findNewFailures(current, previous) {
    const currentFailures = new Set(
      (current.failures || []).map(f => f.test)
    );
    const previousFailures = new Set(
      (previous.failures || []).map(f => f.test)
    );

    return Array.from(currentFailures).filter(test => !previousFailures.has(test));
  }

  /**
   * Find fixed tests
   */
  findFixedTests(current, previous) {
    const currentFailures = new Set(
      (current.failures || []).map(f => f.test)
    );
    const previousFailures = new Set(
      (previous.failures || []).map(f => f.test)
    );

    return Array.from(previousFailures).filter(test => !currentFailures.has(test));
  }

  /**
   * Extract error message
   */
  extractErrorMessage(failure) {
    if (failure.error) {
      if (typeof failure.error === 'string') return failure.error;
      if (failure.error.message) return failure.error.message;
      return String(failure.error);
    }
    return 'Unknown error';
  }

  /**
   * Add entry to history
   */
  addToHistory(entry) {
    this.history.push(entry);

    // Keep only recent history
    if (this.history.length > this.options.maxHistory) {
      this.history.shift();
    }
  }

  /**
   * Get history
   */
  getHistory() {
    return this.history;
  }

  /**
   * Get summary of recent iterations
   */
  getSummary(count = 5) {
    const recent = this.history.slice(-count);

    return {
      iterations: recent.length,
      current: recent[recent.length - 1],
      trend: this.analyzeTrend(recent)
    };
  }

  /**
   * Analyze trend in test results
   */
  analyzeTrend(entries) {
    if (entries.length < 2) {
      return 'stable';
    }

    const first = entries[0].summary.fail;
    const last = entries[entries.length - 1].summary.fail;

    if (last < first) return 'improving';
    if (last > first) return 'degrading';
    return 'stable';
  }

  /**
   * Get formatted history for output
   */
  formatHistory(count = 3) {
    const recent = this.history.slice(-count);

    return recent.map(entry => {
      const lines = [];
      lines.push(`[${entry.iteration}] ${entry.summary.pass}/${entry.summary.total}`);

      if (entry.summary.new_failures.length > 0) {
        lines.push(`  New: ${entry.summary.new_failures.join(', ')}`);
      }

      if (entry.summary.fixed.length > 0) {
        lines.push(`  Fixed: ${entry.summary.fixed.join(', ')}`);
      }

      if (entry.summary.key_errors.length > 0) {
        lines.push(`  Errors: ${entry.summary.key_errors[0]}`);
      }

      return lines.join('\n');
    }).join('\n\n');
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.history = [];
    this.iteration = 0;
    this.lastResults = null;
  }
}

export default WatchHandler;
