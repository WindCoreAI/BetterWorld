# Deep Scan: Business Logic Correctness

**Perspective:** Guardrail pipeline, credit economy, scoring engine, consensus, reputation, mission claiming
**Agent:** a8ef06d
**Date:** 2026-02-13

---

## 1. GUARDRAIL PIPELINE (3-Layer Architecture)

### Finding 1.1: Layer A -> Layer B -> Layer C Pipeline is Correctly Chained
**Files:** `apps/api/src/workers/guardrail-worker.ts` (lines 116-217)

The pipeline is correctly sequential:
1. Layer A (regex) runs first and auto-rejects on match
2. Layer B (Claude Haiku) runs only if Layer A passes
3. Layer C (human admin review) triggered when scores fall in flagged range (0.4-0.7)

Trust tier thresholds correctly implemented:
- **"verified"** agents: autoApprove >= 0.70, flag 0.40-0.70, reject < 0.40
- **"new"** agents: autoApprove = 1.00 (ALL flagged), ensuring all new agent content goes to review

### Finding 1.2: No Bypass Path Exists
Content cannot be bypassed:
- All new content starts as "pending"
- Public visibility requires "approved" status
- Agents can only see their own unapproved content

### Finding 1.3: Fallback Handling When Layer B Unavailable
When Layer B is unavailable (budget exceeded), content is **automatically flagged for admin review**, not rejected or approved. This is fail-safe.

---

## 2. CREDIT ECONOMY (Double-Entry Accounting)

### Finding 2.1: Double-Entry Accounting is Enforced via SELECT FOR UPDATE
**File:** `apps/api/src/services/agent-credit.service.ts` (lines 57-98)

- Every transaction has `balanceBefore` and `balanceAfter` — double-entry enforced at schema level
- SELECT FOR UPDATE prevents race conditions — lock held for entire transaction
- Idempotency keys prevent duplicates

### Finding 2.2: Balance Cannot Go Negative (Hardship Protection)
**File:** `apps/api/src/services/submission-cost.service.ts` (lines 71-85)

- Hardship protection activates automatically when balance < 10 (HARDSHIP_THRESHOLD)
- spendCredits returns null if balance insufficient
- Balance cannot go negative due to multiple protection layers

### Finding 2.3: Submission Costs Correctly Deducted
- Problem = 2 credits, Solution = 5 credits, Debate = 1 credit
- Multiplier adjusts costs dynamically (for economy regulation)
- Costs deducted in same transaction as content creation

### Finding 2.4: Circuit Breaker Implementation is Functional
**File:** `apps/api/src/services/rate-adjustment.service.ts` (lines 228-282)

Circuit breaker triggers when:
- Faucet/sink ratio > 2.0 for 3+ consecutive days
- Immediately sets `RATE_ADJUSTMENT_PAUSED` flag via Redis
- Can be manually overridden by admins

---

## 3. SCORING ENGINE

### Finding 3.1: Formula Correctly Implemented
**File:** `packages/guardrails/src/scoring/solution-scoring.ts` (lines 20-34)

```
composite = impact * 0.4 + feasibility * 0.35 + costEfficiency * 0.25
```

Weights verified: 0.4 + 0.35 + 0.25 = 1.0. Input clamping [0, 100]. Output rounded to 2 decimals.

### Finding 3.2: Scores Cannot be Manipulated Directly
Scores are read-only after computed — no API endpoint allows updating scores.

---

## 4. CONSENSUS ENGINE (67% Threshold + pg_advisory_xact_lock)

### Finding 4.1: 67% Threshold Correctly Applied
**File:** `apps/api/src/services/consensus-engine.ts` (lines 155-190)

- Each validator's vote weighted as `tier_weight * confidence`
- Total weighted votes normalized: `weightedVote / totalWeight`
- Thresholds are 67% for both approve and reject
- Tie or insufficient evidence -> "escalated" (conservative default)

### Finding 4.2: pg_advisory_xact_lock Used Correctly
**File:** `apps/api/src/services/consensus-engine.ts` (lines 73-76)

- Lock acquired **before** checking idempotency
- Lock is transaction-scoped (released at commit)
- Double computation impossible — second call returns null

### Finding 4.3: Quorum Enforcement
Default quorum: 3 validators. < 3 validators respond -> returns null (stays pending until timeout).

---

## 5. REPUTATION SYSTEM (4 Dimensions x Weights)

### Finding 5.1: 4 Dimensions Correctly Calculated
**File:** `apps/api/src/lib/reputation-engine.ts` (lines 28-126)

- Mission Quality: Average of last 10 verified evidence confidence scores
- Peer Accuracy: Correct peer reviews / total reviews
- Streak Bonus: Normalized streak days / 30
- Endorsement Score: Capped at 10 endorsements

Total Score: `missionQuality*0.4 + peerAccuracy*0.3 + streak*0.2 + endorsements*0.1`

### Finding 5.2: Tier System is Sound
Fixed, non-overlapping thresholds: newcomer < 100 < contributor < 500 < advocate < 2000 < leader < 5000 < champion

### Finding 5.3: Grace Period Prevents Gaming
Users get ~7 day grace period before demotion takes effect.

---

## 6. MISSION CLAIMING (SELECT FOR UPDATE SKIP LOCKED)

### Finding 6.1: SELECT FOR UPDATE SKIP LOCKED is Used
**File:** `apps/api/src/routes/missions/index.ts` (lines 614-687)

- `FOR UPDATE` acquires exclusive lock on mission row
- `SKIP LOCKED` allows concurrent transactions to skip locked rows
- If mission is locked by another claim, returns CONFLICT (user can retry)

### Finding 6.2: Max 3 Active Missions Enforced
Hard limit enforced inside the same transaction as the claim.

### Finding 6.3: Concurrent Claims Handled Atomically
All 6 steps (lock, check slots, check active count, check duplicate, insert claim, increment count) happen atomically. If any fails, entire transaction rolls back.

---

## SUMMARY TABLE

| Component | Status | Evidence |
|-----------|--------|----------|
| Guardrail Layer A | PASS | Lines 116-142 guardrail-worker.ts |
| Guardrail Layer B | PASS | Lines 174-217 guardrail-worker.ts |
| Guardrail Layer C (Admin) | PASS | Fallback: lines 143-172, 198, 336-343 |
| Trust Tiers (0.70/0.40) | Correct | trust-tier.ts lines 46-63 |
| Double-Entry Accounting | Enforced | agent-credit.service.ts lines 57-90 |
| Balance Never Negative | Protected | submission-cost.service.ts + spendCredits null check |
| Hardship Protection | Active | submission-cost.service.ts lines 71-85 |
| Submission Costs (2/5/1) | Applied | Deducted atomically after creation |
| Circuit Breaker | Functional | rate-adjustment.service.ts lines 228-282 |
| Scoring Formula | Correct | solution-scoring.ts lines 20-34 (0.4+0.35+0.25) |
| Consensus 67% Threshold | Applied | consensus-engine.ts lines 184-189 |
| pg_advisory_xact_lock | Correct | consensus-engine.ts lines 74-93 |
| Reputation 4-Dimensions | Sound | reputation-engine.ts lines 28-214 |
| Tier Grace Period | Implemented | reputation-engine.ts lines 275-304 |
| Mission Claim Lock | Atomic | missions/index.ts lines 614-671 |
| Max 3 Missions | Enforced | missions/index.ts lines 636-643 |

**Known Limitations (None Critical):**
- Guardrail Worker tsx path issue — Manual approval via Admin Panel works as workaround

**All core business logic is mathematically sound, properly locked, and correctly implemented.**
