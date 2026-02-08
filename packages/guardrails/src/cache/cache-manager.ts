import crypto from "crypto";
import Redis from "ioredis";
import pino from "pino";
import type { LayerBResult } from "@betterworld/shared/types/guardrails";

const logger = pino({ name: "guardrails:cache" });

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const CACHE_TTL = parseInt(process.env.GUARDRAIL_CACHE_TTL_SECONDS || "3600", 10);

/**
 * Generate SHA-256 cache key from normalized content
 * Normalization: lowercase, trim, collapse whitespace, remove markdown
 */
export function generateCacheKey(content: string): string {
  const normalized = content
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ") // Collapse whitespace
    .replace(/[*_~`#]/g, ""); // Remove markdown formatting

  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Get cached evaluation result by content
 * Returns null if cache miss or expired
 */
export async function getCachedEvaluation(content: string): Promise<LayerBResult | null> {
  const key = `guardrail:${generateCacheKey(content)}`;

  try {
    const cached = await redis.get(key);

    if (!cached) {
      logger.debug({ key }, "Cache miss");
      return null;
    }

    logger.info({ key }, "Cache hit");
    return JSON.parse(cached) as LayerBResult;
  } catch (error) {
    logger.error({ error, key }, "Cache get error — proceeding without cache");
    return null; // Fail gracefully - proceed with evaluation
  }
}

/**
 * Set cached evaluation result with TTL
 * Fails gracefully if Redis is unavailable
 */
export async function setCachedEvaluation(
  content: string,
  result: LayerBResult
): Promise<void> {
  const key = `guardrail:${generateCacheKey(content)}`;

  try {
    await redis.setex(key, CACHE_TTL, JSON.stringify(result));
    logger.debug({ key, ttl: CACHE_TTL }, "Cache set");
  } catch (error) {
    logger.error({ error, key }, "Cache set error — proceeding without cache");
    // Fail gracefully - cache miss is acceptable
  }
}
