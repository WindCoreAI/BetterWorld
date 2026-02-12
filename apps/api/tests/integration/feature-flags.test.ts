import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import { getFeatureFlags, getFlag, invalidateFlagCache } from "../../src/services/feature-flags.js";

import {
  setupTestInfra,
  teardownTestInfra,
  getTestRedis,
} from "./helpers.js";

describe("Feature Flags (US8)", () => {
  beforeAll(async () => {
    await setupTestInfra();
  });

  afterAll(async () => {
    await teardownTestInfra();
  });

  beforeEach(async () => {
    invalidateFlagCache();
    const redis = getTestRedis();
    // Clear all feature flag keys
    const keys = await redis.keys("feature-flag:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  it("should default all flags to disabled", async () => {
    const redis = getTestRedis();
    const flags = await getFeatureFlags(redis);

    expect(flags.PEER_VALIDATION_ENABLED).toBe(false);
    expect(flags.PEER_VALIDATION_TRAFFIC_PCT).toBe(0);
    expect(flags.SUBMISSION_COSTS_ENABLED).toBe(false);
    expect(flags.VALIDATION_REWARDS_ENABLED).toBe(false);
    expect(flags.HYPERLOCAL_INGESTION_ENABLED).toBe(false);
    expect(flags.CREDIT_CONVERSION_ENABLED).toBe(false);
    expect(flags.DYNAMIC_RATE_ADJUSTMENT_ENABLED).toBe(false);
    expect(flags.DISPUTES_ENABLED).toBe(false);
  });

  it("should set boolean flag via Redis", async () => {
    const redis = getTestRedis();

    await redis.set("feature-flag:HYPERLOCAL_INGESTION_ENABLED", "true");
    invalidateFlagCache();

    const value = await getFlag(redis, "HYPERLOCAL_INGESTION_ENABLED");
    expect(value).toBe(true);
  });

  it("should set numeric flag (PEER_VALIDATION_TRAFFIC_PCT)", async () => {
    const redis = getTestRedis();

    await redis.set("feature-flag:PEER_VALIDATION_TRAFFIC_PCT", "50");
    invalidateFlagCache();

    const value = await getFlag(redis, "PEER_VALIDATION_TRAFFIC_PCT");
    expect(value).toBe(50);
  });

  it("should reset flag to default after Redis key deleted", async () => {
    const redis = getTestRedis();

    // Set then delete
    await redis.set("feature-flag:DISPUTES_ENABLED", "true");
    invalidateFlagCache();
    expect(await getFlag(redis, "DISPUTES_ENABLED")).toBe(true);

    await redis.del("feature-flag:DISPUTES_ENABLED");
    invalidateFlagCache();
    expect(await getFlag(redis, "DISPUTES_ENABLED")).toBe(false);
  });

  it("should fall back to defaults when Redis is null", async () => {
    invalidateFlagCache();
    const flags = await getFeatureFlags(null);

    expect(flags.HYPERLOCAL_INGESTION_ENABLED).toBe(false);
    expect(flags.PEER_VALIDATION_TRAFFIC_PCT).toBe(0);
  });

  it("should cache flags for 60 seconds", async () => {
    const redis = getTestRedis();
    invalidateFlagCache();

    // First call populates cache
    const flags1 = await getFeatureFlags(redis);
    expect(flags1.HYPERLOCAL_INGESTION_ENABLED).toBe(false);

    // Change value in Redis directly
    await redis.set("feature-flag:HYPERLOCAL_INGESTION_ENABLED", "true");

    // Should still return cached value (cache not expired)
    const flags2 = await getFeatureFlags(redis);
    expect(flags2.HYPERLOCAL_INGESTION_ENABLED).toBe(false);

    // After invalidation, should pick up new value
    invalidateFlagCache();
    const flags3 = await getFeatureFlags(redis);
    expect(flags3.HYPERLOCAL_INGESTION_ENABLED).toBe(true);
  });
});
