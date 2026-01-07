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
  return /export\s+(async\s+)?(function|const|class)\s+\w+/.test(code) ||
         /export\s*\{[^}]+\}/.test(code);
}

/**
 * Find all exports in the source code
 * @param {string} source - Source code
 * @returns {Array<{name: string, type: 'function'|'const'|'class', declaration: string|null}>}
 */
export function findExports(source) {
  const exports = [];
  let match;

  // Match: export function name(...) or export async function name(...)
  const funcExportRegex = /export\s+(async\s+)?function\s+(\w+)/g;
  while ((match = funcExportRegex.exec(source)) !== null) {
    exports.push({ name: match[2], type: "function", declaration: "inline" });
  }

  // Match: export const name = (...) => or export const name = function
  const constExportRegex =
    /export\s+const\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)\s*=>|function)/g;
  while ((match = constExportRegex.exec(source)) !== null) {
    exports.push({ name: match[1], type: "const", declaration: "inline" });
  }

  // Match: export class ClassName
  const classExportRegex = /export\s+class\s+(\w+)/g;
  while ((match = classExportRegex.exec(source)) !== null) {
    exports.push({ name: match[1], type: "class", declaration: "inline" });
  }

  // Match: export { Name1, Name2, ... } - named exports from declarations
  const namedExportRegex = /export\s*\{([^}]+)\}/g;
  while ((match = namedExportRegex.exec(source)) !== null) {
    const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim());
    for (const name of names) {
      if (!name) continue;
      // Determine type by looking for declaration in source
      const isClass = new RegExp(`class\\s+${name}\\s*(extends\\s+\\w+\\s*)?[{<]`).test(source);
      const isFunction = new RegExp(`function\\s+${name}\\s*\\(`).test(source) ||
                         new RegExp(`(const|let|var)\\s+${name}\\s*=\\s*(async\\s*)?\\(`).test(source) ||
                         new RegExp(`(const|let|var)\\s+${name}\\s*=\\s*(async\\s+)?function`).test(source);

      // Skip if already found as inline export
      if (exports.some(e => e.name === name)) continue;

      exports.push({
        name,
        type: isClass ? "class" : isFunction ? "function" : "unknown",
        declaration: "named"
      });
    }
  }

  return exports;
}

/**
 * Transform source code to wrap exported functions and classes with tracing
 * @param {string} source - Original source code
 * @param {string|object} moduleNameOrOptions - Module name for trace labels, or options object
 * @param {string} [tracerImportPath] - Path to import the tracer from (deprecated, use options)
 * @returns {string} - Transformed source code
 */
