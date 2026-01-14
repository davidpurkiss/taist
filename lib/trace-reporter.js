import net from "node:net";
import { EventEmitter } from "node:events";
import { logger } from "./logger.js";

/**
 * TraceReporter - Client that runs in worker processes to send traces to the collector.
 *
 * Features:
 * - Connects to collector via Unix domain socket
 * - Buffers traces locally for batched sending
 * - Auto-flushes on process exit
 * - Handles connection failures gracefully
 * - Reconnects automatically if connection drops
 */
export class TraceReporter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.socketPath =
      options.socketPath || process.env.TAIST_COLLECTOR_SOCKET;
    this.batchSize = options.batchSize || 100;
    this.flushInterval = options.flushInterval || 1000;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 100;

    this.buffer = [];
    this.socket = null;
    this.connected = false;
    this.connecting = false;
    this.connectPromise = null; // Track pending connection for flushSync
    this.flushTimer = null;
    this.workerId = options.workerId || process.pid;
    this.closed = false;
    this.shuttingDown = false; // Prevents race between shutdown signal and SIGTERM

    logger.debug("[reporter] Created with socketPath:", this.socketPath);

    // Auto-setup if socket path is available
    if (this.socketPath) {
      this._setupExitHandlers();
    }
  }

  _setupExitHandlers() {
    const cleanup = (signal) => {
      logger.debug("[reporter] Cleanup triggered by:", signal, "buffer size:", this.buffer.length, "shuttingDown:", this.shuttingDown);
      // If shutdown signal handler is already handling graceful shutdown, don't interfere
      if (this.shuttingDown) {
        logger.debug("[reporter] Shutdown already in progress, skipping cleanup");
        return;
      }
      if (!this.closed) {
        this.flushSync();
        this.close();
      }
    };

    process.on("beforeExit", () => cleanup("beforeExit"));
    process.on("exit", () => cleanup("exit"));
    process.on("SIGINT", () => cleanup("SIGINT"));
    process.on("SIGTERM", () => cleanup("SIGTERM"));
  }

  async connect() {
    if (this.connected || !this.socketPath) {
      return this.connectPromise;
    }

    // Return existing connection attempt if in progress
    if (this.connecting && this.connectPromise) {
      return this.connectPromise;
    }

    this.connecting = true;

    this.connectPromise = new Promise((resolve, reject) => {
      this.socket = net.createConnection(this.socketPath, () => {
        this.connected = true;
        this.connecting = false;
        this._startFlushTimer();
        this.emit("connected");
        logger.debug("[reporter] Connected to collector");
        resolve();
      });

      // Don't keep the process alive just for tracing
      this.socket.unref();

      // Handle incoming messages from collector (e.g., shutdown signal)
      let dataBuffer = '';
      this.socket.on("data", (chunk) => {
        dataBuffer += chunk.toString();
        const lines = dataBuffer.split('\n');
        dataBuffer = lines.pop(); // Keep incomplete line

        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = JSON.parse(line);
              if (message.type === 'shutdown') {
                logger.debug("[reporter] Received shutdown signal, flushing...");
                this._handleShutdown();
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      });

      this.socket.on("error", (err) => {
        this.connected = false;
        this.connecting = false;
        this.connectPromise = null;
        this.emit("error", err);
        reject(err);
      });

      this.socket.on("close", () => {
        this.connected = false;
        this.connectPromise = null;
        this._stopFlushTimer();
        this.emit("disconnected");
      });
    });

    return this.connectPromise;
  }

  /**
   * Start connection eagerly (call at module init time)
   * This ensures the connection is ready before any traces are generated
   */
  connectEager() {
    if (this.socketPath && !this.connected && !this.connecting) {
      logger.debug("[reporter] Starting eager connection...");
      this.connect().catch((err) => {
        logger.debug("[reporter] Eager connect failed:", err.message);
      });
    }
    return this;
  }

  _startFlushTimer() {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      this.flush().catch(() => {});
    }, this.flushInterval);
    // Don't keep process alive just for flushing
    this.flushTimer.unref();
  }

  _stopFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Handle shutdown signal from collector.
   * Flushes buffer and waits for data to be sent before closing.
   */
  _handleShutdown() {
    if (this.closed || this.shuttingDown) return;

    // Set flag immediately to prevent exit handlers from interfering
    this.shuttingDown = true;
    this._stopFlushTimer();

    // Flush and wait for data to be sent
    if (this.buffer.length > 0 && this.socket && this.connected) {
      const traces = this.buffer.splice(0, this.buffer.length);
      const message = JSON.stringify({
        type: "batch",
        workerId: this.workerId,
        data: traces,
      });

      logger.debug("[reporter] Shutdown flushing", traces.length, "traces");

      try {
        // Write data
        const flushed = this.socket.write(message + "\n");

        if (flushed) {
          // Data was written to kernel buffer, use setImmediate to allow
          // the event loop to process and send the data before closing
          setImmediate(() => {
            this._gracefulClose();
          });
        } else {
          // Buffer is full, wait for drain
          this.socket.once('drain', () => {
            logger.debug("[reporter] Drained, closing");
            this._gracefulClose();
          });
        }
      } catch (err) {
        logger.debug("[reporter] Write error:", err.message);
        this.close();
      }
    } else {
      this._gracefulClose();
    }
  }

  /**
   * Close connection gracefully, allowing pending data to be sent.
   */
  _gracefulClose() {
    if (!this.socket) {
      this.close();
      return;
    }

    // Use socket.end() for graceful TCP close (sends FIN, allows pending data)
    // Add a small delay to allow the collector to read the data
    this.socket.once('close', () => {
      logger.debug("[reporter] Socket closed gracefully");
      this.closed = true;
      this.connected = false;
      this.socket = null;
    });

    // Set a timeout in case close doesn't happen
    const closeTimeout = setTimeout(() => {
      logger.debug("[reporter] Close timeout, forcing");
      this.close();
    }, 500);
    closeTimeout.unref();

    try {
      this.socket.end();
    } catch {
      clearTimeout(closeTimeout);
      this.close();
    }
  }

  /**
   * Report a single trace event
   */
  report(trace) {
    if (this.closed) return;

    logger.debug("[reporter] report() called:", trace.name, trace.type);

    this.buffer.push(trace);

    // Connect eagerly on first trace to avoid exit-time connection issues
    if (!this.connected && !this.connecting && this.socketPath) {
      this.connect().catch((err) => {
        logger.debug("[reporter] Eager connect failed:", err.message);
      });
    }

    // Auto-flush when batch size reached
    if (this.buffer.length >= this.batchSize) {
      this.flush().catch(() => {});
    }
  }

  /**
   * Async flush - sends buffered traces to collector
   */
  async flush() {
    if (this.buffer.length === 0 || this.closed) {
      return;
    }

    // Ensure connected
    if (!this.connected && this.socketPath) {
      try {
        await this.connect();
      } catch {
        // Connection failed, keep traces buffered
        return;
      }
    }

    if (!this.connected) {
      return;
    }

    const traces = this.buffer.splice(0, this.buffer.length);

    const message = JSON.stringify({
      type: "batch",
      workerId: this.workerId,
      data: traces,
    });

    return new Promise((resolve, reject) => {
      this.socket.write(message + "\n", (err) => {
        if (err) {
          // Put traces back in buffer on failure
          this.buffer.unshift(...traces);
          reject(err);
        } else {
          this.emit("flushed", { count: traces.length });
          resolve();
        }
      });
    });
  }

  /**
   * Synchronous flush for process exit - best effort
   * This is tricky because we need to ensure data is sent before the process exits,
   * but socket operations are inherently async in Node.js.
   */
  flushSync() {
    logger.debug("[reporter] flushSync() called - buffer:", this.buffer.length, "connected:", this.connected, "connecting:", this.connecting);

    if (this.buffer.length === 0) {
      logger.debug("[reporter] flushSync() - buffer empty, skipping");
      return;
    }

    // If we have an existing socket (even if not fully connected), try to use it
    // The socket may have been created by connect() but not yet emitted 'connect'
    if (!this.socket && this.socketPath) {
      logger.debug("[reporter] flushSync() - no socket, creating new connection");
      try {
        this.socket = net.createConnection(this.socketPath);
        // Note: socket won't be immediately connected, but we can still write to it
        // and the data will be sent once connection completes
      } catch (err) {
        logger.debug("[reporter] flushSync() - connection creation failed:", err.message);
        return;
      }
    }

    if (!this.socket) {
      logger.debug("[reporter] flushSync() - no socket available");
      return;
    }

    const traces = this.buffer.splice(0, this.buffer.length);
    const message = JSON.stringify({
      type: "batch",
      workerId: this.workerId,
      data: traces,
    });

    logger.debug("[reporter] flushSync() - writing", traces.length, "traces");

    try {
      // Temporarily ref the socket to ensure data is sent before exit
      this.socket.ref();

      // Set up drain handler to ensure all data is written
      let dataWritten = false;
      const onDrain = () => {
        dataWritten = true;
        logger.debug("[reporter] flushSync() - socket drained");
      };
      this.socket.once("drain", onDrain);

      // Use cork/uncork for batched write
      this.socket.cork();
      const written = this.socket.write(message + "\n");
      this.socket.uncork();

      if (written) {
        logger.debug("[reporter] flushSync() - write returned true (data buffered in kernel)");
      } else {
        logger.debug("[reporter] flushSync() - write returned false (waiting for drain)");
      }

      // End the socket gracefully - this ensures FIN is sent after all data
      this.socket.end();

      logger.debug("[reporter] flushSync() - socket.end() called, data should be sent");
    } catch (err) {
      logger.debug("[reporter] flushSync() - write error:", err.message);
      // Put traces back in buffer in case we get another chance
      this.buffer.unshift(...traces);
    }
  }

  close() {
    this.closed = true;
    this._stopFlushTimer();

    if (this.socket) {
      try {
        this.socket.end();
      } catch {
        // Ignore errors during close
      }
      this.socket = null;
    }

    this.connected = false;
    this.emit("closed");
  }

  isConnected() {
    return this.connected;
  }

  getBufferSize() {
    return this.buffer.length;
  }
}

// Global reporter instance for easy access from instrumented code
let globalReporter = null;

/**
 * Get or create the global reporter instance
 */
export function getGlobalReporter(options = {}) {
  if (!globalReporter) {
    globalReporter = new TraceReporter(options);
  }
  return globalReporter;
}

/**
 * Report a trace using the global reporter
 */
export function report(trace) {
  const reporter = getGlobalReporter();
  reporter.report(trace);
}

/**
 * Flush the global reporter
 */
export async function flush() {
  if (globalReporter) {
    await globalReporter.flush();
  }
}

export default TraceReporter;
