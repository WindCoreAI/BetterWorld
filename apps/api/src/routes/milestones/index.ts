/**
 * Milestones Routes (Sprint 17: Community Identity & Visible Growth)
 *
 * GET /milestones — List milestones for a group (domain or city)
 */
import { groupMilestones } from "@betterworld/db";
import { AppError } from "@betterworld/shared";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";

const milestoneRoutes = new Hono<AppEnv>();

const querySchema = z.object({
  groupType: z.enum(["domain", "city"]),
  groupValue: z.string().min(1),
  status: z.enum(["reached", "unreached", "all"]).default("all"),
});

// GET /milestones — List milestones for a group (public)
milestoneRoutes.get("/", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const query = c.req.query();
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) {
    return c.json(
      {
        ok: false,
        error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid query" },
        requestId: c.get("requestId"),
      },
      400,
    );
  }

  const { groupType, groupValue, status } = parsed.data;

  const conditions = [
    eq(groupMilestones.groupType, groupType),
    eq(groupMilestones.groupValue, groupValue),
  ];

  if (status === "reached") {
    conditions.push(isNotNull(groupMilestones.reachedAt));
  } else if (status === "unreached") {
    conditions.push(isNull(groupMilestones.reachedAt));
  }

  const rows = await db
    .select()
    .from(groupMilestones)
    .where(and(...conditions))
    .orderBy(groupMilestones.targetValue);

  const now = new Date();
  const data = rows.map((m) => ({
    id: m.id,
    groupType: m.groupType,
    groupValue: m.groupValue,
    milestoneType: m.milestoneType,
    targetValue: m.targetValue,
    currentValue: m.currentValue,
    reachedAt: m.reachedAt?.toISOString() ?? null,
    bannerExpiresAt: m.bannerExpiresAt?.toISOString() ?? null,
    bannerActive: m.bannerExpiresAt ? m.bannerExpiresAt > now : false,
  }));

  return c.json({
    ok: true,
    data,
    requestId: c.get("requestId"),
  });
});

export default milestoneRoutes;
