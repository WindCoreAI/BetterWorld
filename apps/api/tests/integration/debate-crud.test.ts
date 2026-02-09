import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { problems, solutions, debates } from "@betterworld/db";
import {
  getTestApp,
  setupTestInfra,
  teardownTestInfra,
  cleanupTestData,
  registerTestAgent,
  getTestDb,
} from "./helpers.js";

/**
 * Insert a test problem + solution directly in DB, both with guardrailStatus "approved"
 * so the debate route can reference a valid solution.
 */
async function createTestProblemAndSolution(db: any, agentId: string) {
  const [problem] = await db
    .insert(problems)
    .values({
      reportedByAgentId: agentId,
      title: "Test Problem for Debate Testing Minimum Length Required",
      description:
        "A detailed problem description about healthcare access that is long enough to meet the minimum 50 character validation requirement",
      domain: "healthcare_improvement",
      severity: "high",
      guardrailStatus: "approved",
      status: "active",
    })
    .returning();

  const [solution] = await db
    .insert(solutions)
    .values({
      problemId: problem!.id,
      proposedByAgentId: agentId,
      title: "Test Solution for Debate Testing Minimum Length",
      description:
        "A detailed solution description that meets the minimum 50 character requirement for validation purposes",
      approach:
        "A comprehensive approach to solving this problem that meets the minimum 50 character requirement",
      expectedImpact: {
        metric: "lives_improved",
        value: 500,
        timeframe: "6 months",
      },
      guardrailStatus: "approved",
      status: "proposed",
    })
    .returning();

  return { problem: problem!, solution: solution! };
}

const validDebate = {
  stance: "support",
  content:
    "This is a well-reasoned debate contribution that supports the proposed solution with evidence and logical arguments meeting the minimum character requirement",
};

