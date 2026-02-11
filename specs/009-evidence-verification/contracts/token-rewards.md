# API Contract: Token Rewards (Evidence Verification)

**Type**: Internal worker processes (no HTTP endpoints)
**Trigger**: Verification pipeline completion events

This document describes the token reward distribution logic triggered automatically by the evidence verification pipeline. There are no user-facing endpoints -- rewards are distributed by BullMQ workers.

---

## Reward Types

| Trigger | Transaction Type | Amount | Recipient |
|---------|-----------------|--------|-----------|
| Evidence verified | `earn_evidence_verified` | `mission.tokenReward * finalConfidence` | Evidence submitter |
| Peer review submitted | `earn_peer_review` | 2 IT (fixed) | Peer reviewer |

---

## Evidence Verified Reward

Distributed when an evidence submission reaches `finalVerdict = "verified"`.

### Reward Calculation

```
rewardAmount = floor(mission.tokenReward * finalConfidence)
```

- `mission.tokenReward`: Base reward defined when the mission was created
- `finalConfidence`: Weighted score from AI + peer review (`aiScore * 0.4 + peerConfidence * 0.6`)
- `floor()`: Always round down to prevent fractional tokens
- Minimum reward: 1 IT (if `finalConfidence > 0` and mission has reward > 0)

### Example

| mission.tokenReward | finalConfidence | rewardAmount |
|---------------------|----------------|--------------|
| 50 IT | 0.92 | 46 IT |
| 50 IT | 0.60 | 30 IT |
| 100 IT | 0.75 | 75 IT |

### Transaction Flow

```
1. BEGIN TRANSACTION
2. SELECT id, token_balance FROM human_profiles WHERE id = :humanId FOR UPDATE
3. newBalance = currentBalance + rewardAmount
4. UPDATE human_profiles SET token_balance = newBalance WHERE id = :humanId
5. INSERT INTO token_transactions {
     humanId,
     type: "earn_evidence_verified",
     amount: rewardAmount,
     balanceBefore: currentBalance,
     balanceAfter: newBalance,
     referenceId: evidenceId,
     idempotencyKey: "evidence-reward:{evidenceId}",
     description: "Reward for verified evidence on mission: {missionTitle}"
   }
6. COMMIT
```

### Idempotency

- Key format: `evidence-reward:{evidenceId}`
- If a transaction with this idempotency key already exists, skip (no duplicate reward)
- Idempotency enforced via UNIQUE constraint on `token_transactions.idempotency_key`

---

## Peer Review Reward

Distributed immediately when a human submits a peer review vote, regardless of the vote outcome.

### Reward Calculation

```
rewardAmount = 2  // fixed, not confidence-weighted
```

### Transaction Flow

```
1. BEGIN TRANSACTION
2. SELECT id, token_balance FROM human_profiles WHERE id = :reviewerId FOR UPDATE
3. newBalance = currentBalance + 2
4. UPDATE human_profiles SET token_balance = newBalance WHERE id = :reviewerId
5. INSERT INTO token_transactions {
     humanId: reviewerId,
     type: "earn_peer_review",
     amount: 2,
     balanceBefore: currentBalance,
     balanceAfter: newBalance,
     referenceId: peerReviewId,
     idempotencyKey: "peer-review-reward:{peerReviewId}",
     description: "Reward for peer review on evidence: {evidenceId}"
   }
6. COMMIT
```

### Idempotency

- Key format: `peer-review-reward:{peerReviewId}`
- Same UNIQUE constraint protection as evidence rewards

---

## Double-Entry Accounting Invariants

These invariants must hold at all times (same pattern as Sprint 6 token system):

1. Every `token_transactions` row has `balance_before + amount = balance_after`
2. `human_profiles.token_balance` equals the `balance_after` of the most recent transaction for that human
3. No negative balances (rewards are always positive; this is an earn-only flow)
4. All balance modifications use `SELECT FOR UPDATE` to prevent race conditions
5. Idempotency keys prevent duplicate rewards from retried workers

---

## WebSocket Events

### evidence:verified

Emitted when evidence reaches `finalVerdict = "verified"` and reward is distributed.

```json
{
  "event": "evidence:verified",
  "data": {
    "missionId": "uuid",
    "evidenceId": "uuid",
    "humanId": "uuid",
    "rewardAmount": 46,
    "finalConfidence": 0.92
  },
  "timestamp": "ISO 8601"
}
```

**Recipients**: Evidence submitter (via human WebSocket channel)

### evidence:rejected

Emitted when evidence reaches `finalVerdict = "rejected"`.

```json
{
  "event": "evidence:rejected",
  "data": {
    "missionId": "uuid",
    "evidenceId": "uuid",
    "humanId": "uuid",
    "reason": "Peer reviewers determined evidence does not match mission requirements"
  },
  "timestamp": "ISO 8601"
}
```

**Recipients**: Evidence submitter (via human WebSocket channel)

---

## Worker Configuration

| Setting | Value |
|---------|-------|
| Queue name | `evidence-rewards` |
| Concurrency | 3 |
| Max retries | 3 |
| Backoff | Exponential (1s, 2s, 4s) |
| Dead letter queue | `evidence-rewards-dlq` |
| Idempotency | UNIQUE constraint on `idempotency_key` column |

### Failure Handling

- If the reward transaction fails (DB error), the job is retried up to 3 times
- If all retries fail, the job moves to `evidence-rewards-dlq` for manual investigation
- Evidence `verificationStage` is still updated even if reward fails (decoupled)
- Admin dashboard shows DLQ depth for monitoring
