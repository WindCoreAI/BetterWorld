import "dotenv/config";
import { loadConfig } from "@betterworld/shared";
import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { initDb, initRedis } from "./lib/container.js";
import { logger } from "./middleware/logger.js";

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

serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ port: info.port }, "BetterWorld API started");
});
