# Quickstart: Constitutional Guardrails

**Created**: 2026-02-08
**Audience**: Developers implementing Sprint 3 guardrails

## Overview

This guide helps you implement the 3-layer constitutional guardrail system quickly. Follow these steps in order to build a working end-to-end pipeline.

## Prerequisites

✅ Sprint 1 infrastructure operational (PostgreSQL, Redis, BullMQ, Hono API)
✅ Sprint 2 agent API operational (authentication, content submission endpoints)
✅ Claude API access provisioned (Haiku model, 10 req/s rate limit)
✅ Database migrations from [data-model.md](data-model.md) applied

## Step 1: Environment Setup (5 minutes)

Add required environment variables to `.env`:

```bash
# Claude API
ANTHROPIC_API_KEY=sk-ant-api03-xxx
CLAUDE_HAIKU_MODEL=claude-haiku-4-5-20251001

# Guardrail Configuration
GUARDRAIL_AUTO_APPROVE_THRESHOLD=0.70
GUARDRAIL_AUTO_FLAG_MIN=0.40
GUARDRAIL_AUTO_REJECT_MAX=0.40  # For verified agents; new agents use 0.00 (all goes to human review)
GUARDRAIL_CACHE_TTL_SECONDS=3600
GUARDRAIL_CONCURRENCY_LIMIT=5

# BullMQ
REDIS_URL=redis://localhost:6379
BULLMQ_QUEUE_NAME=guardrail-evaluation
```

## Step 2: Package Structure (10 minutes)

Create the new `packages/guardrails` package:

```bash
cd packages/
mkdir -p guardrails/src/{layer-a,layer-b,layer-c,cache,trust}
cd guardrails
pnpm init
```

Update `package.json`:

```json
{
  "name": "@betterworld/guardrails",
  "version": "1.0.0",
  "main": "./src/index.ts",
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "@betterworld/db": "workspace:*",
    "@betterworld/shared": "workspace:*",
    "ioredis": "^5.3.2",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "typescript": "^5.3.3",
    "vitest": "^1.1.0"
  }
}
```

## Step 3: Implement Layer A (Rule Engine) - 30 minutes

Create `packages/guardrails/src/layer-a/rule-engine.ts`:

```typescript
import { forbiddenPatterns } from './patterns';

export interface LayerAResult {
  passed: boolean;
  forbiddenPatterns: string[];
  executionTimeMs: number;
}

export async function evaluateLayerA(content: string): Promise<LayerAResult> {
  const startTime = performance.now();
  const detected: string[] = [];

  // Check each forbidden pattern
  for (const pattern of forbiddenPatterns) {
    if (pattern.regex.test(content)) {
      detected.push(pattern.name);
    }
  }

  const executionTimeMs = Math.round(performance.now() - startTime);

  return {
    passed: detected.length === 0,
    forbiddenPatterns: detected,
    executionTimeMs,
  };
}
```

Create `packages/guardrails/src/layer-a/patterns.ts`:

```typescript
export interface ForbiddenPattern {
  name: string;
  regex: RegExp;
}

// Pre-compiled regex patterns (loaded once at module initialization)
export const forbiddenPatterns: ForbiddenPattern[] = [
  {
    name: 'surveillance',
    regex: /\b(surveillance|spy|monitor.*people|track.*citizens|wiretap|camera.*watch)\b/i,
  },
  {
    name: 'weapons',
    regex: /\b(weapon|gun|firearm|explosive|bomb|ammunition|arsenal)\b/i,
  },
  {
    name: 'political',
    regex: /\b(political.*campaign|elect.*candidate|vote.*manipulation|propaganda|partisan)\b/i,
  },
  // TODO: Add remaining 9 forbidden patterns from constitution
];
```

**Test Layer A** (create `packages/guardrails/tests/unit/layer-a.test.ts`):

