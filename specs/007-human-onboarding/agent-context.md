# Agent Context: Sprint 6 - Human Onboarding

**Feature**: 007-human-onboarding
**Created**: 2026-02-10
**Purpose**: Quick reference for developers and AI agents implementing Sprint 6

This document provides a concise summary of new technologies, libraries, patterns, and conventions introduced in Sprint 6.

---

## New Technologies

### Authentication: better-auth

**Library**: `better-auth` (OAuth 2.0 + PKCE + session management)

**Why chosen**:
- Built-in PKCE support for OAuth flows (no manual implementation)
- Official Drizzle ORM adapter (type-safe, zero config)
- Automatic refresh token rotation (security best practice)
- Matches existing bcrypt pattern from agent authentication

**Key concepts**:
- **PKCE (RFC 7636)**: Prevents authorization code interception attacks
- **Access tokens**: 15-minute expiry (JWT)
- **Refresh tokens**: 7-day expiry, rotates on use (old token invalidated)
- **Sessions**: 30-day rolling expiry (extends on activity)

**Usage**:
```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  socialProviders: {
    google: { clientId, clientSecret },
    github: { clientId, clientSecret },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
});
```

**Docs**: [better-auth.com/docs/authentication/oauth](https://www.better-auth.com/docs/authentication/oauth)

---

### Geocoding: Nominatim (OpenStreetMap)

**Service**: Nominatim REST API (free, no API key)

**Why chosen**:
- Zero cost (no API key, no usage fees)
- Global coverage (OpenStreetMap data)
- 1 req/s rate limit is acceptable for registration flows
- Alternatives (Google Maps, Mapbox) cost $5 per 1000 requests

**Privacy protection**: Coordinates are snapped to 1km grid (`ROUND(lat * 100) / 100`)

**Usage**:
```typescript
const url = `https://nominatim.openstreetmap.org/search?q=${city},${country}&format=json&limit=1`;
const response = await fetch(url, {
  headers: { 'User-Agent': 'BetterWorld/1.0' }, // Required by Nominatim
});
const [result] = await response.json();
const { lat, lon } = result;

// Grid snapping for privacy
const snappedLat = Math.round(parseFloat(lat) * 100) / 100;
const snappedLng = Math.round(parseFloat(lon) * 100) / 100;
```

**Redis caching**:
- Key: `geocode:sha256(city,country)`
- TTL: 30 days
- Hit rate: 80%+ (common cities like Jakarta, London reused)

**Docs**: [nominatim.org/release-docs/latest/api](https://nominatim.org/release-docs/latest/api/)

---

### PostGIS: Geography Type

**Extension**: `postgis` (installed in Docker image)

**Why chosen**:
- Efficient geo-radius queries via `ST_DWithin` + GIST index
- Built-in support in PostgreSQL 16
- Mission matching in Sprint 7 requires "find humans within 10km of mission location"

**Schema**:
```typescript
location: geography("location", { type: "point", srid: 4326 }), // WGS 84
```

**Query pattern**:
```sql
-- Find humans within 10km of mission location
SELECT h.*
FROM human_profiles h
WHERE ST_DWithin(
  h.location,
  ST_MakePoint(mission_lng, mission_lat)::geography,
  h.service_radius * 1000 -- km to meters
);
```

**GIST index**:
```typescript
spatialIndex("human_profiles_location_gist_idx").using("gist", table.location)
```

**Docs**: [postgis.net/docs/ST_DWithin.html](https://postgis.net/docs/ST_DWithin.html)

---

## Key Patterns

### Double-Entry Accounting

**Pattern**: Single-table with `balance_before` and `balance_after` columns

**Why chosen**:
- Simpler than dual-table (debits/credits) for BetterWorld's scale
- `balance_after = balance_before + amount` constraint enforces integrity
- Daily audit job detects discrepancies

**Race condition prevention**: `SELECT FOR UPDATE` pessimistic locking

**Implementation**:
```typescript
return db.transaction(async (tx) => {
  // 1. Lock user's profile row
  const profile = await tx
    .select()
    .from(humanProfiles)
    .where(eq(humanProfiles.humanId, humanId))
    .for('update', { skipLocked: false }); // Wait for lock

  const currentBalance = profile[0].tokenBalance;

  // 2. Check sufficient balance
  if (currentBalance < amount) {
    throw new Error('Insufficient balance');
  }

  // 3. Create transaction record
  await tx.insert(tokenTransactions).values({
    humanId,
    amount: -amount,
    balanceBefore: currentBalance,
    balanceAfter: currentBalance - amount,
    transactionType: 'spend_vote',
    idempotencyKey,
  });

  // 4. Update cached balance
  await tx
    .update(humanProfiles)
    .set({ tokenBalance: currentBalance - amount })
    .where(eq(humanProfiles.humanId, humanId));
});
```

**Daily audit job**:
```typescript
// Check balance integrity
const discrepancies = await db.execute(sql`
  SELECT
    human_id,
    SUM(amount) AS calculated_balance,
    (SELECT token_balance FROM human_profiles WHERE human_id = t.human_id) AS cached_balance
  FROM token_transactions t
  GROUP BY human_id
  HAVING SUM(amount) != (SELECT token_balance FROM human_profiles WHERE human_id = t.human_id)
`);

if (discrepancies.rows.length > 0) {
  await alertAdmins('Token audit failed', discrepancies.rows);
}
```

---

### Idempotency

**Pattern**: Client-generated UUID + server-side uniqueness check

**Why needed**: Prevent duplicate token spending on network retries

**Implementation**:
```typescript
// Client generates idempotency key
const idempotencyKey = crypto.randomUUID();

await fetch('/tokens/spend', {
  method: 'POST',
  headers: { 'Idempotency-Key': idempotencyKey },
  body: JSON.stringify({ amount: 5, type: 'spend_vote' }),
});

// Server checks uniqueness
const existing = await redis.get(`idempotency:${idempotencyKey}`);
if (existing) {
  return JSON.parse(existing); // Cached response
}

// Process transaction...

// Cache response for 1 hour
await redis.setex(`idempotency:${idempotencyKey}`, 3600, JSON.stringify(response));
```

**Database uniqueness**:
```typescript
idempotencyKey: varchar("idempotency_key", { length: 64 }).unique()
```

---

### Profile Completeness Scoring

**Algorithm**: Weighted binary scoring with field categories

**Formula**:
```typescript
profileCompleteness = Math.floor(
  (hasSkills ? 20 : 0) +             // Core matching
  (hasCompleteLocation ? 20 : 0) +   // Core matching
  (hasLanguages ? 10 : 0) +          // Core matching
  (hasAvailability ? 20 : 0) +       // Availability
  (hasBio ? 10 : 0) +                // Identity
  (hasAvatar ? 5 : 0) +              // Identity
  (hasWallet ? 10 : 0) +             // Optional
  (hasCertifications ? 5 : 0)        // Optional
);
```

**Why weighted**: Mission matching requires skills, location, languages (50% weight) more than bio or avatar (15% weight)

**Array logic**: Presence-based (NOT count-based)
- `hasSkills = skills.length > 0` (1 skill = 20 points, 10 skills = 20 points)
- Prevents gamification (users adding meaningless skills to boost score)

**Location completeness**: Requires BOTH city AND coordinates
- City string alone = 0 points (not actionable for geo-radius queries)
- City + geocoded coordinates = 20 points

---

## File Structure

```
specs/007-human-onboarding/
├── spec.md                      # Feature specification (5 user stories, 47 requirements)
├── plan.md                      # Implementation plan with Technical Context + Constitution Check
├── research.md                  # Consolidated research findings (OAuth, geocoding, accounting, scoring)
├── data-model.md                # Database schemas (5 new tables, 1 modified)
├── quickstart.md                # Local setup guide (OAuth credentials, migrations, testing)
├── agent-context.md             # This file (tech summary for developers)
├── contracts/
│   ├── auth.openapi.yaml        # Authentication API (OAuth, email/password, sessions)
│   ├── profile.openapi.yaml     # Profile management API (CRUD, completeness)
│   ├── tokens.openapi.yaml      # ImpactToken API (balance, earn, spend, transactions)
│   └── dashboard.openapi.yaml   # Dashboard aggregation API
└── checklists/
    └── requirements.md          # Spec quality validation (all checks passed)
```

---

## Database Schema Summary

**New tables** (5):
- `human_profiles` - Extended profile attributes (skills, location, languages, availability, completeness)
- `token_transactions` - Double-entry accounting ledger (balance_before, balance_after, idempotency)
- `sessions` - better-auth session management (access token, refresh token)
- `accounts` - better-auth OAuth provider accounts (Google, GitHub)
- `verification_tokens` - better-auth email verification (6-digit codes, 15min expiry)

**Modified tables** (1):
- `humans` - Added OAuth fields (oauth_provider, oauth_provider_id, avatar_url, email_verified)

**New enums** (1):
- `transaction_type` - Token transaction types (earn_*, spend_*)

**New indexes** (6):
- `human_profiles.location` - GIST index for geo-radius queries
- `human_profiles.skills` - GIN index for array containment queries
- `token_transactions.human_id, created_at DESC` - Composite for transaction history
- `token_transactions.idempotency_key` - Unique index for duplicate prevention
- `humans.oauth_provider, oauth_provider_id` - OAuth provider lookup
- `human_profiles.profile_completeness_score` - Filtering by completeness

---

## API Endpoint Summary

### Authentication (`/auth`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/auth/register` | POST | Email/password registration (sends 6-digit code) |
| `/auth/verify-email` | POST | Verify email with 6-digit code (returns tokens) |
| `/auth/resend-code` | POST | Resend verification code (throttled: 3/hour) |
| `/auth/login` | POST | Email/password login (returns tokens) |
| `/auth/oauth/google` | GET | Initiate Google OAuth flow (with PKCE) |
| `/auth/oauth/google/callback` | GET | Google OAuth callback (exchanges code + verifier) |
| `/auth/oauth/github` | GET | Initiate GitHub OAuth flow (with PKCE) |
| `/auth/oauth/github/callback` | GET | GitHub OAuth callback |
| `/auth/refresh` | POST | Refresh access token (rotates refresh token) |
| `/auth/logout` | POST | Logout and invalidate session |

### Profile (`/profile`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/profile` | GET | Get current user's profile (with completeness) |
| `/profile` | POST | Create profile (geocodes location) |
| `/profile` | PATCH | Update profile (partial, re-geocodes if city/country changed) |
| `/profile/completeness` | GET | Get detailed completeness breakdown |

### Tokens (`/tokens`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/tokens/balance` | GET | Get current token balance + totals |
| `/tokens/orientation-reward` | POST | Claim 10 IT for orientation (one-time) |
| `/tokens/spend` | POST | Spend tokens (voting, circles, analytics) |
| `/tokens/transactions` | GET | Transaction history (cursor pagination) |

### Dashboard (`/dashboard`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/dashboard` | GET | Aggregated dashboard data (tokens, reputation, profile, missions, activity) |

---

## Environment Variables (New)

```bash
# OAuth 2.0 Credentials
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."

# JWT Configuration
JWT_SECRET="..." # Min 32 chars, generate with: openssl rand -base64 32
REFRESH_TOKEN_EXPIRY="7d"
ACCESS_TOKEN_EXPIRY="15m"

# Geocoding (Nominatim)
GEOCODING_USER_AGENT="BetterWorld/1.0"
GEOCODING_CACHE_TTL=2592000 # 30 days

# Email Verification
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="..."
SMTP_PASSWORD="..." # Gmail App Password
SMTP_FROM="noreply@betterworld.ai"
EMAIL_VERIFICATION_EXPIRY=900 # 15 minutes
EMAIL_VERIFICATION_MAX_RESENDS=3

# Token Audit
TOKEN_AUDIT_CRON="0 2 * * *" # Daily at 02:00 UTC
TOKEN_AUDIT_WEBHOOK_URL="..." # Slack webhook for alerts
```

---

## Testing Checklist

**Integration tests** (15+ required):
- [ ] Email/password registration → verification → login
- [ ] Google OAuth registration → profile creation → dashboard access
- [ ] GitHub OAuth registration → profile creation → dashboard access
- [ ] Profile creation with geocoding (city → lat/lng)
- [ ] Profile completeness calculation (weighted scoring)
- [ ] Orientation reward claim (one-time, idempotent)
- [ ] Token spending with idempotency (duplicate requests)
- [ ] Token spending with insufficient balance (error)
- [ ] Transaction history pagination (cursor-based)
- [ ] Dashboard aggregation (all data in one request)
- [ ] Race condition prevention (concurrent token operations)
- [ ] Geocoding failure handling (invalid city)
- [ ] Email verification code expiry (15 minutes)
- [ ] Verification code resend throttling (3/hour)
- [ ] PKCE flow verification (code_verifier mismatch)

**Adversarial tests**:
- [ ] Duplicate orientation reward claim (should fail)
- [ ] Spend more tokens than balance (should fail)
- [ ] Reuse idempotency key with different amount (should return cached response)
- [ ] Submit negative token amount (should fail validation)
- [ ] Profile update without auth token (should fail 401)
- [ ] IDOR attack: Update another user's profile (should fail ownership check)

**Performance tests** (k6):
- [ ] Token spending: 1000 concurrent requests, no deadlocks, p95 < 500ms
- [ ] Geocoding: 100 concurrent profile creations, Redis cache hit rate > 80%
- [ ] Dashboard: 100 concurrent requests, p95 < 1000ms (aggregated data)

---

## Success Criteria

**From spec.md**:
- ✅ SC-001: Registration completes in under 2 minutes
- ✅ SC-002: Email codes delivered in under 30 seconds (95% of cases)
- ✅ SC-003: Geocoding completes in under 2 seconds
- ✅ SC-004: Profile completeness calculated accurately (100% = all fields filled)
- ✅ SC-005: Orientation tutorial is resumable
- ✅ SC-006: Orientation reward issued in under 100ms, zero duplicates
- ✅ SC-007: Token operations are race-condition safe
- ✅ SC-008: Daily audit detects 100% of balance discrepancies
- ✅ SC-009: Token spending is idempotent (1-hour cache window)
- ✅ SC-010: Dashboard loads in under 1 second
- ✅ SC-011: OAuth flows complete in under 5 seconds
- ✅ SC-012: 1000 concurrent token transactions, no deadlocks
- ✅ SC-013: All 668 Phase 1 tests continue to pass
- ✅ SC-014: 15+ new integration tests cover full human onboarding flow
- ✅ SC-015: Zero high/critical vulnerabilities in OAuth security audit

---

## Constitutional Compliance

**Principles validated in plan.md**:
1. ✅ **Privacy-First**: Grid snapping (1km), no exact addresses stored
2. ✅ **Security-First**: PKCE, bcrypt, TLS 1.3, pessimistic locking
3. ✅ **Verified Impact**: Double-entry accounting, daily audit job
4. ✅ **User-Centric**: Profile completeness guides users to mission-readiness
5. ✅ **Framework-Agnostic**: better-auth works with any frontend (React, Vue, Svelte)
6. ✅ **Evidence-Backed**: Token transactions have audit trail (balance_before, balance_after)

**Non-applicable**:
- ❌ **Constitutional AI**: N/A (human profiles, not AI agent content)

---

## Key Implementation Notes

1. **PKCE is automatic**: better-auth handles code_verifier, code_challenge internally. No manual implementation needed.

2. **Geocoding is cached**: Always check Redis before calling Nominatim. TTL = 30 days.

3. **Location privacy**: Always snap coordinates to 1km grid (`ROUND(lat * 100) / 100`). Never return exact coordinates in API responses.

4. **Token operations require transactions**: Always wrap token operations in `db.transaction()` with `SELECT FOR UPDATE`.

5. **Idempotency keys are required**: All token earning/spending endpoints require `Idempotency-Key` header.

6. **Profile completeness is cached**: Stored in `human_profiles.profile_completeness_score`. Recalculated on every profile update.

7. **Orientation reward is one-time**: Check `human_profiles.orientation_completed_at` timestamp. If not null, reject duplicate claims.

8. **Array fields use presence logic**: Skills, languages, certifications count as complete if `length > 0`, not based on count.

9. **Location requires coordinates**: City string alone is not sufficient. Must have geocoded latitude/longitude to count as complete.

10. **Refresh tokens rotate on use**: Old refresh token is invalidated after issuing new access token. Prevents replay attacks.

---

**Agent Context Status**: ✅ **COMPLETE**
**Ready for**: Implementation (Sprint 6 coding phase)
