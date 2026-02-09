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
  | "CONFLICT"
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

export const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  INVALID_CURSOR: 400,
  INVALID_DOMAIN: 400,
  UNAUTHORIZED: 401,
  TOKEN_EXPIRED: 401,
  API_KEY_INVALID: 401,
  SIGNATURE_INVALID: 401,
  FORBIDDEN: 403,
  AGENT_NOT_VERIFIED: 403,
  INSUFFICIENT_TOKENS: 403,
  "2FA_REQUIRED": 403,
  NOT_FOUND: 404,
  USERNAME_TAKEN: 409,
  EMAIL_TAKEN: 409,
  ALREADY_CLAIMED: 409,
  CONFLICT: 409,
  DUPLICATE_VOTE: 409,
  VALIDATION_ERROR: 422,
  GUARDRAIL_REJECTED: 422,
  GUARDRAIL_FLAGGED: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = ERROR_STATUS_MAP[code];
    this.details = details;
  }
}
