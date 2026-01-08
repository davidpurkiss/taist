/**
 * Module Hooks - ESM loader hooks for instrumenting modules
 *
 * This file is registered via module.register() and provides
 * load hooks to transform modules as they are loaded.
 */

import { shouldInstrument, getRelativePath } from "./config-loader.js";
import { transformSource } from "./transform.js";
import { fileURLToPath } from "url";
import path from "path";

let config = null;

// Calculate paths to lib files from this file's location
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const traceReporterPath = path.join(__dirname, "trace-reporter.js");
const traceContextPath = path.join(__dirname, "trace-context.js");

// Direct debug logging (logger.js may not work in hooks thread)
const debug = (...args) => {
  if (process.env.TAIST_DEBUG === '1' || process.env.TAIST_DEBUG === 'true') {
    console.error("[TAIST] [hooks]", ...args);
  }
};

/**
 * Initialize hook with config data from parent
 */
export function initialize(data) {
  config = data?.config || { include: [], exclude: [] };
  debug("Initialized with config:", JSON.stringify(config, null, 2));
}

/**
 * Resolve hook - determines which modules to intercept
 */
export async function resolve(specifier, context, nextResolve) {
  return nextResolve(specifier, context);
}

/**
 * Load hook - transforms module source code to add tracing
 */
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);

  // Only transform JavaScript/TypeScript modules
  if (result.format !== "module") {
    return result;
  }

  // Convert file:// URL to path
  let filePath;
  try {
    filePath = new URL(url).pathname;
  } catch (err) {
    debug("Failed to parse URL:", url, err.message);
    return result;
  }

  // Skip if no source (built-in modules)
  if (!result.source) {
    return result;
  }

  // Check if this module should be instrumented
  const relativePath = getRelativePath(filePath);

  if (!config || !shouldInstrument(relativePath, config)) {
    return result;
  }

  // Skip taist's own modules
  if (
    filePath.includes("/taist/lib/") ||
    filePath.includes("/taist/node_modules/")
  ) {
    debug("Skipping taist module:", filePath);
    return result;
  }

  debug("Transforming:", relativePath);

  try {
    const source =
      typeof result.source === "string"
        ? result.source
        : result.source.toString();

    const transformed = transformSource(source, {
      filename: filePath,
      useReporter: true, // Use trace-reporter instead of service-tracer
      traceReporterPath, // Full path to trace-reporter.js
      traceContextPath, // Full path to trace-context.js for context propagation
    });

    debug("Transformed successfully:", relativePath);

    return {
      ...result,
      source: transformed,
    };
  } catch (err) {
    console.warn("[TAIST] Failed to transform", relativePath, ":", err.message);
    return result;
  }
}
