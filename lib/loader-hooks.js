/**
 * ESM Loader Hooks for automatic function instrumentation
 *
 * This module intercepts module loading and wraps exported functions
 * with tracing when TAIST_ENABLED=true
 */

import { getGlobalTracer } from "./service-tracer.js";

// Parse patterns from environment
const includePatterns = (process.env.TAIST_INCLUDE || "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

const excludePatterns = (process.env.TAIST_EXCLUDE || "node_modules")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

/**
 * Check if a module URL should be instrumented
 */
function shouldInstrument(url) {
  if (process.env.TAIST_ENABLED !== "true") return false;

  // Only instrument file:// URLs (local files)
  if (!url.startsWith("file://")) return false;

  const path = url.replace("file://", "");

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
 * Extract module name from file path
 */
function extractModuleName(url) {
  const path = url.replace("file://", "");
  const parts = path.split("/");
  const filename = parts[parts.length - 1].replace(/\.(js|mjs|ts)$/, "");

  // Capitalize first letter
  return filename.charAt(0).toUpperCase() + filename.slice(1);
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
  const moduleName = extractModuleName(url);

  try {
    const transformed = transformSource(source, moduleName, url);
    return {
      ...result,
      source: transformed,
    };
  } catch (e) {
    // If transformation fails, return original
    console.warn(`[TAIST] Failed to transform ${url}: ${e.message}`);
    return result;
  }
}

/**
 * Transform source code to wrap exported functions
 */
function transformSource(source, moduleName, url) {
  // Inject the tracer import and wrapper at the top
  const injection = `
// --- TAIST AUTO-INSTRUMENTATION ---
import { getGlobalTracer as __taist_getTracer } from "taist/lib/service-tracer.js";
const __taist = __taist_getTracer();
const __taist_wrap = (fn, name) => {
  if (!__taist.options.enabled || typeof fn !== 'function') return fn;
  const wrapped = __taist.wrapMethod(fn, name, name.split('.').pop());
  // Preserve function name and properties
  Object.defineProperty(wrapped, 'name', { value: fn.name, configurable: true });
  return wrapped;
};
const __taist_module = "${moduleName}";
// --- END TAIST ---

`;

  // Find exported functions and wrap them
  let transformed = injection + source;

  // Track which exports we've found
  const exports = [];

  // Match: export function name(...) or export async function name(...)
  const funcExportRegex = /export\s+(async\s+)?function\s+(\w+)/g;
  let match;
  while ((match = funcExportRegex.exec(source)) !== null) {
    exports.push({ name: match[2], type: "function" });
  }

  // Match: export const name = (...) => or export const name = function
  const constExportRegex =
    /export\s+const\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)\s*=>|function)/g;
  while ((match = constExportRegex.exec(source)) !== null) {
    exports.push({ name: match[1], type: "const" });
  }

  // For each export, add a wrapper at the end of the file
  if (exports.length > 0) {
    // Rename original exports
    for (const exp of exports) {
      if (exp.type === "function") {
        // Rename: export function foo -> function __orig_foo
        transformed = transformed.replace(
          new RegExp(
            `export\\s+(async\\s+)?function\\s+${exp.name}\\s*\\(`,
            "g"
          ),
          (match, async) =>
            `${async || ""}function __taist_orig_${exp.name}(`
        );
      } else {
        // Rename: export const foo -> const __orig_foo
        transformed = transformed.replace(
          new RegExp(`export\\s+const\\s+${exp.name}\\s*=`, "g"),
          `const __taist_orig_${exp.name} =`
        );
      }
    }

    // Add wrapped re-exports at the end
    const reexports = exports
      .map(
        (exp) =>
          `export const ${exp.name} = __taist_wrap(__taist_orig_${exp.name}, __taist_module + ".${exp.name}");`
      )
      .join("\n");

    transformed += `\n\n// --- TAIST WRAPPED EXPORTS ---\n${reexports}\n`;
  }

  return transformed;
}