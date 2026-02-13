/**
 * Evidence Routes (Sprint 8: Evidence Verification)
 *
 * POST /api/v1/missions/:missionId/evidence - Submit evidence
 * GET /api/v1/missions/:missionId/evidence - List evidence
 * GET /api/v1/evidence/:evidenceId - Get evidence detail
 */

import { evidence, missions, missionClaims, missionTemplates, verificationAuditLog } from "@betterworld/db";
import { AppError } from "@betterworld/shared";
import { and, eq, desc, lt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../../app.js";
import { getDb, getRedis } from "../../lib/container.js";
import {
  getEvidenceType,
  isAllowedMimeType,
  isValidFileSize,
  extractExif,
  stripExifPii,
  MAX_FILE_SIZE,
  MAX_FILES_PER_SUBMISSION,
} from "../../lib/evidence-helpers.js";
import { processImage } from "../../lib/image-processing.js";
import { uploadFile, buildStoragePath, getSignedUrl } from "../../lib/storage.js";
import { parseUuidParam } from "../../lib/validation.js";
import { humanAuth } from "../../middleware/humanAuth.js";

const evidenceRoutes = new Hono<AppEnv>();

/** Rate limit: 10 submissions per hour per human */
const SUBMISSION_RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_SECONDS = 3600;

/**
 * Check submission rate limit using Redis sliding window.
 */
async function checkRateLimit(humanId: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false; // Fail closed if no Redis — prevent abuse during outage

  const key = `rate:evidence:submit:${humanId}`;
  const count = await redis.get(key);
  if (count && parseInt(count, 10) >= SUBMISSION_RATE_LIMIT) {
    return false;
  }
  return true;
}

async function incrementRateLimit(humanId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const key = `rate:evidence:submit:${humanId}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
  }
}


// --- Helper: Parse files from FormData ---
function parseFormFiles(formData: FormData): File[] {
  const files: File[] = [];
  const formFiles = formData.getAll("files");
  for (const f of formFiles) {
    if (f instanceof File) files.push(f);
  }
  return files;
}

// --- Helper: Validate form files ---
function validateFormFiles(files: File[]): void {
  if (files.length === 0) {
    throw new AppError("VALIDATION_ERROR", "At least one file is required");
  }
  if (files.length > MAX_FILES_PER_SUBMISSION) {
    throw new AppError("VALIDATION_ERROR", `Maximum ${MAX_FILES_PER_SUBMISSION} files per submission`);
  }
  for (const file of files) {
    if (!isAllowedMimeType(file.type)) {
      throw new AppError("VALIDATION_ERROR", `Unsupported file type: ${file.type}`);
    }
    if (!isValidFileSize(file.size)) {
      throw new AppError("VALIDATION_ERROR", `File exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
    }
  }
}

// --- Helper: Parse GPS coordinates from form ---
function parseGpsCoordinates(formData: FormData): { latitude?: number; longitude?: number } {
  const latStr = formData.get("latitude");
  const lngStr = formData.get("longitude");
  if (!latStr || !lngStr) return {};

  const latitude = parseFloat(latStr as string);
  const longitude = parseFloat(lngStr as string);
  if (isNaN(latitude) || isNaN(longitude)) {
    throw new AppError("VALIDATION_ERROR", "Invalid GPS coordinates");
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new AppError("VALIDATION_ERROR", "GPS coordinates out of range");
  }
  return { latitude, longitude };
}

// --- Helper: Parse capturedAt from form ---
function parseCapturedAtField(formData: FormData): Date | undefined {
  const capturedAtStr = formData.get("capturedAt");
  if (!capturedAtStr) return undefined;

  const capturedAt = new Date(capturedAtStr as string);
  if (isNaN(capturedAt.getTime())) {
    throw new AppError("VALIDATION_ERROR", "Invalid capturedAt timestamp");
  }
  if (capturedAt > new Date()) {
    throw new AppError("VALIDATION_ERROR", "capturedAt cannot be in the future");
  }
  return capturedAt;
}

// --- Helper: Process and upload primary file ---
async function processAndUploadFile(
  primaryFile: File,
  fileBuffer: Buffer,
  missionId: string,
  claimId: string,
): Promise<{ contentUrl: string | null; thumbnailUrl: string | null; mediumUrl: string | null }> {
  let thumbnailUrl: string | null = null;
  let mediumUrl: string | null = null;
  let contentUrl: string | null = null;

  if (primaryFile.type.startsWith("image/")) {
    try {
      const processed = await processImage(fileBuffer);
      const originalPath = buildStoragePath(missionId, claimId, "original", primaryFile.name);
      const originalResult = await uploadFile(originalPath, fileBuffer, primaryFile.type);
      contentUrl = originalResult.url;

      const thumbPath = buildStoragePath(missionId, claimId, "thumbnail", `thumb_${primaryFile.name}.webp`);
      const thumbResult = await uploadFile(thumbPath, processed.thumbnail, "image/webp");
      thumbnailUrl = thumbResult.url;

      const medPath = buildStoragePath(missionId, claimId, "medium", `med_${primaryFile.name}.webp`);
      const medResult = await uploadFile(medPath, processed.medium, "image/webp");
      mediumUrl = medResult.url;
    } catch {
      const originalPath = buildStoragePath(missionId, claimId, "original", primaryFile.name);
      const originalResult = await uploadFile(originalPath, fileBuffer, primaryFile.type);
      contentUrl = originalResult.url;
    }
  } else {
    const originalPath = buildStoragePath(missionId, claimId, "original", primaryFile.name);
    const originalResult = await uploadFile(originalPath, fileBuffer, primaryFile.type);
    contentUrl = originalResult.url;
  }

  return { contentUrl, thumbnailUrl, mediumUrl };
}

// --- Helper: Handle honeypot detection ---
async function handleHoneypotDetection(
  db: NonNullable<ReturnType<typeof getDb>>,
  evidenceId: string,
  humanId: string,
): Promise<void> {
  const redis = getRedis();
  if (redis) {
    const fraudKey = `fraud:honeypot:${humanId}`;
    const fraudCount = await redis.incr(fraudKey);
    if (fraudCount === 1) {
      await redis.expire(fraudKey, 90 * 24 * 60 * 60);
    }
    if (fraudCount >= 3) {
      
      await db.insert(verificationAuditLog).values({
        evidenceId,
        decisionSource: "system",
        decision: "rejected",
        reasoning: `Account flagged: ${fraudCount} honeypot submissions detected`,
        metadata: { fraudCount, trigger: "honeypot_threshold" },
      });
    }
  }

  
  await db.insert(verificationAuditLog).values({
    evidenceId,
    decisionSource: "system",
    decision: "rejected",
    reasoning: "Honeypot mission submission",
    metadata: { honeypot: true },
  });
}

// --- Helper: Enqueue before/after comparison ---
async function enqueueBeforeAfterComparison(pairId: string, afterEvidenceId: string): Promise<void> {
  try {
    const { getEvidenceVerificationQueue } = await import("../../lib/evidence-queue.js");
    const queue = getEvidenceVerificationQueue();
    await queue.add("compare-pair", { pairId, afterEvidenceId }, {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    });
  } catch {
    // Queue not available in dev/test - non-fatal
  }
}

// --- Helper: Enqueue for AI verification ---
async function enqueueVerification(evidenceId: string): Promise<void> {
  try {
    const { getEvidenceVerificationQueue } = await import("../../lib/evidence-queue.js");
    const queue = getEvidenceVerificationQueue();
    await queue.add("verify", { evidenceId }, {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    });
  } catch {
    // Queue not available in dev/test - non-fatal
  }
}

// --- Helper: Enqueue fraud scoring after evidence submission ---
async function enqueueFraudScoring(evidenceId: string, humanId: string, imageBuffer?: Buffer): Promise<void> {
  try {
    const { getFraudScoringQueue } = await import("../../lib/fraud-queue.js");
    const queue = getFraudScoringQueue();
    await queue.add("score", {
      evidenceId,
      humanId,
      // Pass image as base64 for pHash duplicate detection in fraud-scoring worker
      imageBuffer: imageBuffer ? imageBuffer.toString("base64") : undefined,
    }, {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    });
  } catch {
    // Queue not available in dev/test - non-fatal
  }
}

// --- Helper: Extract EXIF and enrich GPS/timestamp metadata ---
interface ExifEnrichment {
  latitude?: number;
  longitude?: number;
  capturedAt?: Date;
  exifData: Record<string, unknown>;
}

async function extractAndEnrichExif(
  primaryFile: File,
  fileBuffer: Buffer,
  gps: { latitude?: number; longitude?: number },
  capturedAt: Date | undefined,
): Promise<ExifEnrichment> {
  let { latitude, longitude } = gps;
  let exifData: Record<string, unknown> = {};

  if (primaryFile.type.startsWith("image/")) {
    const rawExif = await extractExif(fileBuffer);
    exifData = stripExifPii(rawExif);
    if (!latitude && rawExif.latitude) { latitude = rawExif.latitude; longitude = rawExif.longitude; }
    if (!capturedAt && rawExif.dateTime) { capturedAt = rawExif.dateTime; }
  }

  return { latitude, longitude, capturedAt, exifData };
}

