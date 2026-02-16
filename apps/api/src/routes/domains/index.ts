/**
 * Domain Community Routes (Sprint 17: Community Identity & Visible Growth)
 *
 * GET /domains — List all 15 domains with basic metrics
 * GET /domains/:slug — Domain community page with full data
 */
import { AppError } from "@betterworld/shared";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { DomainCommunityService } from "../../services/domain-community.service.js";

const domainRoutes = new Hono<AppEnv>();

const detailQuerySchema = z.object({
  contributorLimit: z.coerce.number().int().min(1).max(50).default(10),
});

// GET /domains — List all 15 domains with basic metrics (public)
domainRoutes.get("/", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const service = new DomainCommunityService(db);
  const domains = await service.listDomains();

  return c.json({
    ok: true,
    data: domains,
    requestId: c.get("requestId"),
  });
});

// GET /domains/:slug — Domain community page (public)
domainRoutes.get("/:slug", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const slug = c.req.param("slug");
  const query = c.req.query();
  const parsed = detailQuerySchema.safeParse(query);
  const contributorLimit = parsed.success ? parsed.data.contributorLimit : 10;

  const service = new DomainCommunityService(db);
  const detail = await service.getDomainDetail(slug, contributorLimit);

  if (!detail) {
    return c.json(
      {
        ok: false,
        error: { code: "DOMAIN_NOT_FOUND", message: `Domain '${slug}' not found` },
        requestId: c.get("requestId"),
      },
      404,
    );
  }

  return c.json({
    ok: true,
    data: detail,
    requestId: c.get("requestId"),
  });
});

export default domainRoutes;
