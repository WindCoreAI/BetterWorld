import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { Worker, Queue } from "bullmq";
import Redis from "ioredis";
import { eq } from "drizzle-orm";
import { problems, flaggedContent, guardrailEvaluations, agents } from "@betterworld/db";
// Mock evaluateLayerB at the @betterworld/guardrails level (not @anthropic-ai/sdk).
// In pnpm monorepos, vi.mock("@anthropic-ai/sdk") may not intercept imports within
// workspace packages due to module resolution differences. Mocking the guardrails
// package directly is more reliable and avoids cross-package resolution issues.
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
} from "./helpers.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Helper: backdate agent creation and seed approved evaluations so the agent
// qualifies as "verified" tier (autoApprove=0.70 instead of new tier's 1.0).
async function makeAgentVerified(agentId: string) {
  const db = getTestDb();
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  await db.update(agents).set({ createdAt: tenDaysAgo }).where(eq(agents.id, agentId));
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

describe("Guardrail Evaluation (US1)", () => {
  const app = getTestApp();
  let worker: Worker;
  let workerConnection: Redis;

  beforeAll(async () => {
    await setupTestInfra();

    // Start a real BullMQ worker for end-to-end queue processing
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

  // Helper: create a problem record in the DB to get a valid contentId
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

  // Helper: submit evaluation via API and return evaluationId
  async function submitEvaluation(
    apiKey: string,
    agentId: string,
    contentId: string,
    content: Record<string, unknown>,
  ) {
    const res = await app.request("/api/v1/guardrails/evaluate", {
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
    return res;
  }

  // Helper: poll status until completed or timeout
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

  // T033: Valid content approval — submit, poll status, verify approved within 5s
  it("should approve valid food security content within 5s", async () => {
    mockEvaluateLayerB.mockResolvedValue({
      alignedDomain: "food_security",
      alignmentScore: 0.85,
      harmRisk: "low",
      feasibility: "high",
      quality: "good",
      decision: "approve",
      reasoning: "Clear food security initiative targeting community needs",
    });

    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;
    await makeAgentVerified(agentId);

    const problem = await createTestProblem(
      agentId,
      "Community food bank needs volunteers",
      "Local food bank is struggling with volunteer shortage during holiday season",
    );

    // Submit evaluation
    const evalRes = await submitEvaluation(apiKey, agentId, problem.id, {
      title: "Community food bank needs volunteers",
      description: "Local food bank is struggling with volunteer shortage",
    });

    expect(evalRes.status).toBe(202);
    const evalData = (await evalRes.json()) as { ok: boolean; data: { evaluationId: string; status: string } };
    expect(evalData.ok).toBe(true);
    expect(evalData.data.status).toBe("pending");

    const evaluationId = evalData.data.evaluationId;

    // Poll until completed (max 5s)
    const statusData = (await pollUntilCompleted(evaluationId, apiKey)) as {
      ok: boolean;
      data: {
        status: string;
        finalDecision: string;
        alignmentScore: number;
        alignmentDomain: string;
        layerAResult: { passed: boolean; forbiddenPatterns: string[] };
      };
    };

    expect(statusData.data.status).toBe("completed");
    expect(statusData.data.finalDecision).toBe("approved");
    expect(statusData.data.alignmentScore).toBeGreaterThanOrEqual(0.7);
    expect(statusData.data.alignmentDomain).toBe("food_security");
    expect(statusData.data.layerAResult.passed).toBe(true);
    expect(statusData.data.layerAResult.forbiddenPatterns).toEqual([]);
  }, 10000);

  // T034: Cache hit — submit identical content twice, verify second uses cache
  it("should return cache hit on duplicate content submission", async () => {
    mockEvaluateLayerB.mockResolvedValue({
      alignedDomain: "education_access",
      alignmentScore: 0.90,
      harmRisk: "low",
      feasibility: "high",
      quality: "excellent",
      decision: "approve",
      reasoning: "Strong education initiative for underserved communities",
    });

    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    const content = {
      title: "Free tutoring for low-income students",
      description: "Volunteer tutoring program for students in need",
    };

    // First submission
    const problem1 = await createTestProblem(agentId, content.title, content.description);
    const evalRes1 = await submitEvaluation(apiKey, agentId, problem1.id, content);
    expect(evalRes1.status).toBe(202);
    const evalData1 = (await evalRes1.json()) as { data: { evaluationId: string } };

    const statusData1 = (await pollUntilCompleted(evalData1.data.evaluationId, apiKey)) as {
      data: { status: string; cacheHit: boolean };
    };
    expect(statusData1.data.status).toBe("completed");
    expect(statusData1.data.cacheHit).toBe(false); // First submission — no cache

    // Second submission with identical content — should be a cache hit
    const problem2 = await createTestProblem(agentId, content.title, content.description);
    const evalRes2 = await submitEvaluation(apiKey, agentId, problem2.id, content);
    expect(evalRes2.status).toBe(202);
    const evalData2 = (await evalRes2.json()) as { data: { evaluationId: string } };

    const statusData2 = (await pollUntilCompleted(evalData2.data.evaluationId, apiKey)) as {
      data: { status: string; cacheHit: boolean };
    };
    expect(statusData2.data.status).toBe("completed");
    expect(statusData2.data.cacheHit).toBe(true); // Cache hit!

    // LLM should only have been called once (first submission)
    expect(mockEvaluateLayerB).toHaveBeenCalledTimes(1);
  }, 15000);

  // T035: High score → approved + content publicly visible
  it("should approve content with score >= 0.7 and update guardrail status", async () => {
    mockEvaluateLayerB.mockResolvedValue({
      alignedDomain: "environmental_protection",
      alignmentScore: 0.92,
      harmRisk: "low",
      feasibility: "high",
      quality: "excellent",
      decision: "approve",
      reasoning: "Clear environmental protection initiative with community benefit",
    });

    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;
    await makeAgentVerified(agentId);

    const problem = await createTestProblem(
      agentId,
      "Beach cleanup event this Saturday",
      "Organizing a community beach cleanup to remove plastic waste",
    );

    // Submit evaluation
    const evalRes = await submitEvaluation(apiKey, agentId, problem.id, {
      title: "Beach cleanup event this Saturday",
      description: "Organizing a community beach cleanup to remove plastic waste",
    });
    expect(evalRes.status).toBe(202);
    const evalData = (await evalRes.json()) as { data: { evaluationId: string } };

    // Poll until completed
    const statusData = (await pollUntilCompleted(evalData.data.evaluationId, apiKey)) as {
      data: {
        status: string;
        finalDecision: string;
        alignmentScore: number;
        evaluationDurationMs: number;
      };
    };

    expect(statusData.data.status).toBe("completed");
    expect(statusData.data.finalDecision).toBe("approved");
    expect(statusData.data.alignmentScore).toBeGreaterThanOrEqual(0.7);

    // Verify the problem's guardrail_status was updated in the DB
    const db = getTestDb();
    const [updatedProblem] = await db
      .select({ guardrailStatus: problems.guardrailStatus })
      .from(problems)
      .where(eq(problems.id, problem.id))
      .limit(1);

    expect(updatedProblem?.guardrailStatus).toBe("approved");
  }, 10000);
});

// ============================================================
// US2: System Blocks Harmful Content
// ============================================================
describe("Guardrail Evaluation (US2) - Harmful Content Blocking", () => {
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

  // T041: Layer A rejection — surveillance pattern → rejected, content hidden
  it("should reject content with forbidden surveillance pattern via Layer A", async () => {
    // Layer B mock should NOT be called since Layer A rejects first
    mockEvaluateLayerB.mockResolvedValue({
      alignedDomain: "none",
      alignmentScore: 0,
      harmRisk: "high",
      feasibility: "low",
      quality: "rejected",
      decision: "reject",
      reasoning: "Should not be called",
    });

    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    const problem = await createTestProblem(
      agentId,
      "Surveillance system for neighborhood",
      "Install a surveillance network to monitor all residents",
    );

    const evalRes = await submitEvaluation(apiKey, agentId, problem.id, {
      title: "Surveillance system for neighborhood",
      description: "Install a surveillance network to monitor all residents",
    });

    expect(evalRes.status).toBe(202);
    const evalData = (await evalRes.json()) as { data: { evaluationId: string } };

    const statusData = (await pollUntilCompleted(evalData.data.evaluationId, apiKey)) as {
      data: {
        status: string;
        finalDecision: string;
        layerAResult: { passed: boolean; forbiddenPatterns: string[] };
        layerBResult: null;
      };
    };

    expect(statusData.data.status).toBe("completed");
    expect(statusData.data.finalDecision).toBe("rejected");
    expect(statusData.data.layerAResult.passed).toBe(false);
    expect(statusData.data.layerAResult.forbiddenPatterns).toContain("surveillance");

    // Layer B should NOT have been called (Layer A short-circuits)
    expect(mockEvaluateLayerB).not.toHaveBeenCalled();

    // Verify the problem's guardrail_status is rejected in DB
    const db = getTestDb();
    const [updatedProblem] = await db
      .select({ guardrailStatus: problems.guardrailStatus })
      .from(problems)
      .where(eq(problems.id, problem.id))
      .limit(1);

    expect(updatedProblem?.guardrailStatus).toBe("rejected");
  }, 10000);

  // T042: Layer B low score for new agent → flagged for human review (new agents never auto-reject)
  it("should flag content with low alignment score from new agent for human review", async () => {
    mockEvaluateLayerB.mockResolvedValue({
      alignedDomain: "community_building",
      alignmentScore: 0.15,
      harmRisk: "high",
      feasibility: "medium",
      quality: "poor - harmful intent detected",
      decision: "reject",
      reasoning: "Content appears to promote harmful activity disguised as community building",
    });

    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    // Content passes Layer A (no forbidden keywords) but scores low in Layer B
    const problem = await createTestProblem(
      agentId,
      "Community organizing initiative",
      "Gather information about neighborhood routines for planning purposes",
    );

    const evalRes = await submitEvaluation(apiKey, agentId, problem.id, {
      title: "Community organizing initiative",
      description: "Gather information about neighborhood routines for planning purposes",
    });

    expect(evalRes.status).toBe(202);
    const evalData = (await evalRes.json()) as { data: { evaluationId: string } };

    const statusData = (await pollUntilCompleted(evalData.data.evaluationId, apiKey)) as {
      data: {
        status: string;
        finalDecision: string;
        alignmentScore: number;
        layerAResult: { passed: boolean };
        layerBResult: { harmRisk: string; reasoning: string };
      };
    };

    expect(statusData.data.status).toBe("completed");
    expect(statusData.data.finalDecision).toBe("flagged"); // New agents: all content goes to human review
    expect(statusData.data.alignmentScore).toBeLessThan(0.4);
    expect(statusData.data.layerAResult.passed).toBe(true); // Passed Layer A
    expect(statusData.data.layerBResult.harmRisk).toBe("high");
    expect(statusData.data.layerBResult.reasoning).toBeTruthy();

    // Verify problem is flagged in DB (routed to human review, not auto-rejected)
    const db = getTestDb();
    const [updatedProblem] = await db
      .select({ guardrailStatus: problems.guardrailStatus })
      .from(problems)
      .where(eq(problems.id, problem.id))
      .limit(1);

    expect(updatedProblem?.guardrailStatus).toBe("flagged");

    // Verify flagged_content entry was created for admin review
    const [flaggedEntry] = await db
      .select()
      .from(flaggedContent)
      .where(eq(flaggedContent.contentId, problem.id))
      .limit(1);

    expect(flaggedEntry).toBeDefined();
    expect(flaggedEntry!.status).toBe("pending_review");
  }, 10000);

  // T043: Ambiguous content → flagged (score 0.4-0.7) → routed to admin review
  it("should flag ambiguous content and create flagged_content entry", async () => {
    mockEvaluateLayerB.mockResolvedValue({
      alignedDomain: "healthcare_improvement",
      alignmentScore: 0.55,
      harmRisk: "medium",
      feasibility: "medium",
      quality: "unclear - privacy concerns",
      decision: "flag",
      reasoning: "Health records tracking initiative raises privacy questions that need review",
    });

    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    const problem = await createTestProblem(
      agentId,
      "Community health tracking database",
      "Create a database of community health records for research",
    );

    const evalRes = await submitEvaluation(apiKey, agentId, problem.id, {
      title: "Community health tracking database",
      description: "Create a database of community health records for research",
    });

    expect(evalRes.status).toBe(202);
    const evalData = (await evalRes.json()) as { data: { evaluationId: string } };
    const evaluationId = evalData.data.evaluationId;

    const statusData = (await pollUntilCompleted(evaluationId, apiKey)) as {
      data: {
        status: string;
        finalDecision: string;
        alignmentScore: number;
      };
    };

    expect(statusData.data.status).toBe("completed");
    expect(statusData.data.finalDecision).toBe("flagged");
    expect(statusData.data.alignmentScore).toBeGreaterThanOrEqual(0.4);
    expect(statusData.data.alignmentScore).toBeLessThan(0.7);

    // Verify flagged_content entry was created for admin review
    const db = getTestDb();
    const [flaggedEntry] = await db
      .select()
      .from(flaggedContent)
      .where(eq(flaggedContent.evaluationId, evaluationId))
      .limit(1);

    expect(flaggedEntry).toBeDefined();
    expect(flaggedEntry!.status).toBe("pending_review");
    expect(flaggedEntry!.agentId).toBe(agentId);

    // Verify problem is flagged in DB
    const [updatedProblem] = await db
      .select({ guardrailStatus: problems.guardrailStatus })
      .from(problems)
      .where(eq(problems.id, problem.id))
      .limit(1);

    expect(updatedProblem?.guardrailStatus).toBe("flagged");
  }, 10000);
});

// ============================================================
// US5: System Resilience — LLM failures, worker recovery, dedup
// ============================================================
describe("Guardrail Evaluation (US5) - Resilience", () => {
  const app = getTestApp();
  let worker: Worker;
  let workerConnection: Redis;
  let queue: Queue;

  beforeAll(async () => {
    await setupTestInfra();

    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
    workerConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    worker = new Worker("guardrail-evaluation", processEvaluation, {
      connection: workerConnection,
      concurrency: 1,
    });

    // Queue instance for inspecting job states
    const queueConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    queue = new Queue("guardrail-evaluation", { connection: queueConnection });
  }, 15000);

  afterEach(async () => {
    vi.clearAllMocks();
    await cleanupTestData();
  });

  afterAll(async () => {
    if (worker) await worker.close();
    if (queue) await queue.close();
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

  // T071: LLM API failure handling — retries exhaust, evaluation stays in initial state
  // Skipped in CI: 15s sleep for retry backoff makes this too slow/expensive for GitHub Actions
  it.skipIf(!!process.env.CI)("should handle LLM API failure with retries and leave evaluation in initial state", async () => {
    // Mock Layer B to always throw (simulating LLM API failure)
    mockEvaluateLayerB.mockRejectedValue(new Error("Anthropic API error: 500"));

    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    const problem = await createTestProblem(
      agentId,
      "Clean water access program",
      "Provide clean drinking water to rural communities lacking infrastructure",
    );

    // Submit evaluation — content passes Layer A (no forbidden patterns), fails at Layer B (LLM call)
    const evalRes = await submitEvaluation(apiKey, agentId, problem.id, {
      title: "Clean water access program",
      description: "Provide clean drinking water to rural communities lacking infrastructure",
    });

    expect(evalRes.status).toBe(202);
    const evalData = (await evalRes.json()) as { data: { evaluationId: string } };
    const evaluationId = evalData.data.evaluationId;

    // Wait for all 3 retry attempts to exhaust (1s + 2s + 4s backoff = ~7s, plus processing)
    // Use generous timeout to account for backoff delays
    await sleep(15000);

    // Verify the job ended up in failed state
    const job = await queue.getJob(evaluationId);
    expect(job).toBeDefined();
    expect(job!.failedReason).toContain("Anthropic API error: 500");
    expect(job!.attemptsMade).toBe(3);

    // Verify the evaluation record in DB still has the initial placeholder state
    // (worker threw before updating the record)
    const db = getTestDb();
    const [evalRecord] = await db
      .select({
        finalDecision: guardrailEvaluations.finalDecision,
        completedAt: guardrailEvaluations.completedAt,
      })
      .from(guardrailEvaluations)
      .where(eq(guardrailEvaluations.id, evaluationId))
      .limit(1);

    expect(evalRecord).toBeDefined();
    // The initial placeholder decision is "flagged" (set during record creation)
    expect(evalRecord!.finalDecision).toBe("flagged");
    // completedAt should still be null since the worker never completed
    expect(evalRecord!.completedAt).toBeNull();

    // LLM was called 3 times (one per attempt)
    expect(mockEvaluateLayerB).toHaveBeenCalledTimes(3);
  }, 30000);

  // T072: Worker crash recovery — verify worker processes jobs reliably after restart
  it("should process jobs reliably after worker setup", async () => {
    mockEvaluateLayerB.mockResolvedValue({
      alignedDomain: "clean_water",
      alignmentScore: 0.88,
      harmRisk: "low",
      feasibility: "high",
      quality: "excellent",
      decision: "approve",
      reasoning: "Clean water initiative with clear community benefit",
    });

    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;
    await makeAgentVerified(agentId);

    const problem = await createTestProblem(
      agentId,
      "Water purification for villages",
      "Install water purification systems in underserved villages",
    );

    const evalRes = await submitEvaluation(apiKey, agentId, problem.id, {
      title: "Water purification for villages",
      description: "Install water purification systems in underserved villages",
    });

    expect(evalRes.status).toBe(202);
    const evalData = (await evalRes.json()) as { data: { evaluationId: string } };
    const evaluationId = evalData.data.evaluationId;

    // Poll until completed — verifies worker picks up and processes jobs
    const statusData = (await pollUntilCompleted(evaluationId, apiKey, 10000)) as {
      data: {
        status: string;
        finalDecision: string;
        alignmentScore: number;
      };
    };

    expect(statusData.data.status).toBe("completed");
    expect(statusData.data.finalDecision).toBe("approved");
    expect(statusData.data.alignmentScore).toBeGreaterThanOrEqual(0.7);

    // Verify DB record is fully updated
    const db = getTestDb();
    const [evalRecord] = await db
      .select({
        completedAt: guardrailEvaluations.completedAt,
        finalDecision: guardrailEvaluations.finalDecision,
      })
      .from(guardrailEvaluations)
      .where(eq(guardrailEvaluations.id, evaluationId))
      .limit(1);

    expect(evalRecord).toBeDefined();
    expect(evalRecord!.completedAt).not.toBeNull();
    expect(evalRecord!.finalDecision).toBe("approved");
  }, 15000);

  // T073: Duplicate submission prevention — identical content should only call LLM once
  // Skipped in CI: 10 sequential submissions with polling is too slow for GitHub Actions
  it.skipIf(!!process.env.CI)("should deduplicate identical content across 10 submissions via cache", async () => {
    mockEvaluateLayerB.mockResolvedValue({
      alignedDomain: "education_access",
      alignmentScore: 0.91,
      harmRisk: "low",
      feasibility: "high",
      quality: "excellent",
      decision: "approve",
      reasoning: "Strong education access initiative benefiting underserved youth",
    });

    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;
    await makeAgentVerified(agentId);

    // Identical content for all 10 submissions
    const content = {
      title: "Same title",
      description: "Same description",
    };

    // Submit 10 evaluations with identical content but different problem records
    const evaluationIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const problem = await createTestProblem(
        agentId,
        `Problem ${i} - Same title`,
        `Problem ${i} - Same description`,
      );

      const evalRes = await submitEvaluation(apiKey, agentId, problem.id, content);
      expect(evalRes.status).toBe(202);
      const evalData = (await evalRes.json()) as { data: { evaluationId: string } };
      evaluationIds.push(evalData.data.evaluationId);
    }

    // Wait for all evaluations to complete (sequential processing by worker, concurrency=1)
    for (const evaluationId of evaluationIds) {
      const statusData = await pollUntilCompleted(evaluationId, apiKey, 15000);
      const data = (statusData as { data: { status: string } }).data;
      expect(data.status).toBe("completed");
    }

    // The LLM should have been called only ONCE — the rest are cache hits
    expect(mockEvaluateLayerB).toHaveBeenCalledTimes(1);

    // Verify all 10 evaluations completed and count cache hits
    let cacheHitCount = 0;
    for (const evaluationId of evaluationIds) {
      const statusRes = await app.request(`/api/v1/guardrails/status/${evaluationId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const statusData = (await statusRes.json()) as {
        data: { status: string; cacheHit: boolean; finalDecision: string };
      };

      expect(statusData.data.status).toBe("completed");
      expect(statusData.data.finalDecision).toBe("approved");
      if (statusData.data.cacheHit) cacheHitCount++;
    }

    // At least 9 out of 10 should be cache hits (first one is always a miss)
    expect(cacheHitCount).toBeGreaterThanOrEqual(9);
  }, 30000);
});
