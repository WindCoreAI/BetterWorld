/**
 * Mission Routes (Sprint 7: Mission Marketplace)
 *
 * Agent endpoints: POST (create), PATCH (update), DELETE (archive), GET /agent (list own)
 * Human endpoints: GET / (marketplace browse), GET /:id (detail), POST /:id/claim, GET /mine
 * Mixed auth: GET / supports both agent and human auth
 */

import { missions, solutions, problems, missionClaims, humanProfiles, agents } from "@betterworld/db";
import {
  AppError,
  createMissionSchema,
  updateMissionSchema,
  paginationQuerySchema,
  missionListQuerySchema,
  updateClaimSchema,
} from "@betterworld/shared";
import type { MissionStatus, DifficultyLevel } from "@betterworld/shared";
import { and, eq, desc, lt, sql, gte, lte, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { getDb } from "../../lib/container.js";
import { snapToGrid } from "../../lib/geo-helpers.js";
import { enqueueForEvaluation } from "../../lib/guardrail-helpers.js";
import { parseUuidParam } from "../../lib/validation.js";
import { requireAgent } from "../../middleware/auth.js";
import type { AuthEnv } from "../../middleware/auth.js";
import { humanAuth } from "../../middleware/humanAuth.js";

/** Resolve mission location data with privacy snapping for non-claimers. */
function resolveLocation(
  rawLat: string | null,
  rawLng: string | null,
  radiusKm: number | null,
  hasExactAccess: boolean,
) {
  const radius = radiusKm ?? 5;
  const lat = rawLat ? Number(rawLat) : null;
  const lng = rawLng ? Number(rawLng) : null;
  if (lat === null || lng === null) {
    return { latitude: null, longitude: null, radiusKm: radius, isExact: false };
  }
  if (hasExactAccess) {
    return { latitude: lat, longitude: lng, radiusKm: radius, isExact: true };
  }
  const snapped = snapToGrid(lat, lng);
  return { latitude: snapped.latitude, longitude: snapped.longitude, radiusKm: radius, isExact: false };
}

const missionRoutes = new Hono<AuthEnv>();

// Valid enum values for type-safe filtering
const VALID_MISSION_STATUSES: readonly string[] = ["open", "claimed", "in_progress", "submitted", "verified", "expired", "archived"];
const VALID_DIFFICULTY_LEVELS: readonly string[] = ["beginner", "intermediate", "advanced", "expert"];
const VALID_DOMAINS: readonly string[] = [
  "poverty_reduction", "education_access", "healthcare_improvement", "environmental_protection",
  "food_security", "mental_health_wellbeing", "community_building", "disaster_response",
  "digital_inclusion", "human_rights", "clean_water_sanitation", "sustainable_energy",
  "gender_equality", "biodiversity_conservation", "elder_care",
];

// ---------------------------------------------------------------------------
// T017: POST / — Create mission
// ---------------------------------------------------------------------------
missionRoutes.post("/", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const body = await c.req.json();
  const parsed = createMissionSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid request body", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const agent = c.get("agent")!;

  // Verify solution exists, is owned by the agent, and is approved
  const [solution] = await db
    .select({
      id: solutions.id,
      proposedByAgentId: solutions.proposedByAgentId,
      guardrailStatus: solutions.guardrailStatus,
      problemId: solutions.problemId,
    })
    .from(solutions)
    .where(eq(solutions.id, parsed.data.solutionId))
    .limit(1);

  if (!solution) {
    throw new AppError("NOT_FOUND", "Solution not found");
  }
  if (solution.proposedByAgentId !== agent.id) {
    throw new AppError(
      "FORBIDDEN",
      "You can only create missions for your own solutions",
    );
  }
  if (solution.guardrailStatus !== "approved") {
    throw new AppError(
      "FORBIDDEN",
      "Solution must be approved before creating missions",
    );
  }

  // Fetch domain from the parent problem
  const [problem] = await db
    .select({ domain: problems.domain })
    .from(problems)
    .where(eq(problems.id, solution.problemId))
    .limit(1);

  const domain = problem?.domain ?? parsed.data.domain;

  const { solutionId, ...missionData } = parsed.data;

  const result = await db.transaction(async (tx) => {
    // FR-005: Populate PostGIS location column when coordinates are provided
    const locationSql =
      missionData.requiredLatitude != null && missionData.requiredLongitude != null
        ? sql`ST_MakePoint(${missionData.requiredLongitude}, ${missionData.requiredLatitude})::geography`
        : null;

    const [mission] = await tx
      .insert(missions)
      .values({
        solutionId,
        createdByAgentId: agent.id,
        title: missionData.title,
        description: missionData.description,
        instructions: missionData.instructions,
        evidenceRequired: missionData.evidenceRequired,
        requiredSkills: missionData.requiredSkills ?? [],
        domain,
        requiredLocationName: missionData.requiredLocationName ?? null,
        requiredLatitude:
          missionData.requiredLatitude != null
            ? String(missionData.requiredLatitude)
            : null,
        requiredLongitude:
          missionData.requiredLongitude != null
            ? String(missionData.requiredLongitude)
            : null,
        location: locationSql,
        locationRadiusKm: missionData.locationRadiusKm ?? 5,
        estimatedDurationMinutes: missionData.estimatedDurationMinutes,
        difficulty: missionData.difficulty ?? "intermediate",
        missionType: missionData.missionType ?? null,
        tokenReward: missionData.tokenReward,
        bonusForQuality: missionData.bonusForQuality ?? 0,
        maxClaims: missionData.maxClaims ?? 1,
        expiresAt: new Date(missionData.expiresAt),
        guardrailStatus: "pending",
      })
      .returning();

    // Enqueue for guardrail evaluation
    const evaluationId = await enqueueForEvaluation(tx, {
      contentId: mission!.id,
      contentType: "mission",
      content: JSON.stringify({
        title: missionData.title,
        description: missionData.description,
      }),
      agentId: agent.id,
    });

    return { ...mission!, guardrailEvaluationId: evaluationId };
  });

  return c.json(
    {
      ok: true,
      data: {
        id: result.id,
        guardrailStatus: result.guardrailStatus,
        guardrailEvaluationId: result.guardrailEvaluationId,
        status: result.status,
        createdAt: result.createdAt,
      },
      requestId: c.get("requestId"),
    },
    201,
  );
});

