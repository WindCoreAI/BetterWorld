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

const validProblem = {
  title: "Test Problem Report About Healthcare Access in Rural Areas",
  description:
    "This is a detailed test problem description about healthcare access challenges in rural communities that meets the minimum 50 character requirement for validation",
  domain: "healthcare_improvement",
  severity: "high",
};

describe("Problem CRUD — US1 (T016-T019)", () => {
  const app = getTestApp();

  beforeAll(async () => {
    await setupTestInfra();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await teardownTestInfra();
  });

  // T016: POST valid problem -> 201, DB record has guardrailStatus "pending",
  // response has data.id and data.guardrailEvaluationId
  it("T016: creates a problem with valid payload and returns 201 with pending guardrailStatus", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    const res = await app.request("/api/v1/problems", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validProblem),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.guardrailEvaluationId).toBeDefined();
    expect(typeof body.data.id).toBe("string");
    expect(typeof body.data.guardrailEvaluationId).toBe("string");

    // Verify DB record
    const db = getTestDb();
    const [dbProblem] = await db
      .select()
      .from(problems)
      .where(eq(problems.id, body.data.id))
      .limit(1);

    expect(dbProblem).toBeDefined();
    expect(dbProblem!.guardrailStatus).toBe("pending");
    expect(dbProblem!.reportedByAgentId).toBe(agentId);
    expect(dbProblem!.title).toBe(validProblem.title);
    expect(dbProblem!.domain).toBe(validProblem.domain);
    expect(dbProblem!.severity).toBe(validProblem.severity);

    // Verify guardrail evaluation record was created
    const [evalRecord] = await db
      .select()
      .from(guardrailEvaluations)
      .where(eq(guardrailEvaluations.id, body.data.guardrailEvaluationId))
      .limit(1);

    expect(evalRecord).toBeDefined();
    expect(evalRecord!.contentId).toBe(body.data.id);
    expect(evalRecord!.contentType).toBe("problem");
    expect(evalRecord!.agentId).toBe(agentId);
  });

  // T017: POST problem with invalid domain -> 422 VALIDATION_ERROR
  it("T017: rejects problem with invalid domain and returns 422", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;

    const res = await app.request("/api/v1/problems", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...validProblem,
        domain: "invalid_domain",
      }),
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // T018: POST problem without auth -> 401 UNAUTHORIZED
  it("T018: rejects problem creation without authentication", async () => {
    const res = await app.request("/api/v1/problems", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validProblem),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  // T019: GET /problems?mine=true returns own pending problems;
  // GET without mine=true does NOT include pending problems
  it("T019: lists own pending problems with mine=true and hides them without", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;

    // Create a problem (will be pending)
    const createRes = await app.request("/api/v1/problems", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validProblem),
    });
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    const problemId = createBody.data.id;

    // GET with mine=true — should include the pending problem
    const mineRes = await app.request("/api/v1/problems?mine=true", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(mineRes.status).toBe(200);
    const mineBody = await mineRes.json();
    expect(mineBody.ok).toBe(true);
    const mineIds = mineBody.data.map((p: { id: string }) => p.id);
    expect(mineIds).toContain(problemId);

    // GET without mine=true (public listing) — should NOT include pending problem
    const publicRes = await app.request("/api/v1/problems", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(publicRes.status).toBe(200);
    const publicBody = await publicRes.json();
    const publicIds = publicBody.data.map((p: { id: string }) => p.id);
    expect(publicIds).not.toContain(problemId);
  });
});

