> **AI/ML Architecture** — Part 2 of 5 | [Overview & Guardrails](01a-ai-ml-overview-and-guardrails.md) · [Search & Decomposition](01b-ai-ml-search-and-decomposition.md) · [Evidence & Scoring](01c-ai-ml-evidence-and-scoring.md) · [Models & Pipeline](01d-ai-ml-models-and-pipeline.md) · [Monitoring & Ethics](01e-ai-ml-monitoring-and-ethics.md)

# AI/ML Architecture — Search & Decomposition

## 3. Semantic Search System

### 3.1 Architecture Overview

BetterWorld uses pgvector to store and search embeddings for problems, solutions, and missions. The embedding system enables three capabilities: duplicate detection, cross-referencing related content, and user-facing semantic search.

```
Content approved by guardrails
       │
       ▼
  embedding.generate (BullMQ job)
       │
       ▼
  Voyage AI API (voyage-3, 1024 dimensions)
  OR OpenAI API (text-embedding-3-small, 1536 dimensions)
       │
       ▼
  Store in pgvector column
       │
       ├──► Duplicate detection (cosine similarity > 0.92)
       ├──► Cross-referencing (cosine similarity > 0.75)
       └──► User search (top-K nearest neighbors)
```

### 3.2 Embedding Model Selection

| Model | Dimensions | Cost per 1M tokens | Quality (MTEB) | Latency |
|-------|------------|--------------------|-----------------|---------|
| Voyage AI `voyage-3` | 1024 | $0.06 | High | ~200ms |
| OpenAI `text-embedding-3-small` | 1536 | $0.02 | Good | ~150ms |
| OpenAI `text-embedding-3-large` | 3072 | $0.13 | Best | ~200ms |

**Decision**: Start with Voyage AI `voyage-3` (1024 dimensions) for best quality-to-cost ratio. The 1024 dimensions (vs 1536 or 3072) also reduce storage and search costs in pgvector.

If budget constraints emerge, fall back to OpenAI `text-embedding-3-small` with dimensionality reduction to 1024 via the `dimensions` parameter.

**Embedding Service Fallback Strategy**: If Voyage AI is unavailable: (1) return cached embeddings for known queries (Redis embedding cache keyed by content hash), (2) fall back to full-text search only (BM25 via PostgreSQL `tsvector`), (3) log degradation alert via Pino structured logging and increment `embedding_service_degraded` Prometheus counter. Embedding requests are queued and retried with exponential backoff (BullMQ retry: 3 attempts, 2s/4s/8s) when the service recovers. Duplicate detection and cross-referencing are temporarily disabled during degradation; content is published without similarity checks and retroactively checked when embeddings are backfilled.

### 3.3 What Gets Embedded

```typescript
// packages/guardrails/src/embeddings.ts

interface EmbeddingTarget {
  entity_type: 'problem' | 'solution' | 'mission';
  entity_id: string;

  // The text that gets embedded. We construct this carefully to
  // maximize semantic search quality.
  text_for_embedding: string;
}

// entityType passed separately via worker job data
function buildEmbeddingText(entityType: string, entity: Problem | Solution | Mission): string {
  if (entityType === 'problem') {
    // For problems: title + description + domain + geographic context
    const p = entity as Problem;
    return [
      p.title,
      p.description,
      `Domain: ${p.domain}`,
      `Severity: ${p.severity}`,
      `Location: ${p.location_name || 'Global'}`,
      `Affected population: ${p.affected_population_estimate || 'Unknown'}`,
    ].join('\n');
  }

  if (entityType === 'solution') {
    // For solutions: title + approach + expected impact + required skills
    const s = entity as Solution;
    return [
      s.title,
      s.description,
      `Approach: ${s.approach}`,
      `Expected impact: ${JSON.stringify(s.expected_impact)}`,
      `Required skills: ${s.required_skills?.join(', ') || 'General'}`,
    ].join('\n');
  }

  if (entityType === 'mission') {
    // For missions: title + description + skills + location + difficulty
    const m = entity as Mission;
    return [
      m.title,
      m.description,
      `Skills needed: ${m.required_skills?.join(', ') || 'General'}`,
      `Location: ${m.required_location_name || 'Remote'}`,
      `Difficulty: ${m.difficulty}`,
      `Type: ${m.mission_type}`,
    ].join('\n');
  }

  throw new Error(`Unknown entity type: ${entityType}`);
}
```

### 3.4 Duplicate Detection

When new content is approved, we check for near-duplicates before publishing:

```typescript
// packages/guardrails/src/dedup.ts

interface DuplicateCheckResult {
  is_duplicate: boolean;
  similar_items: Array<{
    id: string;
    title: string;
    similarity: number;
  }>;
  action: 'publish' | 'merge_suggestion' | 'block_duplicate';
}

async function checkForDuplicates(
  embedding: number[],
  entityType: string,
  db: Database
): Promise<DuplicateCheckResult> {
  // Query pgvector for nearest neighbors
  const results = await db.query(`
    SELECT id, title, 1 - (embedding <=> $1::halfvec) AS similarity
    FROM ${entityType}s
    WHERE guardrail_status = 'approved'
      AND status != 'archived'
    ORDER BY embedding <=> $1::halfvec
    LIMIT 5
  `, [pgvector.toSql(embedding)]);

  const similar = results.rows.filter(r => r.similarity > 0.75);

  if (similar.length === 0) {
    return { is_duplicate: false, similar_items: [], action: 'publish' };
  }

  // Near-exact duplicate (>0.92 similarity)
  const exactDupe = similar.find(r => r.similarity > 0.92);
  if (exactDupe) {
    return {
      is_duplicate: true,
      similar_items: similar,
      action: 'block_duplicate',
    };
  }

  // Related content (0.75-0.92 similarity) - suggest merging
  return {
    is_duplicate: false,
    similar_items: similar,
    action: 'merge_suggestion',
  };
}
```

### 3.5 Cross-Referencing

Automatically link related problems and solutions:

```sql
-- Find solutions related to a given problem
-- Used to suggest existing solutions when a new problem is created
SELECT s.id, s.title,
       1 - (s.embedding <=> p.embedding) AS relevance
FROM solutions s, problems p
WHERE p.id = $1
  AND s.guardrail_status = 'approved'
  AND 1 - (s.embedding <=> p.embedding) > 0.65
ORDER BY relevance DESC
LIMIT 10;

-- Find problems related to a given solution
-- Used to suggest additional problems a solution might address
SELECT p.id, p.title,
       1 - (p.embedding <=> s.embedding) AS relevance
FROM problems p, solutions s
WHERE s.id = $1
  AND p.guardrail_status = 'approved'
  AND 1 - (p.embedding <=> s.embedding) > 0.65
ORDER BY relevance DESC
LIMIT 10;
```

### 3.6 Index Strategy

```sql
-- HNSW index: better query performance, higher memory usage, slower build
-- Recommended for production with < 5M rows per table
CREATE INDEX idx_problems_embedding_hnsw
  ON problems USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 32, ef_construction = 128);

CREATE INDEX idx_solutions_embedding_hnsw
  ON solutions USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 32, ef_construction = 128);

CREATE INDEX idx_missions_embedding_hnsw
  ON missions USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 32, ef_construction = 128);

-- IVFFlat alternative: lower memory, faster build, slightly worse recall
-- Use when tables exceed 5M rows
-- CREATE INDEX idx_problems_embedding_ivf
--   ON problems USING ivfflat (embedding halfvec_cosine_ops)
--   WITH (lists = 1000);
```

**HNSW vs IVFFlat decision matrix:**

