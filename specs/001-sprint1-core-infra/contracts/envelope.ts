/**
 * Standard API Response Envelope
 * All BetterWorld API responses MUST conform to this structure.
 * Reference: ADR D4, Constitution Principle VI
 */

// ── Success Response ──────────────────────────────────────────────────

export interface ApiResponse<T> {
  ok: true;
  data: T;
  meta?: PaginationMeta | null;
  requestId: string;
}

export interface PaginationMeta {
  cursor: string | null; // Opaque base64-encoded cursor, null if no more pages
  hasMore: boolean;
  total?: number; // Optional total count (expensive, only included when requested)
}

// ── Error Response ────────────────────────────────────────────────────

export interface ApiErrorResponse {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>; // Field-level errors, validation details, etc.
  };
  requestId: string;
}

// ── Union Type ────────────────────────────────────────────────────────

export type ApiEnvelope<T> = ApiResponse<T> | ApiErrorResponse;

// ── Paginated Response Helper ─────────────────────────────────────────

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: PaginationMeta;
}

// ── Query Parameters ──────────────────────────────────────────────────

export interface PaginationQuery {
  cursor?: string; // Opaque cursor from previous response
  limit?: number; // Page size (1-100, default 20)
}

// ── Error Codes ───────────────────────────────────────────────────────

export type ErrorCode =
  // Auth
  | "UNAUTHORIZED"
  | "TOKEN_EXPIRED"
  | "API_KEY_INVALID"
  | "SIGNATURE_INVALID"
  | "FORBIDDEN"
  | "AGENT_NOT_VERIFIED"
  | "2FA_REQUIRED"
  // Validation
  | "VALIDATION_ERROR"
  | "INVALID_CURSOR"
  | "INVALID_DOMAIN"
  // Resources
  | "NOT_FOUND"
  | "USERNAME_TAKEN"
  | "EMAIL_TAKEN"
  | "ALREADY_CLAIMED"
  | "DUPLICATE_VOTE"
  // Guardrails
  | "GUARDRAIL_REJECTED"
  | "GUARDRAIL_FLAGGED"
  // Tokens
  | "INSUFFICIENT_TOKENS"
  // Rate Limiting
  | "RATE_LIMITED"
  // System
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE";
