import { cors } from "hono/cors";
import pino from "pino";

const corsLogger = pino({ name: "cors" });

/**
 * FR-028: Validate CORS origin URLs.
 * In production, origins must start with https:// and contain no wildcards.
 */
function validateOrigins(origins: string[]): string[] {
  const isProd = process.env.NODE_ENV === "production";
  const validated: string[] = [];

  for (const origin of origins) {
    const trimmed = origin.trim();
    if (!trimmed) continue;

    // In production, enforce https and no wildcards
    if (isProd) {
      if (!trimmed.startsWith("https://")) {
        corsLogger.warn({ origin: trimmed }, "CORS origin rejected: must use https:// in production");
        continue;
      }
      if (trimmed.includes("*")) {
        corsLogger.warn({ origin: trimmed }, "CORS origin rejected: wildcards not allowed");
        continue;
      }
    }

    // Basic URL validation
    try {
      new URL(trimmed);
      validated.push(trimmed);
    } catch {
      corsLogger.warn({ origin: trimmed }, "CORS origin rejected: invalid URL");
    }
  }

  return validated;
}

/** Allowed CORS origins, validated at startup */
const ALLOWED_ORIGINS = validateOrigins(
  process.env.CORS_ORIGINS?.split(",") ?? ["http://localhost:3000"],
);

export function corsMiddleware() {
  if (process.env.NODE_ENV === "production" && !process.env.CORS_ORIGINS) {
    throw new Error("CORS_ORIGINS environment variable is required in production");
  }

  if (ALLOWED_ORIGINS.length === 0) {
    corsLogger.warn("No valid CORS origins configured — all cross-origin requests will be rejected");
  }

  const origins = ALLOWED_ORIGINS;

  return cors({
    origin: origins,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-ID", "X-BW-2FA"],
    exposeHeaders: [
      "X-Request-ID",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
      "Retry-After",
    ],
    maxAge: 86400,
    credentials: true,
  });
}
