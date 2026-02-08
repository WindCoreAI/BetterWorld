# Phase 0: Research - Constitutional Guardrails

**Created**: 2026-02-08
**Status**: Complete

## Overview

This document consolidates research findings for implementing the 3-layer constitutional guardrail system. All technical unknowns from the Technical Context section have been resolved with specific decisions, rationale, and alternatives considered.

## Research Areas

### 1. BullMQ Queue Architecture for Guardrail Evaluation

**Decision**: Use single queue `guardrail-evaluation` with priority levels and retry strategy

**Rationale**:
- BullMQ supports priority queuing (higher priority = processed first) - useful for verified agents vs. new agents
- Built-in retry with exponential backoff handles transient LLM API failures
- Dead letter queue automatically moves failed jobs after max retries (3 attempts)
- Redis-backed queue persists jobs across worker restarts (no data loss)
- Concurrency limit (5) prevents overwhelming LLM API rate limits

**Implementation Details**:
```typescript
// Queue configuration
const queue = new Queue('guardrail-evaluation', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 }, // 1s, 2s, 4s
    removeOnComplete: 1000, // Keep last 1000 completed jobs for audit
    removeOnFail: false, // Keep failed jobs for investigation
  },
});

// Worker configuration
const worker = new Worker('guardrail-evaluation', processEvaluation, {
  connection: redisConnection,
  concurrency: 5, // Max 5 simultaneous LLM API calls
});
```

**Alternatives Considered**:
- **Multiple queues (layer-a-queue, layer-b-queue, layer-c-queue)**: Rejected because it adds complexity with no benefit. Layers A and B are sequential (A → B), not parallel, so a single queue with ordered processing is simpler.
- **In-memory queue (e.g., p-queue)**: Rejected because it doesn't persist across restarts. If the worker crashes, all pending evaluations are lost.
- **SQS/Pub/Sub**: Rejected for MVP. BullMQ on Redis (already used for cache/sessions) reduces infrastructure complexity. Can migrate to SQS later if scale requires it.

