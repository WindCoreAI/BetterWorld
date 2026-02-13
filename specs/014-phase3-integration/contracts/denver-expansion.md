# Contract: Denver Expansion

**Base URL**: `/api/v1`
**Related Spec**: Sprint 13 — Phase 3 Integration (Denver City Expansion)
**Dependencies**: Open311 municipal ingestion (Sprint 10), city dashboards (Sprint 11), OPEN311_CITY_CONFIGS (packages/shared)

---

## Overview

Denver expansion adds Denver, CO as the third city in the BetterWorld hyperlocal network, joining Portland and Chicago. This is a **configuration-only change** -- no new API endpoints are required. Denver uses the existing Open311 ingestion pipeline, city dashboard routes, and validator affinity infrastructure.

### What Changes

1. **New city config entry** in `OPEN311_CITY_CONFIGS` (packages/shared/src/constants/phase3.ts)
2. **Denver appears** in `GET /api/v1/city/list` response
3. **Denver metrics** available at `GET /api/v1/city/denver/metrics`
4. **Denver validators** can set Denver as a home region via `PATCH /api/v1/validator/affinity`

No schema changes, no new routes, no new workers.

---

## Configuration Addition

The following entry is added to `OPEN311_CITY_CONFIGS` in `packages/shared/src/constants/phase3.ts`:

```typescript
denver: {
  id: "denver",
  displayName: "City and County of Denver",
  endpoint: "https://www.denvergov.org/open311/v2",
  serviceCodeMapping: {
    // Infrastructure
    "pothole": { domain: "environmental_protection", severity: "medium" },
    "graffiti": { domain: "environmental_protection", severity: "low" },
    "streetlight": { domain: "community_building", severity: "medium" },
    "sidewalk": { domain: "environmental_protection", severity: "medium" },
    // Environment
    "trash": { domain: "environmental_protection", severity: "medium" },
    "illegal_dumping": { domain: "environmental_protection", severity: "high" },
    // Public health
    "rodent": { domain: "healthcare_improvement", severity: "high" },
    "standing_water": { domain: "clean_water_sanitation", severity: "medium" },
  },
  pollingIntervalMs: 15 * 60 * 1000, // 15 minutes
  enabled: false, // Disabled by default, enabled via feature flag or config change
},
```

> **Note**: The Denver Open311 endpoint URL (`https://www.denvergov.org/open311/v2`) is a placeholder pending verification. The actual endpoint must be confirmed against Denver's PocketGov API documentation before production deployment. See rollout step 2 below.

### City Dashboard Behavior

Once the config is added, the existing city routes serve Denver data automatically:

| Existing Route | Denver Behavior |
|---------------|----------------|
| `GET /api/v1/city/list` | Includes `{ id: "denver", displayName: "City and County of Denver", center: { lat: 39.7392, lng: -104.9903 }, totalProblems: 0 }` |
| `GET /api/v1/city/denver/metrics` | Returns Denver-specific metrics (empty initially, populated as Open311 data ingests) |

### Open311 Ingestion

The existing municipal-ingest BullMQ worker (`apps/api/src/workers/municipal-ingest.ts`) iterates over all enabled city configs. When Denver's `enabled` flag is set to `true`:

1. Worker polls Denver's Open311 endpoint every 15 minutes
2. Fetches new service requests since last sync timestamp
3. Maps service codes to BetterWorld domains using `serviceCodeMapping`
4. Creates problems with `source: 'municipal'` and `city: 'denver'`
5. Deduplicates using the Open311 `service_request_id`

### Rollout Steps

1. **Add config** -- Merge the Denver entry into `OPEN311_CITY_CONFIGS` (disabled)
2. **Verify endpoint** -- Manually confirm Denver's Open311 endpoint responds with valid GeoReport v2 format
3. **Enable ingestion** -- Set `enabled: true` in the Denver config (or via environment variable override)
4. **Monitor** -- Check admin Open311 stats dashboard for ingestion metrics
5. **Enable validators** -- Denver-area validators can add Denver as a home region

### Denver Center Coordinates

| Property | Value |
|----------|-------|
| Latitude | 39.7392 |
| Longitude | -104.9903 |
| Display Name | City and County of Denver |
| State | CO |

### City Metrics Worker

The existing city-metrics BullMQ worker (daily at 6:00 AM UTC) automatically picks up Denver once problems exist in the database with `city = 'denver'`. No worker changes needed.

### Validation

Before enabling Denver ingestion in production:

| Check | Expected |
|-------|----------|
| Denver Open311 endpoint returns valid XML/JSON | GeoReport v2 compliant |
| Service code mapping covers top 5 Denver request types | Mapped to BetterWorld domains |
| City dashboard renders Denver with correct center point | Map centered on 39.7392, -104.9903 |
| Validator affinity accepts Denver coordinates | Within continental US bounds |
| Cross-city comparison includes Denver | Appears in `GET /api/v1/city/compare` |
