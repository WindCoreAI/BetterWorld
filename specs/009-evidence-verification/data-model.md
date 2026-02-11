# Data Model: Evidence Verification & Completion Workflow

**Branch**: `009-evidence-verification`
**Date**: 2026-02-10

## Entity Overview

```
missions (existing) ──1:N──▸ evidence ──1:N──▸ peerReviews
    │                           │                   │
    │ isHoneypot (new col)      │ 1:N               │ creates
    │                           ▼                   ▼
    │                   verificationAuditLog    reviewHistory
    │                                          (reviewer_id, submitter_id)
    │
    ▼
missionClaims (existing) ──1:N──▸ evidence (via claimId)
```

## New Tables

### 1. evidence

Stores submitted proof for mission completion. Each row represents one piece of evidence (photo, document, video) submitted by a human for a claimed mission.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| missionId | uuid FK → missions.id | NO | — | Parent mission |
| claimId | uuid FK → missionClaims.id | NO | — | The human's claim this evidence is for |
| submittedByHumanId | uuid FK → humans.id | NO | — | Human who submitted |
| evidenceType | evidence_type enum | NO | — | photo, video, document, text_report |
| contentUrl | text | YES | — | Supabase Storage URL (media files) |
| textContent | text | YES | — | Text evidence / report content |
| thumbnailUrl | text | YES | — | 200x200 WebP thumbnail URL |
| mediumUrl | text | YES | — | 1920x1080 max WebP URL |
| latitude | decimal(10,7) | YES | — | Submission GPS latitude (browser geolocation) |
| longitude | decimal(10,7) | YES | — | Submission GPS longitude (browser geolocation) |
| capturedAt | timestamptz | YES | — | When evidence was captured (from EXIF or client) |
| exifData | jsonb | YES | — | Sanitized EXIF: { gpsLat, gpsLng, dateTime, make, model } |
| fileSize | integer | YES | — | File size in bytes |
| mimeType | varchar(100) | YES | — | MIME type (image/jpeg, etc.) |
| aiVerificationScore | decimal(3,2) | YES | — | Claude Vision confidence 0.00-1.00 |
| aiVerificationReasoning | text | YES | — | AI explanation of score |
| verificationStage | evidence_verification_stage enum | NO | pending | Current stage in pipeline |
| peerReviewCount | integer | NO | 0 | Number of peer reviews received |
| peerReviewsNeeded | integer | NO | 3 | Number of peer reviews required |
| peerVerdict | varchar(20) | YES | — | approved / rejected / null |
| peerAverageConfidence | decimal(3,2) | YES | — | Average peer confidence score |
| finalVerdict | varchar(20) | YES | — | approved / rejected / null |
| finalConfidence | decimal(3,2) | YES | — | Final confidence used for reward calculation |
| rewardTransactionId | uuid FK → tokenTransactions.id | YES | — | Token reward (if approved) |
| isHoneypotSubmission | boolean | NO | false | Flag if submitted against honeypot mission |
| createdAt | timestamptz | NO | now() | Submission timestamp |
| updatedAt | timestamptz | NO | now() | Last update |

**Indexes**:
- `idx_evidence_mission_id` on (missionId)
- `idx_evidence_claim_id` on (claimId)
- `idx_evidence_human_id` on (submittedByHumanId)
- `idx_evidence_stage` on (verificationStage)
- `idx_evidence_pending` on (verificationStage, createdAt) WHERE verificationStage IN ('pending', 'ai_processing')
- `idx_evidence_peer_review` on (verificationStage, createdAt) WHERE verificationStage = 'peer_review'

**Constraints**:
- `ai_score_range`: aiVerificationScore IS NULL OR (aiVerificationScore >= 0 AND aiVerificationScore <= 1)
- `peer_count_non_negative`: peerReviewCount >= 0
- `peer_needed_positive`: peerReviewsNeeded >= 1
- `has_content`: contentUrl IS NOT NULL OR textContent IS NOT NULL

**Relations**:
- Many-to-one → missions
- Many-to-one → missionClaims
- Many-to-one → humans
- One-to-many → peerReviews
- One-to-many → verificationAuditLog

### 2. peerReviews

Individual votes from peer reviewers on evidence submissions.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| evidenceId | uuid FK → evidence.id | NO | — | Evidence being reviewed |
| reviewerHumanId | uuid FK → humans.id | NO | — | Human reviewer |
| verdict | peer_review_verdict enum | NO | — | approve / reject |
| confidence | decimal(3,2) | NO | — | Reviewer's confidence 0.00-1.00 |
| reasoning | text | NO | — | Explanation for verdict |
| rewardTransactionId | uuid FK → tokenTransactions.id | YES | — | Review reward |
| createdAt | timestamptz | NO | now() | When review was submitted |

**Indexes**:
- `idx_peer_reviews_evidence` on (evidenceId)
- `idx_peer_reviews_reviewer` on (reviewerHumanId)
- `unique_peer_review` on (evidenceId, reviewerHumanId) UNIQUE — one vote per reviewer per evidence

**Constraints**:
- `confidence_range`: confidence >= 0 AND confidence <= 1
- `no_self_review`: reviewerHumanId != (SELECT submittedByHumanId FROM evidence WHERE id = evidenceId) — enforced in application layer

**Relations**:
- Many-to-one → evidence
- Many-to-one → humans (reviewer)

### 3. reviewHistory

