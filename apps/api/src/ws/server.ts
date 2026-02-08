import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import pino from "pino";

import { addClient, removeClient, handleMessage } from "./feed.js";
import { initDb, initRedis, getDb } from "../lib/container.js";

const logger = pino({ name: "ws-server" });

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// WebSocket feed endpoint with auth
app.get(
  "/ws/feed",
  upgradeWebSocket(async (c) => {
    const token = c.req.query("token");

    if (!token) {
      return {
        onOpen(_evt, ws) {
          ws.close(1008, "Missing authentication token");
        },
      };
    }

    // Authenticate the agent
    const db = getDb();
    if (!db) {
      return {
        onOpen(_evt, ws) {
          ws.close(1011, "Service unavailable");
        },
      };
    }

    const prefix = token.slice(0, 12);
    const { agents } = await import("@betterworld/db");

    const [agent] = await db
      .select({
        id: agents.id,
        username: agents.username,
        apiKeyHash: agents.apiKeyHash,
        isActive: agents.isActive,
      })
      .from(agents)
      .where(eq(agents.apiKeyPrefix, prefix))
      .limit(1);

    if (!agent || !agent.isActive) {
      return {
        onOpen(_evt, ws) {
          ws.close(1008, "Invalid credentials");
        },
      };
    }

    const valid = await bcrypt.compare(token, agent.apiKeyHash);
    if (!valid) {
      return {
        onOpen(_evt, ws) {
          ws.close(1008, "Invalid credentials");
        },
      };
    }

    const agentId = agent.id;
    const username = agent.username;

    return {
      onOpen(_evt, ws) {
        addClient(ws, agentId, username);
      },
      onMessage(evt, ws) {
        const data = typeof evt.data === "string" ? evt.data : evt.data.toString();
        handleMessage(ws, data);
      },
      onClose(_evt, ws) {
        removeClient(ws);
      },
      onError(_evt, ws) {
        removeClient(ws);
      },
    };
  }),
);

// Health check for WebSocket server
app.get("/healthz", (c) => {
  return c.json({ ok: true, service: "ws-feed" });
});

export function startWsServer() {
  const wsPort = Number(process.env.WS_PORT) || 3001;
  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgresql://betterworld:betterworld_dev@localhost:5432/betterworld";
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

  try {
    initDb(databaseUrl);
  } catch (err) {
    logger.warn({ err }, "Failed to connect to database for WS server");
  }

  try {
    initRedis(redisUrl);
  } catch (err) {
    logger.warn({ err }, "Failed to connect to Redis for WS server");
  }

  const server = serve({ fetch: app.fetch, port: wsPort }, (info) => {
    logger.info(`BetterWorld WebSocket server running on http://localhost:${info.port}`);
  });

  injectWebSocket(server);

  return server;
}

// Run directly if this is the entry point
const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1]?.endsWith("ws/server.ts");

if (isDirectRun) {
  startWsServer();
}
