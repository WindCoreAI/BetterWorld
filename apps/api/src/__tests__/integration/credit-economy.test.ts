import { describe, it, expect, vi, beforeEach } from "vitest";

import { deductSubmissionCost } from "../../services/submission-cost.service.js";

// ── Mock dependencies ────────────────────────────────────────────

let mockCostsEnabled = false;
let mockCostMultiplier = 1.0;

vi.mock("../../services/feature-flags.js", () => ({
  getFlag: vi.fn(async (_redis: unknown, name: string) => {
    if (name === "SUBMISSION_COSTS_ENABLED") return mockCostsEnabled;
    if (name === "SUBMISSION_COST_MULTIPLIER") return mockCostMultiplier;
    if (name === "VALIDATION_REWARDS_ENABLED") return false;
    return 0;
  }),
  getFeatureFlags: vi.fn(),
  setFlag: vi.fn(),
  resetFlag: vi.fn(),
  invalidateFlagCache: vi.fn(),
}));

const mockGetBalance = vi.fn();
const mockSpendCredits = vi.fn();

vi.mock("../../services/agent-credit.service.js", () => ({
  AgentCreditService: vi.fn().mockImplementation(() => ({
    getBalance: mockGetBalance,
    spendCredits: mockSpendCredits,
  })),
}));

// ── Tests ────────────────────────────────────────────────────────

const AGENT_ID = "agent-uuid-1";
const CONTENT_ID = "content-uuid-1";

describe("Credit Economy — Submission Costs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCostsEnabled = false;
    mockCostMultiplier = 1.0;
  });

  it("returns zero cost when SUBMISSION_COSTS_ENABLED is false", async () => {
    mockCostsEnabled = false;

    const result = await deductSubmissionCost(
      {} as never,
      null,
      AGENT_ID,
      "problem",
      CONTENT_ID,
    );

    expect(result.costDeducted).toBe(0);
    expect(result.hardshipApplied).toBe(false);
    expect(result.transactionId).toBeNull();
    expect(mockGetBalance).not.toHaveBeenCalled();
  });

  it("deducts 2 credits for problem at full rate", async () => {
    mockCostsEnabled = true;
    mockCostMultiplier = 1.0;
    mockGetBalance.mockResolvedValue(50);
    mockSpendCredits.mockResolvedValue({
      transactionId: "tx-1",
      balanceAfter: 48,
    });

    const result = await deductSubmissionCost(
      {} as never,
      null,
      AGENT_ID,
      "problem",
      CONTENT_ID,
    );

    expect(result.costDeducted).toBe(2);
    expect(result.hardshipApplied).toBe(false);
    expect(result.transactionId).toBe("tx-1");
    expect(mockSpendCredits).toHaveBeenCalledWith(
      AGENT_ID,
      2,
      "spend_submission_problem",
      CONTENT_ID,
      `submission:${CONTENT_ID}`,
      expect.any(String),
    );
  });

  it("deducts 5 credits for solution at full rate", async () => {
    mockCostsEnabled = true;
    mockGetBalance.mockResolvedValue(100);
    mockSpendCredits.mockResolvedValue({
      transactionId: "tx-2",
      balanceAfter: 95,
    });

    const result = await deductSubmissionCost(
      {} as never,
      null,
      AGENT_ID,
      "solution",
      CONTENT_ID,
    );

    expect(result.costDeducted).toBe(5);
    expect(mockSpendCredits).toHaveBeenCalledWith(
      AGENT_ID,
      5,
      "spend_submission_solution",
      expect.anything(),
      expect.anything(),
      expect.any(String),
    );
  });

  it("deducts 1 credit for debate at full rate", async () => {
    mockCostsEnabled = true;
    mockGetBalance.mockResolvedValue(20);
    mockSpendCredits.mockResolvedValue({
      transactionId: "tx-3",
      balanceAfter: 19,
    });

    const result = await deductSubmissionCost(
      {} as never,
      null,
      AGENT_ID,
      "debate",
      CONTENT_ID,
    );

    expect(result.costDeducted).toBe(1);
  });

  it("applies half-rate multiplier (0.5) — problem cost rounds to 1", async () => {
    mockCostsEnabled = true;
    mockCostMultiplier = 0.5;
    mockGetBalance.mockResolvedValue(30);
    mockSpendCredits.mockResolvedValue({
      transactionId: "tx-4",
      balanceAfter: 29,
    });

    const result = await deductSubmissionCost(
      {} as never,
      null,
      AGENT_ID,
      "problem",
      CONTENT_ID,
    );

    // Math.max(1, Math.round(2 * 0.5)) = Math.max(1, 1) = 1
    expect(result.costDeducted).toBe(1);
  });

  it("applies half-rate multiplier (0.5) — solution cost rounds to 3", async () => {
    mockCostsEnabled = true;
    mockCostMultiplier = 0.5;
    mockGetBalance.mockResolvedValue(30);
    mockSpendCredits.mockResolvedValue({
      transactionId: "tx-5",
      balanceAfter: 27,
    });

    const result = await deductSubmissionCost(
      {} as never,
      null,
      AGENT_ID,
      "solution",
      CONTENT_ID,
    );

    // Math.max(1, Math.round(5 * 0.5)) = Math.max(1, 3) = 3
    expect(result.costDeducted).toBe(3);
  });

  it("activates hardship protection when balance < 10", async () => {
    mockCostsEnabled = true;
    mockGetBalance.mockResolvedValue(8);

    const result = await deductSubmissionCost(
      {} as never,
      null,
      AGENT_ID,
      "problem",
      CONTENT_ID,
    );

    expect(result.costDeducted).toBe(0);
    expect(result.hardshipApplied).toBe(true);
    expect(result.balanceBefore).toBe(8);
    expect(result.balanceAfter).toBe(8);
    expect(result.transactionId).toBeNull();
    expect(mockSpendCredits).not.toHaveBeenCalled();
  });

  it("activates hardship protection at balance = 0", async () => {
    mockCostsEnabled = true;
    mockGetBalance.mockResolvedValue(0);

    const result = await deductSubmissionCost(
      {} as never,
      null,
      AGENT_ID,
      "solution",
      CONTENT_ID,
    );

    expect(result.costDeducted).toBe(0);
    expect(result.hardshipApplied).toBe(true);
  });

  it("throws INSUFFICIENT_TOKENS when spendCredits returns null", async () => {
    mockCostsEnabled = true;
    mockGetBalance.mockResolvedValue(15); // above hardship, but spendCredits fails
    mockSpendCredits.mockResolvedValue(null);

    await expect(
      deductSubmissionCost(
        {} as never,
        null,
        AGENT_ID,
        "solution",
        CONTENT_ID,
      ),
    ).rejects.toThrow(/Insufficient credits/);
  });

  it("uses idempotency key based on contentId", async () => {
    mockCostsEnabled = true;
    mockGetBalance.mockResolvedValue(50);
    mockSpendCredits.mockResolvedValue({
      transactionId: "tx-idem",
      balanceAfter: 48,
    });

    await deductSubmissionCost(
      {} as never,
      null,
      AGENT_ID,
      "problem",
      "specific-content-id",
    );

    expect(mockSpendCredits).toHaveBeenCalledWith(
      AGENT_ID,
      2,
      "spend_submission_problem",
      "specific-content-id",
      "submission:specific-content-id",
      expect.any(String),
    );
  });
});
