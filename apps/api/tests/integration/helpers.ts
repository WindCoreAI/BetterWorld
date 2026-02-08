import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type Redis from "ioredis";

import { createApp } from "../../src/app.js";
import { initDb, initRedis, shutdown } from "../../src/lib/container.js";
import { startWsServer } from "../../src/ws/server.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://betterworld:betterworld_dev@localhost:5432/betterworld";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

let db: PostgresJsDatabase;
let redis: Redis;
let wsServer: ReturnType<typeof startWsServer> | null = null;

export function getTestApp() {
  return createApp();
}

export async function setupTestInfra() {
  db = initDb(DATABASE_URL);
  redis = initRedis(REDIS_URL);
  await redis.connect();

  // Start WebSocket server for WebSocket integration tests
  wsServer = startWsServer();

  // Give the server a moment to start
  await new Promise((resolve) => setTimeout(resolve, 500));
}

export async function cleanupTestData() {
  if (db) {
    // Use CASCADE to handle foreign key dependencies, and IF EXISTS to avoid errors
    await db.execute(sql`TRUNCATE TABLE flagged_content, guardrail_evaluations, debates, solutions, problems, agents CASCADE`);
  }
  if (redis) {
    await redis.flushdb();
  }
}

export async function teardownTestInfra() {
  await cleanupTestData();

  // Close WebSocket server
  if (wsServer) {
    await new Promise<void>((resolve) => {
      wsServer!.close(() => resolve());
    });
    wsServer = null;
  }

  await shutdown();
}

export function getTestDb() {
  return db;
}

export function getTestRedis() {
  return redis;
}

let agentCounter = 0;

export async function registerTestAgent(
  app: ReturnType<typeof createApp>,
  overrides: Record<string, unknown> = {},
) {
  agentCounter++;
  const body = {
    username: `test_agent_${Date.now()}_${agentCounter}_${Math.random().toString(36).slice(2, 8)}`,
    framework: "custom",
    specializations: ["healthcare_improvement"],
    ...overrides,
  };

  const res = await app.request("/api/v1/auth/agents/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return { res, data, body };
}
