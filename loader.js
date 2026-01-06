/**
 * Taist ESM Loader for automatic function tracing
 *
 * Usage: node --import taist/loader your-app.js
 *
 * Environment Variables:
 *   TAIST_ENABLED=true           - Enable tracing (default: true when loader is used)
 *   TAIST_INCLUDE=Order,Cart     - Only trace modules matching these patterns
 *   TAIST_EXCLUDE=node_modules   - Exclude modules matching these patterns (default)
 *   TAIST_OUTPUT_FILE=/tmp/...   - Write traces to file
 *   TAIST_DEPTH=3                - Max trace depth
 */

import { register } from "node:module";

// Enable tracing by default when loader is used
if (!process.env.TAIST_ENABLED) {
  process.env.TAIST_ENABLED = "true";
}

// Register the loader hooks - use import.meta.url as the parent URL
register("./lib/loader-hooks.js", import.meta.url);

console.log("[TAIST] ESM Loader registered");
console.log(`[TAIST] Include patterns: ${process.env.TAIST_INCLUDE || "(all)"}`);
console.log(`[TAIST] Exclude patterns: ${process.env.TAIST_EXCLUDE || "node_modules"}`);