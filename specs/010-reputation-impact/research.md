# Research: Reputation & Impact System

**Branch**: `010-reputation-impact` | **Date**: 2026-02-11

## Research Topics

### R1: Perceptual Hashing (pHash) for Duplicate Photo Detection

**Decision**: Use `sharp-phash` for perceptual hash generation, custom Hamming distance comparison.

**Rationale**:
- `sharp-phash` has 53K weekly npm downloads (highest in category)
- Already using `sharp` for image processing in evidence pipeline (Sprint 8)
- Native TypeScript support, built on libvips (fastest Node.js image processor)
- pHash is robust against resizing, compression, color shifts, minor crops — all common evidence manipulation techniques
- Performance: ~60-100ms per 5MB image (decode + resize + hash), <1ms per comparison

**Alternatives Considered**:
- `blockhash-core` (11K downloads) — good accuracy but requires separate Hamming library, no Sharp integration
- `imghash` (5.5K downloads) — simple API but lower popularity, slower than Sharp-based
- `dHash` — faster (10ms vs 50ms) but fails on rotations and crops; insufficient for fraud detection
- `aHash` — fastest but sensitive to brightness/contrast changes; too many false negatives

**Similarity Threshold**:
- Spec requires 90% similarity detection
- 90% of 64-bit hash = Hamming distance ≤ 6
- Recommended thresholds:
  - Distance 0-6: Auto-reject duplicate, fraud score +20
  - Distance 7-10: Flag for review, fraud score +5
  - Distance 11+: Allow

**Storage**:
- Store as `VARCHAR(16)` hex string in PostgreSQL (human-readable, easy debugging)
- Index on `(submitted_by_human_id, phash)` for per-human duplicate detection
- Cache recent hashes (7 days) in Redis sorted set per human for fast lookup
- For cross-human comparison: query limited scope (same mission domain + last 30 days)

---

### R2: Velocity Checks for Abnormal Submission Rates

**Decision**: Redis sliding window with sorted sets (existing pattern), multi-tier thresholds.

**Rationale**:
- Already using sorted-set sliding window for rate limiting (middleware/rate-limit.ts)
- Atomic pipeline operations: ZREMRANGEBYSCORE + ZCARD + ZADD + EXPIRE
- Multi-tier approach catches both burst and sustained abuse

**Thresholds**:
| Tier | Window | Max Submissions | Fraud Score Delta |
|------|--------|----------------|-------------------|
| Critical | 10 min | 15 | +30 |
| High | 1 hour | 40 | +20 |
| Moderate | 24 hours | 100 | +10 |

**Redis Key Pattern**: `fraud:velocity:{humanId}:{tier}`

---

### R3: Statistical Profiling for Fraud Detection

**Decision**: Custom implementation with Z-score anomaly detection and GPS variance analysis.

**Rationale**:
- Z-score is simple, interpretable, and well-understood (no ML model training required)
- GPS variance calculation uses basic statistics (no external dependencies)
- Timing pattern analysis detects bot-like behavior

**Three Detection Methods**:
1. **GPS Clustering**: Calculate coordinate variance over last 20 submissions. Variance < 0.001 (~100m radius) flags as suspicious. Weight: 40%.
2. **Approval Rate Deviation**: Z-score of user's approval rate vs platform mean. Z > 3 (99.7% confidence) flags as anomalous. Weight: 35%.
3. **Timing Patterns**: Calculate variance of inter-submission intervals. Low variance = suspiciously regular (bot-like). Weight: 25%.

**Combined Score**: `gpsScore × 0.4 + approvalScore × 0.35 + timingScore × 0.25`

**Alternatives Considered**:
- DBSCAN clustering — more sophisticated but overkill for initial implementation; can add in Phase 3
- ML-based anomaly detection — requires training data; not justified for Phase 2 scale
- External fraud APIs — adds external dependency and latency; not needed

---

### R4: Redis Leaderboard Caching Strategy

**Decision**: Redis Sorted Sets (ZADD/ZREVRANGE/ZREVRANK) with per-filter-combination keys.

**Rationale**:
- O(log N) for ZADD, ZREVRANK operations — instant for any practical scale
- ZREVRANK gives user position in O(log N) — perfect for "my rank" queries
- Atomic ZINCRBY for incremental score updates
- Memory-efficient: ziplist encoding for sets < 128 members uses ~10x less memory

**Key Structure**: `leaderboard:{type}:{period}:{domain|global}:{location|global}`
- Example: `leaderboard:reputation:month:environmental_protection:global`
- Example: `leaderboard:tokens:week:global:country:US`

**Scale Calculation**:
- 4 types × 3 periods × (1 global + 15 domains) × (1 global + ~50 countries) ≈ 192 primary keys (global+domain)
- Each key stores top 1000 entries (trimmed) × 60 bytes/entry = ~60 KB/key
- Total: ~12 MB (fits easily in Redis free tier)

**Invalidation Strategy**:
- 1-hour TTL on all leaderboard keys (passive expiry)
- Write-aside invalidation on reputation/token events (delete affected keys)
- Lazy rebuild on cache miss (first reader triggers rebuild from PostgreSQL)
- Hourly aggregation job pre-populates high-traffic leaderboards

**Pagination**: ZREVRANGE with offset/limit (not ZSCAN), base64-encoded cursor containing offset.

