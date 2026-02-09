import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { problems, solutions, debates, guardrailEvaluations } from "@betterworld/db";
import {
  getTestApp,
  setupTestInfra,
  teardownTestInfra,
  cleanupTestData,
  registerTestAgent,
  getTestDb,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTestProblem(
  db: ReturnType<typeof getTestDb>,
  agentId: string,
  overrides: Record<string, unknown> = {},
) {
  const [problem] = await db
    .insert(problems)
    .values({
      reportedByAgentId: agentId,
      title: "Test Problem for Solution Testing That Meets Min Length",
      description:
        "This is a long enough description that meets the minimum 50 character requirement for the problem description field validation",
      domain: "healthcare_improvement",
      severity: "high",
      guardrailStatus: "approved",
      status: "active",
      ...overrides,
    })
    .returning();
  return problem!;
}

const validSolution = (problemId: string) => ({
  problemId,
  title: "Test Solution for Healthcare Access Improvement",
  description:
    "This is a detailed solution description about improving healthcare access that meets the minimum 50 character requirement",
  approach:
    "This is a comprehensive approach to solving the healthcare problem described above meeting the fifty char minimum",
  expectedImpact: { metric: "lives_improved", value: 1000, timeframe: "12 months" },
});

// ---------------------------------------------------------------------------
// US2 — Solution CRUD (T028-T031)
// ---------------------------------------------------------------------------
describe("Solution CRUD (US2)", () => {
  const app = getTestApp();

  beforeAll(async () => {
    await setupTestInfra();
  }, 15_000);

  afterEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await teardownTestInfra();
  }, 15_000);

  // T028: POST solution referencing active problem → 201, scores at "0"
  it("should create a solution referencing an active problem with scores at 0", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    const db = getTestDb();
    const problem = await createTestProblem(db, agentId);

    const res = await app.request("/api/v1/solutions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(validSolution(problem.id)),
    });

    expect(res.status).toBe(201);
    const json = (await res.json()) as {
      ok: boolean;
      data: {
        id: string;
        problemId: string;
        impactScore: string;
        compositeScore: string;
        guardrailStatus: string;
        proposedByAgentId: string;
      };
    };
    expect(json.ok).toBe(true);
    expect(json.data.problemId).toBe(problem.id);
    expect(json.data.proposedByAgentId).toBe(agentId);
    expect(json.data.impactScore).toBe("0");
    expect(json.data.compositeScore).toBe("0");
    expect(json.data.guardrailStatus).toBe("pending");

    // Verify parent problem solutionCount incremented from 0 → 1
    const [updatedProblem] = await db
      .select({ solutionCount: problems.solutionCount })
      .from(problems)
      .where(eq(problems.id, problem.id))
      .limit(1);
    expect(updatedProblem!.solutionCount).toBe(1);

    // Verify guardrail evaluation record was created (enqueueForEvaluation)
    const evals = await db
      .select({ id: guardrailEvaluations.id, contentType: guardrailEvaluations.contentType })
      .from(guardrailEvaluations)
      .where(eq(guardrailEvaluations.contentId, json.data.id))
      .limit(1);
    expect(evals.length).toBe(1);
    expect(evals[0]!.contentType).toBe("solution");
  }, 15_000);

  // T029: POST solution referencing non-existent problem → 404
  it("should return 404 when referencing a non-existent problem", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;

    const fakeProblemId = "00000000-0000-4000-8000-000000000099";

    const res = await app.request("/api/v1/solutions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(validSolution(fakeProblemId)),
    });

    expect(res.status).toBe(404);
    const json = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("NOT_FOUND");
  }, 10_000);

  // T030: POST solution referencing archived problem → 409 CONFLICT
  it("should return 409 when referencing an archived problem", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    const db = getTestDb();
    const archivedProblem = await createTestProblem(db, agentId, { status: "archived" });

    const res = await app.request("/api/v1/solutions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(validSolution(archivedProblem.id)),
    });

    expect(res.status).toBe(409);
    const json = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("CONFLICT");
  }, 10_000);

  // T031: GET /solutions?sort=score returns solutions ordered by compositeScore desc
  it("should return solutions sorted by compositeScore descending", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    const db = getTestDb();
    const problem = await createTestProblem(db, agentId);

    // Insert 3 solutions directly in DB with different compositeScores, all approved
    const scores = ["90.00", "60.25", "75.50"];
    const insertedIds: string[] = [];
    for (const score of scores) {
      const [sol] = await db
        .insert(solutions)
        .values({
          problemId: problem.id,
          proposedByAgentId: agentId,
          title: `Solution with score ${score} that meets minimum length`,
          description:
            "This is a detailed solution description that meets the minimum 50 character requirement for testing purposes",
          approach:
            "This is a comprehensive approach to solving the problem described above meeting the fifty char minimum requirement",
          expectedImpact: { metric: "lives_improved", value: 500, timeframe: "6 months" },
          compositeScore: score,
          guardrailStatus: "approved",
        })
        .returning();
      insertedIds.push(sol!.id);
    }

    // GET with sort=score (public endpoint, no auth required but we send it for mine= support)
    const res = await app.request("/api/v1/solutions?sort=score", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      data: Array<{ id: string; compositeScore: string }>;
    };
    expect(json.ok).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(3);

    // Verify descending order
    const returnedScores = json.data.map((s) => parseFloat(s.compositeScore));
    for (let i = 1; i < returnedScores.length; i++) {
      expect(returnedScores[i - 1]).toBeGreaterThanOrEqual(returnedScores[i]!);
    }

    // The first item should be the 90.00 solution
    expect(json.data[0]!.compositeScore).toBe("90.00");
  }, 10_000);
});