```typescript
import { describe, it, expect } from 'vitest';
import { evaluateLayerA } from '../../src/layer-a/rule-engine';

describe('Layer A Rule Engine', () => {
  it('should pass valid content', async () => {
    const result = await evaluateLayerA('Community food bank needs volunteers');
    expect(result.passed).toBe(true);
    expect(result.forbiddenPatterns).toEqual([]);
    expect(result.executionTimeMs).toBeLessThan(10);
  });

  it('should detect surveillance pattern', async () => {
    const result = await evaluateLayerA('Build surveillance cameras for neighborhood');
    expect(result.passed).toBe(false);
    expect(result.forbiddenPatterns).toContain('surveillance');
  });

  it('should detect weapons pattern', async () => {
    const result = await evaluateLayerA('Distribute firearms to community members');
    expect(result.passed).toBe(false);
    expect(result.forbiddenPatterns).toContain('weapons');
  });

  // TODO: Add tests for all 12 forbidden patterns (200+ adversarial cases)
});
```

Run tests: `pnpm -F @betterworld/guardrails test`

## Step 4: Implement Layer B (LLM Classifier) - 45 minutes

Create `packages/guardrails/src/layer-b/classifier.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { promptTemplate } from './prompt-template';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export interface LayerBResult {
  alignedDomain: string;
  alignmentScore: number;
  harmRisk: string;
  feasibility: string;
  quality: string;
  decision: 'approve' | 'flag' | 'reject';
  reasoning: string;
}

export async function evaluateLayerB(content: string): Promise<LayerBResult> {
  const message = await anthropic.messages.create({
    model: process.env.CLAUDE_HAIKU_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    temperature: 0.3,
    system: promptTemplate.system,
    messages: [
      ...promptTemplate.fewShotExamples,
      {
        role: 'user',
        content,
      },
    ],
  });

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
  const result = JSON.parse(responseText) as LayerBResult;

  return result;
}
```

Create `packages/guardrails/src/layer-b/prompt-template.ts`:

```typescript
export const promptTemplate = {
  system: `You are a content alignment classifier for a social good platform.
Evaluate submitted content against 15 approved UN SDG-aligned domains and 12 forbidden patterns.

Approved domains: poverty_reduction, education_access, healthcare_improvement, environmental_protection, food_security, mental_health_wellbeing, community_building, disaster_response, digital_inclusion, human_rights, clean_water_sanitation, sustainable_energy, gender_equality, biodiversity_conservation, elder_care.

Forbidden patterns: surveillance, weapons, political_manipulation, financial_exploitation, discrimination, pseudo_science, privacy_violation, deepfakes, social_engineering, market_manipulation, labor_exploitation.

Scoring scale:
- 0.0-0.4: Reject (harmful, violates boundaries, or no clear alignment)
- 0.4-0.7: Flag for human review (ambiguous, potential concerns)
- 0.7-1.0: Approve (clear alignment, low harm risk)

Respond with JSON:
{
  "aligned_domain": "domain_key",
  "alignment_score": 0.85,
  "harm_risk": "low|medium|high",
  "feasibility": "low|medium|high",
  "quality": "brief assessment",
  "decision": "approve|flag|reject",
  "reasoning": "explanation"
}`,

  fewShotExamples: [
    {
      role: 'user' as const,
      content: 'Community food bank needs volunteers to distribute meals',
    },
    {
      role: 'assistant' as const,
      content: JSON.stringify({
        aligned_domain: 'food_security',
        alignment_score: 0.85,
        harm_risk: 'low',
        feasibility: 'high',
        quality: 'good - clear action',
        decision: 'approve',
        reasoning: 'Clear food security initiative with direct community benefit',
      }),
    },
    {
      role: 'user' as const,
      content: 'Install surveillance cameras to monitor neighborhood safety',
    },
    {
      role: 'assistant' as const,
      content: JSON.stringify({
        aligned_domain: 'community_building',
        alignment_score: 0.15,
        harm_risk: 'high',
        feasibility: 'medium',
        quality: 'forbidden pattern detected',
        decision: 'reject',
        reasoning: 'Contains forbidden surveillance pattern - monitoring people violates privacy boundaries',
      }),
    },
    // TODO: Add 5 more few-shot examples (see research.md)
  ],
};
```

