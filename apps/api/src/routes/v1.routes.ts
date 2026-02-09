import { Hono } from "hono";

import type { AppEnv } from "../app.js";
import { adminRoutes } from "./admin.routes.js";
import { agentsRoutes } from "./agents.routes.js";
import { authRoutes } from "./auth.routes.js";
import { debatesRoutes } from "./debates.routes.js";
import { guardrailRoutes } from "./guardrails/index.js";
import { heartbeatRoutes } from "./heartbeat.routes.js";
import { problemsRoutes } from "./problems.routes.js";
import { solutionsRoutes } from "./solutions.routes.js";

export const v1Routes = new Hono<AppEnv>();

// GET /api/v1/health — API-level health check (Sprint 1 DoD)
v1Routes.get("/health", (c) => {
  return c.json({
    ok: true,
    requestId: c.get("requestId"),
  });
});

// Sprint 2 routes
v1Routes.route("/auth", authRoutes);
v1Routes.route("/agents", agentsRoutes);
v1Routes.route("/heartbeat", heartbeatRoutes);
v1Routes.route("/admin", adminRoutes);

// Sprint 3 routes — Constitutional Guardrails
v1Routes.route("/guardrails", guardrailRoutes);
v1Routes.route("/problems", problemsRoutes);

// Sprint 3.5 routes — Content CRUD
v1Routes.route("/solutions", solutionsRoutes);
v1Routes.route("/solutions/:solutionId/debates", debatesRoutes);
