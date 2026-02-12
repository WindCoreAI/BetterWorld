import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";

import { backfillValidatorPool } from "../../src/services/validator-pool.service.js";

import {
  setupTestInfra,
  teardownTestInfra,
  getTestDb,
} from "./helpers.js";

describe("Validator Pool Backfill (US5)", () => {
  beforeAll(async () => {
    await setupTestInfra();
  });

  afterAll(async () => {
    await teardownTestInfra();
  });

  beforeEach(async () => {
    const db = getTestDb();
    // Clean validator pool and test agents
    await db.execute(sql`DELETE FROM validator_pool`);
    await db.execute(sql`DELETE FROM agents WHERE username LIKE 'vp-test-%'`);
  });

  it("should backfill qualifying agents into validator pool", async () => {
    const db = getTestDb();

    // Create a verified, active agent
    await db.execute(sql`
      INSERT INTO agents (id, username, framework, api_key_hash, api_key_prefix, is_active, claim_status)
      VALUES (
        'aaaaaaaa-0000-0000-0000-000000000001',
        'vp-test-verified-1',
        'custom',
        '$2b$10$test',
        'test_prefix1',
        true,
        'verified'
      )
    `);

    const result = await backfillValidatorPool(db);

    expect(result.addedCount).toBeGreaterThanOrEqual(1);
    expect(result.totalPoolSize).toBeGreaterThanOrEqual(1);

    // Verify the agent is in the pool
    const [validator] = await db.execute(sql`
      SELECT * FROM validator_pool WHERE agent_id = 'aaaaaaaa-0000-0000-0000-000000000001'
    `);

    expect(validator).toBeDefined();
    expect((validator as Record<string, unknown>).tier).toBe("apprentice");
    expect(Number((validator as Record<string, unknown>).f1_score)).toBe(0);
    expect(Number((validator as Record<string, unknown>).response_rate)).toBe(1);
    expect((validator as Record<string, unknown>).is_active).toBe(true);
  });

  it("should exclude inactive agents from backfill", async () => {
    const db = getTestDb();

    // Create an inactive agent
    await db.execute(sql`
      INSERT INTO agents (id, username, framework, api_key_hash, api_key_prefix, is_active, claim_status)
      VALUES (
        'aaaaaaaa-0000-0000-0000-000000000002',
        'vp-test-inactive',
        'custom',
        '$2b$10$test',
        'test_prefix2',
        false,
        'verified'
      )
    `);

    const result = await backfillValidatorPool(db);

    // Verify the inactive agent is NOT in the pool
    const rows = await db.execute(sql`
      SELECT * FROM validator_pool WHERE agent_id = 'aaaaaaaa-0000-0000-0000-000000000002'
    `);

    expect(rows.length).toBe(0);
  });

  it("should exclude non-verified agents from backfill", async () => {
    const db = getTestDb();

    // Create a non-verified agent
    await db.execute(sql`
      INSERT INTO agents (id, username, framework, api_key_hash, api_key_prefix, is_active, claim_status)
      VALUES (
        'aaaaaaaa-0000-0000-0000-000000000003',
        'vp-test-unverified',
        'custom',
        '$2b$10$test',
        'test_prefix3',
        true,
        'pending'
      )
    `);

    const result = await backfillValidatorPool(db);

    // Verify the non-verified agent is NOT in the pool
    const rows = await db.execute(sql`
      SELECT * FROM validator_pool WHERE agent_id = 'aaaaaaaa-0000-0000-0000-000000000003'
    `);

    expect(rows.length).toBe(0);
  });

  it("should be idempotent — running twice produces no duplicates", async () => {
    const db = getTestDb();

    // Create a qualifying agent
    await db.execute(sql`
      INSERT INTO agents (id, username, framework, api_key_hash, api_key_prefix, is_active, claim_status)
      VALUES (
        'aaaaaaaa-0000-0000-0000-000000000004',
        'vp-test-idempotent',
        'custom',
        '$2b$10$test',
        'test_prefix4',
        true,
        'verified'
      )
    `);

    // First backfill
    const result1 = await backfillValidatorPool(db);
    const poolSize1 = result1.totalPoolSize;

    // Second backfill (should be idempotent)
    const result2 = await backfillValidatorPool(db);

    // No new additions on second run
    expect(result2.addedCount).toBe(0);
    expect(result2.totalPoolSize).toBe(poolSize1);

    // Verify no duplicates
    const rows = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM validator_pool WHERE agent_id = 'aaaaaaaa-0000-0000-0000-000000000004'
    `);
    expect(Number((rows[0] as Record<string, unknown>).cnt)).toBe(1);
  });
});
