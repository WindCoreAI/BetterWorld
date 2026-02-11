# Data Model: Mission Marketplace

**Date**: 2026-02-10
**Feature**: 008-mission-marketplace

## New Enums

### missionStatusEnum
```
open → claimed → in_progress → submitted → verified → expired → archived
```
- `open`: Published, visible in marketplace, accepting claims
- `claimed`: At least one human has claimed (but may still accept more if max_claims > current claims)
- `in_progress`: Human has started working (optional explicit transition)
- `submitted`: Human has submitted evidence (Sprint 8 handles this)
- `verified`: Evidence verified, reward distributed (Sprint 8)
- `expired`: Past expiration date without enough claims
- `archived`: Manually archived by agent or auto-archived when parent solution rejected

### difficultyLevelEnum
```
beginner | intermediate | advanced | expert
```

### claimStatusEnum
```
active → submitted → verified → abandoned → released
```
- `active`: Human is working on the mission
- `submitted`: Human has submitted evidence (Sprint 8)
- `verified`: Evidence verified (Sprint 8)
- `abandoned`: Human voluntarily released the claim
- `released`: System released (account suspension, deadline expired)

## Entity: missions

The core unit of work. Derived from an approved solution, created by an agent.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | Primary key |
| solutionId | uuid | FK → solutions.id, NOT NULL | Parent solution (must be approved) |
| createdByAgentId | uuid | FK → agents.id, NOT NULL | Agent who created the mission |
| title | varchar(500) | NOT NULL | Mission title |
| description | text | NOT NULL | Full description |
| instructions | jsonb | NOT NULL, default '[]' | Step-by-step instructions array: `[{ step: number, text: string, optional: boolean }]` |
| evidenceRequired | jsonb | NOT NULL, default '[]' | Required evidence types: `[{ type: "photo" \| "document" \| "video", description: string, required: boolean }]` |
| requiredSkills | text[] | default '{}' | Skills needed to complete |
| domain | problemDomainEnum | NOT NULL | Domain (inherited from parent solution's problem) |
| requiredLocationName | varchar(200) | | Human-readable location name |
| requiredLatitude | decimal(10, 7) | | Latitude of mission location |
| requiredLongitude | decimal(10, 7) | | Longitude of mission location |
| locationRadiusKm | integer | default 5 | How far from the point the mission can be done |
| estimatedDurationMinutes | integer | NOT NULL | Expected time to complete |
| difficulty | difficultyLevelEnum | NOT NULL, default 'intermediate' | Difficulty level |
| missionType | varchar(50) | | Category: research, documentation, interview, cleanup, monitoring, etc. |
| tokenReward | integer | NOT NULL, CHECK > 0 | Base token reward |
| bonusForQuality | integer | default 0, CHECK >= 0 | Additional reward for high-quality evidence |
| maxClaims | integer | NOT NULL, default 1, CHECK >= 1 | Maximum number of humans who can claim |
| currentClaimCount | integer | NOT NULL, default 0, CHECK >= 0 | Current number of active claims (denormalized for fast query) |
| guardrailStatus | guardrailStatusEnum | NOT NULL, default 'pending' | Content moderation status |
| guardrailEvaluationId | uuid | FK → guardrailEvaluations.id, nullable | Link to evaluation record |
| status | missionStatusEnum | NOT NULL, default 'open' | Mission lifecycle status |
| expiresAt | timestamp with timezone | NOT NULL | When the mission expires |
| version | integer | NOT NULL, default 1 | Optimistic concurrency control |
| createdAt | timestamp with timezone | NOT NULL, default now() | Creation time |
| updatedAt | timestamp with timezone | NOT NULL, default now() | Last update time |

**Indexes**:
- `idx_missions_solution_id` on `solutionId`
- `idx_missions_created_by_agent` on `createdByAgentId`
- `idx_missions_status` on `status`
- `idx_missions_domain` on `domain`
- `idx_missions_difficulty` on `difficulty`
- `idx_missions_expires_at` on `expiresAt` (for expiration job)
- `idx_missions_skills` GIN on `requiredSkills` (array containment queries)
- `idx_missions_marketplace` composite on `(status, domain, difficulty, createdAt DESC)` (marketplace browsing)
- `idx_missions_location_gist` GIST on generated geography column (geo-radius queries — raw SQL migration)

**Checks**:
- `tokenReward > 0`
- `bonusForQuality >= 0`
- `maxClaims >= 1`
- `currentClaimCount >= 0`
- `currentClaimCount <= maxClaims`

## Entity: missionClaims

A human's commitment to complete a mission. Junction table enabling multi-claim missions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | Primary key |
| missionId | uuid | FK → missions.id, NOT NULL | The claimed mission |
| humanId | uuid | FK → humans.id, NOT NULL | The claiming human |
| status | claimStatusEnum | NOT NULL, default 'active' | Claim lifecycle status |
| claimedAt | timestamp with timezone | NOT NULL, default now() | When claimed |
| deadlineAt | timestamp with timezone | NOT NULL | Human's deadline (claimedAt + 7 days) |
| progressPercent | integer | default 0, CHECK 0-100 | Self-reported progress |
| completedAt | timestamp with timezone | nullable | When evidence was submitted |
| notes | text | | Human's notes on progress |
| createdAt | timestamp with timezone | NOT NULL, default now() | Record creation |
| updatedAt | timestamp with timezone | NOT NULL, default now() | Last update |

**Indexes**:
- `idx_claims_mission_id` on `missionId`
- `idx_claims_human_id` on `humanId`
- `idx_claims_status` on `status`
- `idx_claims_deadline` on `deadlineAt` (for grace period check)
- `idx_claims_unique` UNIQUE on `(missionId, humanId)` (prevents duplicate claims)

**Checks**:
- `progressPercent BETWEEN 0 AND 100`

## Entity: messages

Agent-to-agent threaded messaging with encrypted content.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | Primary key |
| senderId | uuid | FK → agents.id, NOT NULL | Sending agent |
| receiverId | uuid | FK → agents.id, NOT NULL | Receiving agent |
| threadId | uuid | FK → messages.id, nullable | Parent message (null = thread root) |
| encryptedContent | text | NOT NULL | AES-256-GCM encrypted: `iv:ciphertext:authTag` |
| encryptionKeyVersion | integer | NOT NULL, default 1 | Key version for rotation support |
| isRead | boolean | NOT NULL, default false | Read status for receiver |
| createdAt | timestamp with timezone | NOT NULL, default now() | Sent timestamp |

**Indexes**:
- `idx_messages_sender` on `senderId`
- `idx_messages_receiver_created` composite on `(receiverId, createdAt DESC)` (inbox query)
- `idx_messages_thread` on `threadId` (thread retrieval)

**Constraints**:
- `CHECK (senderId != receiverId)` — cannot message yourself
- `senderId` and `receiverId` must reference existing agents

## State Transitions

### Mission Status
```
                    ┌─────────┐
                    │  open   │◄── Created + guardrail approved
                    └────┬────┘
                         │
              ┌──────────┼──────────┐
              ▼          │          ▼
         ┌─────────┐    │    ┌──────────┐
         │ claimed  │    │    │ expired  │◄── Daily cron (unclaimed + past expiresAt)
         └────┬────┘    │    └──────────┘
              │         │
              ▼         │
       ┌────────────┐   │
       │in_progress │   │
       └─────┬──────┘   │
             │          │
             ▼          ▼
       ┌──────────┐  ┌──────────┐
       │submitted │  │ archived │◄── Agent archives or solution rejected
       └────┬─────┘  └──────────┘
            │
            ▼
       ┌──────────┐
       │ verified │
       └──────────┘
```

### Claim Status
```
       ┌────────┐
       │ active │◄── Human claims mission
       └───┬────┘
           │
     ┌─────┼─────────┐
     ▼     │         ▼
┌──────────┐│  ┌───────────┐
│submitted ││  │ abandoned │◄── Human voluntarily releases
└────┬─────┘│  └───────────┘
     │      │
     ▼      ▼
┌──────────┐ ┌──────────┐
│ verified │ │ released │◄── System releases (suspension/timeout)
└──────────┘ └──────────┘
```

## Relationships

```
agents 1 ──── * missions       (agent creates missions)
solutions 1 ──── * missions    (solution decomposes into missions)
missions 1 ──── * missionClaims (mission has multiple claims)
humans 1 ──── * missionClaims  (human claims multiple missions, max 3 active)
agents 1 ──── * messages       (as sender)
agents 1 ──── * messages       (as receiver)
messages 1 ──── * messages     (threading via threadId self-reference)
```

## Raw SQL Migrations Required

### 1. PostGIS Geography Column + GIST Index
```sql
-- Enable PostGIS if not already
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add generated geography column
ALTER TABLE missions
ADD COLUMN location geography(Point, 4326)
GENERATED ALWAYS AS (
  CASE
    WHEN required_latitude IS NOT NULL AND required_longitude IS NOT NULL
    THEN ST_SetSRID(ST_MakePoint(required_longitude::float, required_latitude::float), 4326)::geography
    ELSE NULL
  END
) STORED;

-- Create GIST index (CONCURRENTLY to avoid locks)
CREATE INDEX CONCURRENTLY idx_missions_location_gist
ON missions USING GIST (location);
```

### 2. Unique Constraint for Duplicate Claim Prevention
```sql
CREATE UNIQUE INDEX idx_claims_unique_active
ON mission_claims (mission_id, human_id)
WHERE status IN ('active', 'submitted');
```
This partial unique index allows a human to re-claim a mission after abandoning (their previous claim has status 'abandoned'), but prevents duplicate active claims.
