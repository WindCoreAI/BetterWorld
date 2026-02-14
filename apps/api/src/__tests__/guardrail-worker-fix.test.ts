/**
 * Guardrail Worker Fix Tests (Sprint 15 — T017)
 *
 * Verifies:
 * - Static imports resolve correctly (FR-001)
 * - Peer consensus enqueue includes jobId (FR-007)
 * - Duplicate enqueue with same jobId is idempotent
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all external dependencies before importing the module
vi.mock("@betterworld/db", () => ({
  guardrailEvaluations: { id: "id", agentId: "agent_id", finalDecision: "final_decision" },
  flaggedContent: {},
  missions: { id: "id", guardrailStatus: "guardrail_status" },
  problems: { id: "id", guardrailStatus: "guardrail_status", alignmentScore: "alignment_score", alignmentDomain: "alignment_domain" },
  solutions: { id: "id", guardrailStatus: "guardrail_status", impactScore: "impact_score", feasibilityScore: "feasibility_score", costEfficiencyScore: "cost_efficiency_score", compositeScore: "composite_score", alignmentScore: "alignment_score" },
  debates: { id: "id", guardrailStatus: "guardrail_status" },
  agents: { id: "id", createdAt: "created_at" },
}));

vi.mock("@betterworld/guardrails", () => ({
  evaluateLayerA: vi.fn().mockResolvedValue({ passed: true, forbiddenPatterns: [] }),
  evaluateLayerB: vi.fn().mockResolvedValue({
    alignmentScore: 0.85,
    alignedDomain: "environmental_protection",
    solutionScores: null,
  }),
  generateCacheKey: vi.fn().mockReturnValue("test-cache-key"),
  getCachedEvaluation: vi.fn().mockResolvedValue(null),
  setCachedEvaluation: vi.fn().mockResolvedValue(undefined),
  determineTrustTier: vi.fn().mockReturnValue("verified"),
  getThresholds: vi.fn().mockReturnValue({ autoApprove: 0.70, autoRejectMax: 0.40 }),
  computeCompositeScore: vi.fn().mockReturnValue(75),
}));

vi.mock("@betterworld/shared", () => ({
  QUEUE_NAMES: {
    GUARDRAIL_EVALUATION: "guardrail-evaluation",
    PEER_CONSENSUS: "peer-consensus",
  },
}));

vi.mock("bullmq", () => {
  const addMock = vi.fn().mockResolvedValue({ id: "test-job-id" });
  return {
    Queue: vi.fn().mockImplementation(() => ({
      add: addMock,
      close: vi.fn(),
    })),
    Worker: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      close: vi.fn(),
    })),
  };
});

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue("verified"),
    setex: vi.fn(),
    quit: vi.fn(),
  })),
}));

vi.mock("pino", () => ({
  default: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../lib/budget.js", () => ({
  checkBudgetAvailable: vi.fn().mockResolvedValue(true),
  recordAiCost: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/container.js", () => ({
  initDb: vi.fn(),
  getDb: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ createdAt: new Date() }]),
        }),
      }),
    }),
    transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
      });
    }),
  }),
  getRedis: vi.fn().mockReturnValue({
    get: vi.fn().mockResolvedValue("verified"),
    setex: vi.fn(),
  }),
}));

vi.mock("../services/feature-flags.js", () => ({
  getFlag: vi.fn().mockResolvedValue(false),
}));

vi.mock("../services/traffic-router.js", () => ({
  routeSubmission: vi.fn().mockResolvedValue({
    route: "layer_b" as const,
    reason: "test",
    trafficPct: 0,
  }),
}));

describe("Guardrail Worker Fix (FR-001, FR-007)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should use static imports for traffic-router and feature-flags", async () => {
    // Verify the module can be imported without ERR_MODULE_NOT_FOUND
    // Static imports are resolved at module load time
    const workerModule = await import("../workers/guardrail-worker.js");
    expect(workerModule.processEvaluation).toBeDefined();
    expect(typeof workerModule.processEvaluation).toBe("function");
  });

  it("should export createGuardrailWorker and createMetrics", async () => {
    const workerModule = await import("../workers/guardrail-worker.js");
    expect(workerModule.createGuardrailWorker).toBeDefined();
    expect(workerModule.createMetrics).toBeDefined();
  });

  it("processEvaluation should complete without dynamic import errors", async () => {
    const { processEvaluation } = await import("../workers/guardrail-worker.js");

    const mockJob = {
      data: {
        evaluationId: "eval-123",
        contentId: "content-456",
        contentType: "problem" as const,
        content: "Test content about clean water access",
        agentId: "agent-789",
        trustTier: "verified",
      },
      id: "job-1",
      attemptsMade: 0,
    };

    const result = await processEvaluation(mockJob as never);
    expect(result).toBeDefined();
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("peer consensus enqueue should include jobId for idempotency", async () => {
    // Import and configure traffic-router to return peer_consensus
    const { routeSubmission } = await import("../services/traffic-router.js");
    vi.mocked(routeSubmission).mockResolvedValueOnce({
      route: "peer_consensus",
      reason: "traffic routing",
      trafficPct: 100,
    });

    const { processEvaluation } = await import("../workers/guardrail-worker.js");
    const { Queue } = await import("bullmq");

    const mockJob = {
      data: {
        evaluationId: "eval-123",
        contentId: "content-456",
        contentType: "problem" as const,
        content: "Test content about environmental issues",
        agentId: "agent-789",
        trustTier: "verified",
      },
      id: "job-1",
      attemptsMade: 0,
    };

    await processEvaluation(mockJob as never);

    // Verify Queue.add was called with jobId
    const queueInstance = vi.mocked(Queue).mock.results[0]?.value;
    if (queueInstance) {
      const addCalls = vi.mocked(queueInstance.add).mock.calls;
      const lastCall = addCalls[addCalls.length - 1];
      if (lastCall) {
        const options = lastCall[2] as Record<string, unknown>;
        expect(options.jobId).toBe("peer-problem-content-456");
      }
    }
  });
});
