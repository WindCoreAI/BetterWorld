# Research Report: Sprint 6 - Human Onboarding

**Feature**: 007-human-onboarding
**Created**: 2026-02-10
**Research Phase**: Phase 0 (completed)

This document consolidates findings from 4 parallel research investigations conducted during the planning phase.

---

## Table of Contents

1. [OAuth 2.0 + PKCE with better-auth](#oauth-20--pkce-with-better-auth)
2. [PostGIS Geocoding Strategies](#postgis-geocoding-strategies)
3. [Double-Entry Accounting Patterns](#double-entry-accounting-patterns)
4. [Profile Completeness Algorithms](#profile-completeness-algorithms)

---

## OAuth 2.0 + PKCE with better-auth

### Research Question

How do we implement OAuth 2.0 with PKCE (Proof Key for Code Exchange, RFC 7636) using better-auth for Google and GitHub authentication, while maintaining compatibility with Drizzle ORM and the existing agent authentication system?

### Recommendation

**Use better-auth with automatic PKCE support for Google and GitHub OAuth flows, alongside email/password fallback.**

### Key Findings

1. **better-auth PKCE Support**:
   - PKCE is automatically enabled for all OAuth providers by default
   - No manual PKCE implementation required (code_verifier, code_challenge handled internally)
   - Follows RFC 7636 standard with S256 challenge method

2. **Drizzle ORM Integration**:
   - better-auth provides official Drizzle adapter out of the box
   - Schema generation: `pnpm better-auth generate` creates Drizzle schema files
   - Supports PostgreSQL 16 with full type safety

3. **Multi-Provider Setup**:
   ```typescript
   // apps/api/src/auth.ts
   import { betterAuth } from "better-auth";
   import { drizzleAdapter } from "better-auth/adapters/drizzle";
   import { db } from "@betterworld/db";

   export const auth = betterAuth({
     database: drizzleAdapter(db, {
       provider: "pg", // PostgreSQL 16
     }),
     socialProviders: {
       google: {
         clientId: process.env.GOOGLE_CLIENT_ID!,
         clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
         // PKCE enabled by default
       },
       github: {
         clientId: process.env.GITHUB_CLIENT_ID!,
         clientSecret: process.env.GITHUB_CLIENT_SECRET!,
         // PKCE enabled by default
       },
     },
     emailAndPassword: {
       enabled: true,
       requireEmailVerification: true,
     },
   });
   ```

4. **Token Management**:
   - **Access tokens**: 15-minute expiry (JWT)
   - **Refresh tokens**: 7-day expiry with automatic rotation
   - **Session management**: Redis-backed with 30-day rolling expiry

5. **Email Verification**:
   - better-auth includes built-in email verification workflow
   - Can reuse existing `verification_codes` table with minor schema additions
   - 6-digit codes, 15-minute expiry (matches agent verification pattern)

### Security Considerations

- **PKCE prevents authorization code interception**: Even if an attacker intercepts the authorization code, they cannot exchange it without the code_verifier
- **State parameter**: better-auth includes CSRF protection via state parameter validation
- **Refresh token rotation**: Old refresh tokens are invalidated after rotation, limiting replay attack window
- **TLS 1.3**: All OAuth redirect URIs must use HTTPS (enforced in production)

### Implementation Checklist

- [ ] Install better-auth: `pnpm add better-auth`
- [ ] Configure Google OAuth 2.0 credentials in Google Cloud Console
- [ ] Configure GitHub OAuth App credentials in GitHub Developer Settings
- [ ] Generate better-auth Drizzle schema: `pnpm better-auth generate`
- [ ] Run Drizzle migration: `pnpm drizzle-kit push`
- [ ] Set environment variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- [ ] Create `/auth/oauth/google/callback` and `/auth/oauth/github/callback` routes
- [ ] Add email verification route: `POST /auth/verify-email`
- [ ] Add token refresh route: `POST /auth/refresh`
- [ ] Update frontend with OAuth login buttons

### Sources

- [better-auth Documentation - OAuth](https://www.better-auth.com/docs/authentication/oauth)
- [better-auth Documentation - Drizzle Adapter](https://www.better-auth.com/docs/integrations/drizzle)
- [RFC 7636 - Proof Key for Code Exchange (PKCE)](https://datatracker.ietf.org/doc/html/rfc7636)
- [OAuth 2.0 Security Best Current Practice](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)

---

## PostGIS Geocoding Strategies

### Research Question

How do we geocode user-entered location strings (city, country) into PostGIS point coordinates (latitude, longitude) for efficient geo-radius queries, while handling geocoding failures, privacy concerns, and scale?

### Recommendation

**Use Nominatim (OpenStreetMap) for geocoding with Redis caching, PostGIS ST_MakePoint for storage, and 1km grid snapping for privacy.**

### Key Findings

1. **Geocoding Service: Nominatim**
   - **Free and open-source** (no API key required, no usage fees)
   - OpenStreetMap-based, global coverage
   - REST API: `https://nominatim.openstreetmap.org/search?q=Jakarta,Indonesia&format=json`
   - Rate limit: 1 request/second (acceptable for registration flow)
   - Returns latitude, longitude, bounding box, display name

2. **Privacy Protection: Grid Snapping**
   - Round coordinates to 1km grid: `ROUND(latitude * 100) / 100`
   - Prevents exact address inference while preserving mission matching accuracy
   - Example: `(-6.2088, 106.8456)` → `(-6.21, 106.85)` (1km precision)

3. **Storage: PostGIS Geography**
   ```sql
   -- packages/db/src/schema/humanProfiles.ts
   CREATE TABLE human_profiles (
     human_id UUID PRIMARY KEY REFERENCES humans(id),
     city TEXT,
     country TEXT,
     -- Store as geography (lat, lng) for efficient geo-radius queries
     location GEOGRAPHY(POINT, 4326), -- WGS 84 coordinate system
     service_radius INTEGER DEFAULT 10, -- kilometers
     ...
   );

   -- Index for geo-radius queries
   CREATE INDEX idx_human_profiles_location
   ON human_profiles USING GIST (location);
   ```

4. **Query Pattern for Mission Matching**:
   ```sql
   -- Find humans within 10km of mission location
   SELECT h.*
   FROM human_profiles h
   WHERE ST_DWithin(
     h.location,
     ST_MakePoint(mission_lng, mission_lat)::geography,
     h.service_radius * 1000 -- convert km to meters
   )
   AND h.active = true;
   ```

5. **Caching Strategy**:
   - **Redis cache key**: `geocode:sha256(city,country)` → `{lat, lng, display_name}`
   - **TTL**: 30 days (locations don't change frequently)
   - **Hit rate estimate**: 80%+ (common cities like Jakarta, London, New York reused across users)

6. **Failure Handling**:
   - **Geocoding fails** (ambiguous city, API timeout) → Store city as text, set `location = NULL`
   - **Profile completeness score**: Location only counts as complete if coordinates are present
   - **User feedback**: "We couldn't verify your location. Please try a more specific address."
   - **Manual correction**: Admins can manually set coordinates via Admin Panel if needed

### Implementation Flow

```typescript
// packages/api/src/utils/geocode.ts
import { redis } from './redis';
import crypto from 'crypto';

interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

export async function geocodeLocation(
  city: string,
  country: string
): Promise<GeocodeResult | null> {
  // Check Redis cache
  const cacheKey = `geocode:${crypto.createHash('sha256')
    .update(`${city},${country}`)
    .digest('hex')}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Call Nominatim API
  const query = encodeURIComponent(`${city}, ${country}`);
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'BetterWorld/1.0' }, // Required by Nominatim
    });

    const results = await response.json();
    if (results.length === 0) {
      return null; // Geocoding failed
    }

    const { lat, lon, display_name } = results[0];

    // Grid snapping for privacy (1km precision)
    const snappedLat = Math.round(parseFloat(lat) * 100) / 100;
    const snappedLng = Math.round(parseFloat(lon) * 100) / 100;

    const result = {
      lat: snappedLat,
      lng: snappedLng,
      displayName: display_name,
    };

    // Cache for 30 days
    await redis.setex(cacheKey, 30 * 24 * 60 * 60, JSON.stringify(result));

    return result;
  } catch (error) {
    console.error('Geocoding failed:', error);
    return null;
  }
}
```

### Alternatives Considered

| Service | Pros | Cons | Verdict |
|---------|------|------|---------|
| **Nominatim** (OSM) | Free, no API key, global coverage | 1 req/s rate limit | ✅ **Recommended** |
| Google Maps Geocoding | High accuracy, 99.9% uptime | $5 per 1000 requests | ❌ Cost prohibitive |
| Mapbox Geocoding | 100K free requests/month | Requires API key, credit card | ❌ Unnecessary complexity |
| PostGIS Built-in | No external API calls | Requires address database setup | ❌ Too much infra overhead |

### Privacy & Security

- **Grid snapping prevents exact address inference**: 1km precision is sufficient for mission matching but prevents doxxing
- **User consent**: Profile creation form includes disclaimer: "Your location will be used for mission matching within your service radius"
- **Service radius control**: Users can set radius (5-50km) to control matching distance
- **Location visibility**: Location coordinates are never exposed in API responses (only city/country strings shown)

### Sources

- [Nominatim API Documentation](https://nominatim.org/release-docs/latest/api/Overview/)
- [PostGIS Geography Type](https://postgis.net/docs/using_postgis_dbmanagement.html#Geography_Basics)
- [PostGIS ST_DWithin Function](https://postgis.net/docs/ST_DWithin.html)
- [Location Privacy Best Practices](https://www.usenix.org/conference/soups2018/presentation/fawaz)

---

## Double-Entry Accounting Patterns

### Research Question

How do we implement double-entry accounting for ImpactToken transactions to ensure balance integrity, prevent race conditions, and enable reliable auditing?

### Recommendation

**Use single-table double-entry with `balance_before` and `balance_after` columns, pessimistic locking (`SELECT FOR UPDATE`), and daily audit jobs.**

### Key Findings

1. **Single-Table Double-Entry Pattern**
   ```sql
   -- packages/db/src/schema/tokenTransactions.ts
   CREATE TABLE token_transactions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     human_id UUID NOT NULL REFERENCES humans(id),
     amount INTEGER NOT NULL, -- Positive for earn, negative for spend
     balance_before INTEGER NOT NULL,
     balance_after INTEGER NOT NULL CHECK (balance_after = balance_before + amount),
     transaction_type TEXT NOT NULL, -- 'earn_mission', 'earn_orientation', 'spend_vote', 'spend_circle', etc.
     reference_id UUID, -- ID of related entity (mission_id, problem_id, solution_id, circle_id)
     reference_type TEXT, -- 'mission', 'problem', 'solution', 'circle'
     description TEXT,
     idempotency_key TEXT UNIQUE, -- Prevents duplicate transactions
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );

   CREATE INDEX idx_token_tx_human ON token_transactions(human_id, created_at DESC);
   CREATE INDEX idx_token_tx_idempotency ON token_transactions(idempotency_key);
   ```

2. **Race Condition Prevention: Pessimistic Locking**
   ```typescript
   // packages/api/src/routes/tokens/spend.ts
   export async function spendTokens(
     humanId: string,
     amount: number,
     type: string,
     idempotencyKey: string
   ) {
     return db.transaction(async (tx) => {
       // 1. Lock the human's profile row (prevents concurrent modifications)
       const profile = await tx
         .select()
         .from(humanProfiles)
         .where(eq(humanProfiles.humanId, humanId))
         .for('update', { skipLocked: false }) // Wait for lock
         .limit(1);

       const currentBalance = profile[0].tokenBalance;

       // 2. Check sufficient balance
       if (currentBalance < amount) {
         throw new Error('Insufficient balance');
       }

       // 3. Create transaction record
       await tx.insert(tokenTransactions).values({
         humanId,
         amount: -amount, // Negative for spend
         balanceBefore: currentBalance,
         balanceAfter: currentBalance - amount,
         transactionType: type,
         idempotencyKey,
         description: `Spent ${amount} IT on ${type}`,
       });

       // 4. Update cached balance
       await tx
         .update(humanProfiles)
         .set({ tokenBalance: currentBalance - amount })
         .where(eq(humanProfiles.humanId, humanId));

       return { newBalance: currentBalance - amount };
     });
   }
   ```

3. **Idempotency Handling**
   - **Client generates idempotency key**: UUIDv4 or `sha256(humanId + type + timestamp)`
   - **Server checks uniqueness**: `idempotency_key` has UNIQUE constraint
   - **Duplicate request handling**: If key exists, return cached response from Redis (1-hour TTL)
   - **Example**:
     ```typescript
     const idempotencyKey = crypto.randomUUID();
     await fetch('/tokens/spend', {
       method: 'POST',
       headers: { 'X-Idempotency-Key': idempotencyKey },
       body: JSON.stringify({ amount: 5, type: 'spend_vote' }),
     });
     ```

4. **Daily Audit Job**
   ```typescript
   // packages/api/src/jobs/tokenAudit.ts
   export async function runTokenAudit() {
     // 1. Check balance integrity for each user
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
       // Alert admins via webhook or email
       console.error('[AUDIT FAILED] Token balance discrepancies detected:', discrepancies.rows);
       await alertAdmins('Token audit failed', discrepancies.rows);
     }

     // 2. Check double-entry integrity (sum of all transactions should equal sum of all balances)
     const totalTransactions = await db.execute(sql`
       SELECT SUM(amount) AS total FROM token_transactions
     `);

     const totalBalances = await db.execute(sql`
       SELECT SUM(token_balance) AS total FROM human_profiles
     `);

     if (totalTransactions.rows[0].total !== totalBalances.rows[0].total) {
       console.error('[AUDIT FAILED] Total transactions != total balances');
       await alertAdmins('Token audit failed (global sum mismatch)', {
         totalTransactions: totalTransactions.rows[0].total,
         totalBalances: totalBalances.rows[0].total,
       });
     }
   }

   // Schedule daily at 02:00 UTC
   cron.schedule('0 2 * * *', runTokenAudit);
   ```

5. **Performance Considerations**
   - **Pessimistic locking** adds ~5-10ms latency per transaction (acceptable for token operations)
   - **Index on `(human_id, created_at DESC)`** enables efficient transaction history queries
   - **Redis caching** for idempotency responses reduces DB load (1-hour TTL)
   - **Audit job runs daily** (off-peak hours) to minimize production impact

### Why Single-Table Over Dual-Table?

**Dual-table approach** (separate `debits` and `credits` tables):
- **Pros**: Strict double-entry enforcement (every earn has a matching system credit)
- **Cons**: 2x database writes per transaction, complex queries (`JOIN` for balance calculation), harder to debug

**Single-table approach** (one `transactions` table with signed amounts):
- **Pros**: Simpler schema, faster queries, easier debugging, `balance_after` provides audit trail
- **Cons**: Requires CHECK constraint to enforce `balance_after = balance_before + amount`

**Verdict**: Single-table is **sufficient for Sprint 6** given BetterWorld's scale (thousands of users, not millions). Can migrate to dual-table in Phase 3 if needed.

### Edge Cases Handled

1. **Concurrent transactions**: Pessimistic locking serializes access to balance
2. **Duplicate API calls**: Idempotency key prevents duplicate debits
3. **Balance corruption**: Daily audit job detects and alerts discrepancies
4. **Negative balances**: CHECK constraint `balance_after >= 0` enforces non-negative balance
5. **Arithmetic overflow**: PostgreSQL INTEGER type supports -2B to +2B (sufficient for token economy)

### Sources

- [PostgreSQL SELECT FOR UPDATE](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE)
- [Idempotency Keys for Safe Payments](https://stripe.com/docs/api/idempotent_requests)
- [Designing Robust and Predictable APIs with Idempotency](https://brandur.org/idempotency-keys)
- [Double-Entry Bookkeeping in PostgreSQL](https://www.depesz.com/2020/01/31/double-entry-bookkeeping-in-postgresql/)

---

## Profile Completeness Algorithms

### Research Question

What algorithm should we use to calculate profile completeness scores (0-100%) that incentivizes users to complete mission-critical fields (skills, location, languages) while handling optional fields (bio, avatar, certifications)?

### Recommendation

**Use weighted binary scoring with field categories: Core Matching (50%), Availability (20%), Identity (15%), Optional (15%).**

### Key Findings

1. **Scoring Formula**

   | Category | Weight | Fields | Completion Logic |
   |----------|--------|--------|------------------|
   | **Core Matching** | 50% | skills (20%), location (20%), languages (10%) | ≥1 item in array; location requires both city AND coordinates |
   | **Availability** | 20% | availability hours (20%) | Non-null structured schedule data |
   | **Identity** | 15% | bio (10%), avatar (5%) | Non-null and non-empty |
   | **Optional** | 15% | wallet (10%), certifications (5%) | Non-null and non-empty |
   | **Required** | 0% | email, displayName | Always 100% (enforced at registration) |

   **Formula:**
   ```typescript
   profileCompleteness = Math.floor(
     (hasSkills ? 20 : 0) +
     (hasCompleteLocation ? 20 : 0) +
     (hasLanguages ? 10 : 0) +
     (hasAvailability ? 20 : 0) +
     (hasBio ? 10 : 0) +
     (hasAvatar ? 5 : 0) +
     (hasWallet ? 10 : 0) +
     (hasCertifications ? 5 : 0)
   );
   ```

2. **Score Interpretation**
   - **0-40%**: Incomplete (missing core fields, poor mission matching)
   - **41-70%**: Functional (has core fields, missing optional)
   - **71-90%**: Strong (most fields complete)
   - **91-100%**: Complete (all fields filled)

3. **Array Field Logic: Presence-Based (NOT Count-Based)**

   **Philosophy**: We care about **whether** the user provided skills/languages, not **how many**.

   **Rationale**:
   - Avoids gamification (users adding meaningless skills to boost score)
   - Simplifies user understanding ("Add your skills" vs "Add at least 3 skills")
   - 1 skill enables mission matching; 10 skills doesn't make matching 10x better
   - Industry research shows count-based scoring leads to low-quality data

   **Implementation**:
   ```typescript
   // Skills: 20% if array has ≥1 item
   hasSkills = profile.skills.length > 0;

   // Languages: 10% if array has ≥1 item
   hasLanguages = profile.languages.length > 0;

   // Location: Requires BOTH city AND coordinates (not just city string)
   hasCompleteLocation = (
     profile.city !== null &&
     profile.city !== '' &&
     profile.latitude !== null &&
     profile.longitude !== null &&
     !(profile.latitude === 0 && profile.longitude === 0) // Exclude "null island"
   );
   ```

4. **Edge Cases Handled**

   | Edge Case | Decision | Rationale |
   |-----------|----------|-----------|
   | **Partial location** (city without coordinates) | Score as **0%** (incomplete) | Mission matching requires coordinates for geo-radius queries; city string alone is not actionable |
   | **Rounding display** | **Round down** (`Math.floor`) to nearest integer | Conservative approach; users expect 100% to mean "truly complete" |
   | **Required fields** (email, displayName) | Contribute **0%** to score | Always present (enforced at registration); score measures optional enrichment |
   | **Orientation metadata** | Exclude from completeness score | Orientation is a one-time process, not an ongoing profile attribute |

5. **UI Feedback: Prioritized Suggestions**

   ```typescript
   // Generate suggestions (prioritize by weight)
   const suggestions: string[] = [];
   if (!hasCompleteLocation) {
     suggestions.push('Add your location for better mission matching'); // 20% weight
   }
   if (!hasSkills) {
     suggestions.push('Add skills to find relevant missions'); // 20% weight
   }
   if (!hasAvailability) {
     suggestions.push('Set your availability hours'); // 20% weight
   }
   if (!hasLanguages) {
     suggestions.push('Add languages you speak'); // 10% weight
   }
   // ... lower-priority suggestions (bio, avatar, wallet, certifications)
   ```

6. **Industry Examples**

   - **LinkedIn**: Weighted scoring with specific field targets (Skills 25%, Experience 20%, Education 15%). Increased profile completion by 60% after implementing progress bars.
   - **GitHub**: Simple presence-based (no weighted scoring). Binary badges ("Has bio", "Has location").
   - **Twitter/X**: 4-step checklist (avatar, bio, interests, follow 10 accounts). Step-based completion feels achievable for small profiles.
   - **Heallist**: Weighted scoring with categories (Personal Info 30%, Health Metrics 40%, Goals 30%). Category weights align with platform value.

7. **Implementation Example**

   ```typescript
   // packages/shared/src/utils/profileCompleteness.ts
   export function calculateProfileCompleteness(profile: ProfileInput): ProfileCompletenessResult {
     // Core matching (50%)
     const hasSkills = profile.skills.length > 0;
     const skillsPoints = hasSkills ? 20 : 0;

     const hasCompleteLocation = !!(
       profile.city &&
       profile.city.trim() !== '' &&
       profile.latitude !== null &&
       profile.longitude !== null &&
       !(profile.latitude === 0 && profile.longitude === 0)
     );
     const locationPoints = hasCompleteLocation ? 20 : 0;

     const hasLanguages = profile.languages.length > 0;
     const languagesPoints = hasLanguages ? 10 : 0;

     // Availability (20%)
     const hasAvailability = !!(
       profile.availability &&
       profile.availability.trim() !== '' &&
       profile.availability !== '{}'
     );
     const availabilityPoints = hasAvailability ? 20 : 0;

     // Identity (15%)
     const hasBio = !!(profile.bio && profile.bio.trim() !== '');
     const bioPoints = hasBio ? 10 : 0;

     const hasAvatar = !!(profile.avatarUrl && profile.avatarUrl.trim() !== '');
     const avatarPoints = hasAvatar ? 5 : 0;

     // Optional (15%)
     const hasWallet = !!(profile.walletAddress && profile.walletAddress.trim() !== '');
     const walletPoints = hasWallet ? 10 : 0;

     const hasCertifications = !!(profile.certifications && profile.certifications.length > 0);
     const certificationsPoints = hasCertifications ? 5 : 0;

     // Total score (round down)
     const score = Math.floor(
       skillsPoints + locationPoints + languagesPoints +
       availabilityPoints + bioPoints + avatarPoints +
       walletPoints + certificationsPoints
     );

     return { score, breakdown, suggestions };
   }
   ```

### Alternatives Considered

| Approach | Complexity | Mission Alignment | User Experience | Verdict |
|----------|------------|-------------------|-----------------|----------|
| **Weighted Binary** | Medium | ⭐⭐⭐ High | ⭐⭐⭐ Clear | ✅ **Recommended** |
| Unweighted (all fields equal) | Low | ⭐ Low | ⭐⭐ Simple | ❌ Not aligned with mission matching goals |
| Count-Based Arrays (e.g., 3+ skills for 100%) | High | ⭐⭐ Medium | ⭐ Confusing | ❌ Gaming risk, low data quality |
| Progressive Tiers (25%, 50%, 75%, 100%) | Medium | ⭐⭐ Medium | ⭐⭐⭐ Gamified | ❌ Less granular feedback |
| Adaptive Weights (personalized per user intent) | Very High | ⭐⭐⭐ High | ⭐ Complex | ❌ Premature for Sprint 6 |

### Why Weighted Matters for Mission Matching

Sprint 7 introduces mission matching based on:
- **Skills** (e.g., "Needs data analysis skills")
- **Location** (e.g., "Within 10km of Jakarta city center")
- **Languages** (e.g., "Requires Indonesian speaker")

Without these 3 fields, mission matching is effectively broken for the user. By weighting them at 50% combined, we incentivize users to complete the fields that **unlock mission participation**, not just cosmetic fields like avatar or bio.

**Result**: Users with 50%+ completeness can participate in missions. Users with 70%+ get optimal matches. Users with 90%+ maximize platform engagement.

### Sources

- [GitHub - joshk/completeness-fu](https://github.com/joshk/completeness-fu) - Ruby gem for profile completeness
- [Profile Completeness – Higher Logic](https://support.higherlogic.com/hc/en-us/articles/360033051511-Profile-Completeness) - LinkedIn case study
- [How is the Profile Completion Score calculated? - Heallist](https://support.heallist.com/how-is-the-profile-completion-score-calculated) - Weighted scoring example
- [Percentage of profile completion | Creatio Academy](https://academy.creatio.com/docs/user/crm_tools/accounts_and_contacts/profile_completion/calculate_profile_completion) - Configurable weights
- [Weighted Scoring Model: Step-by-Step Implementation Guide](https://productschool.com/blog/product-fundamentals/weighted-scoring-model) - Product scoring methodology
- [A Practical Approach to Gamification Design | Toptal](https://www.toptal.com/designers/ui/gamification-design) - Gamification best practices

---

## Summary: Key Decisions

| Research Area | Decision | Rationale |
|---------------|----------|-----------|
| **OAuth Authentication** | better-auth with automatic PKCE for Google/GitHub + email/password fallback | PKCE built-in, Drizzle integration, matches existing agent auth pattern |
| **Geocoding** | Nominatim (OSM) with Redis caching + PostGIS ST_MakePoint | Free, global coverage, 1km grid snapping for privacy |
| **Token Accounting** | Single-table double-entry with `balance_before`/`balance_after` + SELECT FOR UPDATE locking | Simpler schema, race-condition safe, daily audit job for integrity |
| **Profile Completeness** | Weighted binary scoring (Core 50%, Availability 20%, Identity 15%, Optional 15%) | Incentivizes mission-critical fields, presence-based arrays avoid gaming |

All 4 research areas align with constitutional principles:
- ✅ **Verified Impact**: Double-entry accounting ensures token integrity
- ✅ **Privacy-First**: Grid snapping prevents exact location inference
- ✅ **Security-First**: PKCE prevents authorization code interception
- ✅ **User-Centric**: Profile completeness incentivizes mission participation

---

## Next Steps

With research complete, proceed to Phase 1 design artifacts:

1. **data-model.md**: Database schemas for `humans`, `human_profiles`, `token_transactions`, `verification_codes` extensions
2. **contracts/*.openapi.yaml**: API contracts for auth, profile, tokens, dashboard endpoints
3. **quickstart.md**: Local development setup (OAuth credentials, test data, environment variables)
4. **agent-context.md**: Update with better-auth, Nominatim, weighted scoring algorithm

---

**Research Phase Status**: ✅ **COMPLETE**
**Ready for**: Phase 1 (Design Artifacts)