// --- Helper: Validate mission and claim for evidence submission ---
async function validateMissionAndClaim(
  db: NonNullable<ReturnType<typeof getDb>>,
  missionId: string,
  humanId: string,
): Promise<{
  mission: { id: string; expiresAt: Date; isHoneypot: boolean; templateId: string | null; requiredLatitude: string | null; requiredLongitude: string | null };
  claim: { id: string; status: string; deadlineAt: Date };
  gpsRadiusMeters: number | null;
}> {
  const [mission] = await db
    .select({
      id: missions.id, expiresAt: missions.expiresAt, isHoneypot: missions.isHoneypot,
      templateId: missions.templateId,
      requiredLatitude: missions.requiredLatitude, requiredLongitude: missions.requiredLongitude,
    })
    .from(missions).where(eq(missions.id, missionId)).limit(1);

  if (!mission) throw new AppError("NOT_FOUND", "Mission not found");
  if (mission.expiresAt < new Date()) throw new AppError("CONFLICT", "Mission has expired");

  // Fetch template GPS radius if mission was created from a template
  let gpsRadiusMeters: number | null = null;
  if (mission.templateId) {
    const [template] = await db
      .select({ gpsRadiusMeters: missionTemplates.gpsRadiusMeters })
      .from(missionTemplates)
      .where(eq(missionTemplates.id, mission.templateId))
      .limit(1);
    if (template) gpsRadiusMeters = template.gpsRadiusMeters;
  }

  const [claim] = await db
    .select({ id: missionClaims.id, status: missionClaims.status, deadlineAt: missionClaims.deadlineAt })
    .from(missionClaims)
    .where(and(eq(missionClaims.missionId, missionId), eq(missionClaims.humanId, humanId), eq(missionClaims.status, "active")))
    .limit(1);

  if (!claim) throw new AppError("FORBIDDEN", "No active claim on this mission");
  if (claim.deadlineAt < new Date()) throw new AppError("CONFLICT", "Claim deadline has passed");

  return { mission, claim, gpsRadiusMeters };
}

// --- Helper: Haversine distance in meters ---
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// POST /api/v1/missions/:missionId/evidence - Submit evidence
// ---------------------------------------------------------------------------
// eslint-disable-next-line complexity
evidenceRoutes.post("/:missionId/evidence", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const missionId = parseUuidParam(c.req.param("missionId"), "missionId");
  const human = c.get("human");

  const withinLimit = await checkRateLimit(human.id);
  if (!withinLimit) {
    throw new AppError("RATE_LIMITED", "Evidence submission rate limit exceeded (10/hour)");
  }

  // Increment rate limit BEFORE processing to prevent race conditions
  await incrementRateLimit(human.id);

  const formData = await c.req.formData();
  const files = parseFormFiles(formData);
  validateFormFiles(files);

  const gps = parseGpsCoordinates(formData);
  const capturedAtInput = parseCapturedAtField(formData);
  const notes = formData.get("notes");

  // Sprint 12: Before/after pair support
  const pairIdRaw = formData.get("pairId");
  const photoSequenceTypeRaw = formData.get("photoSequenceType");
  const pairId = pairIdRaw ? String(pairIdRaw) : undefined;
  const photoSequenceType = photoSequenceTypeRaw
    ? (String(photoSequenceTypeRaw) as "before" | "after" | "standalone")
    : "standalone";

  if (pairId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pairId)) {
    throw new AppError("VALIDATION_ERROR", "pairId must be a valid UUID");
  }
  if (!["before", "after", "standalone"].includes(photoSequenceType)) {
    throw new AppError("VALIDATION_ERROR", "photoSequenceType must be before, after, or standalone");
  }

  // Validate mission exists and human has active claim
  const { mission, claim, gpsRadiusMeters } = await validateMissionAndClaim(db, missionId, human.id);

  // Process primary file
  const primaryFile = files[0]!;
  const fileBuffer = Buffer.from(await primaryFile.arrayBuffer());

  // Extract EXIF and enrich metadata
  const enriched = await extractAndEnrichExif(primaryFile, fileBuffer, gps, capturedAtInput);

  // Sprint 12 T078: GPS radius validation for template-based missions
  if (gpsRadiusMeters != null && mission.requiredLatitude && mission.requiredLongitude) {
    if (enriched.latitude == null || enriched.longitude == null) {
      throw new AppError("VALIDATION_ERROR", "GPS coordinates required for template-based missions");
    }
    const distance = haversineMeters(
      Number(mission.requiredLatitude), Number(mission.requiredLongitude),
      enriched.latitude, enriched.longitude,
    );
    if (distance > gpsRadiusMeters) {
      throw new AppError("VALIDATION_ERROR",
        `Evidence location is ${Math.round(distance)}m from mission location, exceeds ${gpsRadiusMeters}m radius`);
    }
  }

  const evidenceType = getEvidenceType(primaryFile.type);
  const uploaded = await processAndUploadFile(primaryFile, fileBuffer, missionId, claim.id);

  // Create evidence record
  const [evidenceRecord] = await db.insert(evidence).values({
    missionId, claimId: claim.id, submittedByHumanId: human.id,
    evidenceType, contentUrl: uploaded.contentUrl, thumbnailUrl: uploaded.thumbnailUrl, mediumUrl: uploaded.mediumUrl,
    latitude: enriched.latitude != null ? String(enriched.latitude) : null,
    longitude: enriched.longitude != null ? String(enriched.longitude) : null,
    capturedAt: enriched.capturedAt, exifData: enriched.exifData, fileSize: primaryFile.size, mimeType: primaryFile.type,
    notes: notes ? String(notes).slice(0, 2000) : null,
    verificationStage: mission.isHoneypot ? "rejected" : "pending",
    isHoneypotSubmission: mission.isHoneypot,
    pairId: pairId ?? null,
    photoSequenceType,
  }).returning();

  if (mission.isHoneypot) {
    await handleHoneypotDetection(db, evidenceRecord!.id, human.id);
  } else if (photoSequenceType === "after" && pairId) {
    // Before/after pair: enqueue comparison instead of standard verification
    await enqueueBeforeAfterComparison(pairId, evidenceRecord!.id);
  } else {
    await enqueueVerification(evidenceRecord!.id);
  }

  // Enqueue fraud scoring for all submissions (honeypot and normal)
  // Pass image buffer for pHash duplicate detection
  const imageBasedType = primaryFile.type.startsWith("image/");
  await enqueueFraudScoring(evidenceRecord!.id, human.id, imageBasedType ? fileBuffer : undefined);

  // Rate limit already incremented before processing (see above)

  return c.json({
    ok: true,
    data: {
      evidenceId: evidenceRecord!.id, missionId, claimId: claim.id,
      status: evidenceRecord!.verificationStage, filesUploaded: files.length,
    },
    requestId: c.get("requestId"),
  }, 201);
});