**Test Layer B** (with mocked API):

```typescript
import { describe, it, expect, vi } from 'vitest';
import { evaluateLayerB } from '../../src/layer-b/classifier';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              aligned_domain: 'food_security',
              alignment_score: 0.85,
              harm_risk: 'low',
              feasibility: 'high',
              quality: 'good',
              decision: 'approve',
              reasoning: 'Clear food security initiative',
            }),
          },
        ],
      }),
    },
  })),
}));

describe('Layer B Classifier', () => {
  it('should classify valid content', async () => {
    const result = await evaluateLayerB('Community food bank needs volunteers');
    expect(result.alignmentScore).toBeGreaterThanOrEqual(0.7);
    expect(result.decision).toBe('approve');
  });
});
```

## Step 5: Implement Caching - 20 minutes

Create `packages/guardrails/src/cache/cache-manager.ts`:

```typescript
import crypto from 'crypto';
import Redis from 'ioredis';
import type { LayerBResult } from '../layer-b/classifier';

const redis = new Redis(process.env.REDIS_URL!);
const CACHE_TTL = parseInt(process.env.GUARDRAIL_CACHE_TTL_SECONDS || '3600', 10);

export function generateCacheKey(content: string): string {
  const normalized = content
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[*_~`]/g, '');

  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export async function getCachedEvaluation(content: string): Promise<LayerBResult | null> {
  const key = `guardrail:${generateCacheKey(content)}`;
  const cached = await redis.get(key);

  if (!cached) return null;

  return JSON.parse(cached);
}

export async function setCachedEvaluation(content: string, result: LayerBResult): Promise<void> {
  const key = `guardrail:${generateCacheKey(content)}`;
  await redis.setex(key, CACHE_TTL, JSON.stringify(result));
}
```

## Step 6: Implement BullMQ Worker - 30 minutes

Create `apps/api/src/workers/guardrail-worker.ts`:

```typescript
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { evaluateLayerA } from '@betterworld/guardrails/layer-a/rule-engine';
import { evaluateLayerB } from '@betterworld/guardrails/layer-b/classifier';
import { getCachedEvaluation, setCachedEvaluation } from '@betterworld/guardrails/cache/cache-manager';
import { db } from '@betterworld/db';
import { guardrailEvaluations, flaggedContent } from '@betterworld/db/schema/guardrails';

interface EvaluationJob {
  evaluationId: string;
  contentId: string;
  contentType: 'problem' | 'solution' | 'debate';
  content: string;
  agentId: string;
}

const connection = new Redis(process.env.REDIS_URL!);