describe("Debate CRUD (US3: T035-T038)", () => {
  const app = getTestApp();

  beforeAll(async () => {
    await setupTestInfra();
  }, 15000);

  afterEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await teardownTestInfra();
  }, 15000);

  // ----------------------------------------------------------------
  // T035: POST root debate -> 201, linked to solution
  // ----------------------------------------------------------------
  it("T035: should create a root debate linked to the solution with pending guardrail status", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    const db = getTestDb();
    const { solution } = await createTestProblemAndSolution(db, agentId);

    const res = await app.request(
      `/api/v1/solutions/${solution.id}/debates`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(validDebate),
      },
    );

    expect(res.status).toBe(201);
    const json = (await res.json()) as {
      ok: boolean;
      data: {
        id: string;
        solutionId: string;
        agentId: string;
        parentDebateId: string | null;
        stance: string;
        content: string;
        guardrailStatus: string;
        guardrailEvaluationId: string;
      };
    };

    expect(json.ok).toBe(true);
    expect(json.data.solutionId).toBe(solution.id);
    expect(json.data.agentId).toBe(agentId);
    expect(json.data.parentDebateId).toBeNull();
    expect(json.data.stance).toBe("support");
    expect(json.data.guardrailStatus).toBe("pending");
    expect(json.data.guardrailEvaluationId).toBeDefined();
    expect(json.data.guardrailEvaluationId).toBeTruthy();
  }, 10000);

  // ----------------------------------------------------------------
  // T036: POST threaded reply -> 201, parentDebateId set correctly
  // ----------------------------------------------------------------
  it("T036: should create a threaded reply with parentDebateId set correctly", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    const db = getTestDb();
    const { solution } = await createTestProblemAndSolution(db, agentId);

    // Insert root debate directly in DB with approved status
    const [rootDebate] = await db
      .insert(debates)
      .values({
        solutionId: solution.id,
        agentId,
        stance: "support",
        content:
          "This is a root debate that has been approved and meets the minimum character requirement for content validation",
        guardrailStatus: "approved",
      })
      .returning();

    // POST a reply via the API referencing the root debate
    const res = await app.request(
      `/api/v1/solutions/${solution.id}/debates`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          stance: "oppose",
          content:
            "I respectfully disagree with the root debate because the proposed approach lacks sufficient evidence and a concrete implementation plan",
          parentDebateId: rootDebate!.id,
        }),
      },
    );

    expect(res.status).toBe(201);
    const json = (await res.json()) as {
      ok: boolean;
      data: {
        id: string;
        solutionId: string;
        parentDebateId: string | null;
        stance: string;
        guardrailStatus: string;
        guardrailEvaluationId: string;
      };
    };

    expect(json.ok).toBe(true);
    expect(json.data.solutionId).toBe(solution.id);
    expect(json.data.parentDebateId).toBe(rootDebate!.id);
    expect(json.data.stance).toBe("oppose");
    expect(json.data.guardrailStatus).toBe("pending");
    expect(json.data.guardrailEvaluationId).toBeDefined();
  }, 10000);

  // ----------------------------------------------------------------
  // T037: POST reply exceeding depth 5 -> 422 VALIDATION_ERROR
  // ----------------------------------------------------------------
  it("T037: should reject a debate reply that exceeds maximum thread depth of 5", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    const db = getTestDb();
    const { solution } = await createTestProblemAndSolution(db, agentId);

    // Build a chain of 5 debates: depth 1 -> 2 -> 3 -> 4 -> 5
    const debateChain: Array<{ id: string }> = [];

    // Depth 1: root debate (no parent)
    const [debate1] = await db
      .insert(debates)
      .values({
        solutionId: solution.id,
        agentId,
        stance: "support",
        content:
          "Depth 1 root debate with enough content to pass any minimum character requirement for validation",
        guardrailStatus: "approved",
      })
      .returning();
    debateChain.push(debate1!);

    // Depth 2-5: each links to the previous
    for (let i = 2; i <= 5; i++) {
      const [debate] = await db
        .insert(debates)
        .values({
          solutionId: solution.id,
          agentId,
          parentDebateId: debateChain[debateChain.length - 1]!.id,
          stance: "modify",
          content: `Depth ${i} debate reply that meets the minimum character requirement for the debate content validation schema`,
          guardrailStatus: "approved",
        })
        .returning();
      debateChain.push(debate!);
    }

    expect(debateChain.length).toBe(5);

    // POST a 6th debate at depth 6 -> should fail with 422
    const res = await app.request(
      `/api/v1/solutions/${solution.id}/debates`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          stance: "question",
          content:
            "This is a depth 6 debate reply that should be rejected because it exceeds the maximum thread depth of five levels",
          parentDebateId: debateChain[4]!.id, // parent is depth 5
        }),
      },
    );

    expect(res.status).toBe(422);
    const json = (await res.json()) as {
      ok: boolean;
      error: { code: string; message: string };
    };

    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain("depth");
  }, 10000);

  // ----------------------------------------------------------------
  // T038: POST debate on non-existent solution -> 404 NOT_FOUND
  // ----------------------------------------------------------------
  it("T038: should return 404 when posting a debate to a non-existent solution", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;

    const fakeSolutionId = crypto.randomUUID();

    const res = await app.request(
      `/api/v1/solutions/${fakeSolutionId}/debates`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(validDebate),
      },
    );

    expect(res.status).toBe(404);
    const json = (await res.json()) as {
      ok: boolean;
      error: { code: string; message: string };
    };

    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  // ----------------------------------------------------------------
  // Additional: POST debate without auth -> 401 UNAUTHORIZED
  // ----------------------------------------------------------------
  it("should return 401 when posting a debate without authentication", async () => {
    const { data: regData } = await registerTestAgent(app);
    const agentId = regData.data.agentId;

    const db = getTestDb();
    const { solution } = await createTestProblemAndSolution(db, agentId);

    const res = await app.request(
      `/api/v1/solutions/${solution.id}/debates`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validDebate),
      },
    );

    expect(res.status).toBe(401);
    const json = (await res.json()) as {
      ok: boolean;
      error: { code: string };
    };

    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  // ----------------------------------------------------------------
  // Additional: GET debates returns list with agent info
  // ----------------------------------------------------------------
  it("should list debates for a solution with agent info included", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    const db = getTestDb();
    const { solution } = await createTestProblemAndSolution(db, agentId);

    // Insert two approved debates directly in DB
    await db.insert(debates).values([
      {
        solutionId: solution.id,
        agentId,
        stance: "support",
        content:
          "First debate contribution that is long enough to meet the minimum character requirement for the content field",
        guardrailStatus: "approved",
      },
      {
        solutionId: solution.id,
        agentId,
        stance: "oppose",
        content:
          "Second debate contribution that provides an opposing viewpoint and meets the minimum character requirement for content",
        guardrailStatus: "approved",
      },
    ]);

    const res = await app.request(
      `/api/v1/solutions/${solution.id}/debates`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      data: Array<{
        id: string;
        solutionId: string;
        agentId: string;
        stance: string;
        content: string;
        guardrailStatus: string;
        agent: {
          id: string;
          username: string;
          displayName: string | null;
        };
      }>;
      meta: {
        hasMore: boolean;
        nextCursor: string | null;
        count: number;
      };
    };

    expect(json.ok).toBe(true);
    expect(json.data.length).toBe(2);
    expect(json.meta.count).toBe(2);
    expect(json.meta.hasMore).toBe(false);

    // Verify agent info is populated on each debate
    for (const debate of json.data) {
      expect(debate.solutionId).toBe(solution.id);
      expect(debate.agent).toBeDefined();
      expect(debate.agent.id).toBe(agentId);
      expect(debate.agent.username).toBeTruthy();
    }
  }, 10000);

  // ----------------------------------------------------------------
  // Additional: POST debate transitions solution status to "debating"
  // ----------------------------------------------------------------
  it("should transition solution status from 'proposed' to 'debating' on first debate", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    const db = getTestDb();
    const { solution } = await createTestProblemAndSolution(db, agentId);

    // Verify solution starts as "proposed"
    const [beforeSolution] = await db
      .select({ status: solutions.status })
      .from(solutions)
      .where(eq(solutions.id, solution.id))
      .limit(1);
    expect(beforeSolution!.status).toBe("proposed");

    // Create the first debate via API
    const res = await app.request(
      `/api/v1/solutions/${solution.id}/debates`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(validDebate),
      },
    );

    expect(res.status).toBe(201);

    // Verify solution status is now "debating"
    const [afterSolution] = await db
      .select({ status: solutions.status })
      .from(solutions)
      .where(eq(solutions.id, solution.id))
      .limit(1);
    expect(afterSolution!.status).toBe("debating");
  }, 10000);

  // ----------------------------------------------------------------
  // Additional: agentDebateCount increments after debate creation
  // ----------------------------------------------------------------
  it("should increment solution agentDebateCount after debate creation", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    const db = getTestDb();
    const { solution } = await createTestProblemAndSolution(db, agentId);

    // Verify initial count is 0
    const [beforeSolution] = await db
      .select({ agentDebateCount: solutions.agentDebateCount })
      .from(solutions)
      .where(eq(solutions.id, solution.id))
      .limit(1);
    expect(beforeSolution!.agentDebateCount).toBe(0);

    // Create first debate
    const res1 = await app.request(
      `/api/v1/solutions/${solution.id}/debates`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(validDebate),
      },
    );
    expect(res1.status).toBe(201);

    // Verify count is now 1
    const [afterFirst] = await db
      .select({ agentDebateCount: solutions.agentDebateCount })
      .from(solutions)
      .where(eq(solutions.id, solution.id))
      .limit(1);
    expect(afterFirst!.agentDebateCount).toBe(1);

    // Create second debate
    const res2 = await app.request(
      `/api/v1/solutions/${solution.id}/debates`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          stance: "oppose",
          content:
            "A second debate contribution that opposes the solution with detailed reasoning and meets the minimum character requirement",
        }),
      },
    );
    expect(res2.status).toBe(201);

    // Verify count is now 2
    const [afterSecond] = await db
      .select({ agentDebateCount: solutions.agentDebateCount })
      .from(solutions)
      .where(eq(solutions.id, solution.id))
      .limit(1);
    expect(afterSecond!.agentDebateCount).toBe(2);
  }, 10000);
});
