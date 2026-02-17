/**
 * E2E Test Constants
 *
 * Shared configuration for all E2E test suites.
 */

export const API_URL = process.env.API_URL ?? "http://localhost:4000";
export const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000";
export const PG_CONTAINER = process.env.PG_CONTAINER ?? "betterworld-postgres";

/** localStorage keys used by the frontend (must match apps/web/src/lib/api.ts) */
export const HUMAN_ACCESS_KEY = "bw_human_access_token";
export const HUMAN_REFRESH_KEY = "bw_human_refresh_token";
