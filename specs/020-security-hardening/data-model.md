# Data Model: Security Hardening Sprint

**Branch**: `020-security-hardening` | **Date**: 2026-02-18

## New Entities

### account_deletion_requests

Tracks pending, cancelled, and completed account deletion requests.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default random | Request identifier |
| humanId | uuid | FK → humans.id, NOT NULL, UNIQUE | One active request per user |
| status | enum | NOT NULL, default 'pending' | pending / cancelled / completed |
| requestedAt | timestamp with TZ | NOT NULL, default now() | When deletion was requested |
| coolingOffExpiresAt | timestamp with TZ | NOT NULL | requestedAt + 14 days |
| cancelledAt | timestamp with TZ | nullable | When user cancelled |
| completedAt | timestamp with TZ | nullable | When PII was deleted |
| anonymizedIdentifier | varchar(12) | nullable | Hash generated during deletion |
| deletionLog | jsonb | nullable | Categories deleted + counts for audit |
| createdAt | timestamp with TZ | NOT NULL, default now() | Record creation |

**Indexes**:
- `idx_deletion_requests_human_id` on humanId (unique)
- `idx_deletion_requests_status_expires` on (status, coolingOffExpiresAt) WHERE status = 'pending'

**Enum**: `deletionRequestStatusEnum` = ['pending', 'cancelled', 'completed']

**State Transitions**:
```
pending → cancelled (user cancels within 14 days)
pending → completed (worker processes after 14-day expiry)
```

## Modified Entities

### humans (no schema change)
- On deletion: replace displayName, email, avatarUrl with anonymized values
- Set email to `deleted_{hash}@removed.betterworld.org`
- Set displayName to `Former User {hash}`
- Null out avatarUrl, oauthProvider, oauthProviderId

### agents (no schema change)
- On owner deletion: SET isActive = false for all owned agents

### problems, solutions (no schema change)
- On author deletion: SET reportedByAgentId/proposedByAgentId to null or anonymized
- Note: These reference agents, not humans directly. The agent deactivation handles this.

### evidence (no schema change)
- On submitter deletion: SET submittedByHumanId to a per-user deterministic UUID (uuidv5 derived from SHA-256 hash of userId + DELETION_SALT)

### discussionThreads, discussionReplies (no schema change)
- On author deletion: SET authorHumanId to a per-user deterministic UUID (uuidv5 derived from SHA-256 hash of userId + DELETION_SALT)

### missionClaims (no schema change)
- On claimer deletion: SET humanId to a per-user deterministic UUID (uuidv5 derived from SHA-256 hash of userId + DELETION_SALT)

### tokenTransactions (no schema change)
- On user deletion: SET humanId to a per-user deterministic UUID (uuidv5 derived from SHA-256 hash of userId + DELETION_SALT)

## Zod Schemas (New)

### classifierResponseSchema
Validates Layer B Claude classifier output. Placed in `packages/shared/src/schemas/`.

```
aligned_domain: z.string()
alignment_score: z.number().min(0).max(1)
harm_risk: z.enum(["none", "low", "medium", "high", "critical"])
feasibility: z.enum(["none", "low", "medium", "high"])
quality: z.string()
decision: z.enum(["approve", "reject", "flag"])
reasoning: z.string()
solution_scores: z.object({
  impact: z.number().min(0).max(100),
  feasibility: z.number().min(0).max(100),
  cost_efficiency: z.number().min(0).max(100),
}).optional()
```

### visionVerificationResponseSchema
Validates Claude Vision evidence verification output.

```
relevanceScore: z.number().min(0).max(1)
gpsPlausibility: z.number().min(0).max(1)
timestampPlausibility: z.number().min(0).max(1)
authenticityScore: z.number().min(0).max(1)
requirementChecklist: z.array(z.object({ requirement: z.string(), met: z.boolean() }))
overallConfidence: z.number().min(0).max(1)
reasoning: z.string()
```

### beforeAfterResponseSchema
Validates Claude Vision before/after comparison output.

```
improvementScore: z.number().min(0).max(1)
confidence: z.number().min(0).max(1)
reasoning: z.string()
```

### decompositionResponseSchema
Validates Claude Sonnet mission decomposition output.

```
missions: z.array(z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(10).max(5000),
  instructions: z.array(z.object({ step: z.number(), text: z.string(), optional: z.boolean() })).min(1),
  evidenceRequired: z.array(z.object({ type: z.enum(["photo","document","video"]), description: z.string(), required: z.boolean() })).min(1),
  requiredSkills: z.array(z.string()),
  estimatedDurationMinutes: z.number().min(15).max(10080),
  difficulty: z.enum(["beginner","intermediate","advanced","expert"]),
  suggestedTokenReward: z.number().int().positive(),
})).min(1).max(10)
```

## Migration

**Migration file**: `0020_security_hardening`

**Changes**:
1. CREATE ENUM `deletion_request_status` ('pending', 'cancelled', 'completed')
2. CREATE TABLE `account_deletion_requests` with all columns and indexes
