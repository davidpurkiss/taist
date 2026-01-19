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

    socket.on("data", (chunk) => {
      buffer += chunk.toString();

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
      // Process any remaining data in buffer
      if (buffer.trim()) {
        this._processMessage(buffer);
      }
      this.connections.delete(socket);
    });

    socket.on("error", (err) => {
      this.emit("connectionError", err);
      this.connections.delete(socket);
    });
  }

  _processMessage(line) {
    try {
      const message = JSON.parse(line);

      if (message.type === "trace") {
        this._addTrace(message.data);
      } else if (message.type === "batch") {
        for (const trace of message.data) {
          this._addTrace(trace);
        }
      } else if (message.type === "flush") {
        this.emit("flush", { workerId: message.workerId });
      }
    } catch (err) {
      this.emit("parseError", { error: err, line });
    }
  }

  _addTrace(trace) {
    const debug = process.env.TAIST_DEBUG === 'true';

    // Generate trace ID for deduplication
    const traceId =
      trace.id || `${trace.name}-${trace.timestamp}-${trace.type}`;

    if (this.traceIds.has(traceId)) {
      if (debug) {
        console.log('[collector] DUPLICATE:', trace.name, 'id:', traceId);
      }
      return; // Duplicate
    }

    // Apply filter
    if (!this.filter(trace)) {
      if (debug) {
        console.log('[collector] FILTERED:', trace.name);
      }
      return; // Filtered out
    }

    if (debug) {
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

    return new Promise((resolve) => {
      // Gracefully close any remaining connections (allows pending data to be read)
      for (const socket of this.connections) {
        try {
          socket.end();
        } catch {
          try { socket.destroy(); } catch { /* ignore */ }
        }
      }

      // Give a moment for final data to arrive before destroying
      setTimeout(() => {
        // Force destroy any sockets that didn't close gracefully
        for (const socket of this.connections) {
          try {
            socket.destroy();
          } catch {
            // Ignore
          }
        }
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

          this.emit("stopped");
          resolve();
        });
      }, 100); // 100ms grace period for data to be read
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