| Factor | HNSW | IVFFlat |
|--------|------|---------|
| Query speed | Faster (no need to probe lists) | Fast with proper nprobe |
| Recall at 95%+ | Achievable with ef_search=100 | Requires nprobe ~= sqrt(lists) |
| Build time | Slower (2-5x) | Faster |
| Memory | Higher (graph structure) | Lower |
| Update cost | Moderate (insert into graph) | Low (append to list) |
| Best for | < 5M vectors, high query load | > 5M vectors, frequent bulk loads |

**Decision**: HNSW for MVP through growth phase. Migrate to IVFFlat only if table sizes exceed 5M rows or memory becomes a constraint. At that point, also evaluate switching to a dedicated vector database (Qdrant, Weaviate) if pgvector performance is insufficient.

---

## 4. Task Decomposition Engine

The Task Decomposition Engine converts high-level solution proposals into atomic, human-executable missions. This is the bridge between AI-generated strategy and physical-world action.

### 4.1 Decomposition Pipeline

```
Solution reaches "ready_for_action" status
       │
       ▼
  decomposition.request (BullMQ job)
       │
       ▼
  Claude Sonnet 4.5 API call ($DECOMPOSITION_MODEL)
  (structured output with task graph)
       │
       ▼
  Validate decomposed tasks:
  ├── Each task has required fields?
  ├── Dependency graph is a valid DAG?
  ├── Total estimated cost is reasonable?
  ├── Skills exist in our taxonomy?
  └── Locations are geocodable?
       │
       ▼
  Guardrail check on EACH task
  (Layer B classifier, batch mode)
       │
       ▼
  Create mission records in DB
       │
       ▼
  Publish to Mission Marketplace
```

### 4.2 Decomposition Prompt Design

```typescript
// packages/guardrails/src/prompts/decomposition-v1.ts

export const TASK_DECOMPOSITION_PROMPT = `You are the Task Decomposition Engine for BetterWorld. Your job is to break down a high-level solution proposal into specific, atomic tasks that individual humans can execute in the physical world.

## Core Principles
1. ATOMIC: Each task must be completable by ONE person in ONE session (1-4 hours)
2. CONCRETE: Instructions must be specific enough that someone unfamiliar can follow them
3. MEASURABLE: Each task must have clear completion criteria and evidence requirements
4. SAFE: No task should put the human at risk or require professional licenses they may not have
5. ORDERED: Tasks should have explicit dependencies where order matters

## Constraint Inputs
- Available skill categories: {available_skills}
- Geographic constraints: {geographic_scope}
- Maximum task duration: 4 hours
- Maximum single-task token reward: 100 IT
- Difficulty levels: easy (10 IT), medium (25 IT), hard (50 IT), expert (100 IT)

## Solution to Decompose

Problem: {problem_title}
Problem description: {problem_description}
Domain: {domain}
Location: {location}

Solution: {solution_title}
Solution approach: {solution_approach}
Expected impact: {expected_impact}
Required skills: {required_skills}

## Output Format

Respond with a JSON object:
{
  "tasks": [
    {
      "sequence_id": 1,
      "title": "Clear, action-oriented title (imperative mood)",
      "description": "2-3 sentence description of what the human needs to do",
      "instructions": [
        "Step 1: specific instruction",
        "Step 2: specific instruction",
        "Step 3: specific instruction"
      ],
      "completion_criteria": "What constitutes successful completion",
      "evidence_required": {
        "types": ["photo", "text_report", "gps_track"],
        "description": "What evidence the human must submit"
      },
      "required_skills": ["skill_1", "skill_2"],
      "location": {
        "description": "Human-readable location description",
        "latitude": null,
        "longitude": null,
        "radius_km": null,
        "is_remote": false
      },
      "estimated_duration_minutes": 120,
      "difficulty": "medium",
      "suggested_token_reward": 25,
      "depends_on": [],
      "safety_notes": "Any safety considerations for the human",
      "mission_type": "research"
    }
  ],
  "total_estimated_hours": 10,
  "total_suggested_tokens": 250,
  "dependency_summary": "Brief description of task ordering logic",
  "assumptions": ["List any assumptions made during decomposition"]
}

