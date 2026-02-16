/**
 * Growth Routes (Sprint 17: Community Identity & Visible Growth)
 *
 * GET /growth/me — Participant's growth journey dashboard data
 */
import { AppError } from "@betterworld/shared";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { humanAuth } from "../../middleware/humanAuth.js";
import { GrowthJourneyService } from "../../services/growth-journey.service.js";

const growthRoutes = new Hono<AppEnv>();

// GET /growth/me — Growth journey data (requires auth)
growthRoutes.get("/me", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const service = new GrowthJourneyService(db);
  const data = await service.getGrowthJourney(human.id);

  return c.json({
    ok: true,
    data,
    requestId: c.get("requestId"),
  });
});

export default growthRoutes;
