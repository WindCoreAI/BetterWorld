import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { Worker } from "bullmq";
import Redis from "ioredis";
import { eq } from "drizzle-orm";
import { problems, flaggedContent, agents, guardrailEvaluations } from "@betterworld/db";

// Mock evaluateLayerB at the @betterworld/guardrails level (not @anthropic-ai/sdk).
// In pnpm monorepos, vi.mock("@anthropic-ai/sdk") may not intercept imports within
// workspace packages due to module resolution differences.
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
  getTestRedis,
} from "./helpers.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeLayerBResult(score: number, domain = "food_security") {
  return {
    alignedDomain: domain,
    alignmentScore: score,
    harmRisk: "low" as const,
    feasibility: "high" as const,
    quality: "good",
    decision: (score >= 0.7 ? "approve" : "flag") as "approve" | "flag",
    reasoning: "Test evaluation for trust tier integration",
  };
}

describe("Trust Tier Integration (US4)", () => {
  const app = getTestApp();
  let worker: Worker;
  let workerConnection: Redis;

  beforeAll(async () => {
    await setupTestInfra();

    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
    workerConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    worker = new Worker("guardrail-evaluation", processEvaluation, {
      connection: workerConnection,
      concurrency: 1,
    });
  }, 15000);

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
      }),
    });
  }

  async function pollUntilCompleted(evaluationId: string, apiKey: string, maxMs = 5000) {
    const iterations = Math.ceil(maxMs / 100);
    let statusData: Record<string, unknown> = {};

    for (let i = 0; i < iterations; i++) {
      await sleep(100);
      const statusRes = await app.request(`/api/v1/guardrails/status/${evaluationId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      statusData = (await statusRes.json()) as Record<string, unknown>;
      const data = statusData.data as Record<string, unknown>;
      if (data?.status === "completed") return statusData;
    }

    return statusData;
  }

  // Helper: backdate agent creation and seed approved evaluations for verified tier
  async function makeAgentVerified(agentId: string) {
    const db = getTestDb();

    // Backdate agent creation to 10 days ago
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await db
      .update(agents)
      .set({ createdAt: tenDaysAgo })
      .where(eq(agents.id, agentId));

    // Insert 3 approved evaluation records so the agent qualifies as "verified"
    for (let i = 0; i < 3; i++) {
      await db.insert(guardrailEvaluations).values({
        contentId: crypto.randomUUID(),
        contentType: "problem",
        agentId,
        submittedContent: JSON.stringify({ title: `Seed approved ${i}` }),
        layerAResult: JSON.stringify({ passed: true, forbiddenPatterns: [], executionTimeMs: 1 }),
        layerBResult: JSON.stringify({
          alignedDomain: "food_security",
          alignmentScore: 0.9,
          harmRisk: "low",
          feasibility: "high",
          quality: "good",
          decision: "approve",
          reasoning: "Seed data",
        }),
        finalDecision: "approved",
        alignmentScore: "0.90",
        alignmentDomain: "food_security",
        trustTier: "new",
        completedAt: new Date(),
        evaluationDurationMs: 100,
      });
    }
  }

  // T063: New agent — score 0.75 → flagged (not auto-approved)
  // Because new tier: autoApprove = 1.0, so 0.75 < 1.0 → flagged
  it("should flag high-scoring content from new agent instead of auto-approving", async () => {
    mockEvaluateLayerB.mockResolvedValue(makeLayerBResult(0.75));

    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    const problem = await createTestProblem(
      agentId,
      "Community garden expansion",
      "Expand community garden to feed more families",
    );

    const evalRes = await submitEvaluation(apiKey, agentId, problem.id, {
      title: "Community garden expansion",
      description: "Expand community garden to feed more families",
    });

    expect(evalRes.status).toBe(202);
    const evalData = (await evalRes.json()) as { data: { evaluationId: string } };

    const statusData = (await pollUntilCompleted(evalData.data.evaluationId, apiKey)) as {
      data: {
        status: string;
        finalDecision: string;
        alignmentScore: number;
      };
    };

    expect(statusData.data.status).toBe("completed");
    // Despite high score (0.75), new agent gets flagged — autoApprove is 1.0
    expect(statusData.data.finalDecision).toBe("flagged");
    expect(statusData.data.alignmentScore).toBe(0.75);

    // Verify flagged_content entry exists for admin review
    const db = getTestDb();
    const [flaggedEntry] = await db
      .select()
      .from(flaggedContent)
      .where(eq(flaggedContent.evaluationId, evalData.data.evaluationId))
      .limit(1);

    expect(flaggedEntry).toBeDefined();
    expect(flaggedEntry!.status).toBe("pending_review");

    // Verify problem is flagged, not approved
    const [updatedProblem] = await db
      .select({ guardrailStatus: problems.guardrailStatus })
      .from(problems)
      .where(eq(problems.id, problem.id))
      .limit(1);

    expect(updatedProblem?.guardrailStatus).toBe("flagged");
  }, 10000);

  // T064: Verified agent — score 0.75 → auto-approved (no human review)
  // Verified tier: autoApprove = 0.70, so 0.75 >= 0.70 → approved
  it("should auto-approve high-scoring content from verified agent", async () => {
    mockEvaluateLayerB.mockResolvedValue(makeLayerBResult(0.75));

    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    // Make agent verified: 10 days old + 3 approved evaluations
    await makeAgentVerified(agentId);

    const problem = await createTestProblem(
      agentId,
      "Meal delivery for elderly",
      "Deliver hot meals to homebound elderly residents",
    );

    const evalRes = await submitEvaluation(apiKey, agentId, problem.id, {
      title: "Meal delivery for elderly",
      description: "Deliver hot meals to homebound elderly residents",
    });

    expect(evalRes.status).toBe(202);
    const evalData = (await evalRes.json()) as { data: { evaluationId: string } };

    const statusData = (await pollUntilCompleted(evalData.data.evaluationId, apiKey)) as {
      data: {
        status: string;
        finalDecision: string;
        alignmentScore: number;
      };
    };

    expect(statusData.data.status).toBe("completed");
    // Verified agent with score 0.75 → auto-approved (threshold = 0.70)
    expect(statusData.data.finalDecision).toBe("approved");
    expect(statusData.data.alignmentScore).toBe(0.75);

    // No flagged_content entry should exist (auto-approved, not flagged)
    const db = getTestDb();
    const flaggedEntries = await db
      .select()
      .from(flaggedContent)
      .where(eq(flaggedContent.evaluationId, evalData.data.evaluationId))
      .limit(1);

    expect(flaggedEntries).toHaveLength(0);

    // Content should be approved in DB
    const [updatedProblem] = await db
      .select({ guardrailStatus: problems.guardrailStatus })
      .from(problems)
      .where(eq(problems.id, problem.id))
      .limit(1);

    expect(updatedProblem?.guardrailStatus).toBe("approved");
  }, 10000);

  // T065: Trust tier transition — agent starts as "new", reaches threshold, becomes "verified"
  // First submission as new → flagged. After backdating + seeding approvals, second → approved.
  it("should transition agent from new to verified and apply different thresholds", async () => {
    mockEvaluateLayerB.mockResolvedValue(makeLayerBResult(0.75));

    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    // -- Step 1: Submit as "new" agent — score 0.75 → flagged --
    const problem1 = await createTestProblem(
      agentId,
      "Water purification project",
      "Install water purification systems in rural areas",
    );

    const evalRes1 = await submitEvaluation(apiKey, agentId, problem1.id, {
      title: "Water purification project",
      description: "Install water purification systems in rural areas",
    });

    expect(evalRes1.status).toBe(202);
    const evalData1 = (await evalRes1.json()) as { data: { evaluationId: string } };

    const status1 = (await pollUntilCompleted(evalData1.data.evaluationId, apiKey)) as {
      data: { status: string; finalDecision: string };
    };

    expect(status1.data.status).toBe("completed");
    expect(status1.data.finalDecision).toBe("flagged"); // New agent → flagged

    // Verify evaluation recorded with trust tier "new"
    const db = getTestDb();
    const [eval1Record] = await db
      .select({ trustTier: guardrailEvaluations.trustTier })
      .from(guardrailEvaluations)
      .where(eq(guardrailEvaluations.id, evalData1.data.evaluationId))
      .limit(1);

    expect(eval1Record?.trustTier).toBe("new");

    // -- Step 2: Transition to "verified" (backdate + seed approved evaluations) --
    await makeAgentVerified(agentId);

    // CRITICAL: Clear trust tier cache so worker recalculates on next evaluation
    // Without this, the worker uses cached "new" tier from step 1, causing flaky test
    const redis = getTestRedis();
    await redis.del(`trust:tier:${agentId}`);

    // -- Step 3: Submit again as "verified" agent — same score 0.75 → approved --
    // Use different content to avoid cache hit
    const problem2 = await createTestProblem(
      agentId,
      "Solar panel installation for schools",
      "Install solar panels on schools to reduce energy costs",
    );

    const evalRes2 = await submitEvaluation(apiKey, agentId, problem2.id, {
      title: "Solar panel installation for schools",
      description: "Install solar panels on schools to reduce energy costs",
    });

    expect(evalRes2.status).toBe(202);
    const evalData2 = (await evalRes2.json()) as { data: { evaluationId: string } };

    const status2 = (await pollUntilCompleted(evalData2.data.evaluationId, apiKey)) as {
      data: { status: string; finalDecision: string };
    };

    expect(status2.data.status).toBe("completed");
    expect(status2.data.finalDecision).toBe("approved"); // Verified agent → approved

    // Verify evaluation recorded with trust tier "verified"
    const [eval2Record] = await db
      .select({ trustTier: guardrailEvaluations.trustTier })
      .from(guardrailEvaluations)
      .where(eq(guardrailEvaluations.id, evalData2.data.evaluationId))
      .limit(1);

    expect(eval2Record?.trustTier).toBe("verified");

    // Problem 1 should still be flagged, problem 2 should be approved
    const [p1] = await db
      .select({ guardrailStatus: problems.guardrailStatus })
      .from(problems)
      .where(eq(problems.id, problem1.id))
      .limit(1);

    const [p2] = await db
      .select({ guardrailStatus: problems.guardrailStatus })
      .from(problems)
      .where(eq(problems.id, problem2.id))
      .limit(1);

    expect(p1?.guardrailStatus).toBe("flagged");
    expect(p2?.guardrailStatus).toBe("approved");
  }, 20000);
});
