# Data Model: MVP Production Readiness

**Branch**: `015-mvp-production-readiness`
**Date**: 2026-02-13

This feature is primarily a hardening/refinement sprint — no new tables are created. Changes are limited to one new column and one migration for PostGIS geo-search.

---

## Schema Changes

### 1. Missions Table — Add PostGIS Location Column (FR-005)

**Table**: `missions`
**Change**: Add `location` column of type `geography(Point, 4326)`

| Column | Type | Nullable | Default | Index | Notes |
|--------|------|----------|---------|-------|-------|
| location | geography(Point, 4326) | Yes | NULL | GIST | Backfilled from requiredLatitude/requiredLongitude |

**Migration** (new: `0013_mission_postgis_location`):
1. Add `location geography(Point, 4326)` column
2. Backfill: `UPDATE missions SET location = ST_MakePoint(required_longitude::float, required_latitude::float)::geography WHERE required_latitude IS NOT NULL`
3. Create GIST index: `CREATE INDEX idx_missions_location ON missions USING GIST (location)`
4. Existing `requiredLatitude` and `requiredLongitude` columns are preserved for backward compatibility

**Query Migration**:
- Before: `6371 * acos(cos(radians(?)) * cos(radians(lat)) * ...)  <= radius`
- After: `ST_DWithin(location, ST_MakePoint(lng, lat)::geography, radius_meters)`

---

### 2. Observations Table — Privacy Status State Machine (FR-008)

**Table**: `observations`
**Column**: `privacyProcessingStatus` (existing enum)

No schema change needed. The existing enum already has `quarantined` state. The change is behavioral — the privacy worker's dead-letter handler must SET status to `quarantined` instead of leaving it as `processing`.

**State transitions** (updated):
```
pending → processing → completed     (success path)
pending → processing → quarantined   (any failure, including dead-letter)
quarantined → processing → completed (admin retry succeeds)
quarantined → processing → quarantined (retry fails again)
```

---

### 3. No New Tables

This sprint does not introduce new database tables. All changes are:
- 1 new column (`missions.location`)
- 1 migration (PostGIS backfill + index)
- Behavioral changes in existing workers and services

---

## Existing Entities Referenced (No Changes)

| Entity | Table | Relevant FR |
|--------|-------|-------------|
| Guardrail Evaluation | `guardrail_evaluations` | FR-001/002 (worker fix) |
| Peer Evaluation | `peer_evaluations` | FR-003 (N+1 batch), FR-007 (idempotency) |
| Debate | `debates` | FR-004 (CTE depth), FR-006 (pagination) |
| Mission | `missions` | FR-005 (PostGIS), FR-015 (error handling) |
| Agent Credit Transaction | `agent_credit_transactions` | FR-009 (rate adj idempotency) |
| Observation | `observations` | FR-008 (quarantine), FR-020-022 (privacy) |
| Token Transaction | `token_transactions` | Already reconciled (P0-D2 fixed) |
| Human | `humans` | FR-023 (onboarding check) |
| Validator Pool | `validator_pool` | FR-007 (assignment idempotency) |

---

## Redis Keys (Changes)

| Key Pattern | Change | FR |
|-------------|--------|-----|
| `bull:*:*` | Add `removeOnComplete`/`removeOnFail` retention policies | FR-011 |
| `feature:PRIVACY_BLUR_ENABLED` | Set to `true` after face/plate detection deployed | FR-020/021 |
| No new key patterns introduced | — | — |
