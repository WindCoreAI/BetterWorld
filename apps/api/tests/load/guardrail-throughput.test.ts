import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { Worker } from "bullmq";
import Redis from "ioredis";
import { problems } from "@betterworld/db";

// Mock Anthropic SDK — vi.hoisted ensures mock fns are available when vi.mock factory runs
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

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

const ITEM_COUNT = 10;

describe("T070: Guardrail Throughput Load Test", () => {
  const app = getTestApp();
  let worker: Worker;
  let workerConnection: Redis;

  beforeAll(async () => {
    await setupTestInfra();

    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
    workerConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    worker = new Worker("guardrail-evaluation", processEvaluation, {
      connection: workerConnection,
      concurrency: 1, // Sequential processing to measure per-item throughput
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

  async function pollUntilCompleted(evaluationId: string, apiKey: string, maxMs = 10000) {
    const pollInterval = 100;
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

  it(`should process ${ITEM_COUNT} sequential items with < 2s average per item`, async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            aligned_domain: "food_security",
            alignment_score: 0.85,
            harm_risk: "low",
            feasibility: "high",
            quality: "good",
            decision: "approve",
            reasoning: "Valid food security initiative targeting community needs",
          }),
        },
      ],
    });

    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey as string;
    const agentId = regData.data.agentId as string;

    const itemTimings: number[] = [];
    const overallStart = Date.now();

    for (let i = 0; i < ITEM_COUNT; i++) {
      const itemStart = Date.now();

      // Each item has unique content to avoid cache hits
      const title = `Throughput test ${i + 1}: Food distribution program`;
      const description = `Unique throughput test ${i + 1} — establishing food distribution network for underserved area ${Date.now()}`;

      const problem = await createTestProblem(agentId, title, description);

      const evalRes = await submitEvaluation(apiKey, agentId, problem.id, {
        title,
        description,
      });

      expect(evalRes.status).toBe(202);
      const evalData = (await evalRes.json()) as { data: { evaluationId: string } };
      const evaluationId = evalData.data.evaluationId;

      // Poll until completed
      const statusData = (await pollUntilCompleted(evaluationId, apiKey)) as {
        data: { status: string; finalDecision: string; evaluationDurationMs: number };
      };

      expect(statusData.data.status).toBe("completed");
      expect(statusData.data.finalDecision).toBe("approved");

      const itemDuration = Date.now() - itemStart;
      itemTimings.push(itemDuration);
    }

    const overallDuration = Date.now() - overallStart;
    const averageMs = overallDuration / ITEM_COUNT;

    // All items should have completed
    expect(itemTimings).toHaveLength(ITEM_COUNT);

    // Average processing time per item should be < 2000ms
    // This means the system can handle > 1800 items/hour (3600s / 2s per item)
    expect(averageMs).toBeLessThan(2000);

    // Extrapolated throughput: items per hour
    const itemsPerHour = Math.floor(3600000 / averageMs);
    expect(itemsPerHour).toBeGreaterThan(100);

    // Verify LLM was called for each unique item
    expect(mockCreate).toHaveBeenCalledTimes(ITEM_COUNT);
  }, 60000);
});
