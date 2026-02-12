import { sql } from "drizzle-orm";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import { AgentCreditService } from "../../src/services/agent-credit.service.js";

import {
  setupTestInfra,
  teardownTestInfra,
  getTestDb,
  getTestRedis,
  registerTestAgent,
  getTestApp,
} from "./helpers.js";

describe("Agent Credits (US1)", () => {
  const app = getTestApp();

  beforeAll(async () => {
    await setupTestInfra();
  });

  afterAll(async () => {
    await teardownTestInfra();
  });

  it("should issue starter grant on registration (50 credits)", async () => {
    const { data } = await registerTestAgent(app);
    expect(data.ok).toBe(true);

    const apiKey = data.data.apiKey;

    // Check balance via API
    const balanceRes = await app.request("/api/v1/agents/credits/balance", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(balanceRes.status).toBe(200);
    const balanceData = await balanceRes.json();
    expect(balanceData.ok).toBe(true);
    expect(balanceData.data.creditBalance).toBe(50);
    expect(balanceData.data.transactions).toHaveLength(1);
    expect(balanceData.data.transactions[0].transactionType).toBe("earn_starter_grant");
    expect(balanceData.data.transactions[0].amount).toBe(50);
    expect(balanceData.data.transactions[0].balanceBefore).toBe(0);
    expect(balanceData.data.transactions[0].balanceAfter).toBe(50);
  });

  it("should reject duplicate starter grant (idempotent)", async () => {
    const db = getTestDb();
    const { data } = await registerTestAgent(app);
    const agentId = data.data.agentId;

    const service = new AgentCreditService(db);

    // First grant already happened during registration
    // Try to issue again — should be idempotent
    const result = await service.issueStarterGrant(agentId);
    expect(result.balanceAfter).toBe(50); // Still 50, not 100

    // Verify only one transaction exists
    const history = await service.getTransactionHistory(agentId);
    const starterGrants = history.transactions.filter(
      (t) => t.transactionType === "earn_starter_grant",
    );
    expect(starterGrants).toHaveLength(1);
  });

  it("should return correct balance and paginated transactions", async () => {
    const db = getTestDb();
    const { data } = await registerTestAgent(app);
    const agentId = data.data.agentId;
    const apiKey = data.data.apiKey;

    const service = new AgentCreditService(db);

    // Earn additional credits
    await service.earnCredits(agentId, 10, "earn_validation", undefined, `test-earn-1:${agentId}`);
    await service.earnCredits(agentId, 5, "earn_validation", undefined, `test-earn-2:${agentId}`);

    // Check balance via API
    const balanceRes = await app.request("/api/v1/agents/credits/balance?limit=2", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const balanceData = await balanceRes.json();
    expect(balanceData.ok).toBe(true);
    expect(balanceData.data.creditBalance).toBe(65); // 50 + 10 + 5
    expect(balanceData.data.transactions).toHaveLength(2); // Limited to 2
    // nextCursor should be set since there are more
    expect(balanceData.data.nextCursor).toBeTruthy();
  });

  it("should serialize concurrent credit operations correctly", async () => {
    const db = getTestDb();
    const { data } = await registerTestAgent(app);
    const agentId = data.data.agentId;

    const service = new AgentCreditService(db);

    // Run 5 concurrent earn operations
    const promises = Array.from({ length: 5 }, (_, i) =>
      service.earnCredits(
        agentId,
        10,
        "earn_validation",
        undefined,
        `concurrent-${agentId}-${i}`,
      ),
    );

    const results = await Promise.all(promises);

    // All should succeed
    expect(results).toHaveLength(5);

    // Final balance should be 50 (starter) + 50 (5 * 10) = 100
    const balance = await service.getBalance(agentId);
    expect(balance).toBe(100);
  });

  it("should return conversion rate disabled when flag is off", async () => {
    const { data } = await registerTestAgent(app);
    const apiKey = data.data.apiKey;

    const rateRes = await app.request("/api/v1/agents/credits/rate", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(rateRes.status).toBe(503);
    const rateData = await rateRes.json();
    expect(rateData.ok).toBe(false);
    expect(rateData.error.code).toBe("FEATURE_DISABLED");
  });
});
