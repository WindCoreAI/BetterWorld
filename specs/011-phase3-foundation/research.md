# Research: Phase 3 Foundation

**Sprint**: 011-phase3-foundation
**Date**: 2026-02-11
**Status**: Complete — All unknowns resolved

---

## R1. PostGIS in Drizzle ORM

### Decision
Use `customType` for `geography(POINT, 4326)` columns, raw `sql` template tags for spatial queries, and a custom migration for `CREATE EXTENSION IF NOT EXISTS postgis`. Do not use the community `drizzle-postgis` package.

### Rationale
Drizzle ORM has partial native support for `geometry(Point)` but **no native support for `geography` types**. The `geography` type is required for accurate distance calculations across global coordinates (BetterWorld has worldwide problems). The community `drizzle-postgis` package exists but is immature and adds dependency risk for a critical infrastructure migration.

### Implementation Approach

**Column definition** — Use `customType` in schema files:
```typescript
import { customType } from 'drizzle-orm/pg-core';

export const geographyPoint = customType<{
  data: string; // WKT string for simplicity
  driverData: string;
}>({
  dataType() {
    return 'geography(Point, 4326)';
  },
});
```

**Spatial queries** — Use `sql` template tags (existing pattern in `geo-helpers.ts`):
```typescript
import { sql } from 'drizzle-orm';

// ST_DWithin for radius search
sql`ST_DWithin(location_point, ST_MakePoint(${lng}, ${lat})::geography, ${radiusMeters})`

// ST_Distance for distance calculation
sql`ST_Distance(location_point, ST_MakePoint(${lng}, ${lat})::geography)`
```

**GIST indexes** — Use `.using('gist', column)` in schema, which generates correct SQL:
```typescript
index('idx_problems_location').using('gist', table.locationPoint)
```

**Migration** — The PostGIS extension must be enabled before any geography column creation. Add to `scripts/init-db.sql` for dev and use a Drizzle migration for production:
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

**Existing init-db.sql** already enables `uuid-ossp`, `vector`, `cube`, `earthdistance`, `pg_trgm` — PostGIS will be added alongside these.

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|--------------|
| `drizzle-postgis` community package | Immature (v0.x), adds dependency risk, not battle-tested |
| Native `geometry(Point)` type | Drizzle supports it natively but uses flat Cartesian math — inaccurate for global distances |
| Store lat/lng as decimals + Haversine | Current approach — too slow for spatial queries at scale, no GIST index support |
| WKT strings in varchar | Current approach for `humanProfiles.location` — no spatial indexing |

---

## R2. Open311 API Integration

### Decision
Start with Chicago Open311 as the primary adapter (well-documented, public API). Portland adapter will use a configurable fallback approach since Portland's Open311 endpoint status is uncertain.

### Rationale
Chicago has a documented, production-ready Open311 GeoReport v2 API. Portland's 311 service (PDX 311) uses Zendesk as its backend and does not have a confirmed public Open311 endpoint. The design document references `https://www.portlandoregon.gov/shared/cfm/open311.cfm` but this may be outdated.

### Open311 GeoReport v2 API Structure

**Endpoints**:
- `GET /requests.json` — List service requests (with filters)
- `GET /services.json` — List available service types and codes
- `GET /requests/{service_request_id}.json` — Single request detail

**Key query parameters**:
- `start_date` / `end_date` — ISO 8601 date range filter (max 90-day span)
- `status` — Filter by `open` or `closed`
- `service_code` — Filter by service type (comma-delimited for multiple)

**Service request fields** (relevant subset):
| Field | Type | Description |
|-------|------|-------------|
| `service_request_id` | string | Unique ID |
| `service_code` | string | Service type code |
| `service_name` | string | Human-readable service name |
| `status` | string | `open` or `closed` |
| `description` | string | Request details (max 4000 chars) |
| `lat` | float | WGS84 latitude |
| `long` | float | WGS84 longitude |
| `address` | string | Human-readable address |
| `requested_datetime` | ISO 8601 | Submission timestamp |
| `media_url` | URL | Associated photo/media |

**Pagination**: Not part of core spec. Default limit is first 1000 requests or 90-day span.

**Chicago endpoint**: `http://311api.cityofchicago.org/open311/v2/requests.json`
- May require API key (register at their portal)
- Test endpoint available: `http://test311api.cityofchicago.org/open311/`

**Portland endpoint**: Unconfirmed — fallback to SeeClickFix or direct city partnership.

### Implementation Approach
1. Create a generic `Open311Client` that implements the GeoReport v2 spec
2. Create per-city adapter configs with service code → domain mappings
3. Use BullMQ repeatable jobs (one per city, configurable interval)
4. Track `last_sync` timestamp per city in Redis
5. Dedup via `municipal_source_type + municipal_source_id` unique constraint
6. Geocode addresses without coordinates using existing Nominatim service

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|--------------|
| Hardcode city-specific API clients | Not extensible; service code mappings differ but API format is standardized |
| Real-time webhooks from Open311 | Not supported by most Open311 implementations; polling is the standard pattern |
| SeeClickFix API instead of Open311 | Proprietary API, not standardized; may use as Portland fallback |

