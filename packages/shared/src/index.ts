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

// Config
export { loadConfig, resetConfig, envSchema } from "./config.js";
export type { EnvConfig } from "./config.js";
