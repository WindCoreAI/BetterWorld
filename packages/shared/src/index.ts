// Types
export { AppError, ERROR_STATUS_MAP } from "./types/errors.js";
export type { ErrorCode } from "./types/errors.js";
export type {
  ApiResponse,
  ApiErrorResponse,
  ApiEnvelope,
  PaginationMeta,
  PaginatedResponse,
  PaginationQuery,
} from "./types/api.js";
export type {
  Agent,
  Human,
  Problem,
  Solution,
  Debate,
  SeverityLevel,
  ProblemStatus,
  SolutionStatus,
  GuardrailStatus,
  ClaimStatus,
  EntityType,
  DebateStance,
} from "./types/entities.js";

// Mission Types (Sprint 7)
export type {
  MissionStatus,
  DifficultyLevel,
  MissionClaimStatus,
  InstructionStep,
  EvidenceRequirement,
  Mission,
  MissionClaim,
  MissionListItem,
  MissionDetail,
  DecomposedMission,
  Message,
  MessageThread,
} from "./types/missions.js";

// Guardrail Types
export type {
  ContentType,
  GuardrailDecision,
  FlaggedContentStatus,
  AdminDecision,
  PatternSeverity,
  TrustTier,
  SolutionScores,
  LayerAResult,
  LayerBResult,
  GuardrailEvaluation,
  FlaggedContent as FlaggedContentEntity,
  ForbiddenPattern as ForbiddenPatternEntity,
  ApprovedDomain as ApprovedDomainEntity,
  EvaluationCache,
} from "./types/guardrails.js";

// Constants
export { ALLOWED_DOMAINS } from "./constants/domains.js";
export type { ProblemDomain } from "./constants/domains.js";
export { RATE_LIMIT_DEFAULTS, AGENT_RATE_LIMIT_TIERS } from "./constants/rate-limits.js";
export type { RateLimitRole, AgentClaimTier } from "./constants/rate-limits.js";
export { RESERVED_USERNAMES, AGENT_FRAMEWORKS } from "./constants/agents.js";
export type { AgentFramework } from "./constants/agents.js";
export { FORBIDDEN_PATTERNS } from "./constants/forbidden-patterns.js";
export { APPROVED_DOMAINS } from "./constants/approved-domains.js";
export { QUEUE_NAMES } from "./constants/queue.js";
export type { QueueName } from "./constants/queue.js";
export {
  FRAUD_THRESHOLDS,
  PHASH_THRESHOLDS,
  VELOCITY_WINDOWS,
  FRAUD_SCORE_DELTAS,
  STATISTICAL_THRESHOLDS,
} from "./constants/fraud-thresholds.js";
export {
  REPUTATION_TIERS,
  TIER_THRESHOLDS,
  TIER_ORDER,
  REPUTATION_WEIGHTS,
  REPUTATION_DECAY,
  ENDORSEMENT_LIMITS,
} from "./constants/reputation-tiers.js";
export type { ReputationTierName } from "./constants/reputation-tiers.js";
export {
  STREAK_MILESTONES,
  getStreakMultiplier,
  getNextStreakMilestone,
  STREAK_FREEZE,
} from "./constants/streak-milestones.js";
export type { StreakMilestone } from "./constants/streak-milestones.js";

// Schemas
export {
  createProblemSchema,
  updateProblemSchema,
  createSolutionSchema,
  updateSolutionSchema,
  createDebateSchema,
  paginationQuerySchema,
  registerAgentSchema,
  updateAgentSchema,
  verifyAgentSchema,
  heartbeatCheckinSchema,
  // Sprint 7: Mission marketplace schemas
  createMissionSchema,
  updateMissionSchema,
  missionListQuerySchema,
  updateClaimSchema,
  sendMessageSchema,
  messageListQuerySchema,
  // Sprint 10: Reputation & Impact schemas
  reputationTierSchema,
  reputationBreakdownSchema,
  reputationScoreSchema,
  reputationHistoryEntrySchema,
  endorsementCreateSchema,
  tierDefinitionSchema,
  gracePeriodSchema,
  reputationHistoryQuerySchema,
  leaderboardTypeSchema,
  leaderboardPeriodSchema,
  leaderboardQuerySchema,
  leaderboardEntrySchema,
  myRankSchema,
  fraudStatusSchema,
  fraudActionTypeSchema,
  fraudScoreSchema,
  fraudEventSchema,
  fraudAdminActionSchema,
  fraudQueueQuerySchema,
  dashboardMetricsSchema,
  heatmapPointSchema,
  heatmapQuerySchema,
  portfolioVisibilitySchema,
  portfolioSchema,
} from "./schemas/index.js";

