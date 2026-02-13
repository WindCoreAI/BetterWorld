/**
 * Mission Template Routes (Sprint 12 — T074, T075)
 *
 * Admin endpoints: CRUD for mission templates
 * Agent endpoint: Create mission from template
 */
import { missions, missionTemplates } from "@betterworld/db";
import { AppError } from "@betterworld/shared";
import { and, desc, eq, lt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.js";
import { getDb } from "../lib/container.js";
import { parseUuidParam } from "../lib/validation.js";
import { requireAdmin } from "../middleware/auth.js";
import { humanAuth } from "../middleware/humanAuth.js";

const missionTemplateRoutes = new Hono<AppEnv>();

// ── Schemas ──────────────────────────────────────────────────

const createTemplateSchema = z.object({
  name: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  domain: z.string().min(1),
  difficultyLevel: z.enum(["easy", "medium", "hard", "expert"]),
  requiredPhotos: z.array(
    z.object({
      label: z.string(),
      description: z.string().optional(),
      required: z.boolean().default(true),
    }),
  ),
  gpsRadiusMeters: z.number().int().positive().max(50000),
  completionCriteria: z.array(
    z.object({
      criterion: z.string(),
      required: z.boolean().default(true),
    }),
  ),
  stepInstructions: z.array(
    z.object({
      step: z.number().int().positive(),
      instruction: z.string(),
      photoRequired: z.boolean().default(false),
    }),
  ),
  estimatedDurationMinutes: z.number().int().positive().optional(),
});

const updateTemplateSchema = createTemplateSchema.partial();

const listQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  domain: z.string().optional(),
  difficulty: z.string().optional(),
  active: z.coerce.boolean().optional(),
});

// ── Admin Routes (T074) ─────────────────────────────────────

// POST /admin/mission-templates — Create template
missionTemplateRoutes.post("/admin/mission-templates", requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const body = await c.req.json();
  const parsed = createTemplateSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid template", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const [template] = await db
    .insert(missionTemplates)
    .values({
      name: parsed.data.name,
      description: parsed.data.description,
      domain: parsed.data.domain as never,
      difficultyLevel: parsed.data.difficultyLevel,
      requiredPhotos: parsed.data.requiredPhotos,
      gpsRadiusMeters: parsed.data.gpsRadiusMeters,
      completionCriteria: parsed.data.completionCriteria,
      stepInstructions: parsed.data.stepInstructions,
      estimatedDurationMinutes: parsed.data.estimatedDurationMinutes ?? null,
      createdByAdminId: c.get("human")?.id ?? null,
    })
    .returning();

  return c.json(
    {
      ok: true,
      data: template,
      requestId: c.get("requestId"),
    },
    201,
  );
});

// GET /admin/mission-templates — List templates
missionTemplateRoutes.get("/admin/mission-templates", requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const query = c.req.query();
  const parsed = listQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query parameters");
  }

  const { limit, cursor, domain, difficulty, active } = parsed.data;
  const conditions = [];

  if (domain) conditions.push(eq(missionTemplates.domain, domain as never));
  if (difficulty) conditions.push(eq(missionTemplates.difficultyLevel, difficulty));
  if (active !== undefined) conditions.push(eq(missionTemplates.isActive, active));

  if (cursor) {
    const [cursorTpl] = await db
      .select({ createdAt: missionTemplates.createdAt })
      .from(missionTemplates)
      .where(eq(missionTemplates.id, cursor))
      .limit(1);
    if (cursorTpl) conditions.push(lt(missionTemplates.createdAt, cursorTpl.createdAt));
  }

  const rows = await db
    .select()
    .from(missionTemplates)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(missionTemplates.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items[items.length - 1];

  return c.json({
    ok: true,
    data: items,
    meta: {
      hasMore,
      nextCursor: hasMore && lastItem ? lastItem.id : null,
      count: items.length,
    },
    requestId: c.get("requestId"),
  });
});

