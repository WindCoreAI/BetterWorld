/**
 * Learning Pathways Routes (Sprint 18: Cooperative Depth & Governance — US6)
 *
 * POST /learning-pathways/:domain/enroll — Enroll in a domain pathway
 * GET  /learning-pathways/me — List enrolled pathways
 * GET  /learning-pathways/:domain/progress — Get detailed progress for a domain
 * POST /learning-pathways/:domain/case-studies/:id/mark-read — Mark case study as read
 */
import { learningPathways } from "@betterworld/db";
import { AppError } from "@betterworld/shared";
import { and, eq, desc } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { humanAuth } from "../../middleware/humanAuth.js";
import { PathwayProgressService } from "../../services/pathway-progress.js";

const learningPathwayRoutes = new Hono<AppEnv>();

// ── POST /learning-pathways/:domain/enroll ──
learningPathwayRoutes.post("/learning-pathways/:domain/enroll", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const domain = c.req.param("domain");

  // Check if already enrolled
  const [existing] = await db
    .select({ id: learningPathways.id })
    .from(learningPathways)
    .where(
      and(
        eq(learningPathways.humanId, human.id),
        eq(learningPathways.domain, domain as never),
      ),
    )
    .limit(1);

  if (existing) {
    return c.json({ ok: false, error: "ALREADY_ENROLLED", message: "Already enrolled in this pathway" }, 400);
  }

  const [created] = await db
    .insert(learningPathways)
    .values({
      humanId: human.id,
      domain: domain as never,
      currentLevel: "observer",
    })
    .returning();

  if (!created) throw new AppError("INTERNAL_ERROR", "Failed to create pathway");

  return c.json({
    ok: true,
    data: { id: created.id, domain, currentLevel: "observer", progressPercent: 0 },
    requestId: c.get("requestId"),
  }, 201);
});

// ── GET /learning-pathways/me ──
learningPathwayRoutes.get("/learning-pathways/me", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");

  const pathways = await db
    .select({
      id: learningPathways.id,
      domain: learningPathways.domain,
      currentLevel: learningPathways.currentLevel,
      progressPercent: learningPathways.progressPercent,
      missionsCompleted: learningPathways.missionsCompleted,
      peerReviewsCompleted: learningPathways.peerReviewsCompleted,
      enrolledAt: learningPathways.enrolledAt,
      levelReachedAt: learningPathways.levelReachedAt,
    })
    .from(learningPathways)
    .where(eq(learningPathways.humanId, human.id))
    .orderBy(desc(learningPathways.enrolledAt));

  return c.json({ ok: true, data: { pathways }, requestId: c.get("requestId") });
});

// ── GET /learning-pathways/:domain/progress ──
learningPathwayRoutes.get("/learning-pathways/:domain/progress", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const domain = c.req.param("domain");

  const [pathway] = await db
    .select({ id: learningPathways.id })
    .from(learningPathways)
    .where(
      and(
        eq(learningPathways.humanId, human.id),
        eq(learningPathways.domain, domain as never),
      ),
    )
    .limit(1);

  if (!pathway) {
    return c.json({ ok: false, error: "NOT_ENROLLED", message: "Not enrolled in this pathway" }, 404);
  }

  const progressService = new PathwayProgressService(db);
  const progress = await progressService.getProgress(pathway.id);

  return c.json({ ok: true, data: progress, requestId: c.get("requestId") });
});

// ── POST /learning-pathways/:domain/case-studies/:id/mark-read ──
learningPathwayRoutes.post("/learning-pathways/:domain/case-studies/:id/mark-read", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const domain = c.req.param("domain");

  const [pathway] = await db
    .select()
    .from(learningPathways)
    .where(
      and(
        eq(learningPathways.humanId, human.id),
        eq(learningPathways.domain, domain as never),
      ),
    )
    .limit(1);

  if (!pathway) {
    return c.json({ ok: false, error: "NOT_ENROLLED", message: "Not enrolled in this pathway" }, 404);
  }

  await db
    .update(learningPathways)
    .set({
      caseStudiesRead: pathway.caseStudiesRead + 1,
      updatedAt: new Date(),
    })
    .where(eq(learningPathways.id, pathway.id));

  return c.json({
    ok: true,
    data: { caseStudiesRead: pathway.caseStudiesRead + 1 },
    requestId: c.get("requestId"),
  });
});

export default learningPathwayRoutes;