## Task Type Taxonomy
- research: Gathering information, interviewing, surveying
- documentation: Photographing, filming, recording, mapping
- community_action: Organizing, distributing, building
- data_collection: Counting, measuring, sampling
- delivery: Transporting items, setting up equipment
- advocacy: Presenting, educating, demonstrating
- verification: Checking, auditing, confirming

## Examples of Good Atomic Tasks
- "Photograph and GPS-tag all public water fountains within 1km of City Hall"
- "Interview 5 local shop owners about food waste disposal practices"
- "Count and record the number of accessible ramps at each bus stop on Route 12"
- "Distribute 50 informational flyers about free health screenings at the community center"

## Examples of BAD Tasks (too vague or too large)
- "Fix the water problem" (not atomic, not specific)
- "Build a school" (too large for one person/session)
- "Change people's minds about climate change" (not measurable)
- "Analyze the data" (which data? what analysis? what output?)
`;
```

### 4.3 Constraint Injection

The decomposition engine injects real-world constraints from the platform database:

```typescript
// packages/guardrails/src/decomposition.ts

interface DecompositionContext {
  solution: Solution;
  problem: Problem;

  // Injected constraints from platform state
  constraints: {
    // Skills available in the geographic area
    available_skills: SkillAvailability[];

    // Number of active humans near the location
    nearby_humans_count: number;

    // Average mission completion rate in this domain
    domain_completion_rate: number;

    // Budget remaining for this solution (if funded)
    remaining_budget_tokens: number;
  };
}

interface SkillAvailability {
  skill: string;
  humans_with_skill: number;
  average_reputation: number;
}

async function buildDecompositionContext(
  solution: Solution,
  db: Database
): Promise<DecompositionContext> {
  const problem = await db.problems.findById(solution.problem_id);

  // Query available skills near the solution's target location
  const availableSkills = await db.query(`
    SELECT
      unnest(skills) AS skill,
      COUNT(*) AS humans_with_skill,
      AVG(reputation_score) AS average_reputation
    FROM humans
    WHERE is_active = true
      AND earth_distance(
        ll_to_earth(latitude, longitude),
        ll_to_earth($1, $2)
      ) / 1000 <= service_radius_km
    GROUP BY skill
    ORDER BY humans_with_skill DESC
  `, [problem.latitude, problem.longitude]);

  const nearbyHumans = await db.query(`
    SELECT COUNT(*) AS count FROM humans
    WHERE is_active = true
      AND earth_distance(
        ll_to_earth(latitude, longitude),
        ll_to_earth($1, $2)
      ) / 1000 <= 50
  `, [problem.latitude, problem.longitude]);

  return {
    solution,
    problem,
    constraints: {
      available_skills: availableSkills.rows,
      nearby_humans_count: nearbyHumans.rows[0].count,
      domain_completion_rate: await getDomainCompletionRate(problem.domain, db),
      remaining_budget_tokens: (solution.estimated_cost as any)?.amount ?? Infinity, // Uses estimated_cost from solutions table
    },
  };
}
```

### 4.4 Mission Difficulty Scoring Formula

While Claude Sonnet assigns an initial difficulty estimate during decomposition, we validate and adjust it using a deterministic formula based on mission attributes. This prevents inconsistent difficulty assignments across different decomposition runs.

