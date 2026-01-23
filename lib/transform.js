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
 * @returns {Array<{name: string, type: 'function'|'const'|'class'|'object', declaration: string|null}>}
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

  // Match: export const name = { - object literal exports
  // Negative lookahead to avoid matching functions/arrows already caught above
  const objectExportRegex = /export\s+const\s+(\w+)\s*=\s*\{/g;
  while ((match = objectExportRegex.exec(source)) !== null) {
    const name = match[1];
    // Skip if already found as a function/const export
    if (exports.some(e => e.name === name)) continue;
    exports.push({ name, type: "object", declaration: "inline" });
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
      const isObject = new RegExp(`(const|let|var)\\s+${name}\\s*=\\s*\\{`).test(source);

      // Skip if already found as inline export
      if (exports.some(e => e.name === name)) continue;

      exports.push({
        name,
        type: isClass ? "class" : isFunction ? "function" : isObject ? "object" : "unknown",
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

  let traceContextPath = "taist/lib/trace-context.js"; // Default package path

  let excludeFunctions = [];
  let maxDepth = 0;

  if (typeof moduleNameOrOptions === "object") {
    const options = moduleNameOrOptions;
    moduleName = options.moduleName || extractModuleName(options.filename || "unknown");
    useReporter = options.useReporter || false;
    importPath = options.tracerImportPath || "taist/lib/service-tracer.js";
    excludeFunctions = options.excludeFunctions || [];
    maxDepth = options.maxDepth || 0;
    // Use provided path if available, convert to file:// URL for ESM
    if (options.traceReporterPath) {
      reporterPath = `file://${options.traceReporterPath}`;
    }
    if (options.traceContextPath) {
      traceContextPath = `file://${options.traceContextPath}`;
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
    // Use trace-reporter for new APM-style collection with context propagation
    injection = `
// --- TAIST AUTO-INSTRUMENTATION ---
import { getGlobalReporter as __taist_getReporter } from "${reporterPath}";
import { getContext as __taist_getContext, runWithContext as __taist_runWithContext, generateId as __taist_generateId, getCorrelationId as __taist_getCorrelationId } from "${traceContextPath}";
const __taist_reporter = __taist_getReporter();
const __taist_debug = process.env.TAIST_DEBUG === 'true';
const __taist_excludeFunctions = ${JSON.stringify(excludeFunctions)};
const __taist_maxDepth = ${maxDepth};
// Eagerly connect to collector if socket path is set (build-time instrumentation)
if (process.env.TAIST_COLLECTOR_SOCKET && !__taist_reporter.isConnected()) {
  __taist_reporter.connectEager();
}
// Helper to find correlationId from GraphQL context argument (Apollo: parent, args, context, info)
const __taist_findCorrelationIdInArgs = (args) => {
  for (const arg of args) {
    if (arg && typeof arg === 'object' && arg.taistCorrelationId) {
      return arg.taistCorrelationId;
    }
  }
  return null;
};
const __taist_wrap = (fn, name) => {
  if (typeof fn !== 'function') return fn;
  // Check if function should be excluded by name
  const funcName = name.split('.').pop();
  if (__taist_excludeFunctions.includes(funcName)) {
    if (__taist_debug) console.log('[taist] EXCLUDED:', name);
    return fn;
  }
  if (__taist_debug) console.log('[taist] wrapping:', name);
  const wrapped = function(...args) {
    const parentCtx = __taist_getContext();
    const depth = parentCtx.depth;
    // Check max depth limit (0 = unlimited)
    if (__taist_maxDepth > 0 && depth >= __taist_maxDepth) {
      return fn.apply(this, args);
    }
    if (__taist_debug) console.log('[taist] CALLED:', name);
    const id = __taist_generateId();
    // Get correlationId: 1) GraphQL context arg (most reliable for resolvers),
    //                    2) parent context (for middleware), 3) fallback global
    const argsCorrelationId = __taist_findCorrelationIdInArgs(args);
    const correlationId = argsCorrelationId || parentCtx.correlationId || __taist_getCorrelationId();
    if (__taist_debug && argsCorrelationId) console.log('[taist] Found correlationId in args:', argsCorrelationId);
    const newCtx = {
      depth: depth + 1,
      traceId: parentCtx.traceId || id,
      parentId: parentCtx.id,
      id,
      correlationId
    };

    const start = performance.now();

    // Report entry immediately for visibility even if function doesn't complete
    if (__taist_debug) console.log('[taist] ENTRY:', name, 'depth:', depth, 'correlationId:', correlationId);
    __taist_reporter.report({
      id, name, type: 'entry', args,
      timestamp: Date.now(),
      depth,
      parentId: parentCtx.id,
      traceId: newCtx.traceId,
      correlationId
    });

    const reportSuccess = (result) => {
      if (__taist_debug) console.log('[taist] EXIT:', name, 'depth:', depth, 'correlationId:', correlationId);
      __taist_reporter.report({
        id, name, type: 'exit', result,
        duration: performance.now() - start,
        timestamp: Date.now(),
        depth,
        parentId: parentCtx.id,
        traceId: newCtx.traceId,
        correlationId
      });
      return result;
    };

    const reportError = (err) => {
      if (__taist_debug) console.log('[taist] ERROR:', name, 'depth:', depth, 'correlationId:', correlationId, 'error:', err.message);
      __taist_reporter.report({
        id, name, type: 'error',
        error: { name: err.name, message: err.message },
        duration: performance.now() - start,
        timestamp: Date.now(),
        depth,
        parentId: parentCtx.id,
        traceId: newCtx.traceId,
        correlationId
      });
      throw err;
    };

    // Run the function within the new context
    return __taist_runWithContext(newCtx, () => {
      try {
        const result = fn.apply(this, args);
        if (result && typeof result.then === 'function') {
          return result.then(reportSuccess, reportError);
        }
        return reportSuccess(result);
      } catch (err) {
        reportError(err);
      }
    });
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
const __taist_instrumentObject = (obj, name, visited = new WeakSet()) => {
  if (!obj || typeof obj !== 'object' || visited.has(obj)) return obj;
  if (__taist_debug) console.log('[taist] instrumentObject:', name, Object.keys(obj));
  visited.add(obj);
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (typeof value === 'function') {
      if (__taist_debug) console.log('[taist] found method:', name + '.' + key);
      obj[key] = __taist_wrap(value, name + '.' + key);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      __taist_instrumentObject(value, name + '.' + key, visited);
    }
  }
  return obj;
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
const __taist_instrumentObject = (obj, name, visited = new WeakSet()) => {
  if (!__taist?.options?.enabled) return obj;
  if (!obj || typeof obj !== 'object' || visited.has(obj)) return obj;
  visited.add(obj);
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (typeof value === 'function') {
      obj[key] = __taist_wrap(value, name + '.' + key);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      __taist_instrumentObject(value, name + '.' + key, visited);
    }
  }
  return obj;
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

  // Separate exports by type - each needs different handling
  const classExports = exports.filter(e => e.type === "class");
  const objectExports = exports.filter(e => e.type === "object");
  const functionExports = exports.filter(e => e.type !== "class" && e.type !== "object");

  // For CLASSES: Keep original export, instrument in-place (preserves hoisting)
  // This avoids TDZ issues with circular dependencies
  // We'll add __taist_instrumentClass() calls at the end instead of re-exporting

  // For OBJECTS: Rename and re-export wrapped version (BUILD-TIME instrumentation)
  // This is critical for GraphQL resolvers and similar nested object patterns.
  // Runtime instrumentation doesn't work because bundlers capture the original reference.
  for (const exp of objectExports) {
    if (exp.declaration === "inline") {
      // Inline exports: export const resolver = { ... }
      // Rename: export const resolver -> const __taist_orig_resolver
      transformed = transformed.replace(
        new RegExp(`export\\s+const\\s+${exp.name}\\s*=\\s*\\{`, "g"),
        `const __taist_orig_${exp.name} = {`
      );
    } else if (exp.declaration === "named") {
      // Named exports: const resolver = { ... }; export { resolver }
      // Rename: const resolver -> const __taist_orig_resolver
      transformed = transformed.replace(
        new RegExp(`\\b(const|let|var)\\s+${exp.name}\\s*=\\s*\\{`, "g"),
        `$1 __taist_orig_${exp.name} = {`
      );
    }
  }

  // For FUNCTIONS: Rename and re-export (original behavior)
  for (const exp of functionExports) {
    if (exp.declaration === "inline") {
      // Inline exports: export function/const Name
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
      }
    } else if (exp.declaration === "named") {
      // Named exports: function foo {...} then export { foo }
      if (exp.type === "function") {
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

  // Remove named export statements for FUNCTIONS and OBJECTS we're replacing (not classes)
  // Match: export { Name1, Name2 } and remove names we're wrapping
  const namedFunctionExportNames = functionExports.filter(e => e.declaration === "named").map(e => e.name);
  const namedObjectExportNames = objectExports.filter(e => e.declaration === "named").map(e => e.name);
  const allNamedExportsToReplace = [...namedFunctionExportNames, ...namedObjectExportNames];
  if (allNamedExportsToReplace.length > 0) {
    transformed = transformed.replace(
      /export\s*\{([^}]+)\}/g,
      (match, names) => {
        const remaining = names.split(',')
          .map(n => n.trim())
          .filter(n => {
            const name = n.split(/\s+as\s+/)[0].trim();
            return !allNamedExportsToReplace.includes(name);
          });
        if (remaining.length === 0) {
          return '// export moved to end';
        }
        return `export { ${remaining.join(', ')} }`;
      }
    );
  }

  // Track default exports for FUNCTIONS that need to be moved to after re-exports
  const defaultExports = [];

  // Remove `export default Name;` from original location for FUNCTIONS only
  // (Classes keep their default export in place)
  for (const exp of functionExports) {
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

  // Add wrapped re-exports for FUNCTIONS at the end
  // Only add module prefix if it differs from export name to avoid "Calculator.Calculator"
  const functionReexports = functionExports
    .map((exp) => {
      const nameExpr = `(__taist_module === "${exp.name}" ? "${exp.name}" : __taist_module + ".${exp.name}")`;
      // Functions use wrapMethod()
      return `export const ${exp.name} = __taist_wrap(__taist_orig_${exp.name}, ${nameExpr});`;
    })
    .join("\n");

  // Add in-place instrumentation for CLASSES (preserves hoisting/TDZ)
  // __taist_instrumentClass mutates the prototype in-place
  const classInstrumentations = classExports
    .map((exp) => {
      const nameExpr = `(__taist_module === "${exp.name}" ? "${exp.name}" : __taist_module + ".${exp.name}")`;
      return `__taist_instrumentClass(${exp.name}, ${nameExpr});`;
    })
    .join("\n");

  // Add wrapped re-exports for OBJECTS at the end (BUILD-TIME instrumentation)
  // This wraps nested methods like GraphQL resolvers: resolver.Mutation.upsertOrder
  // Runtime instrumentation doesn't work because bundlers capture original references
  const objectReexports = objectExports
    .map((exp) => {
      const nameExpr = `(__taist_module === "${exp.name}" ? "${exp.name}" : __taist_module + ".${exp.name}")`;
      return `export const ${exp.name} = __taist_instrumentObject(__taist_orig_${exp.name}, ${nameExpr});`;
    })
    .join("\n");

  transformed += `\n\n// --- TAIST INSTRUMENTATION ---\n`;

  if (functionReexports) {
    transformed += `// Wrapped function exports\n${functionReexports}\n`;
  }

  if (objectReexports) {
    transformed += `// Wrapped object exports (build-time instrumentation for nested methods)\n${objectReexports}\n`;
  }

  if (classInstrumentations) {
    transformed += `// In-place class instrumentation (preserves hoisting)\n${classInstrumentations}\n`;
  }

  // Add default exports at the end (after the wrapped versions are defined)
  for (const name of defaultExports) {
    transformed += `export default ${name};\n`;
  }

  return transformed;
}
