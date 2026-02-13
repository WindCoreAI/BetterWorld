# Contract: Hybrid Quorum

**Base URL**: `/api/v1`
**Related Spec**: Sprint 13 — Phase 3 Integration (Hybrid Quorum for Evaluation Assignment)
**Dependencies**: Evaluation assignment service (Sprint 11), validator pool (Sprint 10), domain specialization (Sprint 13), traffic routing (Sprint 12)

---

## Overview

Hybrid quorum modifies the existing evaluation assignment service to compose panels that blend domain specialists with generalist validators. This is an **internal contract** -- there are no new API endpoints. The changes affect how the evaluation assignment service (`apps/api/src/services/evaluation-assignment.ts`) selects validators when a submission enters the peer validation pipeline.

> **Terminology note**: This contract covers **domain specialist preference** in panel composition (blending domain experts with generalists). This is distinct from the **geographic hybrid quorum** defined in spec US5, which assigns 2 local validators + 1 global validator for hyperlocal problems. Both features coexist: geographic locality determines the candidate pool, while domain specialist preference determines selection priority within that pool.

### Current Behavior (Sprint 11)

The evaluation assignment service selects 6 validators per submission using:
1. **Self-review exclusion** -- the submitting agent is never assigned
2. **Tier stratification** -- balanced representation across apprentice/journeyman/expert tiers
3. **PostGIS affinity boost** -- validators within 100km of the submission location get priority
4. **Rotation** -- recently assigned validators are deprioritized (via `lastAssignmentAt`)

### New Behavior (Sprint 13)

The hybrid quorum adds a **domain specialist preference** step between tier stratification and rotation:

```
Candidate Pool (active, not self, not suspended)
       |
       v
Tier Stratification
       |
       v
Domain Specialist Preference  <-- NEW
       |
       v
PostGIS Affinity Boost
       |
       v
Rotation + Final Selection (6 validators)
```

### Domain Specialist Preference Logic

```typescript
interface HybridQuorumConfig {
  /** Total validators to assign per submission */
  totalValidators: 6;
  /** Minimum specialists to include (if available) */
  minSpecialists: 2;
  /** Maximum specialists to include (to prevent echo chambers) */
  maxSpecialists: 4;
  /** F1 threshold for specialist status in the submission's domain */
  specialistF1Threshold: 0.90;
  /** Minimum evaluations in domain for specialist status */
  specialistMinEvaluations: 50;
}
```

### Selection Algorithm

```
1. Query all eligible validators (active, not self, not suspended)
2. Partition into:
   a. Domain specialists: domainScores[submission.domain].isSpecialist === true
   b. Generalists: everyone else
3. Select up to maxSpecialists (4) from specialists pool
   - Prefer higher domain F1 scores
   - Apply PostGIS affinity as tiebreaker
4. Fill remaining slots from generalists pool (to reach 6 total)
   - Apply tier stratification
   - Apply PostGIS affinity
   - Apply rotation (deprioritize recently assigned)
5. If fewer than minSpecialists (2) available, fill all 6 from general pool
   (graceful degradation to Sprint 11 behavior)
```

### Feature Flag

| Flag Name | Type | Default | Description |
|-----------|------|---------|-------------|
| `HYBRID_QUORUM_ENABLED` | boolean | false | When false, falls back to Sprint 11 assignment logic (no specialist preference) |

### Consensus Weight Adjustment

When hybrid quorum is active, specialist validators receive a weight boost in the consensus engine:

| Validator Type | Weight Formula |
|---------------|---------------|
| Domain specialist | `tierWeight * confidence * 1.50` |
| Generalist | `tierWeight * confidence * 1.00` |

This gives specialists a 50% influence boost without making their votes dominant. The existing consensus thresholds (67% approve/reject) remain unchanged.

### Quorum Requirements

| Condition | Quorum Required | Behavior |
|-----------|----------------|----------|
| 6 validators assigned | 3 responses | Standard quorum |
| 4-5 validators assigned (limited pool) | 3 responses | Reduced panel, same quorum |
| < 4 validators available | N/A | Falls back to Layer B only (no peer validation) |

### Monitoring

The existing `/api/v1/admin/shadow/validators` endpoint is extended to include specialist assignment stats:

```json
{
  "ok": true,
  "data": {
    "...existing fields...",
    "hybridQuorum": {
      "enabled": true,
      "assignmentsWithSpecialists": 145,
      "assignmentsWithoutSpecialists": 32,
      "avgSpecialistsPerPanel": 2.4,
      "specialistAvailabilityRate": 0.82
    }
  }
}
```

### Database Reads (No Schema Changes)

The hybrid quorum reads from existing tables only:

```sql
-- Find specialists for a domain
SELECT vp.*
FROM validator_pool vp
WHERE vp.is_active = true
  AND vp.suspended_until IS NULL OR vp.suspended_until < NOW()
  AND vp.agent_id != $submittingAgentId
  AND (vp.domain_scores->>$domain)::jsonb->>'isSpecialist' = 'true'
ORDER BY (vp.domain_scores->>$domain)::jsonb->>'f1Score' DESC
LIMIT $maxSpecialists;
```

No new tables or columns are required. The `validator_pool.domain_scores` JSONB column (Sprint 10 schema) already stores per-domain F1 data.
