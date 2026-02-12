import { sql } from "drizzle-orm";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  buildPostGISProximityFilter,
  buildPostGISDistanceSelect,
  buildPostGISPoint,
  parsePostGISPointFromHex,
} from "../../src/lib/geo-helpers.js";

import {
  setupTestInfra,
  teardownTestInfra,
  getTestDb,
  registerTestAgent,
  getTestApp,
} from "./helpers.js";

describe("PostGIS Spatial Infrastructure (US4)", () => {
  const app = getTestApp();

  beforeAll(async () => {
    await setupTestInfra();
  });

  afterAll(async () => {
    await teardownTestInfra();
  });

  it("should have PostGIS extension enabled", async () => {
    const db = getTestDb();
    const result = await db.execute(sql`SELECT PostGIS_Version() as version`);
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
    expect((result[0] as { version: string }).version).toMatch(/^\d+/);
  });

  it("should create location_point from lat/lng using ST_MakePoint", async () => {
    const db = getTestDb();
    // Register an agent to use as reporter
    const { data: agentData } = await registerTestAgent(app);
    const agentId = agentData.data.agentId;
    const apiKey = agentData.data.apiKey;

    // Create a problem with lat/lng via the API
    const createRes = await app.request("/api/v1/problems", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        title: "PostGIS Test Problem",
        description: "Testing PostGIS spatial queries with geographic coordinates and distance calculations",
        domain: "environmental_protection",
        severity: "medium",
        geographicScope: "local",
        latitude: 41.8781,
        longitude: -87.6298,
      }),
    });

    expect(createRes.status).toBe(201);
    const createData = await createRes.json();
    const problemId = createData.data.id;

    // Backfill the location_point (simulating what migration does)
    await db.execute(sql`
      UPDATE problems
      SET location_point = ST_SetSRID(ST_MakePoint(longitude::float, latitude::float), 4326)::geography
      WHERE id = ${problemId} AND latitude IS NOT NULL AND longitude IS NOT NULL
    `);

    // Verify location_point was set
    const result = await db.execute(sql`
      SELECT location_point IS NOT NULL as has_point
      FROM problems WHERE id = ${problemId}
    `);
    expect((result[0] as { has_point: boolean }).has_point).toBe(true);
  });

  it("should find problems within radius using ST_DWithin", async () => {
    const db = getTestDb();
    const { data: agentData } = await registerTestAgent(app);
    const apiKey = agentData.data.apiKey;

    // Create a problem in Chicago (41.8781, -87.6298)
    const createRes = await app.request("/api/v1/problems", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        title: "Chicago Problem",
        description: "A problem in downtown Chicago that needs community attention and local resolution",
        domain: "community_building",
        severity: "medium",
        latitude: 41.8781,
        longitude: -87.6298,
      }),
    });

    const chicagoId = (await createRes.json()).data.id;

    // Backfill
    await db.execute(sql`
      UPDATE problems
      SET location_point = ST_SetSRID(ST_MakePoint(longitude::float, latitude::float), 4326)::geography
      WHERE id = ${chicagoId}
    `);

    // Query: problems within 10km of Chicago center
    const withinResults = await db.execute(sql`
      SELECT id FROM problems
      WHERE location_point IS NOT NULL
      AND ST_DWithin(
        location_point,
        ST_SetSRID(ST_MakePoint(-87.6298, 41.8781), 4326)::geography,
        10000
      )
      AND id = ${chicagoId}
    `);

    expect(withinResults.length).toBe(1);
  });

  it("should exclude problems outside radius using ST_DWithin", async () => {
    const db = getTestDb();
    const { data: agentData } = await registerTestAgent(app);
    const apiKey = agentData.data.apiKey;

    // Create problem in NYC (40.7128, -74.0060)
    const createRes = await app.request("/api/v1/problems", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        title: "NYC Problem",
        description: "A problem in New York City that needs community attention and local resolution efforts",
        domain: "community_building",
        severity: "medium",
        latitude: 40.7128,
        longitude: -74.0060,
      }),
    });

    const nycId = (await createRes.json()).data.id;

    // Backfill
    await db.execute(sql`
      UPDATE problems
      SET location_point = ST_SetSRID(ST_MakePoint(longitude::float, latitude::float), 4326)::geography
      WHERE id = ${nycId}
    `);

    // Query: problems within 10km of Chicago center — NYC should NOT appear
    const results = await db.execute(sql`
      SELECT id FROM problems
      WHERE location_point IS NOT NULL
      AND ST_DWithin(
        location_point,
        ST_SetSRID(ST_MakePoint(-87.6298, 41.8781), 4326)::geography,
        10000
      )
      AND id = ${nycId}
    `);

    expect(results.length).toBe(0);
  });

  it("should order problems by proximity using ST_Distance", async () => {
    const db = getTestDb();
    const { data: agentData } = await registerTestAgent(app);
    const apiKey = agentData.data.apiKey;

    // Create two problems: one near (1km away) and one far (100km away) from reference point
    const nearRes = await app.request("/api/v1/problems", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        title: "Near Problem",
        description: "Very close to reference point for proximity testing and spatial queries",
        domain: "community_building",
        severity: "medium",
        latitude: 41.880,
        longitude: -87.630,
      }),
    });

    const farRes = await app.request("/api/v1/problems", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        title: "Far Problem",
        description: "Far from reference point for distance ordering and spatial query testing",
        domain: "community_building",
        severity: "medium",
        latitude: 42.500,
        longitude: -88.500,
      }),
    });

    const nearId = (await nearRes.json()).data.id;
    const farId = (await farRes.json()).data.id;

    // Backfill both
    await db.execute(sql`
      UPDATE problems
      SET location_point = ST_SetSRID(ST_MakePoint(longitude::float, latitude::float), 4326)::geography
      WHERE id IN (${nearId}, ${farId})
    `);

    // Query distance ordering from reference (41.878, -87.630)
    const results = await db.execute(sql`
      SELECT id, ST_Distance(
        location_point,
        ST_SetSRID(ST_MakePoint(-87.630, 41.878), 4326)::geography
      ) as distance
      FROM problems
      WHERE id IN (${nearId}, ${farId})
      AND location_point IS NOT NULL
      ORDER BY distance ASC
    `);

    expect(results.length).toBe(2);
    const ids = results.map((r) => (r as { id: string }).id);
    expect(ids[0]).toBe(nearId);
    expect(ids[1]).toBe(farId);
  });

  it("should parse PostGIS point from hex correctly", () => {
    // This tests the parsePostGISPointFromHex helper
    // A known point at lon=-87.6298, lat=41.8781 in EWKB hex
    // We'll test with a null case and the parse function
    expect(parsePostGISPointFromHex(null)).toBeNull();
    expect(parsePostGISPointFromHex("")).toBeNull();
    expect(parsePostGISPointFromHex("00")).toBeNull();
  });

  it("should build PostGIS proximity filter SQL", () => {
    const filter = buildPostGISProximityFilter("location_point", 41.8781, -87.6298, 10000);
    expect(filter).toBeDefined();
  });

  it("should build PostGIS distance select SQL", () => {
    const distance = buildPostGISDistanceSelect("location_point", 41.8781, -87.6298);
    expect(distance).toBeDefined();
  });

  it("should build PostGIS point SQL", () => {
    const point = buildPostGISPoint(41.8781, -87.6298);
    expect(point).toBeDefined();
  });
});
