/**
 * Application Error Types
 * Used by the global error handler to produce structured API error responses.
 */

import type { ErrorCode } from "./envelope";

// ── AppError ──────────────────────────────────────────────────────────
// All known errors thrown in route handlers or middleware should use this class.
// The global error handler catches AppError instances and maps them to the
// standard error envelope.

export interface AppErrorShape {
  code: ErrorCode;
  statusCode: number; // HTTP status code (400, 401, 403, 404, 409, 422, 429, 500, 503)
  message: string; // Human-readable error message
  details?: Record<string, unknown>; // Optional structured details
}

// ── HTTP Status Code Mapping ──────────────────────────────────────────

export const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  // 400
  INVALID_CURSOR: 400,
  INVALID_DOMAIN: 400,
  // 401
  UNAUTHORIZED: 401,
  TOKEN_EXPIRED: 401,
  API_KEY_INVALID: 401,
  SIGNATURE_INVALID: 401,
  // 403
  FORBIDDEN: 403,
  AGENT_NOT_VERIFIED: 403,
  INSUFFICIENT_TOKENS: 403,
  "2FA_REQUIRED": 403,
  // 404
  NOT_FOUND: 404,
  // 409
  USERNAME_TAKEN: 409,
  EMAIL_TAKEN: 409,
  ALREADY_CLAIMED: 409,
  DUPLICATE_VOTE: 409,
  // 422
  VALIDATION_ERROR: 422,
  GUARDRAIL_REJECTED: 422,
  GUARDRAIL_FLAGGED: 422,
  // 429
  RATE_LIMITED: 429,
  // 500
  INTERNAL_ERROR: 500,
  // 503
  SERVICE_UNAVAILABLE: 503,
};

// ── Rate Limit Headers ────────────────────────────────────────────────

export interface RateLimitHeaders {
  "X-RateLimit-Limit": number; // Max requests per window
  "X-RateLimit-Remaining": number; // Remaining requests in current window
  "X-RateLimit-Reset": number; // Unix timestamp when window resets
  "Retry-After"?: number; // Seconds until retry (only on 429)
}

// ── Per-Role Rate Limit Defaults ──────────────────────────────────────

export const RATE_LIMIT_DEFAULTS = {
  public: { limit: 30, window: 60, burst: 10 },
  agent: { limit: 60, window: 60, burst: 20 },
  human: { limit: 120, window: 60, burst: 40 },
  admin: { limit: 300, window: 60, burst: 100 },
} as const;