// ---------------------------------------------------------------------------
// US4 — Solution Update & Delete (T046-T047)
// ---------------------------------------------------------------------------
describe("Solution Update & Delete (US4)", () => {
  const app = getTestApp();

  beforeAll(async () => {
    await setupTestInfra();
  }, 15_000);

  afterEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await teardownTestInfra();
  }, 15_000);

  // T046: PATCH own solution → 200, scores reset to "0"
  it("should update own solution and reset scores to 0", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    const db = getTestDb();
    const problem = await createTestProblem(db, agentId);

    // Create solution via POST
    const createRes = await app.request("/api/v1/solutions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(validSolution(problem.id)),
    });
    expect(createRes.status).toBe(201);
    const createJson = (await createRes.json()) as { data: { id: string } };
    const solutionId = createJson.data.id;

    // PATCH — update title
    const patchRes = await app.request(`/api/v1/solutions/${solutionId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        title: "Updated Solution Title That Meets Minimum Length Requirement",
      }),
    });

    expect(patchRes.status).toBe(200);
    const patchJson = (await patchRes.json()) as {
      ok: boolean;
      data: {
        id: string;
        title: string;
        impactScore: string;
        compositeScore: string;
        feasibilityScore: string;
        costEfficiencyScore: string;
        guardrailStatus: string;
      };
    };
    expect(patchJson.ok).toBe(true);
    expect(patchJson.data.title).toBe("Updated Solution Title That Meets Minimum Length Requirement");
    expect(patchJson.data.impactScore).toBe("0");
    expect(patchJson.data.compositeScore).toBe("0");
    expect(patchJson.data.feasibilityScore).toBe("0");
    expect(patchJson.data.costEfficiencyScore).toBe("0");
    expect(patchJson.data.guardrailStatus).toBe("pending");
  }, 15_000);

  // T047: DELETE solution → debates cascade-deleted, problem solutionCount decremented
  it("should delete solution, cascade-delete debates, and decrement solutionCount", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    const db = getTestDb();
    const problem = await createTestProblem(db, agentId);

    // Create solution via POST (this increments solutionCount to 1)
    const createRes = await app.request("/api/v1/solutions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(validSolution(problem.id)),
    });
    expect(createRes.status).toBe(201);
    const createJson = (await createRes.json()) as { data: { id: string } };
    const solutionId = createJson.data.id;

    // Verify solutionCount is 1 after POST
    const [problemAfterCreate] = await db
      .select({ solutionCount: problems.solutionCount })
      .from(problems)
      .where(eq(problems.id, problem.id))
      .limit(1);
    expect(problemAfterCreate!.solutionCount).toBe(1);

    // Insert a debate directly in DB on this solution
    const [debate] = await db
      .insert(debates)
      .values({
        solutionId,
        agentId,
        stance: "support",
        content: "This is a great solution that addresses core healthcare access challenges effectively",
        guardrailStatus: "approved",
      })
      .returning();
    expect(debate).toBeDefined();

    // DELETE the solution
    const deleteRes = await app.request(`/api/v1/solutions/${solutionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(deleteRes.status).toBe(200);
    const deleteJson = (await deleteRes.json()) as { ok: boolean; data: { deleted: boolean } };
    expect(deleteJson.ok).toBe(true);
    expect(deleteJson.data.deleted).toBe(true);

    // Verify solution is gone
    const remainingSolutions = await db
      .select({ id: solutions.id })
      .from(solutions)
      .where(eq(solutions.id, solutionId))
      .limit(1);
    expect(remainingSolutions.length).toBe(0);

    // Verify debate is cascade-deleted
    const remainingDebates = await db
      .select({ id: debates.id })
      .from(debates)
      .where(eq(debates.id, debate!.id))
      .limit(1);
    expect(remainingDebates.length).toBe(0);

    // Verify parent problem solutionCount decremented back to 0
    const [problemAfterDelete] = await db
      .select({ solutionCount: problems.solutionCount })
      .from(problems)
      .where(eq(problems.id, problem.id))
      .limit(1);
    expect(problemAfterDelete!.solutionCount).toBe(0);
  }, 15_000);
});

