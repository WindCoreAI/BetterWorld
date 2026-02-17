/**
 * Case Study Routes (Sprint 18: Cooperative Depth & Governance — US7)
 *
 * GET  /case-studies — Public list with domain filter and cursor pagination
 * GET  /case-studies/:id — Public case study detail with contributors
 * GET  /admin/case-studies/drafts — Admin: list draft case studies
 * POST /admin/case-studies/:id/publish — Admin: publish case study
 */
import { caseStudies, humans, tokenTransactions } from "@betterworld/db";
import { AppError } from "@betterworld/shared";
import { and, eq, desc, sql } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { humanAuth } from "../../middleware/humanAuth.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";

const caseStudyRoutes = new Hono<AppEnv>();

// ── GET /case-studies — Public list ──
caseStudyRoutes.get("/case-studies", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const domain = c.req.query("domain");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20"), 50);

  const conditions = [eq(caseStudies.status, "published")];
  if (domain) {
    conditions.push(eq(caseStudies.domain, domain as never));
  }

  const items = await db
    .select({
      id: caseStudies.id,
      title: caseStudies.title,
      summary: caseStudies.summary,
      domain: caseStudies.domain,
      missionId: caseStudies.missionId,
      readCount: caseStudies.readCount,
      publishedAt: caseStudies.publishedAt,
    })
    .from(caseStudies)
    .where(and(...conditions))
    .orderBy(desc(caseStudies.publishedAt))
    .limit(limit);

  return c.json({ ok: true, data: { items }, requestId: c.get("requestId") });
});

// ── GET /case-studies/:id — Public detail ──
caseStudyRoutes.get("/case-studies/:id", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const id = c.req.param("id");

  const [study] = await db
    .select()
    .from(caseStudies)
    .where(and(eq(caseStudies.id, id), eq(caseStudies.status, "published")))
    .limit(1);

  if (!study) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Case study not found" }, 404);
  }

  // Increment read count
  await db
    .update(caseStudies)
    .set({ readCount: study.readCount + 1 })
    .where(eq(caseStudies.id, id));

  // Get contributor names
  const contributorNames: string[] = [];
  if (study.contributorHumanIds && study.contributorHumanIds.length > 0) {
    for (const hid of study.contributorHumanIds) {
      if (!hid) continue;
      const [h] = await db
        .select({ displayName: humans.displayName })
        .from(humans)
        .where(eq(humans.id, hid))
        .limit(1);
      if (h) contributorNames.push(h.displayName);
    }
  }

  return c.json({
    ok: true,
    data: { ...study, contributorNames },
    requestId: c.get("requestId"),
  });
});

// ── GET /admin/case-studies/drafts — Admin: list drafts ──
caseStudyRoutes.get("/admin/case-studies/drafts", humanAuth(), requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const drafts = await db
    .select({
      id: caseStudies.id,
      title: caseStudies.title,
      summary: caseStudies.summary,
      domain: caseStudies.domain,
      missionId: caseStudies.missionId,
      createdAt: caseStudies.createdAt,
    })
    .from(caseStudies)
    .where(eq(caseStudies.status, "draft"))
    .orderBy(desc(caseStudies.createdAt))
    .limit(50);

  return c.json({ ok: true, data: { drafts }, requestId: c.get("requestId") });
});

// ── POST /admin/case-studies/:id/publish — Admin: publish ──
caseStudyRoutes.post("/admin/case-studies/:id/publish", humanAuth(), requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const id = c.req.param("id");

  const [study] = await db
    .select()
    .from(caseStudies)
    .where(eq(caseStudies.id, id))
    .limit(1);

  if (!study) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Case study not found" }, 404);
  }

  if (study.status === "published") {
    return c.json({ ok: false, error: "ALREADY_PUBLISHED", message: "Already published" }, 400);
  }

  // Publish
  await db
    .update(caseStudies)
    .set({
      status: "published",
      publishedAt: new Date(),
      publishedByHumanId: human.id,
      updatedAt: new Date(),
    })
    .where(eq(caseStudies.id, id));

  // Award 2 teaching tokens to contributors
  for (const contributorId of study.contributorHumanIds ?? []) {
    if (!contributorId) continue;
    try {
      const idempotencyKey = `case-study-contribution:${id}:${contributorId}`;

      // Check idempotency
      const [existingTxn] = await db
        .select({ id: tokenTransactions.id })
        .from(tokenTransactions)
        .where(eq(tokenTransactions.idempotencyKey, idempotencyKey))
        .limit(1);

      if (existingTxn) continue;

      // Award tokens with double-entry
      const balanceResult = await db.execute(
        sql`SELECT id, token_balance FROM humans WHERE id = ${contributorId} FOR UPDATE`,
      );
      const humanRow = (balanceResult as unknown as Array<{ id: string; token_balance: string }>)[0];
      if (!humanRow) continue;

      const currentBalance = parseInt(humanRow.token_balance, 10) || 0;
      const newBalance = currentBalance + 2;

      await db
        .update(humans)
        .set({ tokenBalance: String(newBalance), updatedAt: new Date() })
        .where(eq(humans.id, contributorId));

      await db.insert(tokenTransactions).values({
        humanId: contributorId,
        amount: 2,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        transactionType: "earn_case_study_contribution",
        referenceId: id,
        referenceType: "case_study",
        description: "Case study contribution reward (2 tokens)",
        idempotencyKey,
      });
    } catch { /* non-fatal */ }
  }

  return c.json({
    ok: true,
    data: { id, status: "published" },
    requestId: c.get("requestId"),
  });
});

export default caseStudyRoutes;
