# Research: Mission Marketplace

**Date**: 2026-02-10
**Feature**: 008-mission-marketplace

## R1: Mission Claims — Single Column vs Junction Table

**Decision**: Use a `mission_claims` junction table (not `claimedByHumanId` on missions table).

**Rationale**: The existing docs schema puts `claimedByHumanId` directly on the missions table, which only supports single-claim missions. However, the spec requires `max_claims > 1` (e.g., "Plant 100 trees" → 10 humans × 10 each). A junction table supports:
- Multiple humans per mission
- Independent status tracking per claim
- Unique constraint on `(mission_id, human_id)` for duplicate prevention
- Atomic `SELECT FOR UPDATE SKIP LOCKED` on claims rows

**Alternatives considered**:
- Single `claimedByHumanId` column: Simpler but only supports max_claims=1. Rejected because spec explicitly requires multi-claim missions.
- JSONB array of claim objects: Flexible but not indexable, can't use row-level locking for concurrent claims. Rejected for race condition safety.

## R2: PostGIS vs Application-Level Geo-Search

**Decision**: Use PostGIS `ST_DWithin` with GIST index on a generated `geography` column.

**Rationale**: PostGIS provides server-side geo-filtering that scales to 10K+ missions. Application-level haversine calculations would require fetching all missions to memory, which doesn't scale.

**Implementation approach**:
- Store `requiredLatitude` and `requiredLongitude` as `decimal(10, 7)` columns (matches existing humanProfiles pattern)
- Create a raw SQL migration adding a generated `geography` column: `ALTER TABLE missions ADD COLUMN location geography(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(required_longitude::float, required_latitude::float), 4326)::geography) STORED;`
- Add GIST index: `CREATE INDEX CONCURRENTLY missions_location_gist_idx ON missions USING GIST (location);`
- Query with `ST_DWithin(location, ST_MakePoint(lng, lat)::geography, radius_meters)`

**Alternatives considered**:
- Bounding box pre-filter + haversine: Two-step approach. Works at small scale but PostGIS is standard and simpler. Rejected.
- pgvector distance: Not designed for geographic coordinates. Rejected.

## R3: Dynamic Radius — External API vs Local Lookup

**Decision**: Use Nominatim reverse geocoding API with Redis cache (30-day TTL) to determine urban/suburban/rural classification.

**Rationale**: A local `city_boundaries` table requires maintaining geodata. Nominatim is already used for profile geocoding (Sprint 6) with Redis caching. Population density can be inferred from the `place_rank` field in Nominatim responses:
- `place_rank <= 16` (city/town): Urban → 10km default
- `place_rank 17-19` (suburb/village): Suburban → 25km default
- `place_rank >= 20` (hamlet/isolated): Rural → 50km default

**Grid snapping for cache**: Round coordinates to 0.01° (~1.1km) before cache key generation to increase cache hit rate.

**Alternatives considered**:
- Local city_boundaries table: More reliable but requires seeding + maintaining global city data. Overkill for Phase 2 MVP. Deferred.
- Fixed radius (50km): Simplest but poor UX in dense urban areas (too many results) and sparse rural areas (too few). Rejected.

## R4: Claude Sonnet Decomposition — Structured Output Strategy

**Decision**: Use Claude Sonnet with structured output (tool_use) to generate mission arrays.

**Rationale**: Structured output via tool_use ensures reliable JSON parsing without regex extraction. The tool schema defines the expected mission structure, and Claude returns well-typed objects.

**Prompt strategy**:
1. System prompt: BetterWorld mission guidelines (social good, actionable, location-bound, evidence-verifiable)
2. User prompt: Solution title + description + approach + domain + required skills
3. Tool definition: `create_missions` tool accepting an array of 3-8 mission objects
4. Each mission object: title, description, instructions (step-by-step array), evidenceRequired (array), requiredSkills, estimatedDurationMinutes, difficulty, suggestedTokenReward

**Cost tracking**: Redis counter `cost:daily:sonnet:decomposition:{date}` with 24h TTL. Increment per decomposition call. Rate limit: 10/day/agent via Redis `INCR` + `EXPIRE`.

**Alternatives considered**:
- Free-form text output + JSON extraction: Fragile parsing, schema violations common. Rejected.
- Claude Haiku for decomposition: Cheaper but lower quality mission generation. Rejected because mission quality directly impacts human experience.

## R5: Message Encryption Strategy

**Decision**: AES-256-GCM with KEK from environment variable. Encrypt before storage, decrypt on read.

**Rationale**: Constitution requires security-first approach. Agent messages may contain coordination details that should be private. AES-256-GCM provides authenticated encryption (integrity + confidentiality).

**Implementation**:
- KEK stored in `MESSAGE_ENCRYPTION_KEY` env var (32 bytes, base64-encoded)
- Per-message: generate random 12-byte IV, encrypt content, store `iv:ciphertext:authTag` in single column
- Decrypt on API read (server-side only — messages transmitted over TLS to agents)
- Key rotation: Support future key rotation by storing key version in a `encryptionKeyVersion` column (default 1)

**Alternatives considered**:
- No encryption (rely on TLS): Protects in transit but not at rest. Database compromise exposes all messages. Rejected per Security First principle.
- End-to-end encryption: Agents would need to exchange public keys. Complex key management. Overkill for agent-to-agent coordination messages. Deferred to Phase 3 if needed.

## R6: Leaflet Map Integration — SSR Strategy

**Decision**: Dynamic import with `ssr: false` for Leaflet components in Next.js.

**Rationale**: Leaflet requires `window` and `document` globals that don't exist in server-side rendering. Next.js dynamic imports with `ssr: false` ensure Leaflet only loads client-side.

**Implementation**:
- Create `apps/web/src/components/ui/Map.tsx` as a client component (`"use client"`)
- Dynamic import: `const Map = dynamic(() => import("@/components/ui/Map"), { ssr: false })`
- Use `react-leaflet` for React integration
- Use `leaflet.markercluster` for clustering (separate dynamic import)
- OpenStreetMap tiles: `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (free, no API key)

**Alternatives considered**:
- Mapbox GL JS: Better styling and vector tiles. Requires API key and has usage limits. Deferred to Phase 3 per spec assumption.
- Google Maps: Commercial, requires billing. Rejected for cost reasons.

## R7: Mission Expiration Job — BullMQ Cron Pattern

**Decision**: BullMQ repeatable job with daily cron schedule (`0 2 * * *` — 2 AM UTC).

**Rationale**: BullMQ already used for guardrail evaluation queue. Adding a repeatable job follows the established pattern. Running at 2 AM UTC avoids peak hours.

**Implementation**:
- Job name: `mission:expiration`
- Schedule: Daily at 2 AM UTC
- Logic: `SELECT * FROM missions WHERE status = 'open' AND expires_at < NOW()`
- For each expired mission: update status to "expired", create refund token transaction (double-entry)
- Batch size: Process 100 missions per batch to avoid long-running transactions
- Idempotency: Use `mission_id + "expiration"` as idempotency key for refund transaction
- Claimed missions check: Skip missions where `missionClaims` has active claims with `claimed_at + 7 days > NOW()`

**Alternatives considered**:
- pg_cron: Database-level scheduling. Works but adds PostgreSQL extension dependency. BullMQ already available. Rejected for consistency.
- Application-level setInterval: No persistence, no retry, no dead letter. Rejected.
