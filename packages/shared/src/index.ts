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

// Constants
export { ALLOWED_DOMAINS } from "./constants/domains.js";
export type { ProblemDomain } from "./constants/domains.js";
export { RATE_LIMIT_DEFAULTS } from "./constants/rate-limits.js";
export type { RateLimitRole } from "./constants/rate-limits.js";

// Schemas
export {
  createProblemSchema,
  createSolutionSchema,
  createDebateSchema,
  paginationQuerySchema,
} from "./schemas/index.js";

// Config
export { loadConfig, resetConfig, envSchema } from "./config.js";
export type { EnvConfig } from "./config.js";
