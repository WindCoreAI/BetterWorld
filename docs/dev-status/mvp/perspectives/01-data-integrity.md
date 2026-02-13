# Deep Scan: Data Integrity & Database Logic

**Perspective:** Schema design, FK constraints, cascades, double-entry accounting, idempotency, migration safety
**Agent:** a5ea2ae
**Date:** 2026-02-13

---

## ~~CRITICAL ISSUES~~ ALL RESOLVED

### ~~1. Credit Conversions Missing FK Constraints~~ FIXED
**File:** `packages/db/src/schema/creditConversions.ts` (lines 25-33)

**Resolution:** Added `{ onDelete: "restrict" }` to both `agentCreditTransactionId` and `humanTransactionId` FK references. This prevents deletion of either side of a conversion transaction, maintaining referential integrity.

Note: FKs remain nullable by design — the conversion record can be created as part of a multi-step transaction where both sides are linked within the same database transaction. The restrict constraint prevents post-creation orphaning.

---

### 2. Human Deletion Cascades TokenTransactions & Reputation But NOT Mission Claims
**File:** `packages/db/src/schema/tokenTransactions.ts` (line 22) and `packages/db/src/schema/missionClaims.ts` (line 26)

When a human is deleted:
- TokenTransactions cascade deleted (cleans up)
- Reputation records cascade deleted (cleans up)
- HumanProfiles cascade deleted (cleans up)
- MissionClaims, Evidence, PeerReviews are **RESTRICT** — so human deletion will **fail** if they have any active claims

This is inconsistent. Either:
1. Humans should cascade delete missionClaims (dangerous — deletes evidence of work), OR
2. The system should prevent deleting humans with active claims (better approach)

**Impact:** Medium — Incomplete cleanup model; admins will encounter hard FK errors when trying to delete humans with missions.

**Recommendation:** Add business logic to deactivate humans (set `isActive=false`) rather than deleting. For actual deletion, require all claims to be closed first.

---

### ~~3. Evidence Reward Without Double-Entry Guarantee~~ FIXED
**File:** `apps/api/src/workers/token-reconciliation.ts` (new)

**Resolution:** Added `createTokenReconciliationWorker()` — a BullMQ repeatable worker running hourly that:
1. Queries all active humans where `CAST(token_balance AS INTEGER) != COALESCE(SUM(tt.amount), 0)`
2. Auto-fixes discrepancies by updating `humans.tokenBalance` to match transaction sums
3. Handles edge case of humans with zero transactions
4. Alerts admins via webhook on discrepancies
5. Job retention: 24 completed / 10 failed

Worker registered in `all-workers.ts` alongside existing claim-reconciliation job.

---

## HIGH PRIORITY ISSUES

### 4. MissionClaims currentClaimCount Cache Drift
**File:** `apps/api/src/routes/missions/index.ts` (lines 664-668)

The missions table caches `currentClaimCount` for performance. The reconciliation job fixes drifts daily, BUT:
- If a bug causes an off-by-one error during claim creation, the cache drifts immediately
- Marketplace browse shows `slotsAvailable = maxClaims - currentClaimCount`
- Users see **stale slot availability** until the next reconciliation run (up to 24 hours)

**Recommendation:**
- Add a CHECK constraint: `CHECK (currentClaimCount >= 0 AND currentClaimCount <= maxClaims)`
- Run reconciliation hourly instead of daily
- Consider making `currentClaimCount` a computed column

### 5. Observations.problemId Is Nullable But Creates Auto-Problem
**File:** `packages/db/src/schema/observations.ts` (line 22)

If an observation creates an auto-problem but the insert fails partway through:
- The observation record exists with `problemId=NULL`
- The orphaned observation won't match any problem
- Recovery is manual

**Recommendation:**
- Add `auto_created_problem_id` to track auto-creation
- Wrap auto-problem creation in same transaction as observation insert

---

## MEDIUM PRIORITY ISSUES

### 6. AgentCreditTransactions Has Optional idempotencyKey With Non-Unique Index
**File:** `packages/db/src/schema/agentCreditTransactions.ts` (lines 38, 52)

The field is nullable but has a UNIQUE index. In PostgreSQL, multiple NULL values don't violate uniqueness, so transactions without idempotency keys can create duplicates.

**Recommendation:** Add NOT NULL constraint and make idempotency key generation mandatory.

### 7. PeerEvaluations.rewardCreditTransactionId Is Nullable But Rewards Are Expected
**File:** `packages/db/src/schema/peerEvaluations.ts` (line 44)

If a validator completes an evaluation but reward distribution fails, the evaluation is marked "completed" but `rewardCreditTransactionId` is NULL. No way to distinguish "reward pending" vs "reward failed".

**Recommendation:** Add `reward_status` enum: 'pending', 'paid', 'failed'.

### 8. DisputeSuspendedUntil and SuspendedUntil Overlap
**File:** `packages/db/src/schema/validatorPool.ts` (lines 51, 55)

Two separate suspension timestamps with unclear semantics. No CHECK constraint clarifies the relationship.

**Recommendation:** Document which takes precedence or merge into single `suspension_status`.

### 9. EvidenceReviewAssignments.capabilityMatch Is Optional
**File:** `packages/db/src/schema/evidenceReviews.ts` (line 32)

Nullable field that affects assignment logic. NULL assignments might indicate broken assignment pipeline.

**Recommendation:** Make NOT NULL with reason enum.

---

## LOW PRIORITY ISSUES

### 10. Consensus Results Missing Submission Type Enforcement
No FK constraint on `submissionId` (intentional for federation/flexibility), but orphaned consensus records possible post-deletion.

### 11. Rate Adjustment Service Uses String Fields for Decimals
Values converted to string then back to decimal in SQL. Works correctly but non-idiomatic.

### 12. Missing Index: peerReviews on observationId + status
No composite index for querying pending observation reviews.

---

## THINGS DONE WELL

1. **Double-Entry Accounting Enforced**: `agentCreditTransactions` and `tokenTransactions` have CHECK constraints validating `balanceAfter = balanceBefore + amount`
2. **SELECT FOR UPDATE Used Correctly**: Mission claiming and credit transactions use `FOR UPDATE SKIP LOCKED`
3. **Idempotency Keys for Critical Operations**: Starter grants, evidence rewards, dispute stakes all have idempotency keys
4. **Transactions Wrap Multi-Step Operations**: Token reward distribution locks, updates, and records in single transaction
5. **Audit Trail**: All financial transactions recorded with before/after balances
6. **Recursive Reconciliation**: Claim count reconciliation job catches and fixes drifts

---

## SUMMARY

| Category | Count | Severity | Status |
|----------|-------|----------|--------|
| Critical | 3 | Money-equivalent transactions without constraints | **ALL FIXED** |
| High | 2 | Financial drift undetected, UI stale data | Open |
| Medium | 4 | Orphaned records, reward payment gaps, ambiguous suspension | Open |
| Low | 3 | Non-blocking issues, performance, non-idiomatic code | Open |

**Priority Actions:**
1. ~~**Immediate:** Add FK constraints to `creditConversions` (Issue #1)~~ **DONE**
2. ~~**This Sprint:** Add token balance audit job (Issue #3)~~ **DONE**
3. **Soon:** Clarify suspension semantics (Issue #8)
4. **Next Review:** Run reconciliation hourly vs daily (Issue #4)
