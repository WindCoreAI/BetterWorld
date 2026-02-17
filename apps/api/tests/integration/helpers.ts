import { humans } from "@betterworld/db";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type Redis from "ioredis";
import * as jose from "jose";

import { createApp } from "../../src/app.js";
import { initDb, initRedis, shutdown } from "../../src/lib/container.js";
import { startWsServer } from "../../src/ws/server.js";

// Read dynamically at call time so tests that set JWT_SECRET in beforeAll work correctly
function getJwtSecret() {
  return process.env.JWT_SECRET ?? "a-very-secret-key-that-is-at-least-32-chars-long";
}

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://betterworld:betterworld_dev@localhost:5432/betterworld";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

let db: PostgresJsDatabase;
let redis: Redis;
let wsServer: ReturnType<typeof startWsServer> | null = null;
let wsPort = 0;

export function getTestApp() {
  return createApp();
}

export function getWsPort() {
  return wsPort;
}

export async function setupTestInfra() {
  db = initDb(DATABASE_URL);
  redis = initRedis(REDIS_URL);
  await redis.connect();

  // Start WebSocket server on a random available port to avoid EADDRINUSE in tests
  wsServer = startWsServer(0);

  // Retrieve the actual port assigned by the OS
  const addr = wsServer.address();
  if (addr && typeof addr === "object") {
    wsPort = addr.port;
  }

  // Give the server a moment to start
  await new Promise((resolve) => setTimeout(resolve, 500));
}

export async function cleanupTestData() {
  if (db) {
    // Use CASCADE to handle foreign key dependencies, and IF EXISTS to avoid errors
    await db.execute(sql`TRUNCATE TABLE flagged_content, guardrail_evaluations, debates, solutions, problems, agents, humans CASCADE`);
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

/**
 * Create a test human directly in the DB and return a JWT token.
 * Used internally by registerTestAgent for the human-first agent creation flow.
 */
export async function createTestHuman(opts: {
  emailVerified?: boolean;
  displayName?: string;
  role?: string;
} = {}) {
  agentCounter++;
  const email = `test_human_${Date.now()}_${agentCounter}@example.com`;
  const displayName = opts.displayName ?? `Test Human ${agentCounter}`;

  const [human] = await db
    .insert(humans)
    .values({
      email,
      displayName,
      role: opts.role ?? "human",
      emailVerified: opts.emailVerified ?? false,
    })
    .returning();

  const secret = new TextEncoder().encode(getJwtSecret());
  const token = await new jose.SignJWT({ userId: human!.id, email })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("15m")
    .sign(secret);

  return { human: human!, token };
}

/**
 * Register a test agent via the human-first flow (Sprint 19).
 * Creates a human owner, then creates an agent under that human via POST /my-agents.
 * Returns the same shape as the old registerTestAgent for backward compatibility.
 */
export async function registerTestAgent(
  app: ReturnType<typeof createApp>,
  overrides: Record<string, unknown> = {},
) {
  agentCounter++;
  const { email: _email, ...agentFields } = overrides;
  const body = {
    username: `test_agent_${Date.now()}_${agentCounter}_${Math.random().toString(36).slice(2, 8)}`,
    framework: "custom",
    specializations: ["healthcare_improvement"],
    ...agentFields,
  };

  // Create a human owner for the agent
  const { token, human } = await createTestHuman();

  const res = await app.request("/api/v1/my-agents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return { res, data, body, humanToken: token, humanId: human.id };
}
