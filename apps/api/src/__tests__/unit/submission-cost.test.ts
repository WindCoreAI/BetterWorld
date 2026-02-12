import { describe, it, expect, vi, beforeEach } from "vitest";

import { AgentCreditService } from "../../services/agent-credit.service.js";

// ── Mock helpers ─────────────────────────────────────────────────

const AGENT_ID = "550e8400-e29b-41d4-a716-446655440000";

function createMockTx() {
  const selectLimitFn = vi.fn();
  const selectWhereFn = vi.fn().mockReturnValue({ limit: selectLimitFn });
  const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn });
  const selectFn = vi.fn().mockReturnValue({ from: selectFromFn });

  const insertReturningFn = vi.fn();
  const insertValuesFn = vi
    .fn()
    .mockReturnValue({ returning: insertReturningFn });
  const insertFn = vi.fn().mockReturnValue({ values: insertValuesFn });

  const executeFn = vi.fn();

  return {
    tx: { select: selectFn, insert: insertFn, execute: executeFn },
    fns: {
      selectFn,
      selectFromFn,
      selectWhereFn,
      selectLimitFn,
      insertFn,
      insertValuesFn,
      insertReturningFn,
      executeFn,
    },
  };
}

function createMockDb(txCallback: (tx: unknown) => Promise<unknown>) {
  return {
    transaction: vi.fn(txCallback),
  } as unknown as ConstructorParameters<typeof AgentCreditService>[0];
}

// ── Tests ────────────────────────────────────────────────────────

