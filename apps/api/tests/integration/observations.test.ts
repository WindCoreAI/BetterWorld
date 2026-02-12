import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";

import {
  validateGPS,
  checkObservationRateLimit,
  incrementObservationRateLimit,
} from "../../src/services/observation.service.js";

import {
  setupTestInfra,
  teardownTestInfra,
  getTestDb,
  getTestRedis,
} from "./helpers.js";

import { GPS_VALIDATION, OBSERVATION_RATE_LIMIT, SYSTEM_MUNICIPAL_AGENT_ID } from "@betterworld/shared";

describe("Observations (US3)", () => {
  beforeAll(async () => {
    await setupTestInfra();

    // Ensure system agent exists for problem FK
    const db = getTestDb();
    await db.execute(sql`
      INSERT INTO agents (id, username, framework, api_key_hash, api_key_prefix, is_active)
      VALUES (${SYSTEM_MUNICIPAL_AGENT_ID}, 'system-municipal-311', 'system', '$system$', 'sys_', true)
      ON CONFLICT (id) DO NOTHING
    `);
  });

  afterAll(async () => {
    await teardownTestInfra();
  });

  // ============================================================================
  // GPS Validation
  // ============================================================================

  it("should accept valid GPS coordinates", () => {
    const result = validateGPS(41.8781, -87.6298);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("should reject null island (0,0) coordinates", () => {
    const result = validateGPS(0, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("null island");
  });

  it("should reject coordinates beyond polar limit", () => {
    const result = validateGPS(85, 10);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Latitude must be between");
  });

  it("should accept coordinates at the polar limit boundary", () => {
    const result = validateGPS(80, 10);
    expect(result.valid).toBe(true);
  });

  it("should reject GPS accuracy exceeding 1000m", () => {
    const result = validateGPS(41.8781, -87.6298, 1500);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("accuracy exceeds");
  });

  it("should accept GPS accuracy within 1000m", () => {
    const result = validateGPS(41.8781, -87.6298, 500);
    expect(result.valid).toBe(true);
  });

  // ============================================================================
  // Rate Limiting
  // ============================================================================

  it("should allow observation within rate limit", async () => {
    const redis = getTestRedis();
    const allowed = await checkObservationRateLimit(redis, "test-human-rate-1");
    expect(allowed).toBe(true);
  });

  it("should block observation exceeding rate limit", async () => {
    const redis = getTestRedis();
    const humanId = "test-human-rate-2";

    // Manually set rate limit counter to max
    const key = `${OBSERVATION_RATE_LIMIT.REDIS_KEY_PREFIX}${humanId}`;
    await redis.set(key, String(OBSERVATION_RATE_LIMIT.MAX_PER_HOUR));
    await redis.expire(key, OBSERVATION_RATE_LIMIT.WINDOW_SECONDS);

    const allowed = await checkObservationRateLimit(redis, humanId);
    expect(allowed).toBe(false);
  });

  it("should increment rate limit counter", async () => {
    const redis = getTestRedis();
    const humanId = "test-human-rate-3";

    await incrementObservationRateLimit(redis, humanId);
    const key = `${OBSERVATION_RATE_LIMIT.REDIS_KEY_PREFIX}${humanId}`;
    const count = await redis.get(key);
    expect(count).toBe("1");

    // Verify TTL was set
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(OBSERVATION_RATE_LIMIT.WINDOW_SECONDS);
  });

  it("should fail closed when Redis is null", async () => {
    const allowed = await checkObservationRateLimit(null, "test-human");
    expect(allowed).toBe(false);
  });

  // ============================================================================
  // GPS Validation Constants
  // ============================================================================

  it("should have correct GPS validation constants", () => {
    expect(GPS_VALIDATION.NULL_ISLAND_THRESHOLD).toBe(0.0001);
    expect(GPS_VALIDATION.POLAR_LIMIT).toBe(80);
    expect(GPS_VALIDATION.ACCURACY_LIMIT_METERS).toBe(1000);
  });

  it("should have correct observation rate limit constants", () => {
    expect(OBSERVATION_RATE_LIMIT.MAX_PER_HOUR).toBe(10);
    expect(OBSERVATION_RATE_LIMIT.WINDOW_SECONDS).toBe(3600);
  });
});