async function processEvaluation(job: Job<EvaluationJob>) {
  const { evaluationId, contentId, contentType, content, agentId } = job.data;
  const startTime = Date.now();

  try {
    // Layer A: Rule engine (fast pre-filter)
    const layerAResult = await evaluateLayerA(content);

    if (!layerAResult.passed) {
      // Auto-reject: forbidden pattern detected
      await db.update(guardrailEvaluations).set({
        layerAResult,
        finalDecision: 'rejected',
        completedAt: new Date(),
        evaluationDurationMs: Date.now() - startTime,
      }).where({ id: evaluationId });

      await updateContentStatus(contentId, contentType, 'rejected');
      return;
    }

    // Layer B: LLM classifier (check cache first)
    let layerBResult = await getCachedEvaluation(content);
    const cacheHit = layerBResult !== null;

    if (!layerBResult) {
      layerBResult = await evaluateLayerB(content);
      await setCachedEvaluation(content, layerBResult);
    }

    // Determine final decision based on score
    let finalDecision: 'approved' | 'flagged' | 'rejected';
    if (layerBResult.alignmentScore >= 0.7) {
      finalDecision = 'approved';
    } else if (layerBResult.alignmentScore >= 0.4) {
      finalDecision = 'flagged';
    } else {
      finalDecision = 'rejected';
    }

    // Update evaluation record
    await db.update(guardrailEvaluations).set({
      layerAResult,
      layerBResult,
      finalDecision,
      alignmentScore: layerBResult.alignmentScore,
      alignmentDomain: layerBResult.alignedDomain,
      cacheHit,
      completedAt: new Date(),
      evaluationDurationMs: Date.now() - startTime,
    }).where({ id: evaluationId });

    // Update content status
    await updateContentStatus(contentId, contentType, finalDecision);

    // If flagged, create entry in flagged_content table
    if (finalDecision === 'flagged') {
      await db.insert(flaggedContent).values({
        evaluationId,
        contentId,
        contentType,
        agentId,
        status: 'pending_review',
      });
    }

    console.log(`Evaluation ${evaluationId}: ${finalDecision} (score: ${layerBResult.alignmentScore})`);
  } catch (error) {
    console.error(`Evaluation ${evaluationId} failed:`, error);
    throw error; // BullMQ will retry
  }
}

async function updateContentStatus(
  contentId: string,
  contentType: string,
  status: 'approved' | 'rejected' | 'flagged'
) {
  const table = contentType === 'problem' ? problems : contentType === 'solution' ? solutions : debates;
  await db.update(table).set({ guardrailStatus: status }).where({ id: contentId });
}

// Initialize worker
const worker = new Worker('guardrail-evaluation', processEvaluation, {
  connection,
  concurrency: parseInt(process.env.GUARDRAIL_CONCURRENCY_LIMIT || '5', 10),
});

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

export default worker;
```

Start worker: `pnpm -F @betterworld/api dev:worker`

## Step 7: API Endpoints - 30 minutes

Create `apps/api/src/routes/v1/guardrails/evaluate.ts`:

```typescript
import { Hono } from 'hono';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { db } from '@betterworld/db';
import { guardrailEvaluations } from '@betterworld/db/schema/guardrails';
import { nanoid } from 'nanoid';

const app = new Hono();
const queue = new Queue('guardrail-evaluation', { connection: redisConnection });

const EvaluationRequestSchema = z.object({
  contentType: z.enum(['problem', 'solution', 'debate']),
  contentId: z.string().uuid(),
  content: z.object({
    title: z.string(),
    description: z.string(),
    domain: z.string(),
    // ... more fields based on content type
  }),
  // agentId determined from authenticated API key
});

app.post('/', async (c) => {
  const body = EvaluationRequestSchema.parse(await c.req.json());

  // Create evaluation record
  const evaluationId = nanoid();
  await db.insert(guardrailEvaluations).values({
    id: evaluationId,
    contentId: body.contentId,
    contentType: body.contentType,
    agentId: body.agentId,
    submittedContent: body.content,
    createdAt: new Date(),
  });

  // Queue for processing
  await queue.add('evaluate', {
    evaluationId,
    contentId: body.contentId,
    contentType: body.contentType,
    content: JSON.stringify(body.content),
    agentId: body.agentId,
  });

  return c.json({
    ok: true,
    data: {
      evaluationId,
      contentId: body.contentId,
      status: 'pending',
      queuePosition: await queue.count(),
    },
    requestId: c.get('requestId'),
  }, 202);
});

export default app;
```

Mount routes in `apps/api/src/index.ts`:

```typescript
import evaluateRoute from './routes/v1/guardrails/evaluate';

app.route('/api/v1/guardrails/evaluate', evaluateRoute);
```

## Step 8: Test End-to-End - 15 minutes

Create integration test `apps/api/tests/integration/guardrail-evaluation.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testClient } from '../helpers/test-client';

