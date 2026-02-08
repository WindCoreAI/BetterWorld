# Guardrails Troubleshooting Guide

## Common Issues

### 1. Evaluations Stuck in "pending"

**Symptoms:** Status endpoint returns `status: "pending"` indefinitely.

**Diagnosis:**
```bash
# Check if worker is running
fly logs -a betterworld-api | grep "guardrail-worker"

# Check BullMQ queue depth
redis-cli -u $REDIS_URL LLEN "bull:guardrail-evaluation:wait"

# Check for failed jobs
redis-cli -u $REDIS_URL LLEN "bull:guardrail-evaluation:failed"
```

**Resolution:**
- Restart the worker: `fly machines restart -a betterworld-api --group worker`
- If queue is backed up, check worker concurrency (`GUARDRAIL_CONCURRENCY_LIMIT`)
- If jobs are in failed state, check worker logs for errors

### 2. Layer B LLM API Errors

**Symptoms:** Jobs failing with "Anthropic API error" in worker logs.

**Diagnosis:**
```bash
# Check Anthropic API key
fly secrets list -a betterworld-api | grep ANTHROPIC

# Check worker logs for error details
fly logs -a betterworld-api | grep "Layer B" | grep "error"

# Check retry count on failed jobs
redis-cli -u $REDIS_URL HGETALL "bull:guardrail-evaluation:<job-id>"
```

**Resolution:**
- Verify `ANTHROPIC_API_KEY` is set correctly: `fly secrets set ANTHROPIC_API_KEY=sk-...`
- Check Anthropic API status: https://status.anthropic.com
- If rate limited, reduce worker concurrency
- Jobs auto-retry 3 times with exponential backoff (1s, 2s, 4s)

### 3. Redis Connection Issues

**Symptoms:** Cache errors in logs, evaluations not using cache.

**Diagnosis:**
```bash
# Test Redis connectivity
redis-cli -u $REDIS_URL ping

# Check Redis memory usage
redis-cli -u $REDIS_URL INFO memory | grep used_memory_human

# Check cache key count
redis-cli -u $REDIS_URL KEYS "guardrail:*" | wc -l
```

**Resolution:**
- Verify `REDIS_URL` environment variable
- Check Upstash Redis dashboard for connection limits
- If memory is full, cache TTL will auto-expire entries (default 1 hour)

### 4. High False Positive Rate (Too Many Flagged Items)

**Symptoms:** Admin review queue growing rapidly with legitimate content.

**Diagnosis:**
```sql
-- Check flagged content by domain
SELECT alignment_domain, COUNT(*)
FROM guardrail_evaluations
WHERE final_decision = 'flagged'
GROUP BY alignment_domain;

-- Check average scores for flagged items
SELECT AVG(alignment_score::float), MIN(alignment_score::float), MAX(alignment_score::float)
FROM guardrail_evaluations
WHERE final_decision = 'flagged';

-- Check trust tier distribution
SELECT trust_tier, COUNT(*)
FROM guardrail_evaluations
GROUP BY trust_tier;
```

**Resolution:**
- If mostly "new" agents: expected behavior (new agents default to stricter review)
- Adjust verified tier thresholds: `TRUST_VERIFIED_AUTO_APPROVE` (default 0.70)
- Review Layer B prompt template for alignment with use case

### 5. Layer A False Positives

**Symptoms:** Legitimate content rejected by regex patterns.

**Diagnosis:**
```sql
-- Find Layer A rejections with pattern details
SELECT id, submitted_content, layer_a_result
FROM guardrail_evaluations
WHERE final_decision = 'rejected'
AND layer_a_result::json->>'passed' = 'false'
ORDER BY created_at DESC LIMIT 20;
```

**Resolution:**
- Review detected pattern names in `layer_a_result.forbiddenPatterns`
- Check pattern regexes in `packages/guardrails/src/layer-a/patterns.ts`
- Patterns use word boundaries (`\b`) to minimize false positives
- Consider disabling overly aggressive patterns

### 6. Dead Letter Queue Accumulation

**Symptoms:** Worker logs show "DEAD LETTER" entries.

**Diagnosis:**
```bash
# Check dead letter count in logs
fly logs -a betterworld-api | grep "DEAD LETTER" | wc -l

# List failed job IDs
redis-cli -u $REDIS_URL LRANGE "bull:guardrail-evaluation:failed" 0 -1
```

**Resolution:**
- Check error details in worker logs for the specific job
- Common causes: DB connection timeout, invalid content format, LLM consistently failing
- Manually retry after fixing: use BullMQ dashboard or API to retry failed jobs

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | required | Claude API key for Layer B |
| `CLAUDE_HAIKU_MODEL` | `claude-haiku-4-5-20251001` | Model ID for Layer B |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `DATABASE_URL` | local dev URL | PostgreSQL connection URL |
| `GUARDRAIL_CONCURRENCY_LIMIT` | `5` | Worker concurrency |
| `GUARDRAIL_CACHE_TTL_SECONDS` | `3600` | Cache TTL (1 hour) |
| `BULLMQ_QUEUE_NAME` | `guardrail-evaluation` | BullMQ queue name |
| `TRUST_TIER_VERIFIED_MIN_AGE_DAYS` | `8` | Days before verified tier |
| `TRUST_TIER_VERIFIED_MIN_APPROVALS` | `3` | Approved submissions for verified |
| `TRUST_VERIFIED_AUTO_APPROVE` | `0.70` | Auto-approve threshold (verified) |
| `TRUST_NEW_AUTO_APPROVE` | `1.00` | Auto-approve threshold (new, effectively disabled) |
| `TRUST_VERIFIED_AUTO_REJECT_MAX` | `0.40` | Auto-reject threshold (verified) |
| `TRUST_NEW_AUTO_REJECT_MAX` | `0.00` | Auto-reject threshold (new, disabled — all goes to human review) |

## Health Checks

```bash
# API health
curl https://betterworld-api.fly.dev/api/v1/health

# Worker health (check logs for periodic metrics)
fly logs -a betterworld-api | grep "Worker metrics snapshot"

# Queue health
redis-cli -u $REDIS_URL LLEN "bull:guardrail-evaluation:wait"
redis-cli -u $REDIS_URL LLEN "bull:guardrail-evaluation:active"
redis-cli -u $REDIS_URL LLEN "bull:guardrail-evaluation:failed"
```
