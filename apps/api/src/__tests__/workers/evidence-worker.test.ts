/**
 * Evidence Worker Tests (Sprint 8 -- T021)
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{
          type: "tool_use",
          id: "tu_1",
          name: "verify_evidence",
          input: {
            relevanceScore: 0.9,
            gpsPlausibility: 0.85,
            timestampPlausibility: 0.9,
            authenticityScore: 0.95,
            requirementChecklist: [],
            overallConfidence: 0.88,
            reasoning: "Good evidence",
          },
        }],
      }),
    },
  })),
}));

vi.mock("../../../src/lib/container.js", () => ({
  getDb: vi.fn(() => null),
  getRedis: vi.fn(() => null),
  initDb: vi.fn(),
}));

vi.mock("../../../src/lib/reward-helpers.js", () => ({
  distributeEvidenceReward: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../../src/lib/peer-assignment.js", () => ({
  selectPeerReviewers: vi.fn().mockResolvedValue([]),
}));

describe("Evidence Verification Worker", () => {
  it("should export createEvidenceVerificationWorker", async () => {
    const mod = await import("../../workers/evidence-verification.js");
    expect(typeof mod.createEvidenceVerificationWorker).toBe("function");
  });

  it("should export processEvidenceVerification", async () => {
    const mod = await import("../../workers/evidence-verification.js");
    expect(typeof mod.processEvidenceVerification).toBe("function");
  });

  it("should handle null database gracefully", async () => {
    const { processEvidenceVerification } = await import("../../workers/evidence-verification.js");
    await expect(processEvidenceVerification(null, null, "test-id")).rejects.toThrow(
      "Database not initialized",
    );
  });

  it("should handle undefined evidenceId", async () => {
    const mockDb = { select: vi.fn(), insert: vi.fn(), update: vi.fn() };
    const { processEvidenceVerification } = await import("../../workers/evidence-verification.js");
    // Should return early without error
    await processEvidenceVerification((mockDb as unknown) as null, null, undefined);
  });
});