describe("AgentCreditService.spendCredits", () => {
  let mock: ReturnType<typeof createMockTx>;

  beforeEach(() => {
    vi.clearAllMocks();
    mock = createMockTx();
  });

  it("rejects non-positive amount", async () => {
    const db = createMockDb(async () => null);
    const svc = new AgentCreditService(db);

    await expect(
      svc.spendCredits(AGENT_ID, 0, "spend_submission_problem"),
    ).rejects.toThrow("Spend amount must be positive");

    await expect(
      svc.spendCredits(AGENT_ID, -5, "spend_submission_problem"),
    ).rejects.toThrow("Spend amount must be positive");
  });

  it("deducts balance and records negative amount", async () => {
    const txId = "tx-uuid-1";
    const balanceBefore = 50;
    const amount = 5;

    // execute → locked agent row
    mock.fns.executeFn.mockResolvedValueOnce([
      { id: AGENT_ID, credit_balance: balanceBefore },
    ]);
    // insert returning
    mock.fns.insertReturningFn.mockResolvedValueOnce([{ id: txId }]);
    // update execute
    mock.fns.executeFn.mockResolvedValueOnce(undefined);

    const db = createMockDb(async (cb) =>
      (cb as (tx: unknown) => Promise<unknown>)(mock.tx),
    );
    const svc = new AgentCreditService(db);

    const result = await svc.spendCredits(
      AGENT_ID,
      amount,
      "spend_submission_solution",
    );

    expect(result).toEqual({ transactionId: txId, balanceAfter: 45 });

    // Verify negative amount in insert
    const insertedValues = mock.fns.insertValuesFn.mock.calls[0]![0];
    expect(insertedValues.amount).toBe(-amount);
    expect(insertedValues.balanceBefore).toBe(balanceBefore);
    expect(insertedValues.balanceAfter).toBe(balanceBefore - amount);
    expect(insertedValues.transactionType).toBe("spend_submission_solution");
  });

  it("returns null on insufficient balance", async () => {
    const balanceBefore = 3; // less than the 5 we want to spend

    mock.fns.executeFn.mockResolvedValueOnce([
      { id: AGENT_ID, credit_balance: balanceBefore },
    ]);

    const db = createMockDb(async (cb) =>
      (cb as (tx: unknown) => Promise<unknown>)(mock.tx),
    );
    const svc = new AgentCreditService(db);

    const result = await svc.spendCredits(
      AGENT_ID,
      5,
      "spend_submission_solution",
    );
    expect(result).toBeNull();

    // No insert or update should have been called
    expect(mock.fns.insertFn).not.toHaveBeenCalled();
  });

  it("returns existing transaction on duplicate idempotency key", async () => {
    const existingTxId = "existing-tx-uuid";

    // select idempotency check → found
    mock.fns.selectLimitFn.mockResolvedValueOnce([{ id: existingTxId }]);
    // select agent balance
    mock.fns.selectLimitFn.mockResolvedValueOnce([{ creditBalance: 42 }]);

    const db = createMockDb(async (cb) =>
      (cb as (tx: unknown) => Promise<unknown>)(mock.tx),
    );
    const svc = new AgentCreditService(db);

    const result = await svc.spendCredits(
      AGENT_ID,
      5,
      "spend_submission_problem",
      undefined,
      "idem-key-123",
    );

    expect(result).toEqual({ transactionId: existingTxId, balanceAfter: 42 });
    // Should NOT have called execute (no lock acquired)
    expect(mock.fns.executeFn).not.toHaveBeenCalled();
  });

  it("proceeds to lock when idempotency key not found", async () => {
    const txId = "new-tx-uuid";

    // select idempotency check → not found
    mock.fns.selectLimitFn.mockResolvedValueOnce([]);
    // execute → locked agent
    mock.fns.executeFn.mockResolvedValueOnce([
      { id: AGENT_ID, credit_balance: 20 },
    ]);
    // insert returning
    mock.fns.insertReturningFn.mockResolvedValueOnce([{ id: txId }]);
    // update execute
    mock.fns.executeFn.mockResolvedValueOnce(undefined);

    const db = createMockDb(async (cb) =>
      (cb as (tx: unknown) => Promise<unknown>)(mock.tx),
    );
    const svc = new AgentCreditService(db);

    const result = await svc.spendCredits(
      AGENT_ID,
      2,
      "spend_submission_debate",
      "ref-123",
      "new-idem-key",
    );

    expect(result).toEqual({ transactionId: txId, balanceAfter: 18 });
  });

  it("throws if agent not found", async () => {
    // execute → no rows
    mock.fns.executeFn.mockResolvedValueOnce([]);

    const db = createMockDb(async (cb) =>
      (cb as (tx: unknown) => Promise<unknown>)(mock.tx),
    );
    const svc = new AgentCreditService(db);

    await expect(
      svc.spendCredits(AGENT_ID, 5, "spend_submission_problem"),
    ).rejects.toThrow(`Agent ${AGENT_ID} not found`);
  });

  it("records correct balance_before/balance_after for exact balance", async () => {
    const txId = "exact-tx";
    const balance = 5;

    mock.fns.executeFn.mockResolvedValueOnce([
      { id: AGENT_ID, credit_balance: balance },
    ]);
    mock.fns.insertReturningFn.mockResolvedValueOnce([{ id: txId }]);
    mock.fns.executeFn.mockResolvedValueOnce(undefined);

    const db = createMockDb(async (cb) =>
      (cb as (tx: unknown) => Promise<unknown>)(mock.tx),
    );
    const svc = new AgentCreditService(db);

    const result = await svc.spendCredits(
      AGENT_ID,
      5,
      "spend_submission_solution",
    );

    expect(result).toEqual({ transactionId: txId, balanceAfter: 0 });

    const insertedValues = mock.fns.insertValuesFn.mock.calls[0]![0];
    expect(insertedValues.balanceBefore).toBe(5);
    expect(insertedValues.balanceAfter).toBe(0);
    expect(insertedValues.amount).toBe(-5);
  });

  it("uses default description when none provided", async () => {
    mock.fns.executeFn.mockResolvedValueOnce([
      { id: AGENT_ID, credit_balance: 100 },
    ]);
    mock.fns.insertReturningFn.mockResolvedValueOnce([{ id: "tx-1" }]);
    mock.fns.executeFn.mockResolvedValueOnce(undefined);

    const db = createMockDb(async (cb) =>
      (cb as (tx: unknown) => Promise<unknown>)(mock.tx),
    );
    const svc = new AgentCreditService(db);

    await svc.spendCredits(AGENT_ID, 2, "spend_submission_problem");

    const insertedValues = mock.fns.insertValuesFn.mock.calls[0]![0];
    expect(insertedValues.description).toBe(
      "spend_submission_problem: -2 credits",
    );
  });

  it("uses custom description when provided", async () => {
    mock.fns.executeFn.mockResolvedValueOnce([
      { id: AGENT_ID, credit_balance: 100 },
    ]);
    mock.fns.insertReturningFn.mockResolvedValueOnce([{ id: "tx-2" }]);
    mock.fns.executeFn.mockResolvedValueOnce(undefined);

    const db = createMockDb(async (cb) =>
      (cb as (tx: unknown) => Promise<unknown>)(mock.tx),
    );
    const svc = new AgentCreditService(db);

    await svc.spendCredits(
      AGENT_ID,
      5,
      "spend_submission_solution",
      "ref-456",
      undefined,
      "Custom spend note",
    );

    const insertedValues = mock.fns.insertValuesFn.mock.calls[0]![0];
    expect(insertedValues.description).toBe("Custom spend note");
    expect(insertedValues.referenceId).toBe("ref-456");
  });
});
