/**
 * Governance Routes (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * GET /governance/power-audit — Public power distribution audit (latest + trend)
 * GET /governance/network-health — Public network health metrics
 */
import { connections, follows, humanProfiles } from "@betterworld/db";
import { AppError } from "@betterworld/shared";
import { count, sql } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { PowerAuditService } from "../../services/power-audit.js";

const governanceRoutes = new Hono<AppEnv>();

// ── GET /governance/power-audit ──
governanceRoutes.get("/governance/power-audit", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const auditService = new PowerAuditService(db);
  const { latest, trend } = await auditService.getLatest(8);

  return c.json({ ok: true, data: { latest, trend }, requestId: c.get("requestId") });
});

// ── GET /governance/network-health ──
governanceRoutes.get("/governance/network-health", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  // Connection density
  const [connectionCount] = await db
    .select({ count: count() })
    .from(connections);

  const [participantCount] = await db
    .select({ count: count() })
    .from(humanProfiles);

  const totalConnections = connectionCount?.count ?? 0;
  const totalParticipants = participantCount?.count ?? 1;
  const possibleConnections = (totalParticipants * (totalParticipants - 1)) / 2;
  const connectionDensity = possibleConnections > 0
    ? Math.round((totalConnections / possibleConnections) * 10000) / 10000
    : 0;

  // Follow reciprocity
  const [followCount] = await db
    .select({ count: count() })
    .from(follows);
  const totalFollows = followCount?.count ?? 0;

  // Unique cities
  const [cityResult] = await db
    .select({ cityCount: sql<number>`COUNT(DISTINCT ${humanProfiles.city})` })
    .from(humanProfiles)
    .where(sql`${humanProfiles.city} IS NOT NULL`);
  const cityCount = Number(cityResult?.cityCount) || 0;

  return c.json({
    ok: true,
    data: {
      connectionDensity,
      totalConnections,
      totalParticipants,
      totalFollows,
      citiesConnected: cityCount,
      reciprocityRate: totalFollows > 0
        ? Math.round((totalConnections * 2 / totalFollows) * 10000) / 10000
        : 0,
    },
    requestId: c.get("requestId"),
  });
});

export default governanceRoutes;
