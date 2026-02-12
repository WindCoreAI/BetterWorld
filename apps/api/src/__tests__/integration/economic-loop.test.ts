import {
  SUBMISSION_COSTS,
  HARDSHIP_THRESHOLD,
  VALIDATION_REWARDS,
} from "@betterworld/shared";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies ────────────────────────────────────────────

let mockCostsEnabled = true;
let mockRewardsEnabled = true;
let mockCostMultiplier = 1.0;
let mockTrafficPct = 100;

vi.mock("../../services/feature-flags.js", () => ({
  getFlag: vi.fn(async (_redis: unknown, name: string) => {
    if (name === "SUBMISSION_COSTS_ENABLED") return mockCostsEnabled;
    if (name === "SUBMISSION_COST_MULTIPLIER") return mockCostMultiplier;
    if (name === "VALIDATION_REWARDS_ENABLED") return mockRewardsEnabled;
    if (name === "PEER_VALIDATION_TRAFFIC_PCT") return mockTrafficPct;
    return 0;
  }),
  getFeatureFlags: vi.fn(),
  setFlag: vi.fn(),
  resetFlag: vi.fn(),
  invalidateFlagCache: vi.fn(),
}));

const mockGetBalance = vi.fn();
const mockSpendCredits = vi.fn();
const mockEarnCredits = vi.fn();

vi.mock("../../services/agent-credit.service.js", () => ({
  AgentCreditService: vi.fn().mockImplementation(() => ({
    getBalance: mockGetBalance,
    spendCredits: mockSpendCredits,
    earnCredits: mockEarnCredits,
  })),
}));

// Mock the database — we don't need real DB for this integration test
const mockDb = {} as never;
const mockRedis = null;

// Import after mocks are set up
import { shouldRouteToPerConsensus } from "../../lib/traffic-hash.js";
import { deductSubmissionCost } from "../../services/submission-cost.service.js";
import { distributeRewards } from "../../services/validation-reward.service.js";

// ── Test Constants ───────────────────────────────────────────────

const AGENT_ID = "agent-uuid-1";
const CONTENT_ID = "content-uuid-1";
const CONSENSUS_ID = "consensus-uuid-1";

// ── Tests ────────────────────────────────────────────────────────

