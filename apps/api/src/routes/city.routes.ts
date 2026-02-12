/**
 * City Dashboard Routes (Sprint 11 — T042)
 *
 * GET /city/list — List supported cities
 * GET /city/:city/metrics — Get city dashboard metrics
 */
import { sql } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../app.js";
import { getDb, getRedis } from "../lib/container.js";

const SUPPORTED_CITIES = [
  { id: "portland", displayName: "Portland, OR", center: { lat: 45.5152, lng: -122.6784 } },
  { id: "chicago", displayName: "Chicago, IL", center: { lat: 41.8781, lng: -87.6298 } },
];

const SUPPORTED_CITY_IDS = new Set(SUPPORTED_CITIES.map((c) => c.id));

const cityRoutes = new Hono<AppEnv>();

// ============================================================================
// GET /city/list — List supported cities
// ============================================================================

cityRoutes.get("/list", async (c) => {
  const db = getDb();

  const cities = await Promise.all(
    SUPPORTED_CITIES.map(async (city) => {
      let totalProblems = 0;

      if (db) {
        try {
          const [result] = await db.execute(sql`
            SELECT COUNT(*) as count FROM problems
            WHERE municipal_source_type = ${city.id}
          `);
          totalProblems = Number((result as Record<string, string>)?.count ?? 0);
        } catch {
          // Non-fatal
        }
      }

      return {
        id: city.id,
        displayName: city.displayName,
        center: city.center,
        totalProblems,
      };
    }),
  );

  return c.json({
    ok: true,
    data: { cities },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// GET /city/:city/metrics — Get city dashboard metrics
// ============================================================================

cityRoutes.get("/:city/metrics", async (c) => {
  const cityId = c.req.param("city");

  if (!SUPPORTED_CITY_IDS.has(cityId)) {
    return c.json(
      {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `City '${cityId}' is not configured for local dashboard`,
        },
        requestId: c.get("requestId"),
      },
      404,
    );
  }

  const redis = getRedis();

  // Try Redis cache first
  if (redis) {
    try {
      const cached = await redis.get(`betterworld:city:metrics:${cityId}`);
      if (cached) {
        return c.json({
          ok: true,
          data: JSON.parse(cached),
          requestId: c.get("requestId"),
        });
      }
    } catch {
      // Cache miss, fall through to live query
    }
  }

  // Live query fallback
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const city = SUPPORTED_CITIES.find((c) => c.id === cityId)!;

  // Basic live query
  const problemsByCategory = await db.execute(sql`
    SELECT domain, COUNT(*) as count
    FROM problems
    WHERE municipal_source_type = ${cityId}
    GROUP BY domain
    ORDER BY count DESC
  `);

  const [totalResult] = await db.execute(sql`
    SELECT COUNT(*) as count FROM problems WHERE municipal_source_type = ${cityId}
  `);

  const metrics = {
    city: cityId,
    displayName: city.displayName,
    metrics: {
      problemsByCategory: (problemsByCategory as Array<Record<string, string>>).map((r) => ({
        domain: r.domain ?? "unknown",
        count: Number(r.count ?? 0),
      })),
      avgResolutionTimeDays: null,
      activeLocalValidators: 0,
      totalProblems: Number((totalResult as Record<string, string>)?.count ?? 0),
      totalObservations: 0,
    },
    heatmap: [],
    lastAggregatedAt: null,
  };

  return c.json({
    ok: true,
    data: metrics,
    requestId: c.get("requestId"),
  });
});

export default cityRoutes;
