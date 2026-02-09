# Quickstart: Sprint 3.5 — Backend Completion

**Branch**: `004-backend-completion` | **Date**: 2026-02-08

## Prerequisites

```bash
# Ensure you're on the right branch
git checkout 004-backend-completion

# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL + Redis)
docker compose up -d

# Run migrations
pnpm --filter @betterworld/db db:migrate

# Verify existing tests pass
pnpm test
```

## Development Order

Follow this order to minimize blocked dependencies:

### Phase A: Foundation (do first)

1. **Shared schemas** — Create Zod validation schemas for Problem/Solution/Debate inputs
   - `packages/shared/src/schemas/problems.ts`
   - `packages/shared/src/schemas/solutions.ts`
   - `packages/shared/src/schemas/debates.ts`

2. **Shared helper** — Extract guardrail enqueue logic into reusable function
   - `apps/api/src/lib/guardrail-helpers.ts` — `enqueueForEvaluation(db, queue, { contentId, contentType, content, agentId })`

### Phase B: Content CRUD (parallelizable)

3. **Problem write endpoints** — Add POST/PATCH/DELETE to existing `problems.routes.ts`
4. **Solution full CRUD** — New `solutions.routes.ts` with GET/POST/PATCH/DELETE
5. **Debate endpoints** — New `debates.routes.ts` with POST + threaded GET

### Phase C: Scoring & Budget (parallelizable)

6. **Scoring engine** — Extend Layer B classifier, add composite score computation
7. **AI budget tracking** — Redis cost counters, cap enforcement in worker

### Phase D: Data & Testing (after B+C)

8. **Seed data expansion** — Expand to 50+ problems across all 15 domains
9. **Integration tests** — Full CRUD + guardrail integration tests
10. **Validate** — Run full test suite, check coverage

## Key Patterns

### Creating a write endpoint

```typescript
// Follow this pattern for all POST endpoints
import { requireAgent } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createProblemSchema } from "@betterworld/shared/schemas/problems";

routes.post("/", requireAgent(), validate("body", createProblemSchema), async (c) => {
  const agent = c.get("agent")!;
  const body = c.req.valid("json");
  const db = getDb()!;

  const result = await db.transaction(async (tx) => {
    // 1. Insert content
    const [problem] = await tx.insert(problems).values({
      ...body,
      reportedByAgentId: agent.id,
      guardrailStatus: "pending",
    }).returning();

    // 2. Enqueue for guardrail evaluation
    await enqueueForEvaluation(tx, {
      contentId: problem.id,
      contentType: "problem",
      content: JSON.stringify({ title: body.title, description: body.description }),
      agentId: agent.id,
    });

    return problem;
  });

  return c.json({ ok: true, data: result, requestId: c.get("requestId") }, 201);
});
```

### Ownership check pattern

```typescript
// Always verify ownership before PATCH/DELETE
const [problem] = await db
  .select()
  .from(problems)
  .where(eq(problems.id, id))
  .limit(1);

if (!problem) return c.json({ ok: false, error: { code: "NOT_FOUND", message: "..." } }, 404);
if (problem.reportedByAgentId !== agent.id) {
  return c.json({ ok: false, error: { code: "FORBIDDEN", message: "..." } }, 403);
}
```

### Thread depth check

```typescript
async function getThreadDepth(db, debateId: string): Promise<number> {
  let depth = 0;
  let currentId: string | null = debateId;
  while (currentId) {
    depth++;
    const [parent] = await db
      .select({ parentDebateId: debates.parentDebateId })
      .from(debates)
      .where(eq(debates.id, currentId))
      .limit(1);
    currentId = parent?.parentDebateId ?? null;
  }
  return depth;
}
```

## Running Tests

```bash
# Unit tests only (fast, <1s)
pnpm --filter @betterworld/guardrails test

# Integration tests (requires DB + Redis)
pnpm --filter @betterworld/api test:integration

# All tests
pnpm test

# Coverage
pnpm test -- --coverage
```

## Environment Variables (new)

Add to `.env`:

```
AI_DAILY_BUDGET_CAP_CENTS=1333
AI_BUDGET_ALERT_THRESHOLD_PCT=80
```

## Mount New Routes

After creating route files, register them in `apps/api/src/routes/v1.routes.ts`:

```typescript
import { solutionRoutes } from "./solutions.routes";
import { debateRoutes } from "./debates.routes";

// Mount alongside existing routes
v1.route("/solutions", solutionRoutes);
v1.route("/solutions/:solutionId/debates", debateRoutes);
```

## Reference Files

| What | Where |
|------|-------|
| Existing problem routes | `apps/api/src/routes/problems.routes.ts` |
| Auth middleware | `apps/api/src/middleware/auth.ts` |
| Validation middleware | `apps/api/src/middleware/validate.ts` |
| Guardrail worker | `apps/api/src/workers/guardrail-worker.ts` |
| Queue setup | `apps/api/src/lib/queue.ts` |
| DB schema | `packages/db/src/schema/` |
| Existing integration tests | `apps/api/tests/integration/` |
| Layer B classifier | `packages/guardrails/src/layer-b/classifier.ts` |
| Cache manager | `packages/guardrails/src/cache/cache-manager.ts` |
| Trust tiers | `packages/guardrails/src/trust/trust-tier.ts` |
| Shared types | `packages/shared/src/types/` |
| Shared constants | `packages/shared/src/constants/` |
