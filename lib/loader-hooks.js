/**
 * ESM Loader Hooks for automatic function instrumentation
 *
 * This module intercepts module loading and wraps exported functions
 * with tracing when TAIST_ENABLED=true
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractModuleName, hasExports, transformSource } from "./transform.js";
import { logger } from "./logger.js";

// Get the path to service-tracer for injection
const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceTracerPath = join(__dirname, 'service-tracer.js');

// Parse patterns from environment
const includePatterns = (process.env.TAIST_INCLUDE || "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

const excludePatterns = (process.env.TAIST_EXCLUDE || "node_modules")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

// Always exclude taist's own files to prevent self-instrumentation
const taistExcludes = ['taist.js', 'taist/lib/', 'taist/loader', 'loader-hooks.js', 'service-tracer.js', 'execution-tracer.js', 'transform.js'];

/**
 * Check if a module URL should be instrumented
 */
function shouldInstrument(url) {
  if (process.env.TAIST_ENABLED !== "true") return false;

  // Only instrument file:// URLs (local files)
  if (!url.startsWith("file://")) return false;

  const path = url.replace("file://", "");

  // Always exclude taist's own files to prevent self-instrumentation
  for (const pattern of taistExcludes) {
    if (path.includes(pattern)) return false;
  }

  // Check exclude patterns first
  for (const pattern of excludePatterns) {
    if (path.includes(pattern)) return false;
  }

  // Check include patterns (if specified)
  if (includePatterns.length > 0) {
    return includePatterns.some((p) => path.includes(p));
  }

  // Default: instrument if not excluded
  return true;
}

/**
 * Load hook - transforms module source to wrap exports
 */
export async function load(url, context, nextLoad) {
  // Always load the module first
  const result = await nextLoad(url, context);

  // Check if we should instrument this module
  if (!shouldInstrument(url)) {
    return result;
  }

  // Only transform ES modules with source
  if (result.format !== "module" || !result.source) {
    return result;
  }

  const source = result.source.toString();

  // Skip if no exports to instrument
  if (!hasExports(source)) {
    return result;
  }

  const moduleName = extractModuleName(url);

  try {
    // Use file:// URL to work with files outside the taist package
    const tracerImport = `file://${serviceTracerPath}`;
    const transformed = transformSource(source, moduleName, tracerImport);

    if (transformed !== source) {
      logger.debug(`Transformed: ${moduleName} (${url})`);
    }

    return {
      ...result,
      source: transformed,
    };
  } catch (e) {
    // If transformation fails, return original
    logger.warn(`Failed to transform ${url}: ${e.message}`);
    return result;
  }
}