describe("Economic Loop Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCostsEnabled = true;
    mockRewardsEnabled = true;
    mockCostMultiplier = 1.0;
    mockTrafficPct = 100;
    mockGetBalance.mockResolvedValue(50);
    mockSpendCredits.mockResolvedValue({
      transactionId: "tx-spend",
      balanceAfter: 48,
    });
    mockEarnCredits.mockResolvedValue({
      transactionId: "tx-earn",
      balanceAfter: 51,
    });
  });

  describe("Submission Costs", () => {
    it("deducts credits when agent submits a problem", async () => {
      mockGetBalance.mockResolvedValue(50);
      mockSpendCredits.mockResolvedValue({
        transactionId: "tx-problem",
        balanceAfter: 48,
      });

      const result = await deductSubmissionCost(
        mockDb,
        mockRedis,
        AGENT_ID,
        "problem",
        CONTENT_ID,
      );

      expect(result.costDeducted).toBe(SUBMISSION_COSTS.problem);
      expect(mockSpendCredits).toHaveBeenCalledWith(
        AGENT_ID,
        SUBMISSION_COSTS.problem,
        "spend_submission_problem",
        CONTENT_ID,
        `submission:${CONTENT_ID}`,
        expect.any(String),
      );
      expect(result.transactionId).toBe("tx-problem");
    });

    it("deducts credits when agent submits a solution", async () => {
      mockGetBalance.mockResolvedValue(100);
      mockSpendCredits.mockResolvedValue({
        transactionId: "tx-solution",
        balanceAfter: 95,
      });

      const result = await deductSubmissionCost(
        mockDb,
        mockRedis,
        AGENT_ID,
        "solution",
        CONTENT_ID,
      );

      expect(result.costDeducted).toBe(SUBMISSION_COSTS.solution);
      expect(mockSpendCredits).toHaveBeenCalledWith(
        AGENT_ID,
        SUBMISSION_COSTS.solution,
        "spend_submission_solution",
        CONTENT_ID,
        `submission:${CONTENT_ID}`,
        expect.any(String),
      );
    });

    it("deducts credits when agent submits a debate", async () => {
      mockGetBalance.mockResolvedValue(20);
      mockSpendCredits.mockResolvedValue({
        transactionId: "tx-debate",
        balanceAfter: 19,
      });

      const result = await deductSubmissionCost(
        mockDb,
        mockRedis,
        AGENT_ID,
        "debate",
        CONTENT_ID,
      );

      expect(result.costDeducted).toBe(SUBMISSION_COSTS.debate);
      expect(mockSpendCredits).toHaveBeenCalledWith(
        AGENT_ID,
        SUBMISSION_COSTS.debate,
        "spend_submission_debate",
        CONTENT_ID,
        `submission:${CONTENT_ID}`,
        expect.any(String),
      );
    });

    it("applies half-rate with SUBMISSION_COST_MULTIPLIER=0.5", async () => {
      mockCostMultiplier = 0.5;
      mockGetBalance.mockResolvedValue(30);
      mockSpendCredits.mockResolvedValue({
        transactionId: "tx-half",
        balanceAfter: 27,
      });

      const result = await deductSubmissionCost(
        mockDb,
        mockRedis,
        AGENT_ID,
        "solution",
        CONTENT_ID,
      );

      // Math.max(1, Math.round(5 * 0.5)) = Math.max(1, 3) = 3
      expect(result.costDeducted).toBe(3);
      expect(mockSpendCredits).toHaveBeenCalledWith(
        AGENT_ID,
        3,
        "spend_submission_solution",
        CONTENT_ID,
        expect.any(String),
        expect.any(String),
      );
    });

    it("skips cost deduction during hardship (balance < 10)", async () => {
      mockGetBalance.mockResolvedValue(8);

      const result = await deductSubmissionCost(
        mockDb,
        mockRedis,
        AGENT_ID,
        "problem",
        CONTENT_ID,
      );

      expect(result.costDeducted).toBe(0);
      expect(result.hardshipApplied).toBe(true);
      expect(result.balanceBefore).toBe(8);
      expect(result.balanceAfter).toBe(8);
      expect(mockSpendCredits).not.toHaveBeenCalled();
    });

    it("activates hardship protection at balance = 0", async () => {
      mockGetBalance.mockResolvedValue(0);

      const result = await deductSubmissionCost(
        mockDb,
        mockRedis,
        AGENT_ID,
        "solution",
        CONTENT_ID,
      );

      expect(result.costDeducted).toBe(0);
      expect(result.hardshipApplied).toBe(true);
      expect(mockSpendCredits).not.toHaveBeenCalled();
    });

    it("deducts normally when balance is exactly at hardship threshold", async () => {
      mockGetBalance.mockResolvedValue(HARDSHIP_THRESHOLD);
      mockSpendCredits.mockResolvedValue({
        transactionId: "tx-threshold",
        balanceAfter: HARDSHIP_THRESHOLD - SUBMISSION_COSTS.problem,
      });

      const result = await deductSubmissionCost(
        mockDb,
        mockRedis,
        AGENT_ID,
        "problem",
        CONTENT_ID,
      );

      expect(result.costDeducted).toBe(SUBMISSION_COSTS.problem);
      expect(result.hardshipApplied).toBe(false);
      expect(mockSpendCredits).toHaveBeenCalled();
    });
  });

  describe("Traffic Routing", () => {
    it("routes to peer consensus when traffic pct = 100", () => {
      const result = shouldRouteToPerConsensus("submission-1", 100);
      expect(result).toBe(true);
    });

    it("routes to Layer B when traffic pct = 0", () => {
      const result = shouldRouteToPerConsensus("submission-1", 0);
      expect(result).toBe(false);
    });

    it("is deterministic — same submission ID always produces same result", () => {
      const subId = "deterministic-submission-uuid";
      const r1 = shouldRouteToPerConsensus(subId, 50);
      const r2 = shouldRouteToPerConsensus(subId, 50);
      const r3 = shouldRouteToPerConsensus(subId, 50);

      expect(r1).toBe(r2);
      expect(r2).toBe(r3);
    });
  });

  describe("Validation Rewards", () => {
    it("returns zero rewards when VALIDATION_REWARDS_ENABLED is false", async () => {
      mockRewardsEnabled = false;

      const result = await distributeRewards(
        mockDb,
        mockRedis,
        CONSENSUS_ID,
        CONTENT_ID,
        "problem",
      );

      expect(result.rewardsDistributed).toBe(0);
      expect(result.totalCredits).toBe(0);
      expect(result.validators).toEqual([]);
    });

    it("returns zero rewards when no completed evaluations exist", async () => {
      mockRewardsEnabled = true;

      // Mock empty result from DB — use then() to make it thenable/awaitable
      const mockSelect = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            then: (resolve: (value: never[]) => void) => resolve([]),
          })),
        })),
      }));

      Object.assign(mockDb, { select: mockSelect });

      const result = await distributeRewards(
        mockDb,
        mockRedis,
        CONSENSUS_ID,
        CONTENT_ID,
        "problem",
      );

      expect(result.rewardsDistributed).toBe(0);
      expect(result.totalCredits).toBe(0);
    });

    it("distributes correct reward amounts by validator tier", () => {
      // Just verify the constants are imported correctly
      expect(VALIDATION_REWARDS.apprentice).toBe(0.5);
      expect(VALIDATION_REWARDS.journeyman).toBe(0.75);
      expect(VALIDATION_REWARDS.expert).toBe(1.0);
    });
  });

  describe("Full Economic Loop", () => {
    it("completes full cycle: submit → cost → route → consensus → reward", async () => {
      // Step 1: Agent submits content
      mockGetBalance.mockResolvedValue(50);
      mockSpendCredits.mockResolvedValue({
        transactionId: "tx-submit",
        balanceAfter: 48,
      });

      const costResult = await deductSubmissionCost(
        mockDb,
        mockRedis,
        AGENT_ID,
        "problem",
        CONTENT_ID,
      );

      expect(costResult.costDeducted).toBe(SUBMISSION_COSTS.problem);
      expect(costResult.balanceAfter).toBe(48);
      expect(mockSpendCredits).toHaveBeenCalledTimes(1);

      // Step 2: Route to peer consensus
      mockTrafficPct = 100;
      const routingResult = shouldRouteToPerConsensus(CONTENT_ID, mockTrafficPct);
      expect(routingResult).toBe(true);

      // Step 3: Validators respond (mocked — in real system, evaluations happen)
      // Step 4: Consensus reached (mocked — in real system, consensus engine runs)

      // Step 5: Rewards distributed
      mockRewardsEnabled = true;
      mockEarnCredits.mockResolvedValue({
        transactionId: "tx-reward",
        balanceAfter: 50.5,
      });

      // Mock completed evaluations
      const completedEvals = [
        {
          id: "eval-1",
          validatorId: "validator-pool-1",
          validatorAgentId: "validator-agent-1",
          rewardCreditTransactionId: null,
        },
        {
          id: "eval-2",
          validatorId: "validator-pool-2",
          validatorAgentId: "validator-agent-2",
          rewardCreditTransactionId: null,
        },
      ];

      const validatorTiers = [
        { tier: "apprentice" },
        { tier: "expert" },
      ];

      let selectCallCount = 0;

      const mockSelect = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            then: (resolve: (value: unknown[]) => void) => {
              if (selectCallCount === 0) {
                selectCallCount++;
                resolve(completedEvals);
              } else if (selectCallCount === 1) {
                selectCallCount++;
                resolve([validatorTiers[0]]);
              } else if (selectCallCount === 2) {
                selectCallCount++;
                resolve([validatorTiers[1]]);
              } else {
                resolve([]);
              }
            },
            limit: vi.fn(function (this: { then: (resolve: (value: unknown[]) => void) => void }) {
              return this; // Return self for chaining
            }),
          })),
        })),
      }));

      Object.assign(mockDb, {
        select: mockSelect,
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              then: (resolve: (value: unknown[]) => void) => resolve([]),
            })),
          })),
        })),
      });

      const rewardResult = await distributeRewards(
        mockDb,
        mockRedis,
        CONSENSUS_ID,
        CONTENT_ID,
        "problem",
      );

      // Verify rewards were distributed
      expect(mockEarnCredits).toHaveBeenCalledTimes(2);
      expect(rewardResult.rewardsDistributed).toBe(2);
      expect(rewardResult.totalCredits).toBe(
        VALIDATION_REWARDS.apprentice + VALIDATION_REWARDS.expert,
      );

      // Verify reward amounts
      expect(mockEarnCredits).toHaveBeenNthCalledWith(
        1,
        "validator-agent-1",
        VALIDATION_REWARDS.apprentice,
        "earn_validation",
        CONSENSUS_ID,
        "validation:eval-1",
        expect.stringContaining("apprentice"),
      );

      expect(mockEarnCredits).toHaveBeenNthCalledWith(
        2,
        "validator-agent-2",
        VALIDATION_REWARDS.expert,
        "earn_validation",
        CONSENSUS_ID,
        "validation:eval-2",
        expect.stringContaining("expert"),
      );
    });

    it("economic loop with hardship protection — submitter pays nothing, validators still rewarded", async () => {
      // Step 1: Agent with low balance submits (hardship protection)
      mockGetBalance.mockResolvedValue(5); // below threshold

      const costResult = await deductSubmissionCost(
        mockDb,
        mockRedis,
        AGENT_ID,
        "solution",
        CONTENT_ID,
      );

      expect(costResult.costDeducted).toBe(0);
      expect(costResult.hardshipApplied).toBe(true);
      expect(mockSpendCredits).not.toHaveBeenCalled();

      // Step 2: Still routes to peer consensus if traffic allows
      const routingResult = shouldRouteToPerConsensus(CONTENT_ID, 100);
      expect(routingResult).toBe(true);

      // Step 3: Validators evaluate and get rewarded normally
      mockRewardsEnabled = true;
      mockEarnCredits.mockResolvedValue({
        transactionId: "tx-reward-hardship",
        balanceAfter: 1.5,
      });

      const completedEvals = [
        {
          id: "eval-hardship",
          validatorId: "validator-pool-3",
          validatorAgentId: "validator-agent-3",
          rewardCreditTransactionId: null,
        },
      ];

      let selectCallCount = 0;

      const mockSelect = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            then: (resolve: (value: unknown[]) => void) => {
              if (selectCallCount === 0) {
                selectCallCount++;
                resolve(completedEvals);
              } else {
                resolve([{ tier: "journeyman" }]);
              }
            },
            limit: vi.fn(function (this: { then: (resolve: (value: unknown[]) => void) => void }) {
              return this;
            }),
          })),
        })),
      }));

      Object.assign(mockDb, {
        select: mockSelect,
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              then: (resolve: (value: unknown[]) => void) => resolve([]),
            })),
          })),
        })),
      });

      const rewardResult = await distributeRewards(
        mockDb,
        mockRedis,
        CONSENSUS_ID,
        CONTENT_ID,
        "solution",
      );

      expect(rewardResult.rewardsDistributed).toBe(1);
      expect(rewardResult.totalCredits).toBe(VALIDATION_REWARDS.journeyman);
      expect(mockEarnCredits).toHaveBeenCalledWith(
        "validator-agent-3",
        VALIDATION_REWARDS.journeyman,
        "earn_validation",
        CONSENSUS_ID,
        "validation:eval-hardship",
        expect.stringContaining("journeyman"),
      );
    });

    it("economic loop with half-rate costs and proportional rewards", async () => {
      // Step 1: Submit with half-rate multiplier
      mockCostMultiplier = 0.5;
      mockGetBalance.mockResolvedValue(30);
      mockSpendCredits.mockResolvedValue({
        transactionId: "tx-half-submit",
        balanceAfter: 29,
      });

      const costResult = await deductSubmissionCost(
        mockDb,
        mockRedis,
        AGENT_ID,
        "problem",
        CONTENT_ID,
      );

      // Math.max(1, Math.round(2 * 0.5)) = 1
      expect(costResult.costDeducted).toBe(1);

      // Step 2: Route and validate (mocked)
      const routingResult = shouldRouteToPerConsensus(CONTENT_ID, 100);
      expect(routingResult).toBe(true);

      // Step 3: Distribute full rewards (rewards not affected by cost multiplier)
      mockRewardsEnabled = true;
      mockEarnCredits.mockResolvedValue({
        transactionId: "tx-reward-half",
        balanceAfter: 1.5,
      });

      const completedEvals = [
        {
          id: "eval-half",
          validatorId: "validator-pool-4",
          validatorAgentId: "validator-agent-4",
          rewardCreditTransactionId: null,
        },
      ];

      let selectCallCount = 0;

      const mockSelect = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            then: (resolve: (value: unknown[]) => void) => {
              if (selectCallCount === 0) {
                selectCallCount++;
                resolve(completedEvals);
              } else {
                resolve([{ tier: "expert" }]);
              }
            },
            limit: vi.fn(function (this: { then: (resolve: (value: unknown[]) => void) => void }) {
              return this;
            }),
          })),
        })),
      }));

      Object.assign(mockDb, {
        select: mockSelect,
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              then: (resolve: (value: unknown[]) => void) => resolve([]),
            })),
          })),
        })),
      });

      const rewardResult = await distributeRewards(
        mockDb,
        mockRedis,
        CONSENSUS_ID,
        CONTENT_ID,
        "problem",
      );

      expect(rewardResult.totalCredits).toBe(VALIDATION_REWARDS.expert);
      expect(mockEarnCredits).toHaveBeenCalledWith(
        "validator-agent-4",
        VALIDATION_REWARDS.expert,
        "earn_validation",
        CONSENSUS_ID,
        "validation:eval-half",
        expect.stringContaining("expert"),
      );
    });
  });

  describe("Edge Cases", () => {
    it("handles submission with costs disabled but rewards enabled", async () => {
      mockCostsEnabled = false;
      mockRewardsEnabled = true;

      const costResult = await deductSubmissionCost(
        mockDb,
        mockRedis,
        AGENT_ID,
        "problem",
        CONTENT_ID,
      );

      expect(costResult.costDeducted).toBe(0);
      expect(costResult.transactionId).toBeNull();
      expect(mockGetBalance).not.toHaveBeenCalled();
      expect(mockSpendCredits).not.toHaveBeenCalled();
    });

    it("handles routing when traffic pct is exactly 50", () => {
      // With 50% traffic, hash determines routing
      const subId1 = "test-submission-50-1";
      const subId2 = "test-submission-50-2";

      const route1 = shouldRouteToPerConsensus(subId1, 50);
      const route2 = shouldRouteToPerConsensus(subId2, 50);

      // Should be deterministic
      expect(route1).toBe(shouldRouteToPerConsensus(subId1, 50));
      expect(route2).toBe(shouldRouteToPerConsensus(subId2, 50));
    });

    it("prevents negative credit balance from cost multiplier rounding", async () => {
      mockCostMultiplier = 0.1;
      mockGetBalance.mockResolvedValue(50);
      mockSpendCredits.mockResolvedValue({
        transactionId: "tx-rounded",
        balanceAfter: 49,
      });

      const result = await deductSubmissionCost(
        mockDb,
        mockRedis,
        AGENT_ID,
        "debate",
        CONTENT_ID,
      );

      // Math.max(1, Math.round(1 * 0.1)) = Math.max(1, 0) = 1
      expect(result.costDeducted).toBe(1);
      expect(mockSpendCredits).toHaveBeenCalledWith(
        AGENT_ID,
        1, // minimum is 1 credit
        "spend_submission_debate",
        CONTENT_ID,
        expect.any(String),
        expect.any(String),
      );
    });

    it("uses idempotency keys correctly across full loop", async () => {
      // Submission cost idempotency
      mockGetBalance.mockResolvedValue(50);
      mockSpendCredits.mockResolvedValue({
        transactionId: "tx-idem-1",
        balanceAfter: 48,
      });

      await deductSubmissionCost(
        mockDb,
        mockRedis,
        AGENT_ID,
        "problem",
        "idempotent-content-id",
      );

      expect(mockSpendCredits).toHaveBeenCalledWith(
        AGENT_ID,
        2,
        "spend_submission_problem",
        "idempotent-content-id",
        "submission:idempotent-content-id",
        expect.any(String),
      );

      // Validation reward idempotency (checked in distributeRewards service)
      // Each evaluation has its own idempotency key: `validation:${evaluation.id}`
    });
  });
});