export function transformSource(source, moduleNameOrOptions, tracerImportPath) {
  // Support both old API (moduleName, tracerImportPath) and new API (options object)
  let moduleName;
  let useReporter = false;
  let importPath;
  let reporterPath = "taist/lib/trace-reporter.js"; // Default package path

  if (typeof moduleNameOrOptions === "object") {
    const options = moduleNameOrOptions;
    moduleName = options.moduleName || extractModuleName(options.filename || "unknown");
    useReporter = options.useReporter || false;
    importPath = options.tracerImportPath || "taist/lib/service-tracer.js";
    // Use provided path if available, convert to file:// URL for ESM
    if (options.traceReporterPath) {
      reporterPath = `file://${options.traceReporterPath}`;
    }
  } else {
    moduleName = moduleNameOrOptions;
    importPath = tracerImportPath;
  }

  const allExports = findExports(source);

  // Filter out unknown types (non-function/class exports like variables)
  const exports = allExports.filter(e => e.type !== 'unknown');

  // If no exports to wrap, return source unchanged
  if (exports.length === 0) {
    return source;
  }

  // Inject the tracer import and wrapper at the top
  let injection;

  if (useReporter) {
    // Use trace-reporter for new APM-style collection
    injection = `
// --- TAIST AUTO-INSTRUMENTATION ---
import { getGlobalReporter as __taist_getReporter } from "${reporterPath}";
const __taist_reporter = __taist_getReporter();
let __taist_seq = 0;
const __taist_wrap = (fn, name) => {
  if (typeof fn !== 'function') return fn;
  const wrapped = function(...args) {
    const id = '__' + (++__taist_seq) + '_' + Date.now();
    const start = performance.now();
    let result, error;
    try {
      result = fn.apply(this, args);
      if (result && typeof result.then === 'function') {
        return result.then(
          (res) => {
            __taist_reporter.report({ id, name, type: 'exit', args, result: res, duration: performance.now() - start, timestamp: Date.now() });
            return res;
          },
          (err) => {
            __taist_reporter.report({ id, name, type: 'error', args, error: { name: err.name, message: err.message }, duration: performance.now() - start, timestamp: Date.now() });
            throw err;
          }
        );
      }
      __taist_reporter.report({ id, name, type: 'exit', args, result, duration: performance.now() - start, timestamp: Date.now() });
      return result;
    } catch (err) {
      __taist_reporter.report({ id, name, type: 'error', args, error: { name: err.name, message: err.message }, duration: performance.now() - start, timestamp: Date.now() });
      throw err;
    }
  };
  Object.defineProperty(wrapped, 'name', { value: fn.name, configurable: true });
  return wrapped;
};
const __taist_instrumentClass = (cls, name) => {
  const proto = cls.prototype;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    if (descriptor && typeof descriptor.value === 'function') {
      proto[key] = __taist_wrap(descriptor.value, name + '.' + key);
    }
  }
  return cls;
};
const __taist_module = "${moduleName}";
// --- END TAIST ---

`;
  } else {
    // Use service-tracer (original behavior)
    injection = `
// --- TAIST AUTO-INSTRUMENTATION ---
import { getGlobalTracer as __taist_getTracer } from "${importPath}";
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
  }

  // Handle shebang - must stay at the very top of the file
  let shebang = '';
  let sourceWithoutShebang = source;
  if (source.startsWith('#!')) {
    const newlineIndex = source.indexOf('\n');
    if (newlineIndex !== -1) {
      shebang = source.slice(0, newlineIndex + 1);
      sourceWithoutShebang = source.slice(newlineIndex + 1);
    }
  }

  let transformed = shebang + injection + sourceWithoutShebang;

  // Rename original exports
  for (const exp of exports) {
    if (exp.declaration === "inline") {
      // Inline exports: export function/class/const Name
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
    } else if (exp.declaration === "named") {
      // Named exports: class Foo {...} then export { Foo }
      // Rename the declaration (not the export)
      if (exp.type === "class") {
        // Rename: class Foo -> class __taist_orig_Foo (handles extends)
        transformed = transformed.replace(
          new RegExp(`\\bclass\\s+${exp.name}\\s*(extends\\s+\\w+\\s*)?([{<])`, "g"),
          (match, ext, brace) => `class __taist_orig_${exp.name} ${ext || ''}${brace}`
        );
      } else if (exp.type === "function") {
        // Rename: function foo -> function __taist_orig_foo
        transformed = transformed.replace(
          new RegExp(`\\bfunction\\s+${exp.name}\\s*\\(`, "g"),
          `function __taist_orig_${exp.name}(`
        );
        // Also handle arrow functions: const foo = (...) =>
        transformed = transformed.replace(
          new RegExp(`\\b(const|let|var)\\s+${exp.name}\\s*=`, "g"),
          `$1 __taist_orig_${exp.name} =`
        );
      }
    }
  }

  // Remove named export statements that we're replacing
  // Match: export { Name1, Name2 } and remove names we're wrapping
  const namedExportNames = exports.filter(e => e.declaration === "named").map(e => e.name);
  if (namedExportNames.length > 0) {
    transformed = transformed.replace(
      /export\s*\{([^}]+)\}/g,
      (match, names) => {
        const remaining = names.split(',')
          .map(n => n.trim())
          .filter(n => {
            const name = n.split(/\s+as\s+/)[0].trim();
            return !namedExportNames.includes(name);
          });
        if (remaining.length === 0) {
          return '// export moved to end';
        }
        return `export { ${remaining.join(', ')} }`;
      }
    );
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
  // Only add module prefix if it differs from export name to avoid "Calculator.Calculator"
  const reexports = exports
    .map((exp) => {
      const nameExpr = `(__taist_module === "${exp.name}" ? "${exp.name}" : __taist_module + ".${exp.name}")`;
      if (exp.type === "class") {
        // Classes use instrument() to wrap prototype methods
        return `export const ${exp.name} = __taist_instrumentClass(__taist_orig_${exp.name}, ${nameExpr});`;
      } else {
        // Functions use wrapMethod()
        return `export const ${exp.name} = __taist_wrap(__taist_orig_${exp.name}, ${nameExpr});`;
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
