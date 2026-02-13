import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────
const mockSpendCredits = vi.hoisted(() => vi.fn());
const mockEarnCredits = vi.hoisted(() => vi.fn());

vi.mock("../agent-credit.service.js", () => ({
  AgentCreditService: vi.fn().mockImplementation(() => ({
    spendCredits: mockSpendCredits,
    earnCredits: mockEarnCredits,
  })),
}));

vi.mock("../../middleware/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { fileDispute, resolveDispute, checkDisputeSuspension } from "../dispute.service.js";

// ── Mock DB helpers ──────────────────────────────────────────────

// The service makes multiple independent select/insert/update calls.
// Each call returns a fresh chain, so we use mockReturnValueOnce sequences.

function createMockDb() {
  const mockSelectLimit = vi.fn();
  const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockSelectLimit });
  const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

  const mockInsertReturning = vi.fn();
  const mockInsertValues = vi.fn().mockReturnValue({ returning: mockInsertReturning });
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

  const mockUpdateReturning = vi.fn();
  const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockUpdateReturning });
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

  const db = {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  } as never;

  return {
    db,
    mockSelect,
    mockSelectFrom,
    mockSelectWhere,
    mockSelectLimit,
    mockInsert,
    mockInsertValues,
    mockInsertReturning,
    mockUpdate,
    mockUpdateSet,
    mockUpdateWhere,
    mockUpdateReturning,
  };
}

// ── Constants ────────────────────────────────────────────────────

const AGENT_ID = "aaaabbbb-cccc-4ddd-8eee-ffffffffffff";
const OTHER_AGENT_ID = "bbbbcccc-dddd-4eee-8fff-aaaaaaaaaaaa";
const CONSENSUS_ID = "ccccdddd-eeee-4fff-8aaa-bbbbbbbbbbbb";
const DISPUTE_ID = "ddddeeee-ffff-4aaa-8bbb-cccccccccccc";
const ADMIN_ID = "eeeeffff-aaaa-4bbb-8ccc-dddddddddddd";
const TX_ID = "ffffaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

// ── Tests ────────────────────────────────────────────────────────

