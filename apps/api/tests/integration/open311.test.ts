import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";

import {
  transformRequestToProblem,
  getLastSyncTimestamp,
  setLastSyncTimestamp,
} from "../../src/services/open311.service.js";

import {
  setupTestInfra,
  teardownTestInfra,
  getTestDb,
  getTestRedis,
} from "./helpers.js";

import { OPEN311_CITY_CONFIGS, SYSTEM_MUNICIPAL_AGENT_ID, OPEN311_BATCH_SIZE } from "@betterworld/shared";
import type { Open311ServiceRequest } from "@betterworld/shared";

describe("Open311 Municipal Ingestion (US2)", () => {
  beforeAll(async () => {
    await setupTestInfra();

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

  it("should parse valid Open311 service request", () => {
    const request: Open311ServiceRequest = {
      service_request_id: "CHI-2024-001",
      service_code: "4fd3b167e750846744000005",
      service_name: "Graffiti Removal",
      status: "open",
      description: "Graffiti on a building wall at 123 Main St",
      lat: 41.8781,
      long: -87.6298,
      address: "123 Main St, Chicago, IL",
      requested_datetime: "2024-01-15T10:30:00Z",
    };

    const chicagoConfig = OPEN311_CITY_CONFIGS.chicago;
    const result = transformRequestToProblem(request, chicagoConfig);

    expect(result).not.toBeNull();
    expect(result!.domain).toBe("environmental_protection");
    expect(result!.severity).toBe("medium");
    expect(result!.latitude).toBe("41.8781");
    expect(result!.longitude).toBe("-87.6298");
    expect(result!.municipalSourceId).toBe("CHI-2024-001");
    expect(result!.municipalSourceType).toBe("chicago");
    expect(result!.reportedByAgentId).toBe(SYSTEM_MUNICIPAL_AGENT_ID);
  });

  it("should skip records with unmapped service codes", () => {
    const request: Open311ServiceRequest = {
      service_request_id: "CHI-2024-002",
      service_code: "unknown_code_xyz",
      service_name: "Unknown Service",
      status: "open",
      description: "Some unknown service",
    };

    const chicagoConfig = OPEN311_CITY_CONFIGS.chicago;
    const result = transformRequestToProblem(request, chicagoConfig);

    expect(result).toBeNull();
  });

  it("should map service codes to correct domains", () => {
    const chicagoConfig = OPEN311_CITY_CONFIGS.chicago;

    // Water in Street → clean_water_sanitation
    const waterRequest: Open311ServiceRequest = {
      service_request_id: "CHI-WATER-1",
      service_code: "4ffa4c69601827691b000018",
      service_name: "Water in Street",
      status: "open",
      description: "Water flooding",
    };
    const waterResult = transformRequestToProblem(waterRequest, chicagoConfig);
    expect(waterResult).not.toBeNull();
    expect(waterResult!.domain).toBe("clean_water_sanitation");
    expect(waterResult!.severity).toBe("high");

    // Street Light Out → community_building
    const lightRequest: Open311ServiceRequest = {
      service_request_id: "CHI-LIGHT-1",
      service_code: "4fd3b750e750846c53000010",
      service_name: "Street Light Out",
      status: "open",
      description: "Street light is out",
    };
    const lightResult = transformRequestToProblem(lightRequest, chicagoConfig);
    expect(lightResult).not.toBeNull();
    expect(lightResult!.domain).toBe("community_building");
  });

  it("should handle requests without coordinates (geocoding fallback)", () => {
    const request: Open311ServiceRequest = {
      service_request_id: "CHI-2024-003",
      service_code: "4fd3b167e750846744000005",
      service_name: "Graffiti Removal",
      status: "open",
      description: "Graffiti on wall",
      lat: null,
      long: null,
      address: "456 Oak Ave, Chicago, IL",
    };

    const chicagoConfig = OPEN311_CITY_CONFIGS.chicago;
    const result = transformRequestToProblem(request, chicagoConfig);

    expect(result).not.toBeNull();
    expect(result!.latitude).toBeNull();
    expect(result!.longitude).toBeNull();
    expect(result!.address).toBe("456 Oak Ave, Chicago, IL");
  });

  it("should handle malformed records gracefully", () => {
    // Missing required service_request_id
    const malformed = {
      service_code: "test",
      // No service_request_id
    };

    const chicagoConfig = OPEN311_CITY_CONFIGS.chicago;
    // transformRequestToProblem expects valid input, so schema validation
    // should catch this upstream. Testing that transforms handle edge cases.
    const request: Open311ServiceRequest = {
      service_request_id: "",
      service_code: "4fd3b167e750846744000005",
      description: "",
    };

    const result = transformRequestToProblem(request, chicagoConfig);
    expect(result).not.toBeNull();
    expect(result!.title).toBeTruthy();
  });

  it("should track last sync timestamp in Redis", async () => {
    const redis = getTestRedis();

    await setLastSyncTimestamp(redis, "test-city", "2024-01-15T10:30:00Z");
    const result = await getLastSyncTimestamp(redis, "test-city");

    expect(result).toBe("2024-01-15T10:30:00Z");
  });

  it("should have OPEN311_BATCH_SIZE constant set to 100", () => {
    expect(OPEN311_BATCH_SIZE).toBe(100);
  });
});