---

## R3. Feature Flag Implementation

### Decision
Redis-backed feature flags with environment variable fallback and in-memory caching (60s TTL). Admin API for runtime toggling.

### Rationale
Phase 3 rollout requires runtime traffic percentage changes (10% → 50% → 100%) without code redeployment. Environment variables alone require restart. A dedicated service (LaunchDarkly/Unleash) is overkill for ~8 flags. Redis is already available in the infrastructure.

### Implementation Approach

**Architecture**: Redis primary → env var fallback → schema defaults

```
Read path:  in-memory cache (60s TTL) → Redis GET → env vars → Zod defaults
Write path: Admin API → Redis SET → cache invalidation
```

**Flag definitions** (Zod-validated):
```typescript
const flagSchema = z.object({
  PEER_VALIDATION_ENABLED: z.boolean().default(false),
  PEER_VALIDATION_TRAFFIC_PCT: z.number().int().min(0).max(100).default(0),
  SUBMISSION_COSTS_ENABLED: z.boolean().default(false),
  VALIDATION_REWARDS_ENABLED: z.boolean().default(false),
  HYPERLOCAL_INGESTION_ENABLED: z.boolean().default(false),
  CREDIT_CONVERSION_ENABLED: z.boolean().default(false),
  DYNAMIC_RATE_ADJUSTMENT_ENABLED: z.boolean().default(false),
  DISPUTES_ENABLED: z.boolean().default(false),
});
```

**Admin endpoints**:
- `GET /api/v1/admin/feature-flags` — List all flags with current values
- `PUT /api/v1/admin/feature-flags/:name` — Set flag value
- `DELETE /api/v1/admin/feature-flags/:name` — Reset to default

**Fail-safe**: If Redis unavailable, flags fall back to env vars (which default to disabled). This means Phase 3 features are off by default even if Redis fails — safe behavior.

**Cache**: 60-second in-memory cache reduces Redis load. `setFlag()` immediately invalidates cache for the calling process. Other processes pick up changes within 60s.

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|--------------|
| Environment variables only | Requires restart; incompatible with gradual rollout requirement |
| LaunchDarkly / Unleash | Overkill for 8 flags; adds external dependency and $50-200/mo cost |
| Database-backed flags | Adds DB load for every flag check; Redis is better suited for high-frequency reads |

---

## R4. Agent Credit Precision

### Decision
Use **integer credits** in Sprint 10. If fractional rewards are needed in Sprint 11 (e.g., 0.75 credits for local journeyman), switch to **millicredits** (integer × 1000) at that point.

### Rationale
The Phase 3 design specifies fractional credit amounts (0.5, 0.75, 1.125 credits) for validation rewards. However, Sprint 10 only implements starter grants (50 credits — integer) and the ledger infrastructure. Validation rewards are Sprint 11. Using integers now keeps the implementation simple, and migrating to millicredits is a straightforward column type change with a `UPDATE agents SET credit_balance = credit_balance * 1000` migration.

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|--------------|
| Decimal column from start | Adds floating-point precision concerns; integer arithmetic is exact |
| Millicredits from start | Premature optimization; adds cognitive load for Sprint 10 where only integer amounts exist |
| Round fractional to integer | Loses precision; validation reward tiers become indistinguishable |

---

## R5. PostGIS in Drizzle Kit (Migration Generation)

### Decision
Use Drizzle Kit's `extensionsFilters: ['postgis']` config to prevent PostGIS internal tables from appearing in generated migrations. Handle geography columns via `customType` which Drizzle Kit can generate migrations for.

### Rationale
Without `extensionsFilters`, `drizzle-kit generate` would try to include PostGIS's ~50 internal tables (spatial_ref_sys, geometry_columns, etc.) in the migration output, causing errors.

### drizzle.config.ts change
```typescript
export default {
  // ... existing config
  extensionsFilters: ['postgis'],
};
```

---

## R6. Open311 Portland Status

### Decision
Implement the Portland adapter with the endpoint URL from the design document (`https://www.portlandoregon.gov/shared/cfm/open311.cfm`). If the endpoint is unavailable, the adapter logs a warning, and the ingestion job is automatically disabled for Portland via feature flag. Chicago is the primary target.

### Rationale
The design document specifies Portland as a target city. Even if the endpoint is down or requires partnership, implementing the adapter verifies the generic Open311 client works. Feature flags allow disabling Portland ingestion independently of Chicago.

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|--------------|
| Drop Portland entirely | Design document explicitly requires it; adapter is generic enough to be cheap |
| SeeClickFix as Portland source | Different API format; would need a separate adapter pattern |
| Wait for city partnership | Blocks Sprint 10; better to build and verify generic adapter |
