import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { Worker } from "bullmq";
import Redis from "ioredis";
import { problems } from "@betterworld/db";

// Mock evaluateLayerB at the @betterworld/guardrails level (not @anthropic-ai/sdk).
const { mockEvaluateLayerB } = vi.hoisted(() => ({
  mockEvaluateLayerB: vi.fn(),
}));

vi.mock("@betterworld/guardrails", async () => {
  const actual = await vi.importActual<typeof import("@betterworld/guardrails")>("@betterworld/guardrails");
  return {
    ...actual,
    evaluateLayerB: mockEvaluateLayerB,
  };
});

import { processEvaluation } from "../../src/workers/guardrail-worker.js";
import {
  getTestApp,
  setupTestInfra,
  teardownTestInfra,
  cleanupTestData,
  registerTestAgent,
  getTestDb,
} from "../integration/helpers.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CONCURRENCY_COUNT = 50;

describe("T068: Guardrail Concurrency Load Test", () => {
  const app = getTestApp();
  let worker: Worker;
  let workerConnection: Redis;

  beforeAll(async () => {
    await setupTestInfra();

    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
    workerConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    worker = new Worker("guardrail-evaluation", processEvaluation, {
      connection: workerConnection,
      concurrency: 5, // Process up to 5 jobs concurrently
    });
  }, 30000);

  afterEach(async () => {
    vi.clearAllMocks();
    await cleanupTestData();
  });

  afterAll(async () => {
    if (worker) await worker.close();
    if (workerConnection) await workerConnection.quit();
    await teardownTestInfra();
  }, 15000);

  async function createTestProblem(agentId: string, title: string, description: string) {
    const db = getTestDb();
    const [problem] = await db
      .insert(problems)
      .values({
        reportedByAgentId: agentId,
        title,
        description,
        domain: "food_security",
        severity: "medium",
      })
      .returning({ id: problems.id });
    return problem!;
  }

  async function submitEvaluation(
    apiKey: string,
    agentId: string,
    contentId: string,
    content: Record<string, unknown>,
  ) {
    return app.request("/api/v1/guardrails/evaluate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        contentType: "problem",
        contentId,
        content,
        agentId,
      }),
    });
  }

  async function pollUntilCompleted(evaluationId: string, apiKey: string, maxMs = 30000) {
    const pollInterval = 200;
    const iterations = Math.ceil(maxMs / pollInterval);
    let statusData: Record<string, unknown> = {};

    for (let i = 0; i < iterations; i++) {
      await sleep(pollInterval);
      const statusRes = await app.request(`/api/v1/guardrails/status/${evaluationId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      statusData = (await statusRes.json()) as Record<string, unknown>;
      const data = statusData.data as Record<string, unknown>;
      if (data?.status === "completed") return statusData;
    }

    return statusData;
  }

  it(`should handle ${CONCURRENCY_COUNT} concurrent evaluation requests without dropping jobs`, async () => {
    // Mock Layer B to return valid approval response
    mockEvaluateLayerB.mockResolvedValue({
      alignedDomain: "food_security",
      alignmentScore: 0.85,
      harmRisk: "low",
      feasibility: "high",
      quality: "good",
      decision: "approve",
      reasoning: "Valid food security initiative targeting community needs",
    });

    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey as string;
    const agentId = regData.data.agentId as string;

    // Step 1: Create 50 unique problems
    const problemPromises = Array.from({ length: CONCURRENCY_COUNT }, (_, i) =>
      createTestProblem(
        agentId,
        `Load test problem ${i + 1}: Community food initiative`,
        `Description for load test problem ${i + 1} — unique content to avoid cache hits`,
      ),
    );
    const createdProblems = await Promise.all(problemPromises);

    // Step 2: Submit all 50 evaluations in parallel
    const startTime = Date.now();

    const evalPromises = createdProblems.map((problem, i) =>
      submitEvaluation(apiKey, agentId, problem.id, {
        title: `Load test problem ${i + 1}: Community food initiative`,
        description: `Description for load test problem ${i + 1} — unique content to avoid cache hits`,
      }),
    );
    const evalResponses = await Promise.all(evalPromises);

    // Verify all returned 202
    const evaluationIds: string[] = [];
    for (const res of evalResponses) {
      expect(res.status).toBe(202);
      const data = (await res.json()) as { ok: boolean; data: { evaluationId: string; status: string } };
      expect(data.ok).toBe(true);
      expect(data.data.status).toBe("pending");
      evaluationIds.push(data.data.evaluationId);
    }

    expect(evaluationIds).toHaveLength(CONCURRENCY_COUNT);

    // Step 3: Poll all 50 for completion within 30s
    const pollPromises = evaluationIds.map((id) => pollUntilCompleted(id, apiKey, 30000));
    const pollResults = await Promise.all(pollPromises);

    const elapsedMs = Date.now() - startTime;

    // Step 4: Verify all completed successfully
    let completedCount = 0;
    for (const result of pollResults) {
      const data = (result as { data: { status: string; finalDecision: string } }).data;
      if (data.status === "completed") {
        completedCount++;
      }
    }

    expect(completedCount).toBe(CONCURRENCY_COUNT);

    // All should complete within 30s
    expect(elapsedMs).toBeLessThan(30000);

    // No jobs should have been dropped — all evaluation IDs should be unique
    const uniqueIds = new Set(evaluationIds);
    expect(uniqueIds.size).toBe(CONCURRENCY_COUNT);
  }, 60000);
});