// ---------------------------------------------------------------------------
// Additional Tests — Auth, Access Control, Filtering
// ---------------------------------------------------------------------------
describe("Solution Access Control & Filtering", () => {
  const app = getTestApp();

  beforeAll(async () => {
    await setupTestInfra();
  }, 15_000);

  afterEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await teardownTestInfra();
  }, 15_000);

  // POST solution without auth → 401 UNAUTHORIZED
  it("should return 401 when creating a solution without authentication", async () => {
    const res = await app.request("/api/v1/solutions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        validSolution("00000000-0000-4000-8000-000000000001"),
      ),
    });

    expect(res.status).toBe(401);
    const json = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("UNAUTHORIZED");
  }, 10_000);

  // GET /api/v1/solutions/:id returns 403 for non-approved solution viewed by different agent
  it("should return 403 when a different agent views a non-approved solution", async () => {
    // Agent A creates a solution (pending guardrail status)
    const { data: regDataA } = await registerTestAgent(app);
    const apiKeyA = regDataA.data.apiKey;
    const agentIdA = regDataA.data.agentId;

    // Agent B will try to view it
    const { data: regDataB } = await registerTestAgent(app);
    const apiKeyB = regDataB.data.apiKey;

    const db = getTestDb();
    const problem = await createTestProblem(db, agentIdA);

    // Insert solution directly in DB with pending guardrail status (owned by agent A)
    const [sol] = await db
      .insert(solutions)
      .values({
        problemId: problem.id,
        proposedByAgentId: agentIdA,
        title: "Pending Solution That Meets Minimum Length Requirement",
        description:
          "This is a detailed solution description that meets the minimum 50 character requirement for testing",
        approach:
          "This is a comprehensive approach to solving the healthcare problem meeting the fifty char minimum",
        expectedImpact: { metric: "lives_improved", value: 100, timeframe: "6 months" },
        guardrailStatus: "pending",
      })
      .returning();

    // Agent B tries to view it
    const res = await app.request(`/api/v1/solutions/${sol!.id}`, {
      headers: { Authorization: `Bearer ${apiKeyB}` },
    });

    expect(res.status).toBe(403);
    const json = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("FORBIDDEN");

    // Agent A can view their own pending solution
    const resA = await app.request(`/api/v1/solutions/${sol!.id}`, {
      headers: { Authorization: `Bearer ${apiKeyA}` },
    });
    expect(resA.status).toBe(200);
    const jsonA = (await resA.json()) as { ok: boolean; data: { id: string } };
    expect(jsonA.ok).toBe(true);
    expect(jsonA.data.id).toBe(sol!.id);
  }, 10_000);

  // GET /api/v1/solutions?mine=true returns own pending solutions
  it("should return own pending solutions when mine=true", async () => {
    const { data: regDataA } = await registerTestAgent(app);
    const apiKeyA = regDataA.data.apiKey;
    const agentIdA = regDataA.data.agentId;

    const { data: regDataB } = await registerTestAgent(app);
    const agentIdB = regDataB.data.agentId;

    const db = getTestDb();
    const problem = await createTestProblem(db, agentIdA);

    // Insert a pending solution for agent A
    const [solA] = await db
      .insert(solutions)
      .values({
        problemId: problem.id,
        proposedByAgentId: agentIdA,
        title: "Agent A Pending Solution That Meets Minimum Length",
        description:
          "This is a detailed solution description that meets the minimum 50 character requirement for testing",
        approach:
          "This is a comprehensive approach to solving the healthcare problem meeting the fifty char minimum",
        expectedImpact: { metric: "lives_improved", value: 200, timeframe: "6 months" },
        guardrailStatus: "pending",
      })
      .returning();

    // Insert an approved solution for agent B (should NOT appear in agent A's mine=true)
    await db.insert(solutions).values({
      problemId: problem.id,
      proposedByAgentId: agentIdB,
      title: "Agent B Approved Solution That Meets Minimum Length",
      description:
        "This is a detailed solution description that meets the minimum 50 character requirement for testing",
      approach:
        "This is a comprehensive approach to solving the healthcare problem meeting the fifty char minimum",
      expectedImpact: { metric: "lives_improved", value: 300, timeframe: "6 months" },
      guardrailStatus: "approved",
    });

    // GET mine=true for agent A
    const res = await app.request("/api/v1/solutions?mine=true", {
      headers: { Authorization: `Bearer ${apiKeyA}` },
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      data: Array<{ id: string; proposedByAgentId: string }>;
    };
    expect(json.ok).toBe(true);

    // All returned solutions should belong to agent A
    for (const sol of json.data) {
      expect(sol.proposedByAgentId).toBe(agentIdA);
    }

    // Agent A's pending solution should be present
    const ids = json.data.map((s) => s.id);
    expect(ids).toContain(solA!.id);
  }, 10_000);

  // PATCH another agent's solution → 403 FORBIDDEN
  it("should return 403 when patching another agent's solution", async () => {
    const { data: regDataA } = await registerTestAgent(app);
    const apiKeyA = regDataA.data.apiKey;
    const agentIdA = regDataA.data.agentId;

    const { data: regDataB } = await registerTestAgent(app);
    const apiKeyB = regDataB.data.apiKey;

    const db = getTestDb();
    const problem = await createTestProblem(db, agentIdA);

    // Insert solution owned by agent A
    const [sol] = await db
      .insert(solutions)
      .values({
        problemId: problem.id,
        proposedByAgentId: agentIdA,
        title: "Agent A Solution That Meets Minimum Length Requirement",
        description:
          "This is a detailed solution description that meets the minimum 50 character requirement for testing",
        approach:
          "This is a comprehensive approach to solving the healthcare problem meeting the fifty char minimum",
        expectedImpact: { metric: "lives_improved", value: 100, timeframe: "6 months" },
        guardrailStatus: "pending",
      })
      .returning();

    // Agent B tries to PATCH it
    const res = await app.request(`/api/v1/solutions/${sol!.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKeyB}`,
      },
      body: JSON.stringify({
        title: "Hijacked Solution Title That Meets Minimum Length",
      }),
    });

    expect(res.status).toBe(403);
    const json = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("FORBIDDEN");
  }, 10_000);
});
