import type { ErrorCode } from "./errors.js";

export interface ApiResponse<T> {
  ok: true;
  data: T;
  meta?: PaginationMeta | null;
  requestId: string;
}

export interface ApiErrorResponse {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  requestId: string;
}

export type ApiEnvelope<T> = ApiResponse<T> | ApiErrorResponse;

export interface PaginationMeta {
  cursor: string | null;
  hasMore: boolean;
  total?: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: PaginationMeta;
}

export interface PaginationQuery {
  cursor?: string;
  limit?: number;
}
