/**
 * Submission Cost Service — Deducts agent credits for content submissions.
 *
 * Sprint 12 T026: Credit-based submission costs with hardship protection.
 * - Problem = 2 credits, Solution = 5, Debate = 1
 * - Hardship protection: free submissions when balance < 10
 * - Feature-flagged via SUBMISSION_COSTS_ENABLED + SUBMISSION_COST_MULTIPLIER
 */
import {
  SUBMISSION_COSTS,
  HARDSHIP_THRESHOLD,
  AppError,
} from "@betterworld/shared";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type Redis from "ioredis";

import { logger } from "../middleware/logger.js";
import { AgentCreditService } from "../services/agent-credit.service.js";
import { getFlag } from "../services/feature-flags.js";

/** Map content type → transaction type for the credit ledger */
const TRANSACTION_TYPE_MAP = {
  problem: "spend_submission_problem",
  solution: "spend_submission_solution",
  debate: "spend_submission_debate",
} as const;

export interface SubmissionCostResult {
  costDeducted: number;
  hardshipApplied: boolean;
  balanceBefore: number;
  balanceAfter: number;
  transactionId: string | null;
}

/**
 * Deduct submission cost from an agent's credit balance.
 *
 * Flow:
 *  1. Check SUBMISSION_COSTS_ENABLED flag → skip if disabled
 *  2. Apply SUBMISSION_COST_MULTIPLIER to base cost (minimum 1 credit)
 *  3. Check balance for hardship protection (< 10 credits → free)
 *  4. Deduct via AgentCreditService.spendCredits() with idempotency
 */
export async function deductSubmissionCost(
  db: PostgresJsDatabase,
  redis: Redis | null,
  agentId: string,
  contentType: "problem" | "solution" | "debate",
  contentId: string,
): Promise<SubmissionCostResult> {
  // 1. Check feature flag — if disabled, no cost
  const enabled = await getFlag(redis, "SUBMISSION_COSTS_ENABLED");
  if (!enabled) {
    return {
      costDeducted: 0,
      hardshipApplied: false,
      balanceBefore: 0,
      balanceAfter: 0,
      transactionId: null,
    };
  }

  // 2. Get cost multiplier and compute effective cost
  const multiplier = await getFlag(redis, "SUBMISSION_COST_MULTIPLIER");
  const baseCost = SUBMISSION_COSTS[contentType];
  const cost = Math.max(1, Math.round(baseCost * multiplier));

  const creditService = new AgentCreditService(db);

  // 3. Check balance for hardship protection
  const balance = await creditService.getBalance(agentId);
  if (balance < HARDSHIP_THRESHOLD) {
    logger.info(
      { agentId, contentType, balance, threshold: HARDSHIP_THRESHOLD },
      "Hardship protection applied — submission is free",
    );
    return {
      costDeducted: 0,
      hardshipApplied: true,
      balanceBefore: balance,
      balanceAfter: balance,
      transactionId: null,
    };
  }

  // 4. Deduct credits via atomic spendCredits
  const transactionType = TRANSACTION_TYPE_MAP[contentType];
  const idempotencyKey = `submission:${contentId}`;

  const result = await creditService.spendCredits(
    agentId,
    cost,
    transactionType,
    contentId,
    idempotencyKey,
    `${contentType} submission cost: -${cost} credits`,
  );

  // spendCredits returns null on insufficient balance
  if (result === null) {
    throw new AppError(
      "INSUFFICIENT_TOKENS",
      `Insufficient credits to submit ${contentType}. Required: ${cost}, available: ${balance}`,
      { required: cost, available: balance, contentType },
    );
  }

  logger.info(
    {
      agentId,
      contentType,
      contentId,
      cost,
      balanceBefore: balance,
      balanceAfter: result.balanceAfter,
      transactionId: result.transactionId,
    },
    "Submission cost deducted",
  );

  return {
    costDeducted: cost,
    hardshipApplied: false,
    balanceBefore: balance,
    balanceAfter: result.balanceAfter,
    transactionId: result.transactionId,
  };
}
