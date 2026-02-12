/**
 * Observation Service (Sprint 10 — US3)
 *
 * Handles human observation submissions with GPS validation,
 * proximity checking, and auto-problem creation for standalone observations.
 */
import { observations, problems } from "@betterworld/db";
import { GPS_VALIDATION, OBSERVATION_RATE_LIMIT, SYSTEM_MUNICIPAL_AGENT_ID } from "@betterworld/shared";
import type { CreateObservationInput, CreateStandaloneObservationInput } from "@betterworld/shared";
import { eq, and, desc, lt, count, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type Redis from "ioredis";

import { logger } from "../middleware/logger.js";

/**
 * Validate GPS coordinates per spec:
 * - Reject null island (0,0)
 * - Reject polar limits (|lat| > 80)
 * - Reject accuracy > 1000m
 */
export function validateGPS(
  lat: number,
  lng: number,
  accuracyMeters?: number,
): { valid: boolean; error?: string } {
  // Null island check
  if (
    Math.abs(lat) < GPS_VALIDATION.NULL_ISLAND_THRESHOLD &&
    Math.abs(lng) < GPS_VALIDATION.NULL_ISLAND_THRESHOLD
  ) {
    return { valid: false, error: "Invalid GPS coordinates: null island (0,0) rejected" };
  }

  // Polar limit check
  if (Math.abs(lat) > GPS_VALIDATION.POLAR_LIMIT) {
    return { valid: false, error: `Latitude must be between -${GPS_VALIDATION.POLAR_LIMIT} and ${GPS_VALIDATION.POLAR_LIMIT}` };
  }

  // Accuracy check
  if (accuracyMeters != null && accuracyMeters > GPS_VALIDATION.ACCURACY_LIMIT_METERS) {
    return { valid: false, error: `GPS accuracy exceeds ${GPS_VALIDATION.ACCURACY_LIMIT_METERS}m threshold` };
  }

  return { valid: true };
}

/**
 * Check observation rate limit for a human using Redis sliding window.
 * Fail-closed: returns false if Redis is unavailable.
 */
export async function checkObservationRateLimit(
  redis: Redis | null,
  humanId: string,
): Promise<boolean> {
  if (!redis) return false; // Fail closed

  const key = `${OBSERVATION_RATE_LIMIT.REDIS_KEY_PREFIX}${humanId}`;
  try {
    const current = await redis.get(key);
    if (current && parseInt(current, 10) >= OBSERVATION_RATE_LIMIT.MAX_PER_HOUR) {
      return false;
    }
    return true;
  } catch {
    return false; // Fail closed
  }
}

/**
 * Increment the observation rate limit counter for a human.
 */
export async function incrementObservationRateLimit(
  redis: Redis | null,
  humanId: string,
): Promise<void> {
  if (!redis) return;

  const key = `${OBSERVATION_RATE_LIMIT.REDIS_KEY_PREFIX}${humanId}`;
  try {
    const cnt = await redis.incr(key);
    if (cnt === 1) {
      await redis.expire(key, OBSERVATION_RATE_LIMIT.WINDOW_SECONDS);
    }
  } catch {
    // Non-fatal
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PostgresJsDatabase<any>;

/**
 * Create an observation attached to an existing problem.
 */
export async function createObservationForProblem(
  db: AnyDb,
  humanId: string,
  problemId: string,
  input: CreateObservationInput,
) {
  // Verify problem exists
  const problemRows = await db
    .select({ id: problems.id, latitude: problems.latitude, longitude: problems.longitude })
    .from(problems)
    .where(eq(problems.id, problemId))
    .limit(1);

  const problem = problemRows[0];
  if (!problem) {
    throw new ObservationError("NOT_FOUND", "Problem not found");
  }

  // Proximity check: observation should be within 50km of problem location
  if (problem.latitude && problem.longitude) {
    const problemLat = parseFloat(problem.latitude);
    const problemLng = parseFloat(problem.longitude);
    const distance = haversineDistance(input.gpsLat, input.gpsLng, problemLat, problemLng);
    if (distance > 50000) { // 50km
      throw new ObservationError("PROXIMITY_ERROR", "Observation location is too far from problem area");
    }
  }

  // Insert observation
  const insertResult = await db
    .insert(observations)
    .values({
      problemId,
      observationType: input.observationType,
      caption: input.caption,
      gpsLat: String(input.gpsLat),
      gpsLng: String(input.gpsLng),
      gpsAccuracyMeters: input.gpsAccuracyMeters ?? null,
      locationPoint: sql`ST_SetSRID(ST_MakePoint(${input.gpsLng}, ${input.gpsLat}), 4326)::geography`,
      capturedAt: input.capturedAt ? new Date(input.capturedAt) : null,
      submittedByHumanId: humanId,
      verificationStatus: "pending",
    })
    .returning({
      id: observations.id,
      problemId: observations.problemId,
      observationType: observations.observationType,
      caption: observations.caption,
      gpsLat: observations.gpsLat,
      gpsLng: observations.gpsLng,
      verificationStatus: observations.verificationStatus,
      mediaUrl: observations.mediaUrl,
      thumbnailUrl: observations.thumbnailUrl,
      perceptualHash: observations.perceptualHash,
      createdAt: observations.createdAt,
    });

  const observation = insertResult[0]!;

  // Increment observation count on problem
  await db.execute(
    sql`UPDATE problems SET observation_count = COALESCE(observation_count, 0) + 1 WHERE id = ${problemId}`,
  );

  // Enqueue privacy processing (non-blocking)
  try {
    await enqueuePrivacyProcessing(observation.id);
  } catch {
    // Non-fatal: privacy worker will pick up from queue
  }

  logger.info(
    { observationId: observation.id, problemId, humanId },
    "Observation created for problem",
  );

  return {
    observation: {
      id: observation.id,
      problemId: observation.problemId ?? problemId,
      observationType: observation.observationType,
      caption: observation.caption,
      gpsLat: observation.gpsLat ?? String(input.gpsLat),
      gpsLng: observation.gpsLng ?? String(input.gpsLng),
      verificationStatus: observation.verificationStatus,
      mediaUrl: observation.mediaUrl,
      thumbnailUrl: observation.thumbnailUrl,
      perceptualHash: observation.perceptualHash,
      createdAt: observation.createdAt,
    },
  };
}

/**
 * Create a standalone observation that auto-creates a new problem.
 */
export async function createStandaloneObservation(
  db: AnyDb,
  humanId: string,
  input: CreateStandaloneObservationInput,
) {
  return db.transaction(async (tx: AnyDb) => {
    // Auto-create the problem
    const problemResult = await tx
      .insert(problems)
      .values({
        reportedByAgentId: SYSTEM_MUNICIPAL_AGENT_ID,
        title: input.problemTitle,
        description: input.caption,
        domain: input.domain as never,
        severity: (input.severity ?? "medium") as never,
        geographicScope: "neighborhood",
        latitude: String(input.gpsLat),
        longitude: String(input.gpsLng),
        locationPoint: sql`ST_SetSRID(ST_MakePoint(${input.gpsLng}, ${input.gpsLat}), 4326)::geography`,
        guardrailStatus: "pending",
        observationCount: 1,
      })
      .returning({
        id: problems.id,
        title: problems.title,
        domain: problems.domain,
        guardrailStatus: problems.guardrailStatus,
      });

    const newProblem = problemResult[0]!;

    // Create the observation linked to the new problem
    const obsResult = await tx
      .insert(observations)
      .values({
        problemId: newProblem.id,
        observationType: input.observationType,
        caption: input.caption,
        gpsLat: String(input.gpsLat),
        gpsLng: String(input.gpsLng),
        gpsAccuracyMeters: input.gpsAccuracyMeters ?? null,
        locationPoint: sql`ST_SetSRID(ST_MakePoint(${input.gpsLng}, ${input.gpsLat}), 4326)::geography`,
        capturedAt: input.capturedAt ? new Date(input.capturedAt) : null,
        submittedByHumanId: humanId,
        verificationStatus: "pending",
      })
      .returning({
        id: observations.id,
        problemId: observations.problemId,
        observationType: observations.observationType,
        caption: observations.caption,
        gpsLat: observations.gpsLat,
        gpsLng: observations.gpsLng,
        verificationStatus: observations.verificationStatus,
        mediaUrl: observations.mediaUrl,
        thumbnailUrl: observations.thumbnailUrl,
        perceptualHash: observations.perceptualHash,
        createdAt: observations.createdAt,
      });

    const observation = obsResult[0]!;

    // Enqueue privacy processing (non-blocking)
    try {
      await enqueuePrivacyProcessing(observation.id);
    } catch {
      // Non-fatal
    }

    logger.info(
      { observationId: observation.id, problemId: newProblem.id, humanId },
      "Standalone observation created with auto-problem",
    );

    return {
      observation: {
        id: observation.id,
        problemId: observation.problemId ?? newProblem.id,
        observationType: observation.observationType,
        caption: observation.caption,
        gpsLat: observation.gpsLat ?? String(input.gpsLat),
        gpsLng: observation.gpsLng ?? String(input.gpsLng),
        verificationStatus: observation.verificationStatus,
        mediaUrl: observation.mediaUrl,
        thumbnailUrl: observation.thumbnailUrl,
        perceptualHash: observation.perceptualHash,
        createdAt: observation.createdAt,
      },
      problem: newProblem,
    };
  });
}

/**
 * Get a single observation by ID.
 */
export async function getObservation(
  db: AnyDb,
  observationId: string,
) {
  const rows = await db
    .select({
      id: observations.id,
      problemId: observations.problemId,
      observationType: observations.observationType,
      caption: observations.caption,
      mediaUrl: observations.mediaUrl,
      thumbnailUrl: observations.thumbnailUrl,
      gpsLat: observations.gpsLat,
      gpsLng: observations.gpsLng,
      gpsAccuracyMeters: observations.gpsAccuracyMeters,
      capturedAt: observations.capturedAt,
      verificationStatus: observations.verificationStatus,
      verificationNotes: observations.verificationNotes,
      perceptualHash: observations.perceptualHash,
      submittedByHumanId: observations.submittedByHumanId,
      createdAt: observations.createdAt,
      updatedAt: observations.updatedAt,
    })
    .from(observations)
    .where(eq(observations.id, observationId))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * List observations for a problem with cursor pagination and optional status filter.
 */
export async function listObservationsForProblem(
  db: AnyDb,
  problemId: string,
  options: {
    cursor?: string;
    limit?: number;
    verificationStatus?: string;
  } = {},
) {
  const limit = options.limit ?? 20;

  // Verify problem exists
  const problemRows = await db
    .select({ id: problems.id })
    .from(problems)
    .where(eq(problems.id, problemId))
    .limit(1);

  if (problemRows.length === 0) {
    throw new ObservationError("NOT_FOUND", "Problem not found");
  }

  // Build conditions
  const conditions = [eq(observations.problemId, problemId)];

  if (options.verificationStatus) {
    conditions.push(eq(observations.verificationStatus, options.verificationStatus as never));
  }

  if (options.cursor) {
    conditions.push(lt(observations.id, options.cursor));
  }

  // Get total count
  const countRows = await db
    .select({ count: count() })
    .from(observations)
    .where(
      options.verificationStatus
        ? and(eq(observations.problemId, problemId), eq(observations.verificationStatus, options.verificationStatus as never))
        : eq(observations.problemId, problemId),
    );

  const totalCount = Number(countRows[0]?.count ?? 0);

  // Fetch page
  const rows = await db
    .select({
      id: observations.id,
      problemId: observations.problemId,
      observationType: observations.observationType,
      caption: observations.caption,
      mediaUrl: observations.mediaUrl,
      thumbnailUrl: observations.thumbnailUrl,
      gpsLat: observations.gpsLat,
      gpsLng: observations.gpsLng,
      gpsAccuracyMeters: observations.gpsAccuracyMeters,
      capturedAt: observations.capturedAt,
      verificationStatus: observations.verificationStatus,
      verificationNotes: observations.verificationNotes,
      perceptualHash: observations.perceptualHash,
      submittedByHumanId: observations.submittedByHumanId,
      createdAt: observations.createdAt,
      updatedAt: observations.updatedAt,
    })
    .from(observations)
    .where(and(...conditions))
    .orderBy(desc(observations.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const nextCursor = hasMore && page.length > 0 ? page[page.length - 1]!.id : null;

  return { observations: page, nextCursor, totalCount };
}

/**
 * Custom error class for observation service.
 */
export class ObservationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ObservationError";
  }
}

/**
 * Haversine distance between two points in meters.
 */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Enqueue privacy processing for an observation (Sprint 12 — T062).
 * Non-blocking: failure is logged but doesn't prevent observation creation.
 */
async function enqueuePrivacyProcessing(observationId: string): Promise<void> {
  try {
    const { QUEUE_NAMES } = await import("@betterworld/shared");
    const { Queue } = await import("bullmq");
    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
    const queue = new Queue(QUEUE_NAMES.PRIVACY_PROCESSING, {
      connection: { url: redisUrl, lazyConnect: true },
    });
    await queue.add("process", { observationId }, {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    });
    await queue.close();
  } catch {
    // Queue not available in dev/test — non-fatal
  }
}