describe("Dispute Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpendCredits.mockReset();
    mockEarnCredits.mockReset();
  });

  // ================================================================
  // fileDispute
  // ================================================================

  describe("fileDispute", () => {
    it("should file dispute successfully", async () => {
      const { db, mockSelect, mockInsertReturning } = createMockDb();
      const now = new Date();

      // Call 1: consensus lookup → found with terminal status
      const consensusChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: CONSENSUS_ID, decision: "approved", submissionId: "sub-1" },
            ]),
          }),
        }),
      };

      // Call 2: participants lookup → no participation by challenger
      const participantsChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { agentId: OTHER_AGENT_ID },
          ]),
        }),
      };

      // Call 3: existing dispute check → none found
      const existingDisputeChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      // Call 4: validator suspension check → not suspended
      const validatorChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "val-1", disputeSuspendedUntil: null },
            ]),
          }),
        }),
      };

      mockSelect
        .mockReturnValueOnce(consensusChain)
        .mockReturnValueOnce(participantsChain)
        .mockReturnValueOnce(existingDisputeChain)
        .mockReturnValueOnce(validatorChain);

      // Credit spend succeeds
      mockSpendCredits.mockResolvedValue({
        transactionId: TX_ID,
        balanceAfter: 40,
      });

      // Insert dispute row
      mockInsertReturning.mockResolvedValue([
        {
          id: DISPUTE_ID,
          consensusId: CONSENSUS_ID,
          challengerAgentId: AGENT_ID,
          stakeAmount: 10,
          reasoning: "This consensus decision was incorrect based on the evidence provided in the submission which clearly shows valid content.",
          status: "open",
          createdAt: now,
        },
      ]);

      const result = await fileDispute(
        db,
        AGENT_ID,
        CONSENSUS_ID,
        "This consensus decision was incorrect based on the evidence provided in the submission which clearly shows valid content.",
      );

      expect(result.id).toBe(DISPUTE_ID);
      expect(result.status).toBe("open");
      expect(result.stakeAmount).toBe(10);
      expect(mockSpendCredits).toHaveBeenCalledWith(
        AGENT_ID,
        10,
        "spend_dispute_stake",
        CONSENSUS_ID,
        `dispute:${CONSENSUS_ID}:${AGENT_ID}`,
        expect.any(String),
      );
    });

    it("should reject self-dispute (challenger was a participant)", async () => {
      const { db, mockSelect } = createMockDb();

      // Call 1: consensus found
      const consensusChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: CONSENSUS_ID, decision: "rejected", submissionId: "sub-1" },
            ]),
          }),
        }),
      };

      // Call 2: participants include the challenger
      const participantsChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { agentId: AGENT_ID }, // Challenger is a participant
          ]),
        }),
      };

      mockSelect
        .mockReturnValueOnce(consensusChain)
        .mockReturnValueOnce(participantsChain);

      await expect(
        fileDispute(db, AGENT_ID, CONSENSUS_ID, "I disagree with the consensus result because the evidence clearly supports a different conclusion and this was missed."),
      ).rejects.toThrow("Cannot dispute a consensus you participated in");
    });

    it("should reject when consensus not found", async () => {
      const { db, mockSelect } = createMockDb();

      const consensusChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      mockSelect.mockReturnValueOnce(consensusChain);

      await expect(
        fileDispute(db, AGENT_ID, CONSENSUS_ID, "This consensus decision was incorrect based on the evidence provided in the submission which clearly shows valid content."),
      ).rejects.toThrow("Consensus result not found");
    });

    it("should reject when consensus has non-terminal status", async () => {
      const { db, mockSelect } = createMockDb();

      const consensusChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: CONSENSUS_ID, decision: "escalated", submissionId: "sub-1" },
            ]),
          }),
        }),
      };

      mockSelect.mockReturnValueOnce(consensusChain);

      await expect(
        fileDispute(db, AGENT_ID, CONSENSUS_ID, "This consensus decision was incorrect based on the evidence provided in the submission which clearly shows valid content."),
      ).rejects.toThrow("Can only dispute consensus results with terminal status");
    });

    it("should reject when insufficient credits", async () => {
      const { db, mockSelect } = createMockDb();

      // Set up all 4 select calls to pass pre-checks
      const consensusChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: CONSENSUS_ID, decision: "approved", submissionId: "sub-1" },
            ]),
          }),
        }),
      };
      const participantsChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ agentId: OTHER_AGENT_ID }]),
        }),
      };
      const existingDisputeChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      };
      const validatorChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "val-1", disputeSuspendedUntil: null }]),
          }),
        }),
      };

      mockSelect
        .mockReturnValueOnce(consensusChain)
        .mockReturnValueOnce(participantsChain)
        .mockReturnValueOnce(existingDisputeChain)
        .mockReturnValueOnce(validatorChain);

      // Spend returns null = insufficient
      mockSpendCredits.mockResolvedValue(null);

      await expect(
        fileDispute(db, AGENT_ID, CONSENSUS_ID, "This consensus decision was incorrect based on the evidence provided in the submission which clearly shows valid content."),
      ).rejects.toThrow("Insufficient credits to file dispute");
    });

    it("should reject when dispute already exists for same consensus", async () => {
      const { db, mockSelect } = createMockDb();

      const consensusChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: CONSENSUS_ID, decision: "approved", submissionId: "sub-1" },
            ]),
          }),
        }),
      };
      const participantsChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ agentId: OTHER_AGENT_ID }]),
        }),
      };
      const existingDisputeChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "existing-dispute" }]),
          }),
        }),
      };

      mockSelect
        .mockReturnValueOnce(consensusChain)
        .mockReturnValueOnce(participantsChain)
        .mockReturnValueOnce(existingDisputeChain);

      await expect(
        fileDispute(db, AGENT_ID, CONSENSUS_ID, "This consensus decision was incorrect based on the evidence provided in the submission which clearly shows valid content."),
      ).rejects.toThrow("You already have an open dispute for this consensus result");
    });

    it("should reject when validator is suspended", async () => {
      const { db, mockSelect } = createMockDb();

      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const consensusChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: CONSENSUS_ID, decision: "rejected", submissionId: "sub-1" },
            ]),
          }),
        }),
      };
      const participantsChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ agentId: OTHER_AGENT_ID }]),
        }),
      };
      const existingDisputeChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      };
      const validatorChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "val-1", disputeSuspendedUntil: futureDate },
            ]),
          }),
        }),
      };

      mockSelect
        .mockReturnValueOnce(consensusChain)
        .mockReturnValueOnce(participantsChain)
        .mockReturnValueOnce(existingDisputeChain)
        .mockReturnValueOnce(validatorChain);

      await expect(
        fileDispute(db, AGENT_ID, CONSENSUS_ID, "This consensus decision was incorrect based on the evidence provided in the submission which clearly shows valid content."),
      ).rejects.toThrow("Dispute filing suspended until");
    });
  });

  // ================================================================
  // resolveDispute
  // ================================================================

  describe("resolveDispute", () => {
    it("should resolve upheld: refund stake + pay bonus", async () => {
      const { db, mockSelect, mockUpdateReturning } = createMockDb();
      const now = new Date();

      // Fetch dispute
      const disputeChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: DISPUTE_ID,
                challengerAgentId: AGENT_ID,
                stakeAmount: 10,
                status: "open",
              },
            ]),
          }),
        }),
      };

      mockSelect.mockReturnValueOnce(disputeChain);

      // Refund stake
      mockEarnCredits
        .mockResolvedValueOnce({ transactionId: "refund-tx", balanceAfter: 50 })
        .mockResolvedValueOnce({ transactionId: "bonus-tx", balanceAfter: 55 });

      // Update dispute
      mockUpdateReturning.mockResolvedValue([
        {
          id: DISPUTE_ID,
          status: "upheld",
          adminDecision: "upheld",
          adminNotes: "The challenger was correct in their assessment.",
          stakeReturned: true,
          bonusPaid: true,
          resolvedAt: now,
        },
      ]);

      const result = await resolveDispute(
        db,
        DISPUTE_ID,
        "upheld",
        "The challenger was correct in their assessment.",
        ADMIN_ID,
      );

      expect(result.status).toBe("upheld");
      expect(result.stakeReturned).toBe(true);
      expect(result.bonusPaid).toBe(true);
      expect(mockEarnCredits).toHaveBeenCalledTimes(2);
      // First call: refund
      expect(mockEarnCredits).toHaveBeenCalledWith(
        AGENT_ID,
        10,
        "earn_dispute_refund",
        DISPUTE_ID,
        `dispute_refund:${DISPUTE_ID}`,
        expect.any(String),
      );
      // Second call: bonus
      expect(mockEarnCredits).toHaveBeenCalledWith(
        AGENT_ID,
        5,
        "earn_dispute_bonus",
        DISPUTE_ID,
        `dispute_bonus:${DISPUTE_ID}`,
        expect.any(String),
      );
    });

    it("should resolve dismissed: forfeit stake, no credits", async () => {
      const { db, mockSelect, mockUpdateReturning } = createMockDb();
      const now = new Date();

      // Fetch dispute
      const disputeChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: DISPUTE_ID,
                challengerAgentId: AGENT_ID,
                stakeAmount: 10,
                status: "admin_review",
              },
            ]),
          }),
        }),
      };

      // checkDisputeSuspension calls: validator lookup + count dismissed
      const validatorForSuspension = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "val-1", disputeSuspendedUntil: null },
            ]),
          }),
        }),
      };

      const dismissedCount = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      };

      mockSelect
        .mockReturnValueOnce(disputeChain)
        .mockReturnValueOnce(validatorForSuspension)
        .mockReturnValueOnce(dismissedCount);

      // Update dispute
      mockUpdateReturning.mockResolvedValue([
        {
          id: DISPUTE_ID,
          status: "dismissed",
          adminDecision: "dismissed",
          adminNotes: "The consensus result was correct.",
          stakeReturned: false,
          bonusPaid: false,
          resolvedAt: now,
        },
      ]);

      const result = await resolveDispute(
        db,
        DISPUTE_ID,
        "dismissed",
        "The consensus result was correct.",
        ADMIN_ID,
      );

      expect(result.status).toBe("dismissed");
      expect(result.stakeReturned).toBe(false);
      expect(result.bonusPaid).toBe(false);
      expect(mockEarnCredits).not.toHaveBeenCalled();
    });

    it("should reject when dispute not found", async () => {
      const { db, mockSelect } = createMockDb();

      const disputeChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      mockSelect.mockReturnValueOnce(disputeChain);

      await expect(
        resolveDispute(db, DISPUTE_ID, "upheld", "Some admin notes here.", ADMIN_ID),
      ).rejects.toThrow("Dispute not found");
    });

    it("should reject when dispute already resolved", async () => {
      const { db, mockSelect } = createMockDb();

      const disputeChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: DISPUTE_ID,
                challengerAgentId: AGENT_ID,
                stakeAmount: 10,
                status: "upheld",
              },
            ]),
          }),
        }),
      };

      mockSelect.mockReturnValueOnce(disputeChain);

      await expect(
        resolveDispute(db, DISPUTE_ID, "dismissed", "Admin notes for resolve.", ADMIN_ID),
      ).rejects.toThrow("Dispute is already resolved");
    });

    it("should trigger suspension when dismissed count reaches threshold", async () => {
      const { db, mockSelect, mockUpdate } = createMockDb();
      const now = new Date();

      // Fetch dispute
      const disputeChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: DISPUTE_ID,
                challengerAgentId: AGENT_ID,
                stakeAmount: 10,
                status: "open",
              },
            ]),
          }),
        }),
      };

      // checkDisputeSuspension: validator lookup
      const validatorForSuspension = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "val-1", disputeSuspendedUntil: null },
            ]),
          }),
        }),
      };

      // checkDisputeSuspension: dismissed count = 3 (at threshold)
      const dismissedCount = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 3 }]),
        }),
      };

      mockSelect
        .mockReturnValueOnce(disputeChain)
        .mockReturnValueOnce(validatorForSuspension)
        .mockReturnValueOnce(dismissedCount);

      // update calls: 1st for suspension, 2nd for dispute resolution
      const suspensionUpdateChain = {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      };

      const resolveUpdateChain = {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: DISPUTE_ID,
                status: "dismissed",
                adminDecision: "dismissed",
                adminNotes: "Invalid dispute, consensus is correct.",
                stakeReturned: false,
                bonusPaid: false,
                resolvedAt: now,
              },
            ]),
          }),
        }),
      };

      mockUpdate
        .mockReturnValueOnce(suspensionUpdateChain)
        .mockReturnValueOnce(resolveUpdateChain);

      const result = await resolveDispute(
        db,
        DISPUTE_ID,
        "dismissed",
        "Invalid dispute, consensus is correct.",
        ADMIN_ID,
      );

      expect(result.status).toBe("dismissed");
      // Suspension update was called
      expect(mockUpdate).toHaveBeenCalledTimes(2);
    });
  });

  // ================================================================
  // checkDisputeSuspension
  // ================================================================

  describe("checkDisputeSuspension", () => {
    it("should return not suspended when below threshold", async () => {
      const { db, mockSelect } = createMockDb();

      // Validator lookup
      const validatorChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "val-1", disputeSuspendedUntil: null },
            ]),
          }),
        }),
      };

      // Dismissed count = 1 (below threshold of 3)
      const countChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      };

      mockSelect
        .mockReturnValueOnce(validatorChain)
        .mockReturnValueOnce(countChain);

      const result = await checkDisputeSuspension(db, AGENT_ID);

      expect(result.suspended).toBe(false);
      expect(result.suspendedUntil).toBeNull();
      expect(result.dismissedCount).toBe(1);
    });

    it("should apply suspension when at threshold", async () => {
      const { db, mockSelect, mockUpdate } = createMockDb();

      // Validator lookup
      const validatorChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "val-1", disputeSuspendedUntil: null },
            ]),
          }),
        }),
      };

      // Dismissed count = 3 (at threshold)
      const countChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 3 }]),
        }),
      };

      mockSelect
        .mockReturnValueOnce(validatorChain)
        .mockReturnValueOnce(countChain);

      // Update validator with suspension
      const updateChain = {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      };
      mockUpdate.mockReturnValueOnce(updateChain);

      const result = await checkDisputeSuspension(db, AGENT_ID);

      expect(result.suspended).toBe(true);
      expect(result.suspendedUntil).toBeInstanceOf(Date);
      expect(result.dismissedCount).toBe(3);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("should return already suspended when suspension is active", async () => {
      const { db, mockSelect } = createMockDb();

      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const validatorChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "val-1", disputeSuspendedUntil: futureDate },
            ]),
          }),
        }),
      };

      mockSelect.mockReturnValueOnce(validatorChain);

      const result = await checkDisputeSuspension(db, AGENT_ID);

      expect(result.suspended).toBe(true);
      expect(result.suspendedUntil).toEqual(futureDate);
      expect(result.dismissedCount).toBe(-1);
    });

    it("should not suspend when no validator record exists", async () => {
      const { db, mockSelect } = createMockDb();

      // Validator not found
      const validatorChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      // Dismissed count = 5 (above threshold, but no validator to suspend)
      const countChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 5 }]),
        }),
      };

      mockSelect
        .mockReturnValueOnce(validatorChain)
        .mockReturnValueOnce(countChain);

      const result = await checkDisputeSuspension(db, AGENT_ID);

      expect(result.suspended).toBe(false);
      expect(result.suspendedUntil).toBeNull();
      expect(result.dismissedCount).toBe(5);
    });
  });
});
