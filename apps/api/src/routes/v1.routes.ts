import { Hono } from "hono";

import type { AppEnv } from "../app.js";

export const v1Routes = new Hono<AppEnv>();

// GET /api/v1/health — API-level health check (Sprint 1 DoD)
v1Routes.get("/health", (c) => {
  return c.json({
    ok: true,
    requestId: c.get("requestId"),
  });
});