// GET /admin/mission-templates/:id — Template detail
missionTemplateRoutes.get("/admin/mission-templates/:id", requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const id = parseUuidParam(c.req.param("id"), "id");

  const [template] = await db
    .select()
    .from(missionTemplates)
    .where(eq(missionTemplates.id, id))
    .limit(1);

  if (!template) throw new AppError("NOT_FOUND", "Template not found");

  return c.json({
    ok: true,
    data: template,
    requestId: c.get("requestId"),
  });
});

// PUT /admin/mission-templates/:id — Update template
missionTemplateRoutes.put("/admin/mission-templates/:id", requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const id = parseUuidParam(c.req.param("id"), "id");

  const body = await c.req.json();
  const parsed = updateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid template update", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.domain !== undefined) updateData.domain = parsed.data.domain;
  if (parsed.data.difficultyLevel !== undefined) updateData.difficultyLevel = parsed.data.difficultyLevel;
  if (parsed.data.requiredPhotos !== undefined) updateData.requiredPhotos = parsed.data.requiredPhotos;
  if (parsed.data.gpsRadiusMeters !== undefined) updateData.gpsRadiusMeters = parsed.data.gpsRadiusMeters;
  if (parsed.data.completionCriteria !== undefined) updateData.completionCriteria = parsed.data.completionCriteria;
  if (parsed.data.stepInstructions !== undefined) updateData.stepInstructions = parsed.data.stepInstructions;
  if (parsed.data.estimatedDurationMinutes !== undefined) updateData.estimatedDurationMinutes = parsed.data.estimatedDurationMinutes;

  const [updated] = await db
    .update(missionTemplates)
    .set(updateData as never)
    .where(eq(missionTemplates.id, id))
    .returning();

  if (!updated) throw new AppError("NOT_FOUND", "Template not found");

  return c.json({
    ok: true,
    data: updated,
    requestId: c.get("requestId"),
  });
});

// DELETE /admin/mission-templates/:id — Soft delete (set is_active=false)
missionTemplateRoutes.delete("/admin/mission-templates/:id", requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const id = parseUuidParam(c.req.param("id"), "id");

  const [updated] = await db
    .update(missionTemplates)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(missionTemplates.id, id))
    .returning({ id: missionTemplates.id });

  if (!updated) throw new AppError("NOT_FOUND", "Template not found");

  return c.json({
    ok: true,
    data: { id: updated.id, deactivated: true },
    requestId: c.get("requestId"),
  });
});

// ── Agent Route: Create Mission from Template (T075) ────────

const fromTemplateSchema = z.object({
  templateId: z.string().uuid(),
  title: z.string().min(5).max(200),
  description: z.string().min(10).max(5000),
  requiredLatitude: z.number().min(-90).max(90),
  requiredLongitude: z.number().min(-180).max(180),
  rewardAmount: z.number().positive().optional(),
  expiresAt: z.string().datetime().optional(),
});

missionTemplateRoutes.post("/missions/from-template", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const body = await c.req.json();
  const parsed = fromTemplateSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid mission from template", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  // Fetch template
  const [template] = await db
    .select()
    .from(missionTemplates)
    .where(
      and(
        eq(missionTemplates.id, parsed.data.templateId),
        eq(missionTemplates.isActive, true),
      ),
    )
    .limit(1);

  if (!template) {
    throw new AppError("NOT_FOUND", "Template not found or inactive");
  }

  // Create mission from template (snapshot template fields)
  const [mission] = await db
    .insert(missions)
    .values({
      title: parsed.data.title,
      description: parsed.data.description,
      domain: template.domain,
      difficultyLevel: template.difficultyLevel as never,
      requiredLatitude: String(parsed.data.requiredLatitude),
      requiredLongitude: String(parsed.data.requiredLongitude),
      evidenceRequired: template.requiredPhotos,
      templateId: template.id,
      rewardAmount: parsed.data.rewardAmount ? String(parsed.data.rewardAmount) : "10",
      expiresAt: parsed.data.expiresAt
        ? new Date(parsed.data.expiresAt)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
      createdByAgentId: c.get("human")?.id ?? null,
    } as never)
    .returning();

  return c.json(
    {
      ok: true,
      data: {
        missionId: mission!.id,
        templateId: template.id,
        templateName: template.name,
      },
      requestId: c.get("requestId"),
    },
    201,
  );
});

export default missionTemplateRoutes;