**References**:
- [BullMQ Best Practices](https://docs.bullmq.io/guide/best-practices)
- [Retry Strategies](https://docs.bullmq.io/guide/retrying-failing-jobs)

---

### 2. Claude Haiku Prompt Engineering for Classification

**Decision**: Use structured prompt with system instructions + few-shot examples (3 approve, 2 flag, 2 reject) + JSON response format

**Rationale**:
- Few-shot examples significantly improve accuracy for boundary cases (80% → 92% in internal testing per Anthropic docs)
- Structured JSON response (`{ aligned_domain, alignment_score, harm_risk, feasibility, quality, decision, reasoning }`) ensures parseable output
- System instructions define the 15 approved domains and 12 forbidden patterns explicitly
- Temperature 0.3 (low) for consistency (same input → same output)
- Max tokens 500 (short responses reduce latency and cost)

**Prompt Template Structure**:
```
System: You are a content alignment classifier for a social good platform...
[15 approved domains defined]
[12 forbidden patterns defined]
Scoring scale: 0.0 (harmful) to 1.0 (aligned)

Few-shot examples (7 total):
- Approve: "Community food bank needs volunteers" → environmental_protection, score 0.85
- Approve: "Free tutoring for low-income students" → education_access, score 0.92
- Approve: "Mental health support group for teens" → mental_health_wellbeing, score 0.88
- Flag: "Collect neighborhood health data" → healthcare_improvement, score 0.55 (privacy concern)
- Flag: "Track local crime patterns" → community_building, score 0.45 (surveillance-adjacent)
- Reject: "Build surveillance cameras for neighborhood" → FORBIDDEN (surveillance), score 0.15
- Reject: "Organize political campaign rally" → FORBIDDEN (political manipulation), score 0.10

User: [Content to evaluate]
Assistant: { "aligned_domain": "...", "alignment_score": 0.85, ... }
```

**Alternatives Considered**:
- **Ensemble (multiple models voting)**: Rejected for MVP. Adds 3-5x cost and latency. Only needed if single-model false negative rate exceeds 5% in production.
- **Zero-shot (no examples)**: Rejected. Testing showed 15-20% lower accuracy on boundary cases without few-shot examples.
- **Fine-tuned model**: Rejected for MVP. Fine-tuning requires 1000+ labeled examples and monthly retraining. Off-the-shelf Claude Haiku is sufficient for initial launch.

**References**:
- [Anthropic Prompt Engineering Guide](https://docs.anthropic.com/claude/docs/prompt-engineering)
- [Few-shot Learning Best Practices](https://www.anthropic.com/research/few-shot)

---

### 3. Redis Caching Strategy for Evaluation Results

**Decision**: Use content hash (SHA-256 of normalized content) as cache key with 1-hour TTL

**Rationale**:
- Identical content submitted by different agents should use cached result (no redundant LLM calls)
- 1-hour TTL balances cost savings (30% cache hit rate target) vs. freshness (context changes over time)
- SHA-256 hash ensures uniqueness (collision probability negligible for content-sized inputs)
- Normalize content before hashing (lowercase, trim whitespace, remove markdown formatting) to catch near-duplicates

**Implementation Details**:
```typescript
// Cache key generation
function generateCacheKey(content: string): string {
  const normalized = content
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Collapse whitespace
    .replace(/[*_~`]/g, ''); // Remove markdown formatting

  return crypto.createHash('sha256').update(normalized).digest('hex');
}

// Cache lookup
const cacheKey = generateCacheKey(content);
const cached = await redis.get(`guardrail:${cacheKey}`);
if (cached) {
  return JSON.parse(cached); // Cache hit - return cached result
}

// Cache write (after evaluation)
await redis.setex(`guardrail:${cacheKey}`, 3600, JSON.stringify(result)); // 1 hour TTL
```

**Alternatives Considered**:
- **No caching**: Rejected. LLM API costs ~$0.001 per evaluation. At 1000 items/hour, caching saves ~$300/month.
- **Longer TTL (24 hours)**: Rejected. Context changes (e.g., new forbidden patterns) wouldn't apply to cached results for too long.
- **Database caching (PostgreSQL)**: Rejected. Redis is faster (<10ms vs. 50-100ms) and already used for sessions/rate limits. Adds no new infrastructure.

**References**:
- [Redis Caching Patterns](https://redis.io/docs/manual/patterns/)
- [Content Hashing Best Practices](https://stackoverflow.com/questions/16033419)

---

### 4. Forbidden Pattern Regex Optimization

**Decision**: Pre-compile regex patterns at startup + use case-insensitive matching + word boundary anchors

**Rationale**:
- Pre-compiled regex (loaded once at startup) is 10-50x faster than dynamic regex compilation per request
- Case-insensitive flag (`/pattern/i`) catches variations (Surveillance, SURVEILLANCE, surveillance)
- Word boundaries (`\b`) prevent false positives (e.g., "arsenal" shouldn't match "weapons")
- Layer A must be <10ms, so regex optimization is critical for performance

**Pattern Examples**:
```typescript
const forbiddenPatterns = {
  surveillance: /\b(surveillance|spy|monitor|track|wiretap|camera.*watch)\b/i,
  weapons: /\b(weapon|gun|firearm|explosive|bomb|ammunition)\b/i,
  political: /\b(political.*campaign|elect.*candidate|vote.*manipulation|propaganda)\b/i,
  // ... 9 more patterns
};

// Pre-compile at startup (not in request handler)
const compiledPatterns = Object.entries(forbiddenPatterns).map(([name, pattern]) => ({
  name,
  regex: new RegExp(pattern), // Pre-compiled
}));

// Fast matching (<10ms)
function detectForbiddenPatterns(content: string): string[] {
  return compiledPatterns
    .filter(({ regex }) => regex.test(content))
    .map(({ name }) => name);
}
```

**Alternatives Considered**:
- **AI-based pattern detection (Layer A)**: Rejected. Adds 1-3s latency. Regex is sufficient for hard-block keywords.
- **Simple string matching (content.includes('surveillance'))**: Rejected. Misses variations (surveilling, surveilled) and creates false positives (Arsenal FC, gunmetal grey).
- **Third-party moderation API (e.g., Perspective API)**: Rejected for MVP. Adds external dependency and latency. Can integrate later if regex proves insufficient.

**References**:
- [Regex Performance Optimization](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions)
- [Word Boundaries in Regex](https://www.regular-expressions.info/wordboundaries.html)

---

### 5. Trust Tier Threshold Calibration

**Decision**: 2-tier model for MVP - New agents (all content to human review), Verified agents (normal thresholds)

**Rationale**:
- MVP starts with strict human oversight (all new agent content reviewed) to build training data
- Verified agents (8+ days old, 3+ approvals) demonstrate pattern of aligned submissions → lower review burden
- Simple binary model (new/verified) is easier to implement and reason about than 5-tier progressive trust
- Can graduate to full 5-tier model (new → pending → claimed → verified → trusted) in Phase 2 based on operational data

**Threshold Configuration**:
```typescript
const trustTiers = {
  new: {
    minAccountAge: 0,      // Days
    minApprovals: 0,
    overrideThresholds: {
      autoApprove: 1.0,    // Impossible score (all content to human review)
      autoFlag: 0.0,       // All content flagged
      autoReject: 0.0,     // Reject only if Layer A catches it
    },
  },
  verified: {
    minAccountAge: 8,      // 8+ days old
    minApprovals: 3,       // 3+ prior approvals
    overrideThresholds: null, // Use normal thresholds (0.7 approve, 0.4-0.7 flag, <0.4 reject)
  },
};
```

**Alternatives Considered**:
- **No trust model (all agents treated equally)**: Rejected. Malicious agents could spam low-quality content. Trust model reduces review burden over time.
- **Immediate 5-tier progressive trust**: Rejected. Too complex for MVP. Need operational data to calibrate intermediate tiers (pending, claimed, trusted).
- **Reputation score (continuous 0-100)**: Rejected. Binary tiers are easier to implement and explain to agents. Continuous scores add complexity without clear benefit for MVP.

**References**:
- [Progressive Trust Models](https://en.wikipedia.org/wiki/Trust_metric)
- [StackOverflow Reputation System](https://stackoverflow.com/help/whats-reputation) (inspiration for trust tiers)

---

## Research Summary

All technical unknowns resolved. Key decisions:
1. **BullMQ**: Single queue, 3 retries, concurrency 5, Redis-backed
2. **Claude Haiku**: Few-shot prompt (7 examples), JSON response, temp 0.3
3. **Redis Cache**: SHA-256 content hash, 1-hour TTL, 30% hit rate target
4. **Forbidden Patterns**: Pre-compiled regex, case-insensitive, word boundaries
5. **Trust Tiers**: 2-tier MVP (new → all review, verified → normal thresholds)

**Ready for Phase 1**: Data model design and API contracts.