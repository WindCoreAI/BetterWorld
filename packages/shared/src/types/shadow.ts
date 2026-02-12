/**
 * Shadow Mode Types (Sprint 11)
 *
 * Types for evaluation, consensus, and validator interfaces.
 */

// ============================================================================
// Evaluation
// ============================================================================

/** Individual validator evaluation response */
export interface EvaluationResponse {
  recommendation: "approved" | "flagged" | "rejected";
  confidence: number; // 0-1
  scores: {
    domainAlignment: number; // 1-5
    factualAccuracy: number; // 1-5
    impactPotential: number; // 1-5
  };
  reasoning: string; // 50-2000 chars
  safetyFlagged: boolean;
}

/** Evaluation assignment context */
export interface EvaluationAssignment {
  evaluationId: string;
  submissionId: string;
  submissionType: "problem" | "solution" | "debate";
  submission: {
    title: string;
    description: string;
    domain: string;
  };
  rubric: {
    domainAlignment: string;
    factualAccuracy: string;
    impactPotential: string;
  };
  assignedAt: string;
  expiresAt: string;
}

/** Pending evaluation query result */
export interface PendingEvaluation {
  id: string;
  submissionId: string;
  submissionType: string;
  submission: {
    title: string;
    description: string;
    domain: string;
  };
  rubric: {
    domainAlignment: string;
    factualAccuracy: string;
    impactPotential: string;
  };
  assignedAt: string;
  expiresAt: string;
}

// ============================================================================
// Consensus
// ============================================================================

/** Consensus computation result */
export interface ConsensusResult {
  submissionId: string;
  submissionType: string;
  decision: "approved" | "rejected" | "escalated" | "expired";
  confidence: number;
  quorumSize: number;
  responsesReceived: number;
  weightedApprove: number;
  weightedReject: number;
  weightedEscalate: number;
  layerBDecision: string | null;
  agreesWithLayerB: boolean | null;
  consensusLatencyMs: number | null;
  escalationReason: string | null;
}

// ============================================================================
// Validator
// ============================================================================

/** Validator pool statistics */
export interface ValidatorStats {
  validatorId: string;
  tier: "apprentice" | "journeyman" | "expert";
  f1Score: number;
  precision: number;
  recall: number;
  totalEvaluations: number;
  correctEvaluations: number;
  responseRate: number;
  dailyEvaluationCount: number;
  dailyLimit: number;
  homeRegions: HomeRegion[];
  isActive: boolean;
  suspendedUntil: string | null;
}

/** Home region for validator affinity */
export interface HomeRegion {
  name: string;
  lat: number;
  lng: number;
}

/** Tier change history entry */
export interface TierChangeEntry {
  fromTier: string;
  toTier: string;
  f1ScoreAtChange: number;
  evaluationsAtChange: number;
  changedAt: string;
}

// ============================================================================
// City Metrics
// ============================================================================

/** City dashboard metrics */
export interface CityMetrics {
  city: string;
  displayName: string;
  metrics: {
    problemsByCategory: Array<{ domain: string; count: number }>;
    avgResolutionTimeDays: number | null;
    activeLocalValidators: number;
    totalProblems: number;
    totalObservations: number;
  };
  heatmap: Array<{ lat: number; lng: number; intensity: number }>;
  lastAggregatedAt: string | null;
}

// ============================================================================
// Peer Consensus Job
// ============================================================================

/** Data passed to the peer consensus BullMQ job */
export interface PeerConsensusJobData {
  submissionId: string;
  submissionType: "problem" | "solution" | "debate";
  agentId: string;
  content: string;
  domain: string;
  layerBDecision: string;
  layerBAlignmentScore: number;
  locationPoint?: { lat: number; lng: number };
}
