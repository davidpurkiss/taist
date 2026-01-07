/**
 * Config Loader - Loads configuration from .taistrc.json
 *
 * Resolution order:
 * 1. .taistrc.json in current directory
 * 2. .taistrc.json in parent directories (up to project root)
 * 3. Default: instrument nothing (explicit opt-in)
 */

import fs from "node:fs";
import path from "node:path";

const CONFIG_FILENAME = ".taistrc.json";

/**
 * Default configuration
 */
export const defaultConfig = {
  include: [],
  exclude: ["**/node_modules/**", "**/*.test.*", "**/*.spec.*"],
  depth: 3,
};

/**
 * Find and load config file, walking up directory tree
 */
export async function loadConfig(startDir = process.cwd()) {
  let currentDir = startDir;
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const configPath = path.join(currentDir, CONFIG_FILENAME);

    try {
      const content = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(content);

      return {
        ...defaultConfig,
        ...config,
        configPath,
      };
    } catch {
      // File not found or invalid, try parent
      currentDir = path.dirname(currentDir);
    }
  }

  // No config found, use defaults
  return { ...defaultConfig, configPath: null };
}

/**
 * Check if a module path matches the include/exclude patterns
 */
export function shouldInstrument(modulePath, config) {
  const { include, exclude } = config;

  // Must match at least one include pattern
  const included = include.some((pattern) =>
    matchGlob(modulePath, pattern)
  );

  if (!included) {
    return false;
  }

  // Must not match any exclude pattern
  const excluded = exclude.some((pattern) =>
    matchGlob(modulePath, pattern)
  );

  return !excluded;
}

/**
 * Simple glob matching (supports * and **)
 */
export function matchGlob(str, pattern) {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special chars
    .replace(/\*\*\//g, "(?:.*\\/)?") // **/ matches zero or more directories
    .replace(/\*\*/g, ".*") // ** matches anything
    .replace(/\*/g, "[^/]*"); // * matches any chars except /

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(str);
}

/**
 * Get the relative path from cwd for matching
 */
export function getRelativePath(absolutePath) {
  const cwd = process.cwd();
  if (absolutePath.startsWith(cwd)) {
    return absolutePath.slice(cwd.length + 1);
  }
  return absolutePath;
}

export default { loadConfig, shouldInstrument, matchGlob, defaultConfig };
