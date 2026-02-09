# API Contract: AI Budget Tracking

**Internal module** — no public API endpoints. Budget tracking is integrated into the guardrail worker pipeline.

---

## Architecture

AI budget tracking operates at the worker level (not the HTTP route level). It's a pre-check before each Layer B API call and a post-increment after each call completes.

```
Content submitted → BullMQ queue → Worker picks up job
                                    ├── Check budget cap → OVER? → Skip Layer B, flag for admin review
                                    └── Under cap → Call Layer B → Increment cost counter
```

---

## Budget Module Interface

### `checkBudgetAvailable(): Promise<boolean>`

Check if the daily AI budget has remaining capacity.

**Behavior**:
- Read Redis key `ai_cost:daily:{YYYY-MM-DD}` (current UTC date)
- Compare value against `AI_DAILY_BUDGET_CAP_CENTS` env var
- Return `true` if under cap, `false` if at or over

### `recordAiCost(costCents: number): Promise<{ total: number; percentUsed: number }>`

Record an AI API call cost and check alert thresholds.

**Behavior**:
1. `INCRBY ai_cost:daily:{YYYY-MM-DD}` by `costCents`
2. If key is new, set TTL to 48 hours
3. `INCRBY ai_cost:hourly:{YYYY-MM-DD}:{HH}` by `costCents`
4. If hourly key is new, set TTL to 25 hours
5. Calculate `percentUsed = total / dailyCap * 100`
6. If `percentUsed >= 80`: log warning + emit alert
7. Return `{ total, percentUsed }`

### `getDailyUsage(): Promise<{ totalCents: number; capCents: number; percentUsed: number }>`

Read current daily usage for monitoring/admin visibility.

---

## Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `AI_DAILY_BUDGET_CAP_CENTS` | int | 1333 | Daily cap in cents ($13.33 = $400/month ÷ 30) |
| `AI_BUDGET_ALERT_THRESHOLD_PCT` | int | 80 | Alert at this % of daily cap |

---

## Worker Integration

The guardrail worker's `processEvaluation()` function is modified:

```
Before Layer B call:
  1. const available = await checkBudgetAvailable()
  2. if (!available):
     - Set finalDecision = 'flagged'
     - Set evaluation notes: "Budget cap reached — routed to manual review"
     - Create flaggedContent entry
     - Skip Layer B call entirely
     - Return early

After Layer B call:
  1. const costCents = estimateLayerBCost(inputTokens, outputTokens)
  2. await recordAiCost(costCents)
```

---

## Cost Estimation

Layer B calls are estimated at ~$0.003 per call (Claude Haiku 4.5 pricing):
- Input: ~500 tokens × $0.001/1K = $0.0005
- Output: ~200 tokens × $0.005/1K = $0.0010
- Total: ~$0.0015 per call ≈ 0.15 cents

Rounded up to 0.3 cents per call for safety margin.

---

## Alert Behavior

| Threshold | Action |
|-----------|--------|
| 50% daily cap | Info-level log entry |
| 80% daily cap | Warning log + structured alert (Pino warn with `alertType: "budget"`) |
| 100% daily cap | All new evaluations bypass Layer B → admin review |

---

## Monitoring

Budget usage is observable via:
- Structured Pino logs (searchable in production)
- Direct Redis key inspection (`GET ai_cost:daily:2026-02-08`)
- Future: Grafana dashboard panel (Phase 2)
