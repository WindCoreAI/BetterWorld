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

const TOTAL_SUBMISSIONS = 20;

describe("T069: Guardrail Cache Efficiency Load Test", () => {
  const app = getTestApp();
  let worker: Worker;
  let workerConnection: Redis;

  beforeAll(async () => {
    await setupTestInfra();

    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
    workerConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    worker = new Worker("guardrail-evaluation", processEvaluation, {
      connection: workerConnection,
      concurrency: 3,
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

  async function pollUntilCompleted(evaluationId: string, apiKey: string, maxMs = 15000) {
    const pollInterval = 150;
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

  it("should achieve >= 30% cache hit rate with ~50% duplicate content across 20 submissions", async () => {
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

    // Generate content: 10 unique templates, each used twice (20 total, 50% duplicates)
    const uniqueContents = Array.from({ length: 10 }, (_, i) => ({
      title: `Cache test problem ${i + 1}: Community food bank`,
      description: `Unique description for cache test ${i + 1} targeting food insecurity`,
    }));

    // Build submission list: each unique content appears twice
    const submissionContents = [
      ...uniqueContents,
      ...uniqueContents, // Duplicates
    ];

    // Create all 20 problems in DB (each needs its own row even with duplicate content)
    const problemRecords = await Promise.all(
      submissionContents.map((content) =>
        createTestProblem(agentId, content.title, content.description),
      ),
    );

    // Submit sequentially to ensure first batch completes and populates cache
    // before duplicates are submitted — this guarantees cache hits
    const evaluationIds: string[] = [];

    // Phase 1: Submit first 10 (unique content) and wait for each to complete
    for (let i = 0; i < 10; i++) {
      const res = await submitEvaluation(apiKey, agentId, problemRecords[i]!.id, submissionContents[i]!);
      expect(res.status).toBe(202);
      const data = (await res.json()) as { data: { evaluationId: string } };
      evaluationIds.push(data.data.evaluationId);

      // Wait for this evaluation to complete before submitting next
      await pollUntilCompleted(data.data.evaluationId, apiKey);
    }

    // Phase 2: Submit remaining 10 (duplicate content) — should hit cache
    for (let i = 10; i < TOTAL_SUBMISSIONS; i++) {
      const res = await submitEvaluation(apiKey, agentId, problemRecords[i]!.id, submissionContents[i]!);
      expect(res.status).toBe(202);
      const data = (await res.json()) as { data: { evaluationId: string } };
      evaluationIds.push(data.data.evaluationId);
    }

    // Poll remaining evaluations for completion
    const remainingPolls = evaluationIds.slice(10).map((id) =>
      pollUntilCompleted(id, apiKey),
    );
    await Promise.all(remainingPolls);

    // Verify all completed
    let completedCount = 0;
    let cacheHitCount = 0;

    for (const evalId of evaluationIds) {
      const statusRes = await app.request(`/api/v1/guardrails/status/${evalId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const statusData = (await statusRes.json()) as {
        data: { status: string; cacheHit: boolean };
      };

      if (statusData.data.status === "completed") {
        completedCount++;
      }
      if (statusData.data.cacheHit) {
        cacheHitCount++;
      }
    }

    expect(completedCount).toBe(TOTAL_SUBMISSIONS);

    // Cache hit rate should be >= 30% (10 out of 20 are duplicates, expecting most to hit cache)
    const cacheHitRate = cacheHitCount / TOTAL_SUBMISSIONS;
    expect(cacheHitRate).toBeGreaterThanOrEqual(0.3);

    // LLM should have been called fewer times than total submissions
    // First 10 are unique (LLM called), second 10 are duplicates (cache hit, no LLM)
    expect(mockCreate.mock.calls.length).toBeLessThan(TOTAL_SUBMISSIONS);
  }, 60000);
});
