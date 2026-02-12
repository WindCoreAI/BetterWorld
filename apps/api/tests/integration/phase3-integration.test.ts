import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";

import {
  setupTestInfra,
  teardownTestInfra,
  getTestDb,
  getTestRedis,
  getTestApp,
  registerTestAgent,
} from "./helpers.js";

import {
  SYSTEM_MUNICIPAL_AGENT_ID,
  STARTER_GRANT_AMOUNT,
  OPEN311_CITY_CONFIGS,
  GPS_VALIDATION,
} from "@betterworld/shared";

import { AgentCreditService } from "../../src/services/agent-credit.service.js";
import { transformRequestToProblem } from "../../src/services/open311.service.js";
import { validateGPS } from "../../src/services/observation.service.js";
import { computeScore } from "../../src/services/hyperlocal-scoring.js";
import { backfillValidatorPool } from "../../src/services/validator-pool.service.js";
import { getFlag, setFlag } from "../../src/services/feature-flags.js";
import type { Open311ServiceRequest } from "@betterworld/shared";

describe("Phase 3 Cross-Story Integration", () => {
  let app: ReturnType<typeof getTestApp>;

  beforeAll(async () => {
    await setupTestInfra();
    app = getTestApp();

    // Ensure system agent exists
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

  it("should issue starter grant on agent registration and reflect in credit balance", async () => {
    const { data } = await registerTestAgent(app);
    expect(data.ok).toBe(true);

    const agentId = data.data.agentId;
    const db = getTestDb();
    const creditService = new AgentCreditService(db);

    const balance = await creditService.getBalance(agentId);
    expect(balance).toBe(STARTER_GRANT_AMOUNT);
  });

  it("should transform Open311 request and validate the resulting problem data", () => {
    const request: Open311ServiceRequest = {
      service_request_id: "INTEG-001",
      service_code: "4fd3b167e750846744000005",
      service_name: "Graffiti Removal",
      status: "open",
      description: "Graffiti on wall at community center",
      lat: 41.8781,
      long: -87.6298,
      address: "123 Main St, Chicago, IL",
    };

    const config = OPEN311_CITY_CONFIGS.chicago;
    const problem = transformRequestToProblem(request, config);

    expect(problem).not.toBeNull();
    expect(problem!.domain).toBe("environmental_protection");
    expect(problem!.municipalSourceId).toBe("INTEG-001");
    expect(problem!.municipalSourceType).toBe("chicago");
    expect(problem!.reportedByAgentId).toBe(SYSTEM_MUNICIPAL_AGENT_ID);

    // The transformed data should pass GPS validation
    const gpsCheck = validateGPS(
      parseFloat(problem!.latitude!),
      parseFloat(problem!.longitude!),
    );
    expect(gpsCheck.valid).toBe(true);
  });

  it("should score hyperlocal vs global problems differently", () => {
    // Hyperlocal problem
    const localScore = computeScore({
      geographicScope: "neighborhood",
      localUrgency: "immediate",
      actionability: "individual",
      observationCount: 5,
      upvotes: 3,
      alignmentScore: "0.90",
      severity: "medium",
    });

    expect(localScore.weights).toBe("hyperlocal");
    expect(localScore.score).toBeGreaterThan(0);

    // Global problem
    const globalScore = computeScore({
      geographicScope: "global",
      localUrgency: null,
      actionability: null,
      observationCount: 0,
      upvotes: 50,
      alignmentScore: "0.90",
      severity: "medium",
    });

    expect(globalScore.weights).toBe("global");
    expect(globalScore.score).toBeGreaterThan(0);

    // Both should be valid scores
    expect(localScore.score).toBeLessThanOrEqual(100);
    expect(globalScore.score).toBeLessThanOrEqual(100);
  });

  it("should respect feature flag for Open311 ingestion gating", async () => {
    const redis = getTestRedis();

    // Verify default is disabled
    const defaultValue = await getFlag(redis, "HYPERLOCAL_INGESTION_ENABLED");
    expect(defaultValue).toBe(false);

    // Enable it
    await setFlag(redis, "HYPERLOCAL_INGESTION_ENABLED", true);
    const enabledValue = await getFlag(redis, "HYPERLOCAL_INGESTION_ENABLED");
    expect(enabledValue).toBe(true);

    // Disable it back
    await setFlag(redis, "HYPERLOCAL_INGESTION_ENABLED", false);
    const disabledValue = await getFlag(redis, "HYPERLOCAL_INGESTION_ENABLED");
    expect(disabledValue).toBe(false);
  });

  it("should backfill validator pool from verified agents", async () => {
    const db = getTestDb();

    // Clean up any leftover test data
    await db.execute(sql`DELETE FROM validator_pool WHERE agent_id IN (
      SELECT id FROM agents WHERE username LIKE 'cross-test-%'
    )`);
    await db.execute(sql`DELETE FROM agents WHERE username LIKE 'cross-test-%'`);

    // Create a verified agent
    await db.execute(sql`
      INSERT INTO agents (id, username, framework, api_key_hash, api_key_prefix, is_active, claim_status)
      VALUES (
        'cccccccc-0000-0000-0000-000000000001',
        'cross-test-verified',
        'custom',
        '$2b$10$test',
        'cross_test_1',
        true,
        'verified'
      )
    `);

    const result = await backfillValidatorPool(db);
    expect(result.addedCount).toBeGreaterThanOrEqual(1);

    // Verify the agent is in the pool at apprentice tier
    const [validator] = await db.execute(sql`
      SELECT tier, is_active FROM validator_pool
      WHERE agent_id = 'cccccccc-0000-0000-0000-000000000001'
    `);
    expect(validator).toBeDefined();
    expect((validator as Record<string, unknown>).tier).toBe("apprentice");
    expect((validator as Record<string, unknown>).is_active).toBe(true);

    // Cleanup
    await db.execute(sql`DELETE FROM validator_pool WHERE agent_id = 'cccccccc-0000-0000-0000-000000000001'`);
    await db.execute(sql`DELETE FROM agents WHERE id = 'cccccccc-0000-0000-0000-000000000001'`);
  });
});
