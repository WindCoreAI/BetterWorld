import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so mock fns are available when vi.mock factory runs
const { mockReturning, mockQueueAdd } = vi.hoisted(() => ({
  mockReturning: vi.fn(),
  mockQueueAdd: vi.fn(),
}));

// Track the values passed to insert.values()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedValues: any = null;

// Mock @betterworld/db
vi.mock("@betterworld/db", () => ({
  guardrailEvaluations: {
    id: "id",
    contentId: "contentId",
    contentType: "contentType",
    agentId: "agentId",
    submittedContent: "submittedContent",
    layerAResult: "layerAResult",
    finalDecision: "finalDecision",
    trustTier: "trustTier",
  },
}));

// Mock queue
vi.mock("../lib/queue.js", () => ({
  getGuardrailEvaluationQueue: vi.fn(() => ({
    add: mockQueueAdd,
  })),
}));

import { enqueueForEvaluation } from "../lib/guardrail-helpers.js";

describe("Guardrail Helpers", () => {
  // Create a mock DB with insert chain
  const mockDb = {
    insert: vi.fn(() => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      values: vi.fn((vals: any) => {
        capturedValues = vals; // Capture the values
        return {
          returning: mockReturning,
        };
      }),
    })),
  } as unknown as PostgresJsDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedValues = null;
  });

  describe("enqueueForEvaluation", () => {
    it("should create guardrail evaluation record with correct shape", async () => {
      const evaluationId = "eval-123";
      mockReturning.mockResolvedValue([{ id: evaluationId }]);
      mockQueueAdd.mockResolvedValue({ id: evaluationId });

      const params = {
        contentId: "problem-456",
        contentType: "problem" as const,
        content: "Community food bank needs volunteers",
        agentId: "agent-789",
      };

      await enqueueForEvaluation(mockDb, params);

      // Verify DB insert was called
      expect(mockDb.insert).toHaveBeenCalledOnce();

      // Verify values() was called with correct shape
      expect(capturedValues).toMatchObject({
        contentId: "problem-456",
        contentType: "problem",
        agentId: "agent-789",
        submittedContent: "Community food bank needs volunteers",
        finalDecision: "flagged",
        trustTier: "new",
      });
      expect(capturedValues.layerAResult).toContain('"passed":false');
    });

    it("should enqueue BullMQ job with correct data", async () => {
      const evaluationId = "eval-abc";
      mockReturning.mockResolvedValue([{ id: evaluationId }]);
      mockQueueAdd.mockResolvedValue({ id: evaluationId });

      const params = {
        contentId: "solution-xyz",
        contentType: "solution" as const,
        content: "Build a mobile app for food rescue",
        agentId: "agent-123",
      };

      await enqueueForEvaluation(mockDb, params);

      // Verify queue.add was called with correct job data
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "evaluate",
        {
          evaluationId,
          contentId: "solution-xyz",
          contentType: "solution",
          content: "Build a mobile app for food rescue",
          agentId: "agent-123",
          trustTier: "new",
        },
        expect.objectContaining({ jobId: evaluationId }),
      );
    });

    it("should return evaluation ID", async () => {
      const evaluationId = "eval-return-test";
      mockReturning.mockResolvedValue([{ id: evaluationId }]);
      mockQueueAdd.mockResolvedValue({ id: evaluationId });

      const params = {
        contentId: "debate-999",
        contentType: "debate" as const,
        content: "This solution is too expensive",
        agentId: "agent-critic",
      };

      const result = await enqueueForEvaluation(mockDb, params);

      expect(result).toBe(evaluationId);
    });

    it("should throw if DB insert fails", async () => {
      mockReturning.mockResolvedValue([]); // Empty array = no row returned

      const params = {
        contentId: "problem-fail",
        contentType: "problem" as const,
        content: "Test content",
        agentId: "agent-fail",
      };

      await expect(enqueueForEvaluation(mockDb, params)).rejects.toThrow(
        "Failed to create guardrail evaluation record",
      );

      // Queue should not be called if DB insert fails
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it("should throw if DB insert returns undefined", async () => {
      mockReturning.mockResolvedValue([undefined]); // Invalid response

      const params = {
        contentId: "problem-undef",
        contentType: "problem" as const,
        content: "Test content",
        agentId: "agent-undef",
      };

      await expect(enqueueForEvaluation(mockDb, params)).rejects.toThrow(
        "Failed to create guardrail evaluation record",
      );
    });

    it("should handle problem content type", async () => {
      const evaluationId = "eval-problem";
      mockReturning.mockResolvedValue([{ id: evaluationId }]);
      mockQueueAdd.mockResolvedValue({ id: evaluationId });

      const params = {
        contentId: "problem-001",
        contentType: "problem" as const,
        content: "Homelessness is increasing in our city",
        agentId: "agent-001",
      };

      const result = await enqueueForEvaluation(mockDb, params);

      expect(result).toBe(evaluationId);
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "evaluate",
        expect.objectContaining({ contentType: "problem" }),
        expect.any(Object),
      );
    });

    it("should handle solution content type", async () => {
      const evaluationId = "eval-solution";
      mockReturning.mockResolvedValue([{ id: evaluationId }]);
      mockQueueAdd.mockResolvedValue({ id: evaluationId });

      const params = {
        contentId: "solution-002",
        contentType: "solution" as const,
        content: "Create a shelter booking system",
        agentId: "agent-002",
      };

      const result = await enqueueForEvaluation(mockDb, params);

      expect(result).toBe(evaluationId);
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "evaluate",
        expect.objectContaining({ contentType: "solution" }),
        expect.any(Object),
      );
    });

    it("should handle debate content type", async () => {
      const evaluationId = "eval-debate";
      mockReturning.mockResolvedValue([{ id: evaluationId }]);
      mockQueueAdd.mockResolvedValue({ id: evaluationId });

      const params = {
        contentId: "debate-003",
        contentType: "debate" as const,
        content: "I disagree with this approach because...",
        agentId: "agent-003",
      };

      const result = await enqueueForEvaluation(mockDb, params);

      expect(result).toBe(evaluationId);
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "evaluate",
        expect.objectContaining({ contentType: "debate" }),
        expect.any(Object),
      );
    });

    it("should set placeholder layerAResult in correct JSON format", async () => {
      const evaluationId = "eval-placeholder";
      mockReturning.mockResolvedValue([{ id: evaluationId }]);
      mockQueueAdd.mockResolvedValue({ id: evaluationId });

      const params = {
        contentId: "problem-placeholder",
        contentType: "problem" as const,
        content: "Test content",
        agentId: "agent-placeholder",
      };

      await enqueueForEvaluation(mockDb, params);

      // Verify layerAResult is valid JSON with expected structure
      const layerAResult = JSON.parse(capturedValues.layerAResult);
      expect(layerAResult).toEqual({
        passed: false,
        forbiddenPatterns: [],
        executionTimeMs: 0,
      });
    });

    it("should always set finalDecision to 'flagged' as placeholder", async () => {
      const evaluationId = "eval-flagged";
      mockReturning.mockResolvedValue([{ id: evaluationId }]);
      mockQueueAdd.mockResolvedValue({ id: evaluationId });

      const params = {
        contentId: "problem-flagged",
        contentType: "problem" as const,
        content: "Test content",
        agentId: "agent-flagged",
      };

      await enqueueForEvaluation(mockDb, params);

      expect(capturedValues.finalDecision).toBe("flagged");
    });

    it("should always set trustTier to 'new' as placeholder", async () => {
      const evaluationId = "eval-trusttier";
      mockReturning.mockResolvedValue([{ id: evaluationId }]);
      mockQueueAdd.mockResolvedValue({ id: evaluationId });

      const params = {
        contentId: "problem-trusttier",
        contentType: "problem" as const,
        content: "Test content",
        agentId: "agent-trusttier",
      };

      await enqueueForEvaluation(mockDb, params);

      expect(capturedValues.trustTier).toBe("new");
    });

    it("should use evaluation ID as BullMQ jobId for idempotency", async () => {
      const evaluationId = "eval-idempotent";
      mockReturning.mockResolvedValue([{ id: evaluationId }]);
      mockQueueAdd.mockResolvedValue({ id: evaluationId });

      const params = {
        contentId: "problem-idempotent",
        contentType: "problem" as const,
        content: "Test content",
        agentId: "agent-idempotent",
      };

      await enqueueForEvaluation(mockDb, params);

      // Verify jobId matches evaluationId for idempotency
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "evaluate",
        expect.any(Object),
        expect.objectContaining({ jobId: evaluationId }),
      );
    });
  });
});
