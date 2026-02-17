/**
 * Circle Routes (Sprint 18: Cooperative Depth & Governance — US9)
 *
 * GET  /circles — List circles
 * POST /circles — Create circle (25 tokens)
 * GET  /circles/:id — Circle detail with metrics + members
 * POST /circles/:id/join — Join circle (50 member + 3 circle limits)
 * POST /circles/:id/leave — Leave circle
 * GET  /circles/:id/posts — Circle discussion posts (approved only)
 * POST /circles/:id/posts — Create circle post (guardrail pipeline)
 * POST /circles/:id/missions — Share mission in circle
 * GET  /circles/:id/missions — List shared missions
 */
import { circles, circleMembers, circlePosts, circleMissions, missions, humans, tokenTransactions } from "@betterworld/db";
import { createCircleSchema, circlePostSchema, shareCircleMissionSchema, AppError } from "@betterworld/shared";
import { and, eq, desc, count, sql } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { humanAuth } from "../../middleware/humanAuth.js";

const circleRoutes = new Hono<AppEnv>();

const MAX_MEMBERS = 50;
const MAX_CIRCLES_PER_USER = 3;
const CIRCLE_CREATION_COST = 25;
const MAX_POSTS_PER_DAY = 10;

// ── GET /circles ──
circleRoutes.get("/circles", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const domain = c.req.query("domain");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20"), 50);

  const conditions = [eq(circles.status, "active")];
  if (domain) conditions.push(eq(circles.domain, domain as never));

  const items = await db
    .select({
      id: circles.id,
      name: circles.name,
      description: circles.description,
      domain: circles.domain,
      memberCount: circles.memberCount,
      createdAt: circles.createdAt,
    })
    .from(circles)
    .where(and(...conditions))
    .orderBy(desc(circles.createdAt))
    .limit(limit);

  return c.json({ ok: true, data: { items }, requestId: c.get("requestId") });
});

// ── POST /circles — Create circle (25 tokens) ──
circleRoutes.post("/circles", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const body = await c.req.json();
  const parsed = createCircleSchema.parse(body);

  // Check circle limit
  const [circleCount] = await db
    .select({ count: count() })
    .from(circleMembers)
    .where(eq(circleMembers.humanId, human.id));

  if ((circleCount?.count ?? 0) >= MAX_CIRCLES_PER_USER) {
    return c.json({ ok: false, error: "CIRCLE_LIMIT", message: `Maximum ${MAX_CIRCLES_PER_USER} circles per user` }, 400);
  }

  // Deduct tokens with double-entry accounting
  const balanceResult = await db.execute(
    sql`SELECT id, token_balance FROM humans WHERE id = ${human.id} FOR UPDATE`,
  );
  const humanRow = (balanceResult as unknown as Array<{ id: string; token_balance: string }>)[0];
  if (!humanRow) throw new AppError("NOT_FOUND", "User not found");

  const currentBalance = parseInt(humanRow.token_balance, 10) || 0;
  if (currentBalance < CIRCLE_CREATION_COST) {
    return c.json({ ok: false, error: "INSUFFICIENT_BALANCE", message: `Requires ${CIRCLE_CREATION_COST} tokens` }, 400);
  }

  const newBalance = currentBalance - CIRCLE_CREATION_COST;

  await db
    .update(humans)
    .set({ tokenBalance: String(newBalance), updatedAt: new Date() })
    .where(eq(humans.id, human.id));

  // Create circle
  const [created] = await db
    .insert(circles)
    .values({
      name: parsed.name,
      description: parsed.description ?? null,
      domain: parsed.domain ? (parsed.domain as never) : null,
      createdByHumanId: human.id,
      memberCount: 1,
    })
    .returning();

  if (!created) throw new AppError("INTERNAL_ERROR", "Failed to create circle");

  // Add creator as founder
  await db.insert(circleMembers).values({
    circleId: created.id,
    humanId: human.id,
    role: "founder",
  });

  // Record token transaction
  await db.insert(tokenTransactions).values({
    humanId: human.id,
    amount: -CIRCLE_CREATION_COST,
    balanceBefore: currentBalance,
    balanceAfter: newBalance,
    transactionType: "spend_circle_creation" as never,
    referenceId: created.id,
    referenceType: "circle",
    description: `Circle creation: ${parsed.name} (-${CIRCLE_CREATION_COST} tokens)`,
    idempotencyKey: `circle-creation:${created.id}:${human.id}`,
  });

  return c.json({
    ok: true,
    data: { id: created.id, name: parsed.name },
    requestId: c.get("requestId"),
  }, 201);
});

