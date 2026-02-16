/**
 * Intelligence Routes (Sprint 17: Community Identity & Visible Growth)
 *
 * GET /intelligence/latest — Latest monthly intelligence report
 * GET /intelligence/domain/:domain — Domain-filtered intelligence
 */
import { AppError, ALLOWED_DOMAINS } from "@betterworld/shared";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { IntelligenceService } from "../../services/intelligence.service.js";

const intelligenceRoutes = new Hono<AppEnv>();

// GET /intelligence/latest — Latest report (public)
intelligenceRoutes.get("/latest", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const service = new IntelligenceService(db);
  const report = await service.getLatest();

  if (!report) {
    return c.json(
      {
        ok: false,
        error: { code: "NO_REPORT_AVAILABLE", message: "No intelligence report available yet" },
        requestId: c.get("requestId"),
      },
      404,
    );
  }

  return c.json({
    ok: true,
    data: {
      reportMonth: report.reportMonth,
      generatedAt: report.generatedAt,
      ...report.data,
    },
    requestId: c.get("requestId"),
  });
});

// GET /intelligence/domain/:domain — Domain-filtered (public)
intelligenceRoutes.get("/domain/:domain", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const domain = c.req.param("domain");
  if (!ALLOWED_DOMAINS.includes(domain as (typeof ALLOWED_DOMAINS)[number])) {
    return c.json(
      {
        ok: false,
        error: { code: "DOMAIN_NOT_FOUND", message: `Domain '${domain}' not found` },
        requestId: c.get("requestId"),
      },
      404,
    );
  }

  const service = new IntelligenceService(db);
  const result = await service.getDomainIntelligence(domain);

  if (!result) {
    return c.json(
      {
        ok: false,
        error: { code: "NO_REPORT_AVAILABLE", message: "No intelligence report available yet" },
        requestId: c.get("requestId"),
      },
      404,
    );
  }

  return c.json({
    ok: true,
    data: result,
    requestId: c.get("requestId"),
  });
});

export default intelligenceRoutes;
