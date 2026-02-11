/**
 * Reputation Tier Constants (Sprint 9: Reputation & Impact)
 *
 * 5-tier progression system with score thresholds, multipliers, and privileges.
 */

export const REPUTATION_TIERS = {
  newcomer: {
    name: "newcomer",
    displayName: "Newcomer",
    minScore: 0,
    multiplier: 1.0,
    privileges: ["submit_evidence", "view_leaderboards"],
  },
  contributor: {
    name: "contributor",
    displayName: "Contributor",
    minScore: 100,
    multiplier: 1.1,
    privileges: [
      "submit_evidence",
      "view_leaderboards",
      "peer_review",
      "endorse_peers",
    ],
  },
  advocate: {
    name: "advocate",
    displayName: "Advocate",
    minScore: 500,
    multiplier: 1.2,
    privileges: [
      "submit_evidence",
      "view_leaderboards",
      "peer_review",
      "endorse_peers",
      "create_missions",
      "priority_claiming",
    ],
  },
  leader: {
    name: "leader",
    displayName: "Leader",
    minScore: 2000,
    multiplier: 1.5,
    privileges: [
      "submit_evidence",
      "view_leaderboards",
      "peer_review",
      "endorse_peers",
      "create_missions",
      "priority_claiming",
      "governance_voting",
      "mentor_newcomers",
    ],
  },
  champion: {
    name: "champion",
    displayName: "Champion",
    minScore: 5000,
    multiplier: 2.0,
    privileges: [
      "submit_evidence",
      "view_leaderboards",
      "peer_review",
      "endorse_peers",
      "create_missions",
      "priority_claiming",
      "governance_voting",
      "mentor_newcomers",
      "platform_ambassador",
      "early_access",
    ],
  },
} as const;

export type ReputationTierName = keyof typeof REPUTATION_TIERS;

export const TIER_THRESHOLDS = [0, 100, 500, 2000, 5000] as const;

export const TIER_ORDER: ReputationTierName[] = [
  "newcomer",
  "contributor",
  "advocate",
  "leader",
  "champion",
];

/** Reputation calculation weights */
export const REPUTATION_WEIGHTS = {
  missionQuality: 0.4,
  peerAccuracy: 0.3,
  streak: 0.2,
  endorsements: 0.1,
} as const;

/** Decay rates */
export const REPUTATION_DECAY = {
  /** Weekly decay percentage for 7+ days inactive */
  standardPercent: 2,
  /** Weekly decay percentage after 90+ days inactive */
  acceleratedPercent: 5,
  /** Days of inactivity before decay starts */
  inactivityThresholdDays: 7,
  /** Days of inactivity before accelerated decay */
  acceleratedThresholdDays: 90,
  /** Grace period before tier demotion (days) */
  gracePeriodDays: 7,
} as const;

/** Endorsement limits */
export const ENDORSEMENT_LIMITS = {
  /** Max endorsements a human can give per day */
  maxPerDay: 5,
  /** Min reason length */
  minReasonLength: 10,
  /** Max reason length */
  maxReasonLength: 500,
} as const;
