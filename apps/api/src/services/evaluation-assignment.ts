/* eslint-disable complexity */
/**
 * Evaluation Assignment Service (Sprint 11 — T007, T008)
 *
 * Assigns validators from the pool to evaluate submissions.
 * Ensures no self-review, tier stratification, daily limits, and rotation.
 */
import { peerEvaluations, validatorPool } from "@betterworld/db";
import { and, eq, sql, ne, or, isNull, lt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

import { sendToAgent } from "../ws/feed.js";

const logger = pino({ name: "evaluation-assignment" });

const EVALUATION_RUBRIC = {
  domainAlignment: "Rate how well this submission aligns with its claimed domain (1-5)",
  factualAccuracy: "Rate the factual accuracy and evidence quality (1-5)",
  impactPotential: "Rate the potential impact if addressed (1-5)",
};

const DEFAULT_OVER_ASSIGN = 6;
const EVALUATION_EXPIRY_MINUTES = 30;
const DAILY_EVALUATION_LIMIT = 10;

export interface AssignmentResult {
  assignedValidatorIds: string[];
  tierFallback: boolean;
  quorumRequired: number;
  expiresAt: Date;
}

/**
 * Assign validators to evaluate a submission.
 *
 * Selection algorithm:
 * 1. Filter active, non-suspended, within daily limit, exclude self
 * 2. Exclude validators assigned to same submitting agent's last 3 submissions
 * 3. Prefer at least 1 journeyman+ tier
 * 4. Over-assign (configurable, default 6) to ensure quorum (3)
 */
export async function assignValidators(
  db: PostgresJsDatabase,
  submissionId: string,
  submissionType: "problem" | "solution" | "debate",
  agentId: string,
  domain: string,
  submission: { title: string; description: string },
  locationPoint?: { lat: number; lng: number },
): Promise<AssignmentResult> {
  const overAssign = parseInt(process.env.PEER_CONSENSUS_OVER_ASSIGN || String(DEFAULT_OVER_ASSIGN), 10);
  const expiryMinutes = parseInt(process.env.PEER_CONSENSUS_EXPIRY_MINUTES || String(EVALUATION_EXPIRY_MINUTES), 10);
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  // 1. Query active validators excluding the submission author
  const candidates = await db
    .select({
      id: validatorPool.id,
      agentId: validatorPool.agentId,
      tier: validatorPool.tier,
      dailyEvaluationCount: validatorPool.dailyEvaluationCount,
      homeRegionPoint: validatorPool.homeRegionPoint,
      homeRegions: validatorPool.homeRegions,
    })
    .from(validatorPool)
    .where(
      and(
        eq(validatorPool.isActive, true),
        or(
          isNull(validatorPool.suspendedUntil),
          lt(validatorPool.suspendedUntil, new Date()),
        ),
        ne(validatorPool.agentId, agentId),
        lt(validatorPool.dailyEvaluationCount, DAILY_EVALUATION_LIMIT),
      ),
    );

  // 2. Exclude validators assigned to same submitting agent's last 3 submissions
  const lastSubmissionValidators = await db.execute(sql`
    SELECT DISTINCT validator_id FROM peer_evaluations
    WHERE submission_id IN (
      SELECT submission_id FROM peer_evaluations
      WHERE submission_id IN (
        SELECT id FROM problems WHERE reported_by_agent_id = ${agentId}
        UNION ALL
        SELECT id FROM solutions WHERE proposed_by_agent_id = ${agentId}
        UNION ALL
        SELECT id FROM debates WHERE agent_id = ${agentId}
      )
      ORDER BY assigned_at DESC
      LIMIT 3
    )
  `);

  const excludedValidatorIds = new Set(
    (lastSubmissionValidators as unknown as Array<{ validator_id: string }>).map((r) => r.validator_id),
  );

  const eligible = candidates.filter((c) => !excludedValidatorIds.has(c.id));

  if (eligible.length < 3) {
    throw Object.assign(new Error(`Cannot form quorum: only ${eligible.length} active validator(s) available, need at least 3`), {
      code: "INSUFFICIENT_VALIDATORS",
    });
  }

  // T037: Affinity boost — prefer local validators for hyperlocal submissions
  let preferredPool: typeof eligible = [];
  let generalPool = eligible;

  if (locationPoint) {
    // Check each validator's home_region_point within 100km of submission location
    const localValidators: typeof eligible = [];
    const nonLocalValidators: typeof eligible = [];

    for (const v of eligible) {
      let isLocal = false;

      // Check if home_region_point is set and within 100km (100000 meters)
      if (v.homeRegionPoint) {
        try {
          const [result] = await db.execute(sql`
            SELECT ST_DWithin(
              ${v.homeRegionPoint}::geography,
              ST_SetSRID(ST_MakePoint(${locationPoint.lng}, ${locationPoint.lat}), 4326)::geography,
              100000
            ) AS within
          `) as Array<{ within: boolean }>;
          if (result?.within) {
            isLocal = true;
          }
        } catch {
          // PostGIS not available or query error — skip affinity boost
        }
      }

      // Also check JSONB home_regions array for proximity
      if (!isLocal && Array.isArray(v.homeRegions) && (v.homeRegions as Array<{ lat: number; lng: number }>).length > 0) {
        for (const region of v.homeRegions as Array<{ lat: number; lng: number }>) {
          try {
            const [result] = await db.execute(sql`
              SELECT ST_DWithin(
                ST_SetSRID(ST_MakePoint(${region.lng}, ${region.lat}), 4326)::geography,
                ST_SetSRID(ST_MakePoint(${locationPoint.lng}, ${locationPoint.lat}), 4326)::geography,
                100000
              ) AS within
            `) as Array<{ within: boolean }>;
            if (result?.within) {
              isLocal = true;
              break;
            }
          } catch {
            // PostGIS not available — skip
          }
        }
      }

      if (isLocal) {
        localValidators.push(v);
      } else {
        nonLocalValidators.push(v);
      }
    }

    if (localValidators.length > 0) {
      preferredPool = localValidators;
      generalPool = nonLocalValidators;
      logger.info(
        { submissionId, submissionType, domain, localCount: localValidators.length },
        "Affinity boost: local validators found for hyperlocal submission",
      );
    }
  }

  // 3. Check tier stratification - prefer at least 1 journeyman+
  const allCandidates = [...preferredPool, ...generalPool];
  const journeymanPlus = allCandidates.filter((v) => v.tier === "journeyman" || v.tier === "expert");
  let tierFallback = false;

  let selected: typeof eligible;

  if (journeymanPlus.length === 0) {
    // No journeyman+ available - proceed with all-apprentice (shadow mode only)
    tierFallback = true;
    logger.warn(
      { submissionId, submissionType, domain },
      "journeyman_unavailable: proceeding with all-apprentice quorum (shadow mode)",
    );
    // Prefer local validators, then fill from general pool
    const shuffledPreferred = shuffle(preferredPool);
    const shuffledGeneral = shuffle(generalPool);
    selected = [...shuffledPreferred, ...shuffledGeneral].slice(0, overAssign);
  } else {
    // Select from preferred pool first (local validators), then fill from general pool
    // Ensure at least 1 journeyman+ is included
    const preferredJourneyman = shuffle(preferredPool.filter((v) => v.tier === "journeyman" || v.tier === "expert"));
    const preferredApprentice = shuffle(preferredPool.filter((v) => v.tier === "apprentice"));
    const generalJourneyman = shuffle(generalPool.filter((v) => v.tier === "journeyman" || v.tier === "expert"));
    const generalApprentice = shuffle(generalPool.filter((v) => v.tier === "apprentice"));

    // Priority order: preferred journeyman+, preferred apprentice, general journeyman+, general apprentice
    const combined = [...preferredJourneyman, ...preferredApprentice, ...generalJourneyman, ...generalApprentice];

    if (combined.length > overAssign) {
      selected = combined.slice(0, overAssign);
      // Ensure at least 1 journeyman+ is in the selection
      if (!selected.some((v) => v.tier === "journeyman" || v.tier === "expert")) {
        const firstJourneyman = preferredJourneyman[0] || generalJourneyman[0];
        if (firstJourneyman) {
          selected[selected.length - 1] = firstJourneyman;
        }
      }
    } else {
      selected = combined;
    }
  }

  // 5. Insert peer_evaluations records
  const evaluationRecords = selected.map((validator) => ({
    submissionId,
    submissionType: submissionType as "problem" | "solution" | "debate" | "mission",
    validatorId: validator.id,
    validatorAgentId: validator.agentId,
    status: "pending",
    expiresAt,
  }));

  const insertedEvals = await db
    .insert(peerEvaluations)
    .values(evaluationRecords)
    .returning({ id: peerEvaluations.id, validatorAgentId: peerEvaluations.validatorAgentId });

  // 6. Increment daily_evaluation_count on validator_pool
  for (const validator of selected) {
    await db
      .update(validatorPool)
      .set({
        dailyEvaluationCount: sql`${validatorPool.dailyEvaluationCount} + 1`,
        lastAssignmentAt: new Date(),
      })
      .where(eq(validatorPool.id, validator.id));
  }

  // T008: Send WebSocket notifications to each assigned validator
  for (const evaluation of insertedEvals) {
    sendToAgent(evaluation.validatorAgentId, {
      type: "evaluation_request",
      data: {
        evaluationId: evaluation.id,
        submission: {
          id: submissionId,
          type: submissionType,
          title: submission.title,
          description: submission.description,
          domain,
        },
        rubric: EVALUATION_RUBRIC,
        expiresAt: expiresAt.toISOString(),
      },
    });
  }

  logger.info(
    {
      submissionId,
      submissionType,
      domain,
      assignedCount: selected.length,
      tierFallback,
    },
    "Validators assigned for evaluation",
  );

  return {
    assignedValidatorIds: selected.map((v) => v.id),
    tierFallback,
    quorumRequired: 3,
    expiresAt,
  };
}

/** Fisher-Yates shuffle */
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return result;
}