Tracks all reviewer-submitter pairs for the 2-hop transitive exclusion algorithm. Append-only. One row per review event.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| reviewerHumanId | uuid FK → humans.id | NO | — | Human who reviewed |
| submitterHumanId | uuid FK → humans.id | NO | — | Human whose evidence was reviewed |
| evidenceId | uuid FK → evidence.id | NO | — | Evidence that was reviewed |
| reviewedAt | timestamptz | NO | now() | When the review occurred |

**Indexes**:
- `idx_review_history_reviewer` on (reviewerHumanId)
- `idx_review_history_submitter` on (submitterHumanId)
- `idx_review_history_pair` on (reviewerHumanId, submitterHumanId) — for exclusion queries

**Constraints**:
- `no_self_review_history`: reviewerHumanId != submitterHumanId

**Relations**:
- Many-to-one → humans (reviewer)
- Many-to-one → humans (submitter)
- Many-to-one → evidence

### 4. verificationAuditLog

Immutable record of every verification decision. Never updated or deleted.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| evidenceId | uuid FK → evidence.id | NO | — | Evidence this decision is about |
| decisionSource | varchar(20) | NO | — | ai, peer, admin |
| decision | varchar(20) | NO | — | approved, rejected, escalated |
| score | decimal(3,2) | YES | — | Confidence score (if applicable) |
| reasoning | text | YES | — | Explanation of decision |
| decidedByHumanId | uuid FK → humans.id | YES | — | Human who made decision (peer/admin) |
| metadata | jsonb | NO | {} | Additional context (GPS distance, AI model, etc.) |
| createdAt | timestamptz | NO | now() | When decision was made |

**Indexes**:
- `idx_audit_evidence` on (evidenceId)
- `idx_audit_source` on (decisionSource)
- `idx_audit_created` on (createdAt)

**Relations**:
- Many-to-one → evidence
- Many-to-one → humans (decider, nullable)

## Modified Tables

### missions (existing) — add column

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| isHoneypot | boolean | NO | false | Marks impossible missions for fraud detection |

No index needed (only 5 honeypot missions, filtered in application layer).

## New Enums

### evidence_type
```
photo, video, document, text_report
```

### evidence_verification_stage
```
pending → ai_processing → peer_review → verified → rejected → appealed → admin_review
```

### peer_review_verdict
```
approve, reject
```

## Extended Enums

### transaction_type (add values)
```
earn_evidence_verified    # Reward for verified evidence submission
earn_peer_review          # Reward for completing a peer review
```

### mission_claim_status (existing values sufficient)
```
active → submitted → verified → abandoned → released
```
The `submitted` and `verified` statuses already exist and map to evidence workflow.

## State Machine: Evidence Verification

```
                    ┌──────────┐
                    │ pending  │ ← evidence submitted
                    └────┬─────┘
                         │ BullMQ worker picks up
                         ▼
                ┌────────────────┐
                │ ai_processing  │ ← Claude Vision analyzing
                └───────┬────────┘
                        │
            ┌───────────┼───────────┐
            │           │           │
     score ≥ 0.80  0.50-0.80   score < 0.50
            │           │           │
            ▼           ▼           ▼
      ┌──────────┐ ┌──────────┐ ┌──────────┐
      │ verified │ │peer_review│ │ rejected │
      └──────────┘ └────┬─────┘ └────┬─────┘
                        │             │
                  majority vote    appeal?
                   ┌────┴────┐        │
                   │         │        ▼
              approve    reject  ┌──────────┐
                   │         │   │ appealed │
                   ▼         ▼   └────┬─────┘
            ┌──────────┐ ┌──────────┐ │
            │ verified │ │ rejected │ │
            └──────────┘ └──────────┘ │
                                      ▼
                               ┌──────────────┐
                               │ admin_review │
                               └──────┬───────┘
                                 ┌────┴────┐
                            approve      uphold
                                 │         │
                                 ▼         ▼
                          ┌──────────┐ ┌──────────┐
                          │ verified │ │ rejected │
                          └──────────┘ └──────────┘
```

**Terminal states**: `verified`, `rejected` (after admin review or no appeal)

## State Machine: Mission Claim (updated flow)

```
active → submitted (evidence uploaded) → verified (evidence approved) → [mission complete]
  │                    │
  │                    └──→ rejected (evidence rejected, can resubmit)
  │
  └──→ abandoned (human gives up)
  └──→ released (deadline expired)
```

## Validation Rules

### Evidence Submission
- File type must be in allowlist: image/jpeg, image/png, image/heic, application/pdf, video/mp4, video/quicktime
- File size ≤ 10MB
- Rate limit: 10 uploads/hour/human (Redis sliding window)
- Claim must be active (status = 'active')
- Claim must belong to the submitting human (IDOR protection)
- Mission must not be expired
- At least one evidence item (photo or text) required

### Peer Review
- Reviewer cannot review their own evidence (no_self_review)
- Reviewer must pass 2-hop exclusion check
- One vote per reviewer per evidence (unique constraint)
- Confidence must be between 0.00 and 1.00
- Reasoning must be non-empty

### Token Rewards
- Evidence reward: `mission.tokenReward * finalConfidence` (rounded down)
- Peer review reward: fixed amount per review (configurable, default 2 IT)
- All rewards use double-entry accounting (balanceBefore + amount = balanceAfter)
- Idempotency key: `evidence-reward:{evidenceId}` and `peer-review-reward:{peerReviewId}`
- SELECT FOR UPDATE on humans.tokenBalance