describe("Problem CRUD — US4 (T043-T045)", () => {
  const app = getTestApp();

  beforeAll(async () => {
    await setupTestInfra();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await teardownTestInfra();
  });

  // T043: PATCH own problem -> 200, guardrailStatus reset to "pending"
  it("T043: updates own problem and resets guardrailStatus to pending", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;

    // Create a problem
    const createRes = await app.request("/api/v1/problems", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validProblem),
    });
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    const problemId = createBody.data.id;

    // Manually set guardrailStatus to "approved" to simulate it being processed
    const db = getTestDb();
    await db
      .update(problems)
      .set({ guardrailStatus: "approved" })
      .where(eq(problems.id, problemId));

    // Verify it was set to approved
    const [before] = await db
      .select({ guardrailStatus: problems.guardrailStatus })
      .from(problems)
      .where(eq(problems.id, problemId))
      .limit(1);
    expect(before!.guardrailStatus).toBe("approved");

    // PATCH the problem title
    const patchRes = await app.request(`/api/v1/problems/${problemId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Updated Problem Title About Healthcare Access in Rural Areas",
      }),
    });

    expect(patchRes.status).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody.ok).toBe(true);
    expect(patchBody.data.title).toBe(
      "Updated Problem Title About Healthcare Access in Rural Areas",
    );

    // Verify guardrailStatus was reset to "pending"
    const [after] = await db
      .select({ guardrailStatus: problems.guardrailStatus })
      .from(problems)
      .where(eq(problems.id, problemId))
      .limit(1);
    expect(after!.guardrailStatus).toBe("pending");
  });

  // T044: PATCH another agent's problem -> 403 FORBIDDEN
  it("T044: rejects update of another agent's problem with 403", async () => {
    const { data: regData1 } = await registerTestAgent(app);
    const apiKey1 = regData1.data.apiKey;

    const { data: regData2 } = await registerTestAgent(app);
    const apiKey2 = regData2.data.apiKey;

    // Agent 1 creates a problem
    const createRes = await app.request("/api/v1/problems", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey1}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validProblem),
    });
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    const problemId = createBody.data.id;

    // Agent 2 tries to PATCH agent 1's problem -> 403
    const patchRes = await app.request(`/api/v1/problems/${problemId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey2}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Hijacked Title That Should Not Be Allowed",
      }),
    });

    expect(patchRes.status).toBe(403);
    const patchBody = await patchRes.json();
    expect(patchBody.ok).toBe(false);
    expect(patchBody.error.code).toBe("FORBIDDEN");
  });

  // T045: DELETE problem with solutions -> cascaded deletion
  it("T045: deletes problem and cascades deletion of associated solutions", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    // Create a problem
    const createRes = await app.request("/api/v1/problems", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validProblem),
    });
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    const problemId = createBody.data.id;

    // Insert a solution directly in DB (bypass API to avoid extra enqueueForEvaluation)
    const db = getTestDb();
    const [solution] = await db
      .insert(solutions)
      .values({
        problemId,
        proposedByAgentId: agentId,
        title: "Test Solution for Cascade Deletion",
        description:
          "A solution description that is sufficiently long for the test case",
        approach: "We will use a phased rollout approach to address this issue",
        expectedImpact: {
          metric: "healthcare_access",
          improvement: "25%",
          timeframe: "6 months",
        },
        guardrailStatus: "approved",
      })
      .returning();

    expect(solution).toBeDefined();
    const solutionId = solution!.id;

    // Verify solution exists
    const [solutionBefore] = await db
      .select({ id: solutions.id })
      .from(solutions)
      .where(eq(solutions.id, solutionId))
      .limit(1);
    expect(solutionBefore).toBeDefined();

    // DELETE the problem
    const deleteRes = await app.request(`/api/v1/problems/${problemId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(deleteRes.status).toBe(200);
    const deleteBody = await deleteRes.json();
    expect(deleteBody.ok).toBe(true);
    expect(deleteBody.data.deleted).toBe(true);

    // Verify problem is gone
    const [problemAfter] = await db
      .select({ id: problems.id })
      .from(problems)
      .where(eq(problems.id, problemId))
      .limit(1);
    expect(problemAfter).toBeUndefined();

    // Verify solution was cascade-deleted
    const [solutionAfter] = await db
      .select({ id: solutions.id })
      .from(solutions)
      .where(eq(solutions.id, solutionId))
      .limit(1);
    expect(solutionAfter).toBeUndefined();
  });
});

describe("Problem CRUD — Edge Cases", () => {
  const app = getTestApp();

  beforeAll(async () => {
    await setupTestInfra();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await teardownTestInfra();
  });

  // POST problem with missing required fields -> 422
  it("rejects problem with missing required fields and returns 422", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;

    // Missing title and description
    const res = await app.request("/api/v1/problems", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        domain: "healthcare_improvement",
        severity: "high",
      }),
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // GET /api/v1/problems/:id returns 404 for non-existent UUID
  it("returns 404 for non-existent problem UUID", async () => {
    const nonExistentId = "00000000-0000-4000-a000-000000000000";

    const res = await app.request(`/api/v1/problems/${nonExistentId}`);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  // GET /api/v1/problems/:id returns problem data for approved problems (public access)
  it("returns approved problem data for unauthenticated requests", async () => {
    const { data: regData } = await registerTestAgent(app);
    const agentId = regData.data.agentId;

    // Insert an approved problem directly in DB
    const db = getTestDb();
    const [approvedProblem] = await db
      .insert(problems)
      .values({
        reportedByAgentId: agentId,
        title: "Approved Public Problem for Healthcare Access",
        description:
          "This is a detailed description of a publicly visible approved problem about healthcare that meets the minimum length requirement",
        domain: "healthcare_improvement",
        severity: "medium",
        guardrailStatus: "approved",
      })
      .returning();

    expect(approvedProblem).toBeDefined();

    // GET without auth — should return the approved problem
    const res = await app.request(`/api/v1/problems/${approvedProblem!.id}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe(approvedProblem!.id);
    expect(body.data.title).toBe("Approved Public Problem for Healthcare Access");
    expect(body.data.guardrailStatus).toBe("approved");
  });
});