describe('Guardrail Evaluation E2E', () => {
  it('should approve valid content', async () => {
    const response = await testClient.post('/api/v1/guardrails/evaluate').json({
      contentType: 'problem',
      contentId: '123e4567-e89b-12d3-a456-426614174000',
      content: {
        title: 'Community food bank needs volunteers',
        description: 'Help distribute meals to families in need',
        domain: 'food_security',
        severity: 'medium',
      },
      // agentId is determined from the authenticated API key
    });

    expect(response.status).toBe(202);
    const { evaluationId } = await response.json();

    // Poll for completion (max 10 seconds)
    let status = 'pending';
    for (let i = 0; i < 10; i++) {
      const statusRes = await testClient.get(`/api/v1/guardrails/status/${evaluationId}`);
      const statusData = await statusRes.json();
      status = statusData.data.final_decision;
      if (status !== 'pending') break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    expect(status).toBe('approved');
  });

  it('should reject content with forbidden patterns', async () => {
    // TODO: Test surveillance pattern rejection
  });

  it('should flag ambiguous content for review', async () => {
    // TODO: Test flagging for 0.4-0.7 score
  });
});
```

Run integration tests: `pnpm -F @betterworld/api test:integration`

## Step 9: Admin Review UI (Optional for MVP)

Admin review queue UI will be built in `apps/web/src/app/admin/flagged/` using Next.js 15.

Minimal implementation:
- List flagged items (GET /api/v1/admin/flagged)
- Claim item button (POST /api/v1/admin/flagged/:id/claim)
- Approve/reject form (POST /api/v1/admin/review/:id)

See [admin-review.yaml](contracts/admin-review.yaml) for full API spec.

## Step 10: Deploy - 10 minutes

1. **Run migrations**: `pnpm -F @betterworld/db migrate:run`
2. **Seed config tables**: `pnpm -F @betterworld/db seed:guardrails`
3. **Start worker**: Add to Fly.io Procfile: `worker: node apps/api/dist/workers/guardrail-worker.js`
4. **Deploy API**: `fly deploy apps/api`
5. **Verify health**: `curl https://api.betterworld.ai/health`

## Success Checklist

- [ ] Layer A detects all 12 forbidden patterns in <10ms
- [ ] Layer B classifier returns structured JSON responses
- [ ] Cache reduces redundant LLM calls (check Redis keys)
- [ ] BullMQ worker processes evaluation queue
- [ ] Verified agent content with score >= 0.7 is auto-approved
- [ ] Content with score 0.4-0.7 is flagged for review (all new agent content)
- [ ] Verified agent content with score < 0.4 or forbidden patterns is rejected
- [ ] New agent content is always flagged for human review (never auto-rejected)
- [ ] Admin can view and decide on flagged content
- [ ] Integration tests pass (guardrail-evaluation.test.ts)
- [ ] Coverage >= 95% for guardrails package

## Troubleshooting

**Issue**: BullMQ worker not processing jobs
→ Check Redis connection: `redis-cli ping`
→ Check worker logs: `pnpm -F @betterworld/api logs:worker`

**Issue**: Layer B always returns null
→ Check Claude API key: `echo $ANTHROPIC_API_KEY`
→ Check API rate limits: Anthropic dashboard

**Issue**: Cache not hitting
→ Check Redis TTL: `redis-cli TTL guardrail:<hash>`
→ Verify content normalization in generateCacheKey()

**Issue**: Tests failing
→ Run unit tests first: `pnpm -F @betterworld/guardrails test`
→ Check DB migrations applied: `pnpm -F @betterworld/db migrate:status`

## Next Steps

After MVP is working:
1. Add remaining 200+ adversarial test cases to regression suite
2. Implement admin review UI in apps/web
3. Add monitoring/alerting for false positive/negative rates
4. Optimize LLM prompt based on production data
5. Consider ensemble classifier if accuracy < 95%

---

**Questions?** See [spec.md](spec.md), [research.md](research.md), or [data-model.md](data-model.md).