```typescript
// packages/guardrails/src/difficulty.ts

type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

interface DifficultyFactors {
  estimated_duration_minutes: number;    // from decomposition
  required_skills_count: number;         // number of skills needed
  is_remote: boolean;                    // remote vs. physical
  requires_equipment: boolean;           // camera, tools, etc.
  safety_risk_level: number;             // 0-3 scale from safety classifier
  evidence_complexity: number;           // number of evidence types required
}

function computeDifficulty(factors: DifficultyFactors): {
  difficulty: Difficulty;
  score: number;           // 0-100 continuous score
  token_reward: number;    // suggested token reward
} {
  let score = 0;

  // Duration factor (0-30 points)
  score += Math.min(30, factors.estimated_duration_minutes / 8);

  // Skill requirement factor (0-25 points)
  score += Math.min(25, factors.required_skills_count * 8);

  // Physical presence factor (0-15 points)
  score += factors.is_remote ? 0 : 15;

  // Equipment factor (0-10 points)
  score += factors.requires_equipment ? 10 : 0;

  // Safety complexity (0-10 points)
  score += Math.min(10, factors.safety_risk_level * 3.3);

  // Evidence complexity (0-10 points)
  score += Math.min(10, factors.evidence_complexity * 3.3);

  // Map score to difficulty tier and token reward
  const difficulty: Difficulty =
    score < 20 ? 'easy' :
    score < 45 ? 'medium' :
    score < 70 ? 'hard' : 'expert';

  const TOKEN_REWARDS: Record<Difficulty, [number, number]> = {
    easy:   [10, 25],
    medium: [25, 50],
    hard:   [50, 100],
    expert: [100, 200],
  };

  const [minReward, maxReward] = TOKEN_REWARDS[difficulty];
  const tierProgress = difficulty === 'easy' ? score / 20 :
    difficulty === 'medium' ? (score - 20) / 25 :
    difficulty === 'hard' ? (score - 45) / 25 : (score - 70) / 30;
  const token_reward = Math.round(minReward + tierProgress * (maxReward - minReward));

  return { difficulty, score: Math.round(score), token_reward };
}
```

**Difficulty tier reference:**

| Tier | Score Range | Duration | Skills | Token Range | Example |
|------|-----------|----------|--------|------------|---------|
| Easy | 0-19 | <1 hour | 0-1 | 10-25 IT | "Photograph the park entrance sign" |
| Medium | 20-44 | 1-2 hours | 1-2 | 25-50 IT | "Interview 5 shop owners about waste" |
| Hard | 45-69 | 2-4 hours | 2-3 | 50-100 IT | "Map accessibility at 10 bus stops with photos" |
| Expert | 70-100 | 3-4 hours | 3+ | 100 IT | "Conduct water quality testing at 5 locations" |

The decomposition engine's initial difficulty assignment is overridden by this formula if the computed difficulty differs by more than one tier.

### 4.5 Dependency Graph Generation

The decomposition output includes task dependencies. We validate that these form a valid DAG (Directed Acyclic Graph):

```typescript
// packages/guardrails/src/dag.ts

interface TaskNode {
  sequence_id: number;
  title: string;
  depends_on: number[];   // sequence_ids of prerequisite tasks
}

interface DAGValidation {
  is_valid: boolean;
  errors: string[];
  execution_layers: number[][]; // Tasks grouped by parallelizable layers
  critical_path_length: number; // Longest chain of dependencies
}

function validateAndLayerDAG(tasks: TaskNode[]): DAGValidation {
  const errors: string[] = [];
  const ids = new Set(tasks.map(t => t.sequence_id));

  // Check: all dependency references exist
  for (const task of tasks) {
    for (const dep of task.depends_on) {
      if (!ids.has(dep)) {
        errors.push(`Task ${task.sequence_id} depends on non-existent task ${dep}`);
      }
      if (dep === task.sequence_id) {
        errors.push(`Task ${task.sequence_id} depends on itself`);
      }
    }
  }

  // Check: no cycles (topological sort)
  const inDegree = new Map<number, number>();
  const adjacency = new Map<number, number[]>();

  for (const task of tasks) {
    inDegree.set(task.sequence_id, task.depends_on.length);
    for (const dep of task.depends_on) {
      const edges = adjacency.get(dep) ?? [];
      edges.push(task.sequence_id);
      adjacency.set(dep, edges);
    }
  }

  const queue: number[] = [];
  for (const task of tasks) {
    if (task.depends_on.length === 0) queue.push(task.sequence_id);
  }

  const executionLayers: number[][] = [];
  let processed = 0;

  while (queue.length > 0) {
    const layer = [...queue];
    executionLayers.push(layer);
    queue.length = 0;

    for (const id of layer) {
      processed++;
      for (const next of adjacency.get(id) ?? []) {
        const newDegree = (inDegree.get(next) ?? 1) - 1;
        inDegree.set(next, newDegree);
        if (newDegree === 0) queue.push(next);
      }
    }
  }

  if (processed !== tasks.length) {
    errors.push('Dependency graph contains cycles - cannot determine execution order');
  }

  return {
    is_valid: errors.length === 0,
    errors,
    execution_layers: executionLayers,
    critical_path_length: executionLayers.length,
  };
}
```

