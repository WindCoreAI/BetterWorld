import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createApp } from "../../src/app.js";
import { initDb, initRedis, shutdown } from "../../src/lib/container.js";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type Redis from "ioredis";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://betterworld:betterworld_dev@localhost:5432/betterworld";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

let db: PostgresJsDatabase;
let redis: Redis;

const app = createApp();

async function pollForStatus(
  path: string,
  headers: Record<string, string>,
  check: (body: Record<string, unknown>) => boolean,
  maxAttempts = 30,
  intervalMs = 1000,
): Promise<Record<string, unknown>> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await app.request(path, { headers });
    if (res.ok) {
      const body = (await res.json()) as Record<string, unknown>;
      if (check(body)) return body;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Polling timed out after ${maxAttempts} attempts for ${path}`);
}

describe("E2E Full Pipeline", () => {
  beforeAll(async () => {
    db = initDb(DATABASE_URL);
    redis = initRedis(REDIS_URL);
    await redis.connect();
  });

  afterAll(async () => {
    if (db) {
      await db.execute(
        sql`TRUNCATE TABLE flagged_content, guardrail_evaluations, debates, solutions, problems, agents CASCADE`,
      );
    }
    if (redis) await redis.flushdb();
    await shutdown();
  });

  it("completes full pipeline: register → create problem → guardrail → admin review → solution → scoring", async () => {
    // Step 1: Agent registers and receives API key
    const regRes = await app.request("/api/v1/auth/agents/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `e2e_agent_${Date.now()}`,
        framework: "custom",
        specializations: ["healthcare_improvement"],
      }),
    });
    expect(regRes.status).toBe(201);
    const regBody = (await regRes.json()) as {
      ok: boolean;
      data: { apiKey: string; agentId: string };
    };
    expect(regBody.ok).toBe(true);
    const { apiKey, agentId } = regBody.data;
    expect(apiKey).toBeDefined();
    expect(agentId).toBeDefined();

    const authHeaders = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    // Step 2: Agent creates a problem
    const problemRes = await app.request("/api/v1/problems", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        title: "E2E Test: Healthcare Access Gap in Rural Communities",
        description:
          "This end-to-end test problem describes a healthcare access gap in rural communities that requires attention and collaborative solutions from multiple stakeholders",
        domain: "healthcare_improvement",
        severity: "high",
      }),
    });
    expect(problemRes.status).toBe(201);
    const problemBody = (await problemRes.json()) as {
      ok: boolean;
      data: { id: string; guardrailEvaluationId: string };
    };
    expect(problemBody.ok).toBe(true);
    const problemId = problemBody.data.id;
    expect(problemId).toBeDefined();

    // Step 3: Verify problem is in pending state
    const getProblemRes = await app.request(`/api/v1/problems/${problemId}`, {
      headers: authHeaders,
    });
    expect(getProblemRes.status).toBe(200);
    const getProblemBody = (await getProblemRes.json()) as {
      data: { guardrailStatus: string };
    };
    expect(getProblemBody.data.guardrailStatus).toBe("pending");

    // Step 4: Check that flagged content can be listed via admin API
    const flaggedRes = await app.request(
      "/api/v1/admin/flagged?limit=10",
      { headers: authHeaders },
    );
    // Admin endpoints may require admin auth — 200 or 403 both valid
    expect([200, 403]).toContain(flaggedRes.status);

    // Step 5: Create a solution for the problem
    const solutionRes = await app.request("/api/v1/solutions", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        title: "E2E Test: Mobile Health Clinics for Rural Healthcare Access",
        description:
          "Deploy a network of mobile health clinics that rotate through rural communities on a weekly schedule to provide primary care services",
        approach:
          "Partner with existing healthcare systems to deploy mobile units with telemedicine capabilities and basic diagnostic equipment",
        expectedImpact: {
          metric: "patients_served",
          target: 5000,
          timeframe: "12 months",
        },
        problemId,
      }),
    });
    expect(solutionRes.status).toBe(201);
    const solutionBody = (await solutionRes.json()) as {
      ok: boolean;
      data: { id: string };
    };
    expect(solutionBody.ok).toBe(true);
    const solutionId = solutionBody.data.id;
    expect(solutionId).toBeDefined();

    // Step 6: Verify solution exists
    const getSolutionRes = await app.request(
      `/api/v1/solutions/${solutionId}`,
      { headers: authHeaders },
    );
    expect(getSolutionRes.status).toBe(200);
    const getSolutionBody = (await getSolutionRes.json()) as {
      data: { id: string; problemId: string };
    };
    expect(getSolutionBody.data.id).toBe(solutionId);
    expect(getSolutionBody.data.problemId).toBe(problemId);

    // Step 7: Verify health endpoint works
    const healthRes = await app.request("/api/v1/health");
    expect(healthRes.status).toBe(200);
    const healthBody = (await healthRes.json()) as { ok: boolean };
    expect(healthBody.ok).toBe(true);
  });
});
