/**
 * Feature flags service — Redis-backed with env var fallback and in-memory cache.
 *
 * Read path:  in-memory cache (60s TTL) → Redis GET → env vars → Zod defaults
 * Write path: Admin API → Redis SET → cache invalidation
 *
 * @see research.md R3 for implementation rationale
 */
import {
  FEATURE_FLAG_DEFAULTS,
  FEATURE_FLAG_NAMES,
  FEATURE_FLAG_REDIS_PREFIX,
  FEATURE_FLAG_CACHE_TTL_MS,
  featureFlagSchema,
} from "@betterworld/shared";
import type { FeatureFlagName, FeatureFlags } from "@betterworld/shared";
import type Redis from "ioredis";

import { logger } from "../middleware/logger.js";

// In-memory cache
let cachedFlags: FeatureFlags | null = null;
let cacheExpiresAt = 0;

/**
 * Get all feature flags.
 * Uses in-memory cache → Redis → env var → Zod defaults.
 */
export async function getFeatureFlags(redis: Redis | null): Promise<FeatureFlags> {
  const now = Date.now();

  // Check in-memory cache
  if (cachedFlags && now < cacheExpiresAt) {
    return cachedFlags;
  }

  const flags: Record<string, unknown> = {};

  for (const name of FEATURE_FLAG_NAMES) {
    flags[name] = await readFlag(redis, name);
  }

  const validated = featureFlagSchema.parse(flags);
  cachedFlags = validated;
  cacheExpiresAt = now + FEATURE_FLAG_CACHE_TTL_MS;

  return validated;
}

/**
 * Get a single feature flag value.
 */
export async function getFlag<K extends FeatureFlagName>(
  redis: Redis | null,
  name: K,
): Promise<FeatureFlags[K]> {
  const now = Date.now();

  // Check in-memory cache
  if (cachedFlags && now < cacheExpiresAt) {
    return cachedFlags[name];
  }

  const flags = await getFeatureFlags(redis);
  return flags[name];
}

/**
 * Set a feature flag value in Redis.
 * Immediately invalidates the in-memory cache.
 */
export async function setFlag<K extends FeatureFlagName>(
  redis: Redis | null,
  name: K,
  value: FeatureFlags[K],
): Promise<{ previousValue: FeatureFlags[K] }> {
  if (!redis) {
    throw new Error("Redis not available for flag storage");
  }

  const previousValue = await getFlag(redis, name);

  const redisKey = `${FEATURE_FLAG_REDIS_PREFIX}${name}`;
  await redis.set(redisKey, JSON.stringify(value));

  logger.info(
    { flag: name, previousValue, newValue: value },
    "Feature flag updated",
  );

  // Invalidate cache immediately
  invalidateFlagCache();

  return { previousValue };
}

/**
 * Reset a feature flag to its default value by removing it from Redis.
 */
export async function resetFlag<K extends FeatureFlagName>(
  redis: Redis | null,
  name: K,
): Promise<{ defaultValue: FeatureFlags[K] }> {
  if (!redis) {
    throw new Error("Redis not available for flag storage");
  }

  const redisKey = `${FEATURE_FLAG_REDIS_PREFIX}${name}`;
  await redis.del(redisKey);

  logger.info({ flag: name }, "Feature flag reset to default");

  // Invalidate cache immediately
  invalidateFlagCache();

  return { defaultValue: FEATURE_FLAG_DEFAULTS[name] };
}

/**
 * Invalidate the in-memory flag cache.
 * Useful for testing and admin operations.
 */
export function invalidateFlagCache(): void {
  cachedFlags = null;
  cacheExpiresAt = 0;
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Read a single flag from Redis → env var → Zod default.
 */
async function readFlag(redis: Redis | null, name: FeatureFlagName): Promise<unknown> {
  // Try Redis first
  if (redis) {
    try {
      const redisKey = `${FEATURE_FLAG_REDIS_PREFIX}${name}`;
      const redisValue = await redis.get(redisKey);
      if (redisValue !== null) {
        return JSON.parse(redisValue);
      }
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : "Unknown", flag: name },
        "Redis read failed for feature flag, falling back to env var",
      );
    }
  }

  // Try env var
  const envValue = process.env[`PHASE3_${name}`];
  if (envValue !== undefined) {
    if (envValue === "true") return true;
    if (envValue === "false") return false;
    // Use parseFloat for decimal flags (e.g., SUBMISSION_COST_MULTIPLIER=0.5)
    const num = parseFloat(envValue);
    if (!isNaN(num)) return num;
    return envValue;
  }

  // Use Zod defaults
  return FEATURE_FLAG_DEFAULTS[name];
}