// ── GET /circles/:id ──
circleRoutes.get("/circles/:id", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const id = c.req.param("id");

  const [circle] = await db.select().from(circles).where(eq(circles.id, id)).limit(1);
  if (!circle) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Circle not found" }, 404);
  }

  // Get members
  const members = await db
    .select({
      humanId: circleMembers.humanId,
      role: circleMembers.role,
      displayName: humans.displayName,
      joinedAt: circleMembers.joinedAt,
    })
    .from(circleMembers)
    .innerJoin(humans, eq(circleMembers.humanId, humans.id))
    .where(eq(circleMembers.circleId, id))
    .orderBy(circleMembers.joinedAt);

  return c.json({
    ok: true,
    data: { circle, members },
    requestId: c.get("requestId"),
  });
});

// ── POST /circles/:id/join ──
circleRoutes.post("/circles/:id/join", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const circleId = c.req.param("id");

  // Check circle exists
  const [circle] = await db
    .select({ id: circles.id, memberCount: circles.memberCount })
    .from(circles)
    .where(eq(circles.id, circleId))
    .limit(1);

  if (!circle) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Circle not found" }, 404);
  }

  if (circle.memberCount >= MAX_MEMBERS) {
    return c.json({ ok: false, error: "CIRCLE_FULL", message: `Circle has reached ${MAX_MEMBERS} member limit` }, 400);
  }

  // Check user's circle count
  const [userCircleCount] = await db
    .select({ count: count() })
    .from(circleMembers)
    .where(eq(circleMembers.humanId, human.id));

  if ((userCircleCount?.count ?? 0) >= MAX_CIRCLES_PER_USER) {
    return c.json({ ok: false, error: "CIRCLE_LIMIT", message: `You can join at most ${MAX_CIRCLES_PER_USER} circles` }, 400);
  }

  // Check if already a member
  const [existing] = await db
    .select({ id: circleMembers.id })
    .from(circleMembers)
    .where(
      and(eq(circleMembers.circleId, circleId), eq(circleMembers.humanId, human.id)),
    )
    .limit(1);

  if (existing) {
    return c.json({ ok: false, error: "ALREADY_MEMBER", message: "Already a member" }, 400);
  }

  await db.insert(circleMembers).values({
    circleId,
    humanId: human.id,
    role: "member",
  });

  await db
    .update(circles)
    .set({ memberCount: circle.memberCount + 1, updatedAt: new Date() })
    .where(eq(circles.id, circleId));

  return c.json({ ok: true, data: { circleId, role: "member" }, requestId: c.get("requestId") }, 201);
});

// ── POST /circles/:id/leave ──
circleRoutes.post("/circles/:id/leave", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const circleId = c.req.param("id");

  const [membership] = await db
    .select({ id: circleMembers.id, role: circleMembers.role })
    .from(circleMembers)
    .where(
      and(eq(circleMembers.circleId, circleId), eq(circleMembers.humanId, human.id)),
    )
    .limit(1);

  if (!membership) {
    return c.json({ ok: false, error: "NOT_MEMBER", message: "Not a member" }, 400);
  }

  // If founder, transfer ownership to next member
  if (membership.role === "founder") {
    const [nextMember] = await db
      .select({ id: circleMembers.id, humanId: circleMembers.humanId })
      .from(circleMembers)
      .where(
        and(
          eq(circleMembers.circleId, circleId),
          sql`${circleMembers.humanId} != ${human.id}`,
        ),
      )
      .orderBy(circleMembers.joinedAt)
      .limit(1);

    if (nextMember) {
      await db
        .update(circleMembers)
        .set({ role: "founder" })
        .where(eq(circleMembers.id, nextMember.id));
    }
  }

  await db.delete(circleMembers).where(eq(circleMembers.id, membership.id));

  // Decrement member count
  const [circle] = await db
    .select({ memberCount: circles.memberCount })
    .from(circles)
    .where(eq(circles.id, circleId))
    .limit(1);

  if (circle) {
    await db
      .update(circles)
      .set({ memberCount: Math.max(0, circle.memberCount - 1), updatedAt: new Date() })
      .where(eq(circles.id, circleId));
  }

  return c.json({ ok: true, data: { circleId, left: true }, requestId: c.get("requestId") });
});