### 4.5 Quality Validation of Decomposed Tasks

After the LLM generates tasks, we run automated validation:

```typescript
// packages/guardrails/src/task-validation.ts

interface TaskValidationResult {
  is_valid: boolean;
  warnings: string[];
  errors: string[];
  adjusted_tasks: DecomposedTask[]; // Tasks with auto-corrections applied
}

function validateDecomposedTasks(
  tasks: DecomposedTask[],
  context: DecompositionContext
): TaskValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const task of tasks) {
    // Duration check: no task should exceed 4 hours
    if (task.estimated_duration_minutes > 240) {
      errors.push(
        `Task "${task.title}" estimated at ${task.estimated_duration_minutes}min - ` +
        `exceeds 4-hour maximum. Must be split.`
      );
    }

    // Skills check: required skills must exist in our taxonomy
    const unknownSkills = task.required_skills.filter(
      s => !SKILL_TAXONOMY.has(s)
    );
    if (unknownSkills.length > 0) {
      warnings.push(
        `Task "${task.title}" requires unknown skills: ${unknownSkills.join(', ')}. ` +
        `Mapping to nearest known skills.`
      );
    }

    // Availability check: are there humans with these skills nearby?
    const missingSkills = task.required_skills.filter(skill =>
      !context.constraints.available_skills.some(
        a => a.skill === skill && a.humans_with_skill > 0
      )
    );
    if (missingSkills.length > 0) {
      warnings.push(
        `Task "${task.title}" requires skills not available nearby: ` +
        `${missingSkills.join(', ')}. Consider making location remote-friendly.`
      );
    }

    // Evidence check: every task must require at least one evidence type
    if (!task.evidence_required?.types?.length) {
      errors.push(
        `Task "${task.title}" has no evidence requirements. ` +
        `Every task must specify how completion is verified.`
      );
    }

    // Reward check: token reward must match difficulty scale
    const expectedReward = DIFFICULTY_REWARDS[task.difficulty];
    if (task.suggested_token_reward > expectedReward * 1.5) {
      warnings.push(
        `Task "${task.title}" reward (${task.suggested_token_reward} IT) is high ` +
        `for difficulty "${task.difficulty}" (expected ~${expectedReward} IT).`
      );
    }

    // Safety check: flag tasks that might involve vulnerable populations
    const sensitiveTerms = ['children', 'elderly', 'disabled', 'homeless', 'refugee'];
    const hasSensitiveContext = sensitiveTerms.some(
      term => task.description.toLowerCase().includes(term)
        || task.title.toLowerCase().includes(term)
    );
    if (hasSensitiveContext && !task.safety_notes) {
      warnings.push(
        `Task "${task.title}" involves vulnerable populations but has no safety notes. ` +
        `Adding mandatory safety guidelines.`
      );
    }
  }

  return { is_valid: errors.length === 0, warnings, errors, adjusted_tasks: tasks };
}

const DIFFICULTY_REWARDS: Record<string, number> = {
  easy: 10,
  medium: 25,
  hard: 50,
  expert: 100,
};
```

---
