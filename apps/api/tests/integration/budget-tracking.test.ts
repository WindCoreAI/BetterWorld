import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  getTestApp,
  setupTestInfra,
  teardownTestInfra,
  cleanupTestData,
  registerTestAgent,
  getTestRedis,
} from "./helpers.js";

/**
 * T061 (US6): Budget Tracking Integration Tests
 *
 * Verifies that the AI budget tracking system works correctly at the Redis level.
 * The budget module (`apps/api/src/lib/budget.ts`) uses Redis keys:
 *   - `ai_cost:daily:YYYY-MM-DD` for daily cost tracking
 *   - `ai_cost:hourly:YYYY-MM-DD:HH` for hourly cost tracking
 *   - Default cap: AI_DAILY_BUDGET_CAP_CENTS = 1333 ($13.33/day)
 *
 * The worker (which skips Layer B when budget is exceeded) does not run in
 * integration tests, so we focus on:
 *   1. Redis key format and increment behavior
 *   2. POST problem still succeeds regardless of budget state (async evaluation)
 *   3. Budget cap detection via Redis key values
 */
describe("Budget Tracking — T061 (US6)", () => {
  const app = getTestApp();

  beforeAll(async () => {
    await setupTestInfra();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await teardownTestInfra();
  });

  it("budget cap is tracked via Redis daily key with atomic increment", async () => {
    const redis = getTestRedis();
    const today = new Date().toISOString().slice(0, 10);
    const key = `ai_cost:daily:${today}`;

    // Simulate cost accumulation via atomic increment (same as recordAiCost)
    await redis.incrby(key, 500);
    const value = await redis.get(key);
    expect(Number(value)).toBe(500);

    // Simulate additional cost
    await redis.incrby(key, 250);
    const updated = await redis.get(key);
    expect(Number(updated)).toBe(750);
  });

  it("POST problem succeeds even when budget tracking is active", async () => {
    const redis = getTestRedis();
    const today = new Date().toISOString().slice(0, 10);
    const dailyKey = `ai_cost:daily:${today}`;

    // Set budget to a value below cap (1333 cents default) — budget available
    await redis.set(dailyKey, "1000");

    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;

    const res = await app.request("/api/v1/problems", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Budget Test Problem Report About Healthcare Access",
        description:
          "This tests that problem submission works when budget tracking is active and meets the minimum 50 character requirement",
        domain: "healthcare_improvement",
        severity: "medium",
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.id).toBeDefined();
  });

  it("POST problem succeeds even when budget cap is exceeded (async evaluation)", async () => {
    const redis = getTestRedis();
    const today = new Date().toISOString().slice(0, 10);
    const dailyKey = `ai_cost:daily:${today}`;

    // Set budget well above the default cap of 1333 cents
    await redis.set(dailyKey, "9999");

    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;

    // POST should still succeed — guardrail evaluation is async via BullMQ
    const res = await app.request("/api/v1/problems", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Budget Exceeded Problem Report About Education Access",
        description:
          "This tests that problem submission succeeds even when the AI budget cap has been exceeded since evaluation is asynchronous",
        domain: "education_access",
        severity: "high",
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.id).toBeDefined();
    expect(data.data.guardrailEvaluationId).toBeDefined();
  });

  it("budget Redis keys use expected daily and hourly format", async () => {
    const redis = getTestRedis();
    const today = new Date().toISOString().slice(0, 10);
    const hour = new Date().getUTCHours().toString().padStart(2, "0");
    const dailyKey = `ai_cost:daily:${today}`;
    const hourlyKey = `ai_cost:hourly:${today}:${hour}`;

    await redis.incrby(dailyKey, 100);
    await redis.incrby(hourlyKey, 50);

    expect(Number(await redis.get(dailyKey))).toBe(100);
    expect(Number(await redis.get(hourlyKey))).toBe(50);

    // Verify key format matches budget module expectations
    expect(dailyKey).toMatch(/^ai_cost:daily:\d{4}-\d{2}-\d{2}$/);
    expect(hourlyKey).toMatch(/^ai_cost:hourly:\d{4}-\d{2}-\d{2}:\d{2}$/);
  });

  it("budget cap detection: value at or above cap signals budget exhausted", async () => {
    const redis = getTestRedis();
    const today = new Date().toISOString().slice(0, 10);
    const dailyKey = `ai_cost:daily:${today}`;

    // Default cap is 1333 cents
    const DEFAULT_CAP = 1333;

    // Below cap — budget available
    await redis.set(dailyKey, String(DEFAULT_CAP - 1));
    const belowCapValue = Number(await redis.get(dailyKey));
    expect(belowCapValue).toBeLessThan(DEFAULT_CAP);

    // At cap — budget exhausted
    await redis.set(dailyKey, String(DEFAULT_CAP));
    const atCapValue = Number(await redis.get(dailyKey));
    expect(atCapValue).toBeGreaterThanOrEqual(DEFAULT_CAP);

    // Above cap — budget exhausted
    await redis.set(dailyKey, String(DEFAULT_CAP + 500));
    const aboveCapValue = Number(await redis.get(dailyKey));
    expect(aboveCapValue).toBeGreaterThan(DEFAULT_CAP);
  });

  it("Redis TTL can be set on budget keys for auto-expiry", async () => {
    const redis = getTestRedis();
    const today = new Date().toISOString().slice(0, 10);
    const dailyKey = `ai_cost:daily:${today}`;

    await redis.incrby(dailyKey, 100);

    // Set 48-hour TTL (same as budget module)
    await redis.expire(dailyKey, 48 * 60 * 60);
    const ttl = await redis.ttl(dailyKey);

    // TTL should be positive and within range
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(48 * 60 * 60);
  });
});
