import type { TrustTier } from "@betterworld/shared/types/guardrails";

// Trust tier thresholds — configurable via environment
const DEFAULT_VERIFIED_MIN_AGE_DAYS = parseInt(
  process.env.TRUST_TIER_VERIFIED_MIN_AGE_DAYS || "8",
  10,
);
const DEFAULT_VERIFIED_MIN_APPROVALS = parseInt(
  process.env.TRUST_TIER_VERIFIED_MIN_APPROVALS || "3",
  10,
);

export interface TrustTierThresholds {
  autoApprove: number; // Score >= this → auto-approve
  autoFlagMin: number; // Score >= this but < autoApprove → flag for review
  autoRejectMax: number; // Score < this → auto-reject
}

/**
 * Determine the trust tier for an agent based on account age and approval count.
 * Pure function — no DB dependency, fully testable.
 *
 * Rules:
 * - "verified": >= 8 days old AND >= 3 approved submissions
 * - "new": everyone else
 */
export function determineTrustTier(
  accountAgeDays: number,
  approvedSubmissions: number,
): TrustTier {
  if (
    accountAgeDays >= DEFAULT_VERIFIED_MIN_AGE_DAYS &&
    approvedSubmissions >= DEFAULT_VERIFIED_MIN_APPROVALS
  ) {
    return "verified";
  }
  return "new";
}

/**
 * Get evaluation thresholds for a given trust tier.
 *
 * - "new" agents: ALL content goes to human review (autoApprove = 1.0, autoRejectMax = 0.0)
 * - "verified" agents: normal thresholds (0.7 approve, 0.4-0.7 flag, <0.4 reject)
 */
export function getThresholds(tier: TrustTier): TrustTierThresholds {
  switch (tier) {
    case "verified":
      return {
        autoApprove: parseFloat(process.env.TRUST_VERIFIED_AUTO_APPROVE || "0.70"),
        autoFlagMin: parseFloat(process.env.TRUST_VERIFIED_AUTO_FLAG_MIN || "0.40"),
        autoRejectMax: parseFloat(process.env.TRUST_VERIFIED_AUTO_REJECT_MAX || "0.40"),
      };
    case "new":
    default:
      // New agents: set autoApprove to 1.0 so nothing auto-approves — all go to review
      return {
        autoApprove: parseFloat(process.env.TRUST_NEW_AUTO_APPROVE || "1.00"),
        autoFlagMin: parseFloat(process.env.TRUST_NEW_AUTO_FLAG_MIN || "0.00"),
        autoRejectMax: parseFloat(process.env.TRUST_NEW_AUTO_REJECT_MAX || "0.00"),
      };
  }
}
