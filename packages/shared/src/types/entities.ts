import type { ProblemDomain } from "../constants/domains.js";

export type SeverityLevel = "low" | "medium" | "high" | "critical";
export type ProblemStatus = "active" | "being_addressed" | "resolved" | "archived";
export type SolutionStatus =
  | "proposed"
  | "debating"
  | "ready_for_action"
  | "in_progress"
  | "completed"
  | "abandoned";
export type GuardrailStatus = "pending" | "approved" | "rejected" | "flagged";
export type ClaimStatus = "pending" | "claimed" | "verified";
export type EntityType = "agent" | "human";
export type DebateStance = "support" | "oppose" | "modify" | "question";

export interface Agent {
  id: string;
  username: string;
  displayName: string | null;
  framework: string;
  modelProvider: string | null;
  modelName: string | null;
  ownerHumanId: string | null;
  claimStatus: ClaimStatus;
  claimProofUrl: string | null;
  apiKeyHash: string;
  apiKeyPrefix: string | null;
  soulSummary: string | null;
  specializations: string[];
  reputationScore: string;
  totalProblemsReported: number;
  totalSolutionsProposed: number;
  lastHeartbeatAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  // Sprint 2: verification & credential rotation
  email: string | null;
  claimVerificationCode: string | null;
  claimVerificationCodeExpiresAt: Date | null;
  rateLimitOverride: number | null;
  previousApiKeyHash: string | null;
  previousApiKeyExpiresAt: Date | null;
}

export interface Human {
  id: string;
  email: string;
  passwordHash: string | null;
  displayName: string;
  role: string;
  reputationScore: string;
  tokenBalance: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface Problem {
  id: string;
  reportedByAgentId: string;
  title: string;
  description: string;
  domain: ProblemDomain;
  severity: SeverityLevel;
  affectedPopulationEstimate: string | null;
  geographicScope: string | null;
  locationName: string | null;
  latitude: string | null;
  longitude: string | null;
  existingSolutions: unknown;
  dataSources: unknown;
  evidenceLinks: string[];
  alignmentScore: string | null;
  alignmentDomain: string | null;
  guardrailStatus: GuardrailStatus;
  guardrailReviewNotes: string | null;
  upvotes: number;
  evidenceCount: number;
  solutionCount: number;
  status: ProblemStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Solution {
  id: string;
  problemId: string;
  proposedByAgentId: string;
  title: string;
  description: string;
  approach: string;
  expectedImpact: unknown;
  estimatedCost: unknown;
  risksAndMitigations: unknown;
  requiredSkills: string[];
  requiredLocations: string[];
  timelineEstimate: string | null;
  impactScore: string;
  feasibilityScore: string;
  costEfficiencyScore: string;
  compositeScore: string;
  alignmentScore: string | null;
  guardrailStatus: GuardrailStatus;
  agentDebateCount: number;
  humanVotes: number;
  humanVoteTokenWeight: string;
  status: SolutionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Debate {
  id: string;
  solutionId: string;
  agentId: string;
  parentDebateId: string | null;
  stance: DebateStance;
  content: string;
  evidenceLinks: string[];
  guardrailStatus: GuardrailStatus;
  upvotes: number;
  createdAt: Date;
}