// Guardrail Schemas
export {
  evaluationRequestSchema,
  evaluationResponseSchema,
  evaluationStatusResponseSchema,
  flaggedContentListParamsSchema,
  adminReviewDecisionSchema,
  trustTierThresholdsSchema,
  layerAResultSchema,
  layerBResultSchema,
  contentTypeSchema,
  guardrailDecisionSchema,
} from "./schemas/guardrails.js";
export type {
  EvaluationRequest,
  EvaluationResponse,
  EvaluationStatusResponse,
  FlaggedContentListParams,
  AdminReviewDecision,
  TrustTierThresholds,
} from "./schemas/guardrails.js";

// Phase 3 Types (Sprint 10)
export {
  gpsCoordinateSchema,
  open311ServiceRequestSchema,
  open311ServiceSchema,
  cityConfigSchema,
  createObservationSchema,
  createStandaloneObservationSchema,
  agentCreditTransactionInputSchema,
  featureFlagSchema,
  FEATURE_FLAG_NAMES,
  FEATURE_FLAG_DEFAULTS,
} from "./types/phase3.js";
export type {
  GPSCoordinate,
  Open311ServiceRequest,
  Open311Service,
  CityConfig,
  CreateObservationInput,
  CreateStandaloneObservationInput,
  AgentCreditTransactionInput,
  FeatureFlags,
  FeatureFlagName,
} from "./types/phase3.js";

// Phase 3 Constants (Sprint 10)
export {
  STARTER_GRANT_AMOUNT,
  SEED_CONVERSION_RATE,
  HYPERLOCAL_SCORING_WEIGHTS,
  GLOBAL_SCORING_WEIGHTS,
  GPS_VALIDATION,
  OPEN311_BATCH_SIZE,
  SYSTEM_MUNICIPAL_AGENT_USERNAME,
  SYSTEM_MUNICIPAL_AGENT_ID,
  OPEN311_CITY_CONFIGS,
  FEATURE_FLAG_REDIS_PREFIX,
  FEATURE_FLAG_CACHE_TTL_MS,
  OBSERVATION_RATE_LIMIT,
  SUBMISSION_COSTS,
  HARDSHIP_THRESHOLD,
  VALIDATION_REWARDS,
} from "./constants/phase3.js";

// Sprint 11: Shadow Mode schemas
export {
  peerEvaluationResponseSchema,
  evaluationPendingQuerySchema,
  homeRegionSchema,
  homeRegionsSchema,
} from "./schemas/evaluation.js";
export type {
  PeerEvaluationResponseInput,
  EvaluationPendingQuery,
  HomeRegionsInput,
} from "./schemas/evaluation.js";

// Sprint 11: Shadow Mode types
export type {
  EvaluationAssignment,
  PendingEvaluation,
  ConsensusResult as ShadowConsensusResult,
  ValidatorStats,
  HomeRegion,
  TierChangeEntry,
  CityMetrics,
  PeerConsensusJobData,
} from "./types/shadow.js";

// Sprint 12: Consensus constants
export {
  SPOT_CHECK_RATE,
  SPOT_CHECK_HASH_SEED,
} from "./constants/consensus.js";

// Config
export { loadConfig, resetConfig, envSchema } from "./config.js";
export type { EnvConfig } from "./config.js";
