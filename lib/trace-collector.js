import net from "node:net";
import fs from "node:fs";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";

/**
 * TraceCollector - Unix domain socket server for aggregating traces from multiple worker processes.
 *
 * Architecture:
 * - Main process starts the collector before spawning test workers
 * - Workers connect via Unix socket and send NDJSON trace messages
 * - Collector aggregates, deduplicates, and filters traces
 * - After tests complete, main process retrieves aggregated traces
 */
export class TraceCollector extends EventEmitter {
  constructor(options = {}) {
    super();
    this.sessionId = options.sessionId || crypto.randomUUID();
    this.socketPath = options.socketPath || this._getDefaultSocketPath();
    this.filter = options.filter || (() => true);
    this.maxTraces = options.maxTraces || 10000;

    this.traces = [];
    this.traceIds = new Set(); // For deduplication
    this.server = null;
    this.connections = new Set();
    this.started = false;
  }

  _getDefaultSocketPath() {
    if (process.platform === "win32") {
      return `\\\\?\\pipe\\taist-collector-${this.sessionId}`;
    }
    return `/tmp/taist-collector-${this.sessionId}.sock`;
  }

  async start() {
    if (this.started) {
      throw new Error("TraceCollector already started");
    }

    // Clean up any stale socket file
    if (process.platform !== "win32") {
      try {
        fs.unlinkSync(this.socketPath);
      } catch {
        // Ignore if doesn't exist
      }
    }

    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this._handleConnection(socket);
      });

      this.server.on("error", (err) => {
        if (!this.started) {
          reject(err);
        } else {
          this.emit("error", err);
        }
      });

      this.server.listen(this.socketPath, () => {
        this.started = true;
        this.emit("started", { socketPath: this.socketPath });
        resolve();
      });
    });
  }

  _handleConnection(socket) {
    this.connections.add(socket);
    let buffer = "";
    const lifecycleDebug = process.env.TAIST_TRACE_LIFECYCLE === 'true';

    socket.on("data", (chunk) => {
      const data = chunk.toString();
      buffer += data;

      if (lifecycleDebug) {
        console.log('[LIFECYCLE collector] RAW DATA received, length:', data.length, 'buffer now:', buffer.length);
      }

      // Process complete NDJSON lines
      const lines = buffer.split("\n");
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          this._processMessage(line);
        }
      }
    });

    socket.on("close", () => {
      if (lifecycleDebug) {
        console.log('[LIFECYCLE collector] Socket closed, remaining buffer:', buffer.length, 'chars');
      }
      // Process any remaining data in buffer
      if (buffer.trim()) {
        this._processMessage(buffer);
      }
      this.connections.delete(socket);
    });

    socket.on("error", (err) => {
      if (lifecycleDebug) {
        console.log('[LIFECYCLE collector] Socket error:', err.message);
      }
      this.emit("connectionError", err);
      this.connections.delete(socket);
    });
  }

  _processMessage(line) {
    const lifecycleDebug = process.env.TAIST_TRACE_LIFECYCLE === 'true';

    try {
      const message = JSON.parse(line);

      if (message.type === "trace") {
        this._addTrace(message.data);
      } else if (message.type === "batch") {
        if (lifecycleDebug) {
          console.log('[LIFECYCLE collector] Processing batch of', message.data?.length, 'traces');
        }
        for (const trace of message.data) {
          this._addTrace(trace);
        }
      } else if (message.type === "flush") {
        this.emit("flush", { workerId: message.workerId });
      }
    } catch (err) {
      if (lifecycleDebug) {
        console.log('[LIFECYCLE collector] PARSE ERROR:', err.message, 'line:', line.slice(0, 100));
      }
      this.emit("parseError", { error: err, line });
    }
  }

  _addTrace(trace) {
    const debug = process.env.TAIST_DEBUG === 'true';
    const lifecycleDebug = process.env.TAIST_TRACE_LIFECYCLE === 'true';

    // Generate trace ID for deduplication
    const traceId =
      trace.id || `${trace.name}-${trace.timestamp}-${trace.type}`;

    if (this.traceIds.has(traceId)) {
      if (debug || lifecycleDebug) {
        console.log('[LIFECYCLE collector] DUPLICATE:', trace.name, 'id:', traceId);
      }
      return; // Duplicate
    }

    // Apply filter
    if (!this.filter(trace)) {
      if (debug || lifecycleDebug) {
        console.log('[LIFECYCLE collector] FILTERED:', trace.name);
      }
      return; // Filtered out
    }

    if (lifecycleDebug) {
      console.log('[LIFECYCLE collector] RECEIVED:', trace.name, 'depth:', trace.depth, 'correlationId:', trace.correlationId);
    } else if (debug) {
      console.log('[collector] RECEIVED:', trace.name, 'depth:', trace.depth, 'correlationId:', trace.correlationId);
    }

    // Enforce max traces (circular buffer behavior)
    if (this.traces.length >= this.maxTraces) {
      const removed = this.traces.shift();
      this.traceIds.delete(removed.id || `${removed.name}-${removed.timestamp}-${removed.type}`);
    }

    this.traces.push(trace);
    this.traceIds.add(traceId);
    this.emit("trace", trace);
  }

  getTraces() {
    return [...this.traces];
  }

  getTraceCount() {
    return this.traces.length;
  }

  clearTraces() {
    this.traces = [];
    this.traceIds.clear();
  }

  /**
   * Stop the collector gracefully.
   * Sends shutdown signal to workers and waits for them to flush before closing.
   * @param {number} timeout - Max time to wait for workers to disconnect (default: 2000ms)
   */
  async stop(timeout = 2000) {
    if (!this.started) {
      return;
    }

    const lifecycleDebug = process.env.TAIST_TRACE_LIFECYCLE === 'true';

    if (lifecycleDebug) {
      console.log('[LIFECYCLE collector] stop() called, connections:', this.connections.size);
    }

    // Send shutdown signal to all connected workers
    const shutdownMessage = JSON.stringify({ type: 'shutdown' }) + '\n';
    for (const socket of this.connections) {
      try {
        socket.write(shutdownMessage);
      } catch {
        // Socket may already be closed
      }
    }

    // Wait for connections to close gracefully, or timeout
    const startTime = Date.now();
    while (this.connections.size > 0 && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    if (lifecycleDebug) {
      console.log('[LIFECYCLE collector] After wait, remaining connections:', this.connections.size);
    }

    return new Promise((resolve) => {
      // If all connections closed gracefully, we're done
      if (this.connections.size === 0) {
        this._finishStop(resolve);
        return;
      }

      // Track sockets that need closing
      const socketsToClose = new Set(this.connections);
      let closedCount = 0;

      const onSocketClosed = (socket) => {
        socketsToClose.delete(socket);
        closedCount++;
        if (lifecycleDebug) {
          console.log('[LIFECYCLE collector] Socket closed during shutdown, remaining:', socketsToClose.size);
        }
        if (socketsToClose.size === 0) {
          clearTimeout(forceCloseTimeout);
          this._finishStop(resolve);
        }
      };

      // Set up close handlers for remaining sockets
      for (const socket of socketsToClose) {
        socket.once('close', () => onSocketClosed(socket));
        try {
          // socket.end() sends FIN but allows pending data to be read
          socket.end();
        } catch {
          // Socket already closed
          onSocketClosed(socket);
        }
      }

      // Force close after extended grace period (500ms instead of 100ms)
      // This gives more time for in-flight data to be received
      const forceCloseTimeout = setTimeout(() => {
        if (lifecycleDebug) {
          console.log('[LIFECYCLE collector] Force closing', socketsToClose.size, 'remaining sockets');
        }
        for (const socket of socketsToClose) {
          try {
            socket.destroy();
          } catch {
            // Ignore
          }
        }
        this._finishStop(resolve);
      }, 500);
    });
  }

  _finishStop(resolve) {
    const lifecycleDebug = process.env.TAIST_TRACE_LIFECYCLE === 'true';

    this.connections.clear();

    // Close server
    this.server.close(() => {
      this.started = false;

      // Clean up socket file
      if (process.platform !== "win32") {
        try {
          fs.unlinkSync(this.socketPath);
        } catch {
          // Ignore
        }
      }

      if (lifecycleDebug) {
        console.log('[LIFECYCLE collector] Stopped, total traces collected:', this.traces.length);
      }

      this.emit("stopped");
      resolve();
    });
  }

  getSocketPath() {
    return this.socketPath;
  }

  isRunning() {
    return this.started;
  }
}

/**
 * Create a default filter that excludes taist's own traces
 */
export function createDefaultFilter(options = {}) {
  const excludePatterns = options.exclude || [
    "/taist/",
    "/node_modules/taist/",
    "taist/lib/",
  ];

  return (trace) => {
    const name = trace.name || "";
    for (const pattern of excludePatterns) {
      if (name.includes(pattern)) {
        return false;
      }
    }
    return true;
  };
}

export default TraceCollector;
