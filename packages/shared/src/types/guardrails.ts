// Guardrail evaluation types

export type ContentType = "problem" | "solution" | "debate" | "mission";

export type GuardrailDecision = "approved" | "flagged" | "rejected";

export type FlaggedContentStatus = "pending_review" | "approved" | "rejected";

export type AdminDecision = "approve" | "reject";

export type PatternSeverity = "high" | "critical";

export type TrustTier = "new" | "verified";

// Layer A: Rule Engine Result
export interface LayerAResult {
  passed: boolean;
  forbiddenPatterns: string[];
  executionTimeMs: number;
}

// Solution quality scores (0-100 scale)
export interface SolutionScores {
  impact: number;
  feasibility: number;
  costEfficiency: number;
  composite: number;
}

// Layer B: LLM Classifier Result
export interface LayerBResult {
  alignedDomain: string;
  alignmentScore: number; // 0.0 - 1.0
  harmRisk: "low" | "medium" | "high";
  feasibility: "low" | "medium" | "high";
  quality: string;
  decision: "approve" | "flag" | "reject";
  reasoning: string;
  solutionScores?: SolutionScores;
}

// Guardrail Evaluation Entity
export interface GuardrailEvaluation {
  id: string;
  contentId: string;
  contentType: ContentType;
  agentId: string;
  submittedContent: Record<string, unknown>;
  layerAResult: LayerAResult;
  layerBResult: LayerBResult | null;
  finalDecision: GuardrailDecision;
  alignmentScore: number | null;
  alignmentDomain: string | null;
  cacheHit: boolean;
  cacheKey: string | null;
  trustTier: TrustTier;
  createdAt: Date;
  completedAt: Date | null;
  evaluationDurationMs: number | null;
}

// Flagged Content Entity
export interface FlaggedContent {
  id: string;
  evaluationId: string;
  contentId: string;
  contentType: ContentType;
  agentId: string;
  status: FlaggedContentStatus;
  assignedAdminId: string | null;
  claimedAt: Date | null;
  adminDecision: AdminDecision | null;
  adminNotes: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

// Forbidden Pattern Entity
export interface ForbiddenPattern {
  id: number;
  name: string;
  description: string;
  regexPattern: string;
  severity: PatternSeverity;
  exampleViolations: string[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Approved Domain Entity
export interface ApprovedDomain {
  id: number;
  domainKey: string;
  displayName: string;
  description: string;
  unSdgAlignment: number[];
  exampleTopics: string[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Trust Tier Entity
export interface TrustTierConfig {
  id: number;
  tierName: string;
  displayName: string;
  minAccountAgeDays: number;
  minApprovedSubmissions: number;
  autoApproveThreshold: number | null;
  autoFlagThresholdMin: number | null;
  autoRejectThresholdMax: number | null;
  description: string;
  enabled: boolean;
  createdAt: Date;
}

// Evaluation Cache Entity
export interface EvaluationCache {
  cacheKey: string;
  evaluationResult: LayerBResult;
  alignmentScore: number;
  alignmentDomain: string | null;
  hitCount: number;
  createdAt: Date;
  expiresAt: Date;
}
