import { loadConfig } from "@betterworld/shared";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import * as jose from "jose";
import pino from "pino";

import { addClient, removeClient, handleMessage, addHumanClient, removeHumanClient, handleHumanMessage } from "./feed.js";
import { initDb, initRedis, getDb } from "../lib/container.js";
import { ALLOWED_ORIGINS } from "../middleware/cors.js";

const logger = pino({ name: "ws-server" });

/** T033: Maximum WebSocket message size in bytes (64KB) */
const MAX_MESSAGE_BYTES = 65536;

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

/**
 * T032: Validate WebSocket Origin header against CORS whitelist.
 * Rejects CSWSH (Cross-Site WebSocket Hijacking) attempts.
 * Returns true if Origin is valid, false otherwise.
 */
function validateOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

// WebSocket feed endpoint with auth
app.get(
  "/ws/feed",
  (c, next) => {
    // T032: Origin validation before WebSocket upgrade
    const origin = c.req.header("origin");
    if (!validateOrigin(origin)) {
      logger.warn({ origin: origin ?? "missing" }, "WebSocket /ws/feed rejected: unauthorized Origin");
      return c.json({ error: "Forbidden: invalid Origin" }, 403);
    }
    return next();
  },
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
        // T033: Reject oversized messages but keep connection open
        if (Buffer.byteLength(data, "utf-8") > MAX_MESSAGE_BYTES) {
          logger.warn({ agentId, bytes: Buffer.byteLength(data, "utf-8") }, "WebSocket message too large (>64KB)");
          ws.send(JSON.stringify({ error: "Message too large" }));
          return;
        }
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

// Sprint 16: Human WebSocket endpoint with JWT auth
app.get(
  "/ws/human",
  (c, next) => {
    // T032: Origin validation before WebSocket upgrade
    const origin = c.req.header("origin");
    if (!validateOrigin(origin)) {
      logger.warn({ origin: origin ?? "missing" }, "WebSocket /ws/human rejected: unauthorized Origin");
      return c.json({ error: "Forbidden: invalid Origin" }, 403);
    }
    return next();
  },
  upgradeWebSocket(async (c) => {
    const token = c.req.query("token");

    if (!token) {
      return {
        onOpen(_evt, ws) {
          ws.close(1008, "Missing authentication token");
        },
      };
    }

    // Authenticate human via JWT
    let humanId: string;
    try {
      const config = loadConfig();
      const secret = new TextEncoder().encode(config.JWT_SECRET);
      const { payload } = await jose.jwtVerify(token, secret);
      humanId = payload.userId as string;
      if (!humanId) {
        return {
          onOpen(_evt, ws) {
            ws.close(1008, "Invalid token payload");
          },
        };
      }
    } catch {
      return {
        onOpen(_evt, ws) {
          ws.close(1008, "Invalid credentials");
        },
      };
    }

    return {
      onOpen(_evt, ws) {
        addHumanClient(ws, humanId);
      },
      onMessage(evt, ws) {
        const data = typeof evt.data === "string" ? evt.data : evt.data.toString();
        // T033: Reject oversized messages but keep connection open
        if (Buffer.byteLength(data, "utf-8") > MAX_MESSAGE_BYTES) {
          logger.warn({ humanId, bytes: Buffer.byteLength(data, "utf-8") }, "WebSocket message too large (>64KB)");
          ws.send(JSON.stringify({ error: "Message too large" }));
          return;
        }
        handleHumanMessage(ws, data);
      },
      onClose(_evt, ws) {
        removeHumanClient(ws);
      },
      onError(_evt, ws) {
        removeHumanClient(ws);
      },
    };
  }),
);

// Health check for WebSocket server
app.get("/healthz", (c) => {
  return c.json({ ok: true, service: "ws-feed" });
});

export function startWsServer(portOverride?: number) {
  const wsPort = portOverride ?? (Number(process.env.WS_PORT) || 3001);
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
