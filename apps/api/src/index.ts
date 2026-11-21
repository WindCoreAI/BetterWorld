import "./lib/load-env.js";
import { isAiConfigured, loadConfig } from "@betterworld/shared";
import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { initDb, initRedis } from "./lib/container.js";
import { logger } from "./middleware/logger.js";
import { startWsServer } from "./ws/server.js";

// Load and validate environment variables (fails fast on missing/invalid vars)
const config = loadConfig();

const port = config.API_PORT;
const databaseUrl = config.DATABASE_URL;
const redisUrl = config.REDIS_URL;

// Initialize infrastructure connections
try {
  initDb(databaseUrl);
} catch (err) {
  logger.warn(
    { error: err instanceof Error ? err.message : "Unknown error" },
    "Failed to connect to database",
  );
}

try {
  initRedis(redisUrl);
} catch (err) {
  logger.warn(
    { error: err instanceof Error ? err.message : "Unknown error" },
    "Failed to connect to Redis",
  );
}

const app = createApp();

const server = serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ port: info.port }, "BetterWorld API started");
});

// Stop on SIGTERM/SIGINT. Several modules register handlers for these signals
// to close their queues, which (per Node's rules) disables the default
// "terminate" behaviour — so without an explicit exit the process ignored
// SIGTERM entirely and had to be SIGKILLed on every deploy or restart.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");
  server.close(() => process.exit(0));
  // Open keep-alive connections and worker shutdown must not hold the process up.
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Start WebSocket server on separate port (default 3001)
// DB and Redis are already initialized above (container uses singletons)
try {
  startWsServer();
} catch (err) {
  logger.warn(
    { error: err instanceof Error ? err.message : "Unknown error" },
    "Failed to start WebSocket server",
  );
}

// Background workers (guardrail evaluation, evidence verification, housekeeping…).
// Without them nothing a user submits ever leaves "pending".
//   development: run inside this process by default, so `pnpm dev` is a complete platform
//   production:  run src/workers/all-workers.ts as its own process, or set
//                EMBEDDED_WORKERS=true for a single-machine deployment
const embedWorkers =
  (process.env.EMBEDDED_WORKERS ?? (config.NODE_ENV === "development" ? "true" : "false")) === "true";

if (embedWorkers) {
  import("./workers/all-workers.js")
    .then(({ startAllWorkers }) => startAllWorkers())
    .then((report) => {
      logger.info(
        { started: report.started.length, failed: report.failed.map((f) => f.name) },
        "Embedded workers running",
      );
    })
    .catch((err) => {
      logger.error(
        { error: err instanceof Error ? err.message : "Unknown error" },
        "Failed to start embedded workers — submissions will stay pending",
      );
    });
} else {
  logger.info("Embedded workers disabled — expecting a separate worker process (src/workers/all-workers.ts)");
}

if (!isAiConfigured()) {
  logger.warn(
    "ANTHROPIC_API_KEY is not set — running in operator-moderated mode: all submissions and evidence go to the human review queues",
  );
}