// ── GET /circles/:id/posts — Approved posts only ──
circleRoutes.get("/circles/:id/posts", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const circleId = c.req.param("id");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20"), 50);

  const posts = await db
    .select({
      id: circlePosts.id,
      content: circlePosts.content,
      postType: circlePosts.postType,
      authorHumanId: circlePosts.authorHumanId,
      authorName: humans.displayName,
      createdAt: circlePosts.createdAt,
    })
    .from(circlePosts)
    .innerJoin(humans, eq(circlePosts.authorHumanId, humans.id))
    .where(
      and(
        eq(circlePosts.circleId, circleId),
        eq(circlePosts.guardrailStatus, "approved"),
      ),
    )
    .orderBy(desc(circlePosts.createdAt))
    .limit(limit);

  return c.json({ ok: true, data: { posts }, requestId: c.get("requestId") });
});

// ── POST /circles/:id/posts — Create post (pending guardrail) ──
circleRoutes.post("/circles/:id/posts", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const circleId = c.req.param("id");
  const body = await c.req.json();
  const parsed = circlePostSchema.parse(body);

  // Verify membership
  const [membership] = await db
    .select({ id: circleMembers.id })
    .from(circleMembers)
    .where(
      and(eq(circleMembers.circleId, circleId), eq(circleMembers.humanId, human.id)),
    )
    .limit(1);

  if (!membership) {
    return c.json({ ok: false, error: "NOT_MEMBER", message: "Must be a circle member" }, 403);
  }

  // Rate limit: 10 posts/day
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [todayCount] = await db
    .select({ count: count() })
    .from(circlePosts)
    .where(
      and(
        eq(circlePosts.authorHumanId, human.id),
        sql`${circlePosts.createdAt} >= ${todayStart}`,
      ),
    );

  if ((todayCount?.count ?? 0) >= MAX_POSTS_PER_DAY) {
    return c.json({ ok: false, error: "RATE_LIMITED", message: `Maximum ${MAX_POSTS_PER_DAY} posts per day` }, 429);
  }

  const [created] = await db
    .insert(circlePosts)
    .values({
      circleId,
      authorHumanId: human.id,
      content: parsed.content,
      postType: parsed.postType,
      guardrailStatus: "pending",
    })
    .returning();

  if (!created) throw new AppError("INTERNAL_ERROR", "Failed to create post");

  return c.json({
    ok: true,
    data: { id: created.id, status: "pending" },
    requestId: c.get("requestId"),
  }, 201);
});

// ── POST /circles/:id/missions — Share mission ──
circleRoutes.post("/circles/:id/missions", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const circleId = c.req.param("id");
  const body = await c.req.json();
  const parsed = shareCircleMissionSchema.parse(body);

  // Verify membership
  const [membership] = await db
    .select({ id: circleMembers.id })
    .from(circleMembers)
    .where(
      and(eq(circleMembers.circleId, circleId), eq(circleMembers.humanId, human.id)),
    )
    .limit(1);

  if (!membership) {
    return c.json({ ok: false, error: "NOT_MEMBER", message: "Must be a circle member" }, 403);
  }

  // Check mission exists
  const [mission] = await db
    .select({ id: missions.id })
    .from(missions)
    .where(eq(missions.id, parsed.missionId))
    .limit(1);

  if (!mission) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Mission not found" }, 404);
  }

  // Check duplicate
  const [existing] = await db
    .select({ id: circleMissions.id })
    .from(circleMissions)
    .where(
      and(
        eq(circleMissions.circleId, circleId),
        eq(circleMissions.missionId, parsed.missionId),
      ),
    )
    .limit(1);

  if (existing) {
    return c.json({ ok: false, error: "ALREADY_SHARED", message: "Mission already shared in this circle" }, 400);
  }

  await db.insert(circleMissions).values({
    circleId,
    missionId: parsed.missionId,
    sharedByHumanId: human.id,
  });

  return c.json({
    ok: true,
    data: { circleId, missionId: parsed.missionId },
    requestId: c.get("requestId"),
  }, 201);
});

// ── GET /circles/:id/missions ──
circleRoutes.get("/circles/:id/missions", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const circleId = c.req.param("id");

  const shared = await db
    .select({
      missionId: circleMissions.missionId,
      missionTitle: missions.title,
      missionDomain: missions.domain,
      sharedByHumanId: circleMissions.sharedByHumanId,
      sharedByName: humans.displayName,
      createdAt: circleMissions.createdAt,
    })
    .from(circleMissions)
    .innerJoin(missions, eq(circleMissions.missionId, missions.id))
    .innerJoin(humans, eq(circleMissions.sharedByHumanId, humans.id))
    .where(eq(circleMissions.circleId, circleId))
    .orderBy(desc(circleMissions.createdAt))
    .limit(50);

  return c.json({ ok: true, data: { missions: shared }, requestId: c.get("requestId") });
});

export default circleRoutes;
