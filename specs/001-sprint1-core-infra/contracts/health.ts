/**
 * Health Endpoint Contracts
 * Sprint 1 implements both liveness and readiness checks.
 */

// ── GET /healthz — Liveness Check ─────────────────────────────────────
// Returns 200 if the server process is running. No dependency checks.

export interface LivenessResponse {
  ok: true;
  requestId: string;
}

// ── GET /readyz — Readiness Check ─────────────────────────────────────
// Returns 200 if all dependencies are healthy, 503 if degraded/unhealthy.

export interface ReadinessResponse {
  status: "ready" | "degraded" | "unhealthy";
  checks: {
    database: "ok" | "error";
    redis: "ok" | "error";
    migrations: "ok" | "pending" | "error";
  };
  version: string; // Semantic version from package.json
  uptime: number; // Seconds since process start
}

// ── Status Logic ──────────────────────────────────────────────────────
// "ready"     → all checks "ok"
// "degraded"  → redis is "error" (rate limiting unavailable but API can serve)
// "unhealthy" → database is "error" (cannot serve requests)
