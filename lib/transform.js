/**
 * Shared code transformation logic for Taist instrumentation
 * Used by both the Rollup plugin and ESM loader hooks
 */

/**
 * Extract module name from file path
 * @param {string} filePath - File path or URL
 * @returns {string} - Capitalized module name
 */
export function extractModuleName(filePath) {
  const path = filePath.replace("file://", "");
  const parts = path.split("/");
  const filename = parts[parts.length - 1].replace(/\.(ts|js|mjs)$/, "");

  // Capitalize first letter
  return filename.charAt(0).toUpperCase() + filename.slice(1);
}

/**
 * Check if code has any exports worth instrumenting
 * @param {string} code - Source code
 * @returns {boolean}
 */
export function hasExports(code) {
  return /export\s+(async\s+)?(function|const|class)\s+\w+/.test(code);
}

/**
 * Find all exports in the source code
 * @param {string} source - Source code
 * @returns {Array<{name: string, type: 'function'|'const'|'class'}>}
 */
export function findExports(source) {
  const exports = [];
  let match;

  // Match: export function name(...) or export async function name(...)
  const funcExportRegex = /export\s+(async\s+)?function\s+(\w+)/g;
  while ((match = funcExportRegex.exec(source)) !== null) {
    exports.push({ name: match[2], type: "function" });
  }

  // Match: export const name = (...) => or export const name = function
  const constExportRegex =
    /export\s+const\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)\s*=>|function)/g;
  while ((match = constExportRegex.exec(source)) !== null) {
    exports.push({ name: match[1], type: "const" });
  }

  // Match: export class ClassName
  const classExportRegex = /export\s+class\s+(\w+)/g;
  while ((match = classExportRegex.exec(source)) !== null) {
    exports.push({ name: match[1], type: "class" });
  }

  return exports;
}

/**
 * Transform source code to wrap exported functions and classes with tracing
 * @param {string} source - Original source code
 * @param {string} moduleName - Module name for trace labels
 * @param {string} tracerImportPath - Path to import the tracer from
 * @returns {string} - Transformed source code
 */
export function transformSource(source, moduleName, tracerImportPath) {
  const exports = findExports(source);

  // If no exports to wrap, return source unchanged
  if (exports.length === 0) {
    return source;
  }

  // Inject the tracer import and wrapper at the top
  const injection = `
// --- TAIST AUTO-INSTRUMENTATION ---
import { getGlobalTracer as __taist_getTracer } from "${tracerImportPath}";
const __taist = __taist_getTracer();
const __taist_wrap = (fn, name) => {
  if (!__taist?.options?.enabled || typeof fn !== 'function') return fn;
  const wrapped = __taist.wrapMethod(fn, name, name.split('.').pop());
  // Preserve function name and properties
  Object.defineProperty(wrapped, 'name', { value: fn.name, configurable: true });
  return wrapped;
};
const __taist_instrumentClass = (cls, name) => {
  if (!__taist?.options?.enabled) return cls;
  __taist.instrument(cls, name);
  return cls;
};
const __taist_module = "${moduleName}";
// --- END TAIST ---

`;

  let transformed = injection + source;

  // Rename original exports
  for (const exp of exports) {
    if (exp.type === "function") {
      // Rename: export function foo -> function __taist_orig_foo
      transformed = transformed.replace(
        new RegExp(
          `export\\s+(async\\s+)?function\\s+${exp.name}\\s*\\(`,
          "g"
        ),
        (match, async) => `${async || ""}function __taist_orig_${exp.name}(`
      );
    } else if (exp.type === "const") {
      // Rename: export const foo -> const __taist_orig_foo
      transformed = transformed.replace(
        new RegExp(`export\\s+const\\s+${exp.name}\\s*=`, "g"),
        `const __taist_orig_${exp.name} =`
      );
    } else if (exp.type === "class") {
      // Rename: export class Foo -> class __taist_orig_Foo
      transformed = transformed.replace(
        new RegExp(`export\\s+class\\s+${exp.name}\\b`, "g"),
        `class __taist_orig_${exp.name}`
      );
    }
  }

  // Track default exports that need to be moved to after re-exports
  const defaultExports = [];

  // Remove `export default Name;` from original location (will add after re-exports)
  for (const exp of exports) {
    // Match: export default Name;
    if (transformed.match(new RegExp(`export\\s+default\\s+${exp.name}\\s*;`))) {
      transformed = transformed.replace(
        new RegExp(`export\\s+default\\s+${exp.name}\\s*;`, "g"),
        `// export default moved to end`
      );
      defaultExports.push(exp.name);
    }
    // Match: export default Name (no semicolon, end of file)
    else if (transformed.match(new RegExp(`export\\s+default\\s+${exp.name}\\s*$`, "m"))) {
      transformed = transformed.replace(
        new RegExp(`export\\s+default\\s+${exp.name}\\s*$`, "gm"),
        `// export default moved to end`
      );
      defaultExports.push(exp.name);
    }
  }

  // Add wrapped re-exports at the end
  const reexports = exports
    .map((exp) => {
      if (exp.type === "class") {
        // Classes use instrument() to wrap prototype methods
        return `export const ${exp.name} = __taist_instrumentClass(__taist_orig_${exp.name}, __taist_module + ".${exp.name}");`;
      } else {
        // Functions use wrapMethod()
        return `export const ${exp.name} = __taist_wrap(__taist_orig_${exp.name}, __taist_module + ".${exp.name}");`;
      }
    })
    .join("\n");

  transformed += `\n\n// --- TAIST WRAPPED EXPORTS ---\n${reexports}\n`;

  // Add default exports at the end (after the wrapped versions are defined)
  for (const name of defaultExports) {
    transformed += `export default ${name};\n`;
  }

  return transformed;
}
