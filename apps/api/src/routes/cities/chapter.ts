/**
 * City Chapter Routes (Sprint 17: Community Identity & Visible Growth)
 *
 * GET /cities/:citySlug/chapter — City chapter data with community identity
 */
import { AppError } from "@betterworld/shared";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { CityChapterService } from "../../services/city-chapter.service.js";

const cityChapterRoutes = new Hono<AppEnv>();

// GET /cities/:citySlug/chapter — City chapter page (public)
cityChapterRoutes.get("/:citySlug/chapter", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const citySlug = c.req.param("citySlug");
  const service = new CityChapterService(db);
  const chapter = await service.getChapter(citySlug);

  if (!chapter) {
    return c.json(
      {
        ok: false,
        error: { code: "CITY_NOT_FOUND", message: `City '${citySlug}' not found` },
        requestId: c.get("requestId"),
      },
      404,
    );
  }

  return c.json({
    ok: true,
    data: chapter,
    requestId: c.get("requestId"),
  });
});

export default cityChapterRoutes;
