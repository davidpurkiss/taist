/**
 * Module Patcher - APM-style module instrumentation using import-in-the-middle
 *
 * This module is loaded via `--import taist/module-patcher` and intercepts
 * module loading to wrap exported functions/classes with tracing.
 *
 * Features:
 * - Works with any test runner (Vitest, Jest, Mocha, etc.)
 * - Intercepts both ESM and CJS modules
 * - Reads configuration from .taistrc.json
 * - Sends traces to collector via Unix socket
 */

import { register } from "module";
import { loadConfig } from "./config-loader.js";
import { logger } from "./logger.js";
import { getGlobalReporter } from "./trace-reporter.js";

// Register the hooks
const config = await loadConfig();

logger.debug("[patcher] Config loaded:", JSON.stringify(config, null, 2));
logger.debug("[patcher] TAIST_ENABLED:", process.env.TAIST_ENABLED);
logger.debug("[patcher] TAIST_COLLECTOR_SOCKET:", process.env.TAIST_COLLECTOR_SOCKET);

if (process.env.TAIST_ENABLED === "true" && config.include?.length > 0) {
  logger.debug("[patcher] Registering hooks...");
  register("./module-hooks.js", {
    parentURL: import.meta.url,
    data: { config },
  });
  logger.debug("[patcher] Hooks registered");

  // Pre-connect the reporter eagerly to avoid connection timing issues
  // This ensures the socket is connected before any traces are generated
  if (process.env.TAIST_COLLECTOR_SOCKET) {
    logger.debug("[patcher] Pre-connecting reporter...");
    getGlobalReporter().connectEager();
  }
} else {
  logger.debug("[patcher] Not registering hooks - TAIST_ENABLED:", process.env.TAIST_ENABLED, "include patterns:", config.include?.length || 0);
}