---

### R5: Hourly Metrics Aggregation

**Decision**: Custom aggregation queries in BullMQ worker, results stored in Redis HASHes.

**Rationale**:
- Materialized views require PostgreSQL extension support on Supabase (limited)
- BullMQ worker pattern already established (guardrail worker, mission expiration worker)
- Redis HASHes provide O(1) access for individual metrics
- HINCRBY for atomic counter increments between full refreshes

**Aggregation Queries**:
1. Total missions by domain/location/status
2. Total ImpactTokens distributed by domain
3. Active humans (last 7 days) by domain
4. Average reputation by tier
5. Verification latency percentiles

**Redis Key Pattern**: `metrics:aggregate:{metric_name}:{period}`
- Example: `metrics:aggregate:missions_total:month:environmental_protection`
- Example: `metrics:aggregate:active_humans:week:global`

**Schedule**: BullMQ repeatable job, every 60 minutes, concurrency 1.

---

### R6: Leaflet Heatmap Integration

**Decision**: `leaflet.heat` plugin with dynamic import (SSR-disabled), zoom-based layer switching.

**Rationale**:
- `leaflet.heat` is the official Leaflet heatmap plugin (lightweight, performant)
- Canvas-based rendering handles 10K+ points at 60fps
- Grid-based automatic clustering reduces render load
- Already using dynamic Leaflet import pattern from Sprint 7 (MissionMap.tsx)

**Zoom-Based Switching**:
- Zoom < 10: Show heatmap layer (overview density visualization)
- Zoom >= 10: Switch to individual markers with clustering (MarkerCluster)

**Data Pipeline**:
- Hourly aggregation job pre-computes heatmap data points
- API endpoint returns `[lat, lng, intensity][]` tuples
- Intensity weighted by mission count per grid cell

**Dependencies**: `leaflet.heat` + `@types/leaflet.heat` (dev)

---

### R7: Open Graph Image Generation

**Decision**: Next.js 15 `opengraph-image.tsx` route handler with `ImageResponse` (edge runtime).

**Rationale**:
- Built into Next.js 15 App Router — no external service needed
- `ImageResponse` from `next/og` renders JSX to PNG on the edge
- Automatic cache headers in production
- Compatible with Twitter, LinkedIn, Facebook (1200×630px PNG)

**Implementation Pattern**:
- `app/portfolio/[humanId]/page.tsx` — `generateMetadata()` for OG meta tags
- `app/portfolio/[humanId]/opengraph-image.tsx` — `ImageResponse` for custom image
- Edge runtime for low-latency generation
- ISR with 1-hour revalidation for caching

**Image Content**: User avatar initial, display name, reputation score, tier badge, tokens earned, missions completed, top domain.

---

### R8: Reputation Algorithm Design

**Decision**: Weighted 4-factor formula with configurable weights and decay.

**Algorithm**:
```
reputation_delta = (
  mission_quality_score × 0.40 +
  peer_accuracy_score × 0.30 +
  streak_bonus × 0.20 +
  endorsement_score × 0.10
) × tier_multiplier
```

**Factor Calculations**:
1. **Mission Quality** (40%): Average `finalConfidence` of last 10 verified evidence submissions × 100
2. **Peer Accuracy** (30%): Percentage of peer reviews that matched final consensus × 100
3. **Streak Bonus** (20%): `min(streakDays / 30, 1.0) × 100` (maxes at 30 days)
4. **Endorsements** (10%): `min(endorsementCount / 10, 1.0) × 100` (maxes at 10 endorsements)

**Decay**: 2% per week for humans inactive 7+ days (no mission completions or peer reviews).
- Accelerated decay after 90 days: 5% per week.
- Floor: reputation cannot go below 0.

**Tier Thresholds**:
| Tier | Name | Min Score | Multiplier | Privileges |
|------|------|-----------|------------|------------|
| 1 | Newcomer | 0 | 1.0x | None |
| 2 | Contributor | 100 | 1.1x | Peer reviewer eligibility |
| 3 | Advocate | 500 | 1.2x | Create community missions |
| 4 | Leader | 2000 | 1.5x | Governance voting |
| 5 | Champion | 5000 | 2.0x | Mentor status |

**Grace Period**: 7 days before demotion. Tracked via `grace_period_start` and `grace_period_tier` columns.

---

### R9: Streak System Design

**Decision**: Daily check via BullMQ cron job, freeze tracked per human.

**Streak Rules**:
- Activity defined as: completing a mission (evidence verified) OR submitting a peer review
- Streak increments on first qualifying activity per calendar day (UTC)
- Missing a day breaks streak unless freeze is active
- Freeze: preservable once per 30 days, covers 1 missed day

**Multiplier Milestones**:
| Streak Days | Multiplier |
|-------------|------------|
| 1-6 | 1.0x |
| 7-29 | 1.1x |
| 30-89 | 1.25x |
| 90-364 | 1.5x |
| 365+ | 2.0x |

**Multiplier Application**: Applied to token rewards at distribution time (in `distributeEvidenceReward()`):
```
finalReward = baseReward × tierMultiplier × streakMultiplier
```

---

## All NEEDS CLARIFICATION Resolved

No unresolved unknowns remain. All technical decisions documented above with rationale and alternatives.
