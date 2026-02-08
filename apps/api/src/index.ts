import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { initDb, initRedis } from "./lib/container.js";

const port = Number(process.env.API_PORT) || 4000;
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://betterworld:betterworld_dev@localhost:5432/betterworld";
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

// Initialize infrastructure connections
try {
  initDb(databaseUrl);
} catch (err) {
  console.warn("Failed to connect to database:", err);
}

try {
  initRedis(redisUrl);
} catch (err) {
  console.warn("Failed to connect to Redis:", err);
}

const app = createApp();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`BetterWorld API running on http://localhost:${info.port}`);
});