// ---------------------------------------------------------------------------
// T020: GET /agent — List agent's missions (must be before /:id)
// ---------------------------------------------------------------------------
const agentMissionListQuerySchema = paginationQuerySchema.extend({
  status: z.string().optional(),
});

missionRoutes.get("/agent", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const query = c.req.query();
  const parsed = agentMissionListQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query parameters", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const agent = c.get("agent")!;
  const { limit, cursor, status } = parsed.data;

  const conditions = [eq(missions.createdByAgentId, agent.id)];

  if (status && VALID_MISSION_STATUSES.includes(status)) {
    conditions.push(
      eq(missions.status, status as MissionStatus),
    );
  }

  if (cursor) {
    conditions.push(lt(missions.createdAt, new Date(cursor)));
  }

  const rows = await db
    .select({
      id: missions.id,
      solutionId: missions.solutionId,
      title: missions.title,
      description: missions.description,
      domain: missions.domain,
      difficulty: missions.difficulty,
      tokenReward: missions.tokenReward,
      maxClaims: missions.maxClaims,
      currentClaimCount: missions.currentClaimCount,
      guardrailStatus: missions.guardrailStatus,
      status: missions.status,
      expiresAt: missions.expiresAt,
      createdAt: missions.createdAt,
    })
    .from(missions)
    .where(and(...conditions))
    .orderBy(desc(missions.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem ? lastItem.createdAt.toISOString() : null;

  return c.json({
    ok: true,
    data: items,
    meta: {
      hasMore,
      nextCursor,
      count: items.length,
    },
    requestId: c.get("requestId"),
  });
});

// ---------------------------------------------------------------------------
// T033: GET /mine — Human's claimed missions (must be before /:id)
// ---------------------------------------------------------------------------
missionRoutes.get("/mine", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const query = c.req.query();
  const limitParam = parseInt(query.limit || "20", 10);
  const limit = Math.min(Math.max(1, limitParam), 50);
  const cursor = query.cursor;
  const statusFilter = query.status;

  const validClaimStatuses = ["active", "submitted", "verified", "abandoned", "released"];
  const conditions = [eq(missionClaims.humanId, human.id)];
  if (statusFilter && validClaimStatuses.includes(statusFilter)) {
    conditions.push(eq(missionClaims.status, statusFilter as typeof missionClaims.status.enumValues[number]));
  }
  if (cursor) {
    conditions.push(lt(missionClaims.claimedAt, new Date(cursor)));
  }

  const rows = await db
    .select({
      id: missionClaims.id,
      status: missionClaims.status,
      claimedAt: missionClaims.claimedAt,
      deadlineAt: missionClaims.deadlineAt,
      progressPercent: missionClaims.progressPercent,
      missionId: missionClaims.missionId,
      // Join mission data
      missionTitle: missions.title,
      missionDomain: missions.domain,
      missionTokenReward: missions.tokenReward,
      missionDifficulty: missions.difficulty,
      missionLocationName: missions.requiredLocationName,
      missionLatitude: missions.requiredLatitude,
      missionLongitude: missions.requiredLongitude,
    })
    .from(missionClaims)
    .innerJoin(missions, eq(missionClaims.missionId, missions.id))
    .where(and(...conditions))
    .orderBy(desc(missionClaims.claimedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem ? lastItem.claimedAt.toISOString() : null;

  const claims = items.map(r => ({
    id: r.id,
    status: r.status,
    claimedAt: r.claimedAt,
    deadlineAt: r.deadlineAt,
    progressPercent: r.progressPercent,
    mission: {
      id: r.missionId,
      title: r.missionTitle,
      domain: r.missionDomain,
      tokenReward: r.missionTokenReward,
      difficulty: r.missionDifficulty,
      requiredLocationName: r.missionLocationName,
      location: {
        latitude: r.missionLatitude ? Number(r.missionLatitude) : null,
        longitude: r.missionLongitude ? Number(r.missionLongitude) : null,
        isExact: true, // Claimed missions get exact location
      },
    },
  }));

  return c.json({
    ok: true,
    data: { claims, nextCursor, hasMore },
    requestId: c.get("requestId"),
  });
});

// ---------------------------------------------------------------------------
// T023: GET / — Marketplace browse (must be before /:id)
// ---------------------------------------------------------------------------

/** Build WHERE conditions for marketplace browse from validated query params. */
function buildMarketplaceFilters(
  parsed: z.infer<typeof missionListQuerySchema>,
) {
  const { cursor, domain, skills, difficulty, status, minReward, maxReward, maxDuration } = parsed;

  const conditions = [eq(missions.guardrailStatus, "approved")];

  if (status && VALID_MISSION_STATUSES.includes(status)) {
    conditions.push(eq(missions.status, status as MissionStatus));
  } else {
    conditions.push(eq(missions.status, "open"));
  }

  if (domain && VALID_DOMAINS.includes(domain)) {
    conditions.push(eq(missions.domain, domain as typeof missions.domain.enumValues[number]));
  }
  if (difficulty && VALID_DIFFICULTY_LEVELS.includes(difficulty)) {
    conditions.push(eq(missions.difficulty, difficulty as DifficultyLevel));
  }
  if (minReward !== undefined) conditions.push(gte(missions.tokenReward, minReward));
  if (maxReward !== undefined) conditions.push(lte(missions.tokenReward, maxReward));
  if (maxDuration !== undefined) conditions.push(lte(missions.estimatedDurationMinutes, maxDuration));

  if (skills) {
    const skillsArr = skills.split(",").map(s => s.trim()).filter(Boolean);
    if (skillsArr.length > 0) {
      conditions.push(sql`${missions.requiredSkills} @> ARRAY[${sql.join(skillsArr.map(s => sql`${s}`), sql`, `)}]::text[]`);
    }
  }

  if (cursor) {
    conditions.push(lt(missions.createdAt, new Date(cursor)));
  }

  return conditions;
}

/** Convert a raw mission row to a marketplace list item with snapped coordinates. */
function toMarketplaceItem(m: {
  description: string;
  requiredLatitude: string | null;
  requiredLongitude: string | null;
  maxClaims: number;
  currentClaimCount: number;
  [key: string]: unknown;
}) {
  const { requiredLatitude, requiredLongitude, ...rest } = m;
  return {
    ...rest,
    description: m.description.length > 200 ? m.description.slice(0, 200) + "..." : m.description,
    approximateLatitude: requiredLatitude ? snapToGrid(Number(requiredLatitude), Number(requiredLongitude || 0)).latitude : null,
    approximateLongitude: requiredLongitude ? snapToGrid(Number(requiredLatitude || 0), Number(requiredLongitude)).longitude : null,
    slotsAvailable: m.maxClaims - m.currentClaimCount,
  };
}

missionRoutes.get("/", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const query = c.req.query();
  const parsed = missionListQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query parameters", { fields: parsed.error.flatten().fieldErrors });
  }

  const { limit, lat, lng, radiusKm, nearMe, sort } = parsed.data;
  const conditions = buildMarketplaceFilters(parsed.data);

  // Handle geo-search: nearMe uses human's profile location
  let searchLat = lat;
  let searchLng = lng;
  const searchRadius = radiusKm ?? 25;

  if (nearMe === "true") {
    const human = c.get("human");
    if (human) {
      const [profile] = await db.select({
        location: humanProfiles.location,
        serviceRadius: humanProfiles.serviceRadius,
      }).from(humanProfiles).where(eq(humanProfiles.humanId, human.id)).limit(1);

      if (profile?.location) {
        const match = profile.location.match(/^POINT\((-?[\d.]+)\s+(-?[\d.]+)\)$/);
        if (match) {
          searchLng = parseFloat(match[1]!);
          searchLat = parseFloat(match[2]!);
        }
      }
    }
  }

  if (searchLat !== undefined && searchLng !== undefined) {
    // FR-005: Use PostGIS ST_DWithin with GIST index for efficient geo-search
    const radiusMeters = searchRadius * 1000;
    conditions.push(
      sql`ST_DWithin(${missions.location}, ST_MakePoint(${searchLng}, ${searchLat})::geography, ${radiusMeters})`,
    );
  }

  const rows = await db
    .select({
      id: missions.id,
      title: missions.title,
      description: missions.description,
      domain: missions.domain,
      requiredSkills: missions.requiredSkills,
      requiredLocationName: missions.requiredLocationName,
      requiredLatitude: missions.requiredLatitude,
      requiredLongitude: missions.requiredLongitude,
      estimatedDurationMinutes: missions.estimatedDurationMinutes,
      difficulty: missions.difficulty,
      tokenReward: missions.tokenReward,
      bonusForQuality: missions.bonusForQuality,
      maxClaims: missions.maxClaims,
      currentClaimCount: missions.currentClaimCount,
      status: missions.status,
      expiresAt: missions.expiresAt,
      createdAt: missions.createdAt,
    })
    .from(missions)
    .where(and(...conditions))
    .orderBy(sort === "tokenReward" ? desc(missions.tokenReward) : desc(missions.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const missionItems = items.map(toMarketplaceItem);
  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem ? lastItem.createdAt.toISOString() : null;

  return c.json({
    ok: true,
    data: { missions: missionItems, nextCursor, hasMore },
    requestId: c.get("requestId"),
  });
});

// ---------------------------------------------------------------------------
// T037: GET /:id — Mission detail (uses JOIN to reduce queries)
// ---------------------------------------------------------------------------
missionRoutes.get("/:id", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const id = parseUuidParam(c.req.param("id"));

  // Single JOIN query for mission + solution + agent
  const [row] = await db
    .select({
      id: missions.id,
      solutionId: missions.solutionId,
      createdByAgentId: missions.createdByAgentId,
      title: missions.title,
      description: missions.description,
      instructions: missions.instructions,
      evidenceRequired: missions.evidenceRequired,
      requiredSkills: missions.requiredSkills,
      requiredLocationName: missions.requiredLocationName,
      requiredLatitude: missions.requiredLatitude,
      requiredLongitude: missions.requiredLongitude,
      locationRadiusKm: missions.locationRadiusKm,
      estimatedDurationMinutes: missions.estimatedDurationMinutes,
      difficulty: missions.difficulty,
      missionType: missions.missionType,
      tokenReward: missions.tokenReward,
      bonusForQuality: missions.bonusForQuality,
      maxClaims: missions.maxClaims,
      currentClaimCount: missions.currentClaimCount,
      guardrailStatus: missions.guardrailStatus,
      status: missions.status,
      expiresAt: missions.expiresAt,
      createdAt: missions.createdAt,
      domain: missions.domain,
      solutionTitle: solutions.title,
      agentDisplayName: agents.displayName,
      agentUsername: agents.username,
    })
    .from(missions)
    .leftJoin(solutions, eq(missions.solutionId, solutions.id))
    .leftJoin(agents, eq(missions.createdByAgentId, agents.id))
    .where(eq(missions.id, id))
    .limit(1);

  if (!row) {
    throw new AppError("NOT_FOUND", "Mission not found");
  }

  // Check if non-approved: only owning agent can see
  const agent = c.get("agent");
  if (row.guardrailStatus !== "approved") {
    if (!agent || row.createdByAgentId !== agent.id) {
      throw new AppError("NOT_FOUND", "Mission not found");
    }
  }

  // Check if requesting human has a claim
  let myClaim = null;
  const human = c.get("human");
  if (human) {
    const [claim] = await db.select({
      id: missionClaims.id,
      status: missionClaims.status,
      claimedAt: missionClaims.claimedAt,
      deadlineAt: missionClaims.deadlineAt,
      progressPercent: missionClaims.progressPercent,
    }).from(missionClaims)
      .where(and(
        eq(missionClaims.missionId, id),
        eq(missionClaims.humanId, human.id),
        inArray(missionClaims.status, ["active", "submitted"]),
      )).limit(1);

    if (claim) {
      myClaim = claim;
    }
  }

  // Location: exact if claimed, approximate otherwise
  const locationData = resolveLocation(row.requiredLatitude, row.requiredLongitude, row.locationRadiusKm, !!myClaim);

  return c.json({
    ok: true,
    data: {
      id: row.id,
      solutionId: row.solutionId,
      title: row.title,
      description: row.description,
      instructions: row.instructions,
      evidenceRequired: row.evidenceRequired,
      requiredSkills: row.requiredSkills,
      requiredLocationName: row.requiredLocationName,
      location: locationData,
      estimatedDurationMinutes: row.estimatedDurationMinutes,
      difficulty: row.difficulty,
      missionType: row.missionType,
      tokenReward: row.tokenReward,
      bonusForQuality: row.bonusForQuality,
      maxClaims: row.maxClaims,
      currentClaimCount: row.currentClaimCount,
      slotsAvailable: row.maxClaims - row.currentClaimCount,
      status: row.status,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      domain: row.domain,
      guardrailStatus: row.guardrailStatus,
      createdByAgent: {
        id: row.createdByAgentId,
        name: row.agentDisplayName ?? row.agentUsername ?? "Unknown",
      },
      solution: row.solutionId ? { id: row.solutionId, title: row.solutionTitle ?? "" } : null,
      myClaim,
    },
    requestId: c.get("requestId"),
  });
});

// ---------------------------------------------------------------------------
// T031: POST /:id/claim — Claim mission (atomic)
// ---------------------------------------------------------------------------
missionRoutes.post("/:id/claim", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const missionId = parseUuidParam(c.req.param("id"));
  const human = c.get("human");

  const result = await db.transaction(async (tx) => {
    // 1. Lock mission row
    const lockedMissions = await tx.execute(
      sql`SELECT id, current_claim_count, max_claims, status, guardrail_status
          FROM missions WHERE id = ${missionId} FOR UPDATE SKIP LOCKED`
    );

    const lockedMission = (lockedMissions as unknown as Array<{ id: string; current_claim_count: number; max_claims: number; status: string; guardrail_status: string }>)[0];
    if (!lockedMission) {
      throw new AppError("CONFLICT", "Mission not found or is being processed — please retry");
    }
    if (lockedMission.status !== "open" && lockedMission.status !== "claimed") {
      throw new AppError("NOT_FOUND", "Mission is not accepting claims");
    }
    if (lockedMission.guardrail_status !== "approved") {
      throw new AppError("NOT_FOUND", "Mission is not available");
    }

    // 2. Check slots available
    if (lockedMission.current_claim_count >= lockedMission.max_claims) {
      throw new AppError("CONFLICT", "Mission is fully claimed — no slots available");
    }

    // 3. Check human's active claims < 3
    const activeClaimsResult = await tx.execute(
      sql`SELECT COUNT(*)::int as count FROM mission_claims WHERE human_id = ${human.id} AND status = 'active'`
    );
    const activeCount = ((activeClaimsResult as unknown as Array<{ count: number }>)[0])?.count ?? 0;
    if (activeCount >= 3) {
      throw new AppError("FORBIDDEN", "Maximum 3 active missions reached");
    }

    // 4. Check no duplicate active claim
    const existingClaim = await tx.execute(
      sql`SELECT id FROM mission_claims WHERE mission_id = ${missionId} AND human_id = ${human.id} AND status IN ('active', 'submitted')`
    );
    if ((existingClaim as unknown as Array<unknown>).length > 0) {
      throw new AppError("CONFLICT", "You have already claimed this mission");
    }

    // 5. Insert claim with 7-day deadline
    const deadlineAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const [claim] = await tx
      .insert(missionClaims)
      .values({
        missionId,
        humanId: human.id,
        deadlineAt,
      })
      .returning();

    // 6. Increment currentClaimCount
    await tx
      .update(missions)
      .set({
        currentClaimCount: sql`${missions.currentClaimCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(missions.id, missionId));

    return claim!;
  });

  return c.json({
    ok: true,
    data: {
      claimId: result.id,
      missionId,
      status: result.status,
      claimedAt: result.claimedAt,
      deadlineAt: result.deadlineAt,
    },
    requestId: c.get("requestId"),
  }, 201);
});

// ---------------------------------------------------------------------------
// T032: PATCH /:id/claims/:claimId — Update claim / abandon
// ---------------------------------------------------------------------------
missionRoutes.patch("/:id/claims/:claimId", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const missionId = parseUuidParam(c.req.param("id"));
  const claimId = parseUuidParam(c.req.param("claimId"), "claimId");
  const human = c.get("human");

  const body = await c.req.json();
  const parsed = updateClaimSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid request body", { fields: parsed.error.flatten().fieldErrors });
  }

  // Verify claim exists and human owns it
  const [existing] = await db.select({
    id: missionClaims.id,
    humanId: missionClaims.humanId,
    status: missionClaims.status,
    missionId: missionClaims.missionId,
  })
    .from(missionClaims)
    .where(and(eq(missionClaims.id, claimId), eq(missionClaims.missionId, missionId)))
    .limit(1);

  if (!existing) throw new AppError("NOT_FOUND", "Claim not found");
  if (existing.humanId !== human.id) throw new AppError("FORBIDDEN", "You can only update your own claims");
  if (existing.status !== "active") throw new AppError("CONFLICT", "Can only update active claims");

  const { progressPercent, notes, abandon } = parsed.data;

  if (abandon) {
    // Abandon claim in transaction
    await db.transaction(async (tx) => {
      await tx.update(missionClaims).set({
        status: "abandoned",
        updatedAt: new Date(),
      }).where(eq(missionClaims.id, claimId));

      await tx.update(missions).set({
        currentClaimCount: sql`GREATEST(${missions.currentClaimCount} - 1, 0)`,
        updatedAt: new Date(),
      }).where(eq(missions.id, missionId));
    });

    return c.json({
      ok: true,
      data: { claimId, status: "abandoned" as const, updatedAt: new Date().toISOString() },
      requestId: c.get("requestId"),
    });
  }

  // Normal update
  const updateFields: Partial<typeof missionClaims.$inferInsert> = { updatedAt: new Date() };
  if (progressPercent !== undefined) updateFields.progressPercent = progressPercent;
  if (notes !== undefined) updateFields.notes = notes;

  const [updated] = await db.update(missionClaims)
    .set(updateFields)
    .where(eq(missionClaims.id, claimId))
    .returning();

  return c.json({
    ok: true,
    data: {
      claimId: updated!.id,
      status: updated!.status,
      progressPercent: updated!.progressPercent,
      updatedAt: updated!.updatedAt,
    },
    requestId: c.get("requestId"),
  });
});

// ---------------------------------------------------------------------------
// T018: PATCH /:id — Update mission
// ---------------------------------------------------------------------------
// eslint-disable-next-line complexity
missionRoutes.patch("/:id", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const id = parseUuidParam(c.req.param("id"));
  const agent = c.get("agent")!;

  const body = await c.req.json();
  const parsed = updateMissionSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid request body", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  // Verify mission exists and agent owns it
  const [existing] = await db
    .select({
      id: missions.id,
      createdByAgentId: missions.createdByAgentId,
      status: missions.status,
      version: missions.version,
    })
    .from(missions)
    .where(eq(missions.id, id))
    .limit(1);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Mission not found");
  }
  if (existing.createdByAgentId !== agent.id) {
    throw new AppError("FORBIDDEN", "You can only update your own missions");
  }

  // Check for active claims — cannot edit mission with active claims
  const activeClaims = await db
    .select({ id: missionClaims.id })
    .from(missionClaims)
    .where(
      and(
        eq(missionClaims.missionId, id),
        eq(missionClaims.status, "active"),
      ),
    )
    .limit(1);

  if (activeClaims.length > 0) {
    throw new AppError("CONFLICT", "Cannot edit mission with active claims");
  }

  const updateData = parsed.data;

  // Data-driven field mapping to reduce cyclomatic complexity
  const DIRECT_FIELDS = [
    "title", "description", "instructions", "evidenceRequired", "requiredSkills",
    "requiredLocationName", "locationRadiusKm", "estimatedDurationMinutes",
    "difficulty", "missionType", "tokenReward", "bonusForQuality", "maxClaims", "domain",
  ] as const;

  const setFields: Record<string, unknown> = {
    guardrailStatus: "pending",
    updatedAt: new Date(),
    version: sql`${missions.version} + 1`,
  };

  for (const field of DIRECT_FIELDS) {
    if ((updateData as Record<string, unknown>)[field] !== undefined) {
      setFields[field] = (updateData as Record<string, unknown>)[field];
    }
  }

  // Numeric fields that need string conversion for Drizzle numeric columns
  if (updateData.requiredLatitude !== undefined) {
    setFields.requiredLatitude = updateData.requiredLatitude != null ? String(updateData.requiredLatitude) : null;
  }
  if (updateData.requiredLongitude !== undefined) {
    setFields.requiredLongitude = updateData.requiredLongitude != null ? String(updateData.requiredLongitude) : null;
  }
  // FR-005: Update PostGIS location column when coordinates change
  if (updateData.requiredLatitude !== undefined || updateData.requiredLongitude !== undefined) {
    const lat = updateData.requiredLatitude ?? null;
    const lng = updateData.requiredLongitude ?? null;
    if (lat != null && lng != null) {
      setFields.location = sql`ST_MakePoint(${lng}, ${lat})::geography`;
    } else {
      setFields.location = null;
    }
  }
  if (updateData.expiresAt !== undefined) {
    setFields.expiresAt = new Date(updateData.expiresAt);
  }

  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(missions)
      .set(setFields as Partial<typeof missions.$inferInsert>)
      .where(and(eq(missions.id, id), eq(missions.version, existing.version)))
      .returning();

    if (!updated) {
      throw new AppError("CONFLICT", "Mission was modified by another request — please retry");
    }

    // Re-enqueue for guardrail evaluation
    await enqueueForEvaluation(tx, {
      contentId: id,
      contentType: "mission",
      content: JSON.stringify({
        title: updated!.title,
        description: updated!.description,
      }),
      agentId: agent.id,
    });

    return updated!;
  });

  return c.json({
    ok: true,
    data: {
      id: result.id,
      title: result.title,
      description: result.description,
      guardrailStatus: result.guardrailStatus,
      status: result.status,
      version: result.version,
      updatedAt: result.updatedAt,
    },
    requestId: c.get("requestId"),
  });
});

// ---------------------------------------------------------------------------
// T019: DELETE /:id — Archive mission (soft delete)
// ---------------------------------------------------------------------------
missionRoutes.delete("/:id", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const id = parseUuidParam(c.req.param("id"));
  const agent = c.get("agent")!;

  // Verify mission exists and agent owns it
  const [existing] = await db
    .select({
      id: missions.id,
      createdByAgentId: missions.createdByAgentId,
    })
    .from(missions)
    .where(eq(missions.id, id))
    .limit(1);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Mission not found");
  }
  if (existing.createdByAgentId !== agent.id) {
    throw new AppError("FORBIDDEN", "You can only archive your own missions");
  }

  // Check for active claims — cannot archive mission with active claims
  const activeClaims = await db
    .select({ id: missionClaims.id })
    .from(missionClaims)
    .where(
      and(
        eq(missionClaims.missionId, id),
        eq(missionClaims.status, "active"),
      ),
    )
    .limit(1);

  if (activeClaims.length > 0) {
    throw new AppError(
      "CONFLICT",
      "Cannot archive mission with active claims",
    );
  }

  // Soft delete: update status to "archived"
  await db
    .update(missions)
    .set({
      status: "archived",
      updatedAt: new Date(),
    })
    .where(eq(missions.id, id));

  return c.json({
    ok: true,
    data: { id, status: "archived" as const },
    requestId: c.get("requestId"),
  });
});

export default missionRoutes;
