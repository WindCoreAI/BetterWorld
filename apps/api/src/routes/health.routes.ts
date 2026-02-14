import { Hono } from "hono";

import type { AppEnv } from "../app.js";

export const healthRoutes = new Hono<AppEnv>();

// GET /healthz — Liveness check (is the process running?)
// FR-025: Wrapped in standard envelope with `data` field
healthRoutes.get("/healthz", (c) => {
  return c.json({
    ok: true,
    data: {
      status: "alive",
      uptime: process.uptime(),
    },
    requestId: c.get("requestId"),
  });
});

// GET /readyz — Readiness check (are dependencies healthy?)
healthRoutes.get("/readyz", async (c) => {
  const checks = {
    database: "ok" as "ok" | "error",
    redis: "ok" as "ok" | "error",
    migrations: "ok" as "ok" | "pending" | "error",
  };

  // Check PostgreSQL connectivity
  try {
    const { getDb } = await import("../lib/container.js");
    const db = getDb();
    if (db) {
      const { sql } = await import("drizzle-orm");
      await db.execute(sql`SELECT 1`);
    } else {
      checks.database = "error";
    }
  } catch {
    checks.database = "error";
  }

  // Check Redis connectivity
  try {
    const { getRedis } = await import("../lib/container.js");
    const redis = getRedis();
    if (redis) {
      await redis.ping();
    } else {
      checks.redis = "error";
    }
  } catch {
    checks.redis = "error";
  }

  // Determine overall status
  let status: "ready" | "degraded" | "unhealthy";
  if (checks.database === "error") {
    status = "unhealthy";
  } else if (checks.redis === "error") {
    status = "degraded";
  } else {
    status = "ready";
  }

  const statusCode = status === "unhealthy" ? 503 : 200;

  return c.json(
    {
      ok: status !== "unhealthy",
      data: {
        status,
        checks,
        version: "0.1.0",
        uptime: process.uptime(),
      },
      requestId: c.get("requestId"),
    },
    statusCode,
  );
});
