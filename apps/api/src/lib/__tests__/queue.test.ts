import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ioredis and bullmq before importing the module under test
const mockQueueInstance = {
  add: vi.fn(),
  count: vi.fn().mockResolvedValue(0),
  close: vi.fn(),
};

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => mockQueueInstance),
}));

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({
    quit: vi.fn(),
  })),
}));

vi.mock("pino", () => ({
  default: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("Guardrail Evaluation Queue", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("should export getGuardrailEvaluationQueue function", async () => {
    const { getGuardrailEvaluationQueue } = await import("../queue");
    expect(typeof getGuardrailEvaluationQueue).toBe("function");
  });

  it("should return a Queue instance", async () => {
    const { getGuardrailEvaluationQueue } = await import("../queue");
    const queue = getGuardrailEvaluationQueue();
    expect(queue).toBeDefined();
  });

  it("should return the same instance on repeated calls (singleton)", async () => {
    const { getGuardrailEvaluationQueue } = await import("../queue");
    const q1 = getGuardrailEvaluationQueue();
    const q2 = getGuardrailEvaluationQueue();
    expect(q1).toBe(q2);
  });
});