// ---------------------------------------------------------------------------
// GET /api/v1/missions/:missionId/evidence - List evidence
// ---------------------------------------------------------------------------
const listQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

evidenceRoutes.get("/:missionId/evidence", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const missionId = parseUuidParam(c.req.param("missionId"), "missionId");
  const human = c.get("human");

  const query = c.req.query();
  const parsed = listQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query parameters");
  }

  const { limit, cursor } = parsed.data;

  // IDOR protection: only show own evidence
  const conditions = [
    eq(evidence.missionId, missionId),
    eq(evidence.submittedByHumanId, human.id),
  ];

  if (cursor) {
    const [cursorEvidence] = await db
      .select({ createdAt: evidence.createdAt })
      .from(evidence)
      .where(eq(evidence.id, cursor))
      .limit(1);
    if (cursorEvidence) {
      conditions.push(lt(evidence.createdAt, cursorEvidence.createdAt));
    }
  }

  const rows = await db
    .select({
      id: evidence.id,
      missionId: evidence.missionId,
      claimId: evidence.claimId,
      evidenceType: evidence.evidenceType,
      contentUrl: evidence.contentUrl,
      thumbnailUrl: evidence.thumbnailUrl,
      verificationStage: evidence.verificationStage,
      aiVerificationScore: evidence.aiVerificationScore,
      finalVerdict: evidence.finalVerdict,
      createdAt: evidence.createdAt,
    })
    .from(evidence)
    .where(and(...conditions))
    .orderBy(desc(evidence.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  // Generate signed URLs
  const itemsWithUrls = await Promise.all(
    items.map(async (item) => ({
      ...item,
      contentUrl: item.contentUrl ? await getSignedUrl(item.contentUrl) : null,
      thumbnailUrl: item.thumbnailUrl ? await getSignedUrl(item.thumbnailUrl) : null,
    })),
  );

  const lastItem = items[items.length - 1];

  return c.json({
    ok: true,
    data: {
      evidence: itemsWithUrls,
      nextCursor: hasMore && lastItem ? lastItem.id : null,
    },
    meta: {
      hasMore,
      count: items.length,
    },
    requestId: c.get("requestId"),
  });
});

export default evidenceRoutes;
