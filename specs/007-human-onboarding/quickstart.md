# Quickstart Guide: Sprint 6 - Human Onboarding

**Feature**: 007-human-onboarding
**Created**: 2026-02-10
**Estimated setup time**: 30-45 minutes

This guide walks through local development environment setup for Sprint 6 (Human Onboarding).

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [OAuth Provider Setup](#oauth-provider-setup)
   - [Google OAuth](#google-oauth-setup)
   - [GitHub OAuth](#github-oauth-setup)
3. [Environment Variables](#environment-variables)
4. [Database Migration](#database-migration)
5. [Seed Data](#seed-data)
6. [Running Services](#running-services)
7. [Testing the Flow](#testing-the-flow)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

**Required** (Phase 1 complete):
- ✅ Docker Desktop running (PostgreSQL + Redis + BullMQ worker)
- ✅ Node.js 22+ installed
- ✅ pnpm installed (`npm install -g pnpm`)
- ✅ Repository cloned: `git clone https://github.com/WindCoreAI/BetterWorld.git`
- ✅ Dependencies installed: `pnpm install`
- ✅ Phase 1 services verified working (API, Web, Docker)

**New requirements for Sprint 6**:
- Google Cloud Console account (for Google OAuth)
- GitHub account (for GitHub OAuth)
- Email delivery service credentials (optional for testing, can mock)

---

## OAuth Provider Setup

### Google OAuth Setup

**Step 1: Create OAuth 2.0 Client**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing): **BetterWorld Dev**
3. Enable **Google+ API** (required for profile data):
   - Navigation menu → APIs & Services → Library
   - Search "Google+ API" → Enable
4. Create OAuth 2.0 credentials:
   - Navigation menu → APIs & Services → Credentials
   - Click **Create Credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Name: **BetterWorld Local Dev**
   - Authorized redirect URIs:
     - `http://localhost:4000/v1/auth/oauth/google/callback`
     - `http://localhost:3000/auth/callback` (frontend)
   - Click **Create**
5. Copy **Client ID** and **Client Secret**

**Step 2: Configure OAuth Consent Screen**

1. Navigation menu → APIs & Services → OAuth consent screen
2. User Type: **External** (for testing)
3. App information:
   - App name: **BetterWorld (Dev)**
   - User support email: your email
   - Developer contact: your email
4. Scopes: Add the following:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
5. Test users: Add your Google account email
6. Save and Continue

---

### GitHub OAuth Setup

**Step 1: Create OAuth App**

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Application details:
   - Application name: **BetterWorld Local Dev**
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:4000/v1/auth/oauth/github/callback`
4. Click **Register application**
5. Copy **Client ID**
6. Click **Generate a new client secret** → Copy **Client Secret**

---

## Environment Variables

**Step 1: Update `.env` file**

Add the following to `apps/api/.env` (or root `.env` if using shared config):

```bash
# ============================================================
# Sprint 6: Human Onboarding Environment Variables
# ============================================================

# ----- OAuth 2.0 Credentials -----
GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"

# ----- better-auth Configuration -----
# JWT secret for access/refresh tokens (min 32 chars)
# Generate with: openssl rand -base64 32
JWT_SECRET="your-jwt-secret-min-32-chars-required"

# Refresh token expiry (7 days)
REFRESH_TOKEN_EXPIRY="7d"

# Access token expiry (15 minutes)
ACCESS_TOKEN_EXPIRY="15m"

# ----- Geocoding Configuration -----
# Nominatim geocoding (no API key required)
GEOCODING_USER_AGENT="BetterWorld/1.0 Dev"

# Cache TTL for geocoded locations (30 days)
GEOCODING_CACHE_TTL=2592000

# ----- Email Configuration (Optional for Testing) -----
# SMTP settings for verification code emails
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASSWORD="your-app-password"
SMTP_FROM="noreply@betterworld.ai"

# Email verification code expiry (15 minutes)
EMAIL_VERIFICATION_EXPIRY=900

# Max verification code resend attempts per hour
EMAIL_VERIFICATION_MAX_RESENDS=3

# ----- Token Audit Job Configuration -----
# Daily audit job cron schedule (02:00 UTC)
TOKEN_AUDIT_CRON="0 2 * * *"

# Admin webhook for audit failures
TOKEN_AUDIT_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
```

**Step 2: Generate JWT Secret**

```bash
# Option 1: OpenSSL (recommended)
openssl rand -base64 32

# Option 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Example output:
# xK7vF3nL9wQ2zR8mP1aT4yH6jB5sD0cG8eV1qU3oI9pW2rN7tY6hM4lK5fA0bX3c
```

**Step 3: Verify Existing Variables**

Ensure Phase 1 variables are still set:

```bash
# From Phase 1 (should already exist)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=betterworld
POSTGRES_PASSWORD=betterworld_dev
POSTGRES_DB=betterworld
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Database Migration

**Step 1: Generate better-auth Schema**

```bash
# Install better-auth
pnpm add better-auth

# Generate Drizzle schema files for sessions, accounts, verification_tokens
pnpm better-auth generate --adapter drizzle --provider pg
```

**Expected output**:
```
✓ Generated schema files:
  - packages/db/src/schema/sessions.ts
  - packages/db/src/schema/accounts.ts
  - packages/db/src/schema/verificationTokens.ts
```

**Step 2: Create Schema Files**

Create the new schema files manually (if not using better-auth generator):

```bash
# Create schema files
touch packages/db/src/schema/humanProfiles.ts
touch packages/db/src/schema/tokenTransactions.ts

# Update existing schema
# packages/db/src/schema/humans.ts (add OAuth fields)
# packages/db/src/schema/enums.ts (add transaction_type enum)
```

Refer to [data-model.md](./data-model.md) for full schema definitions.

**Step 3: Generate Migration**

```bash
# Generate Drizzle migration from schema changes
pnpm drizzle-kit generate:pg

# Expected output:
# ✓ Generated migration file: drizzle/0006_sprint6_human_onboarding.sql
```

**Step 4: Apply Migration**

```bash
# Start Docker services (if not already running)
docker-compose up -d

# Verify PostgreSQL is healthy
docker ps | grep postgres

# Apply migration
pnpm drizzle-kit push:pg

# Verify tables were created
docker exec -it betterworld-postgres psql -U betterworld -d betterworld -c "\dt"

# Expected output (partial):
#              List of relations
#  Schema |         Name          | Type  |    Owner
# --------+-----------------------+-------+-------------
#  public | humans                | table | betterworld
#  public | human_profiles        | table | betterworld  ← New
#  public | token_transactions    | table | betterworld  ← New
#  public | sessions              | table | betterworld  ← New
#  public | accounts              | table | betterworld  ← New
#  public | verification_tokens   | table | betterworld  ← New
```

**Step 5: Verify Indexes**

```bash
# Check PostGIS extension is installed (required for human_profiles.location)
docker exec -it betterworld-postgres psql -U betterworld -d betterworld -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# Verify GIST index on location field
docker exec -it betterworld-postgres psql -U betterworld -d betterworld -c "\d human_profiles"

# Expected output (partial):
# Indexes:
#     "human_profiles_location_gist_idx" gist (location)
```

---

## Seed Data

**Step 1: Create Seed Script**

```bash
# Create seed file
touch packages/db/src/seed/humans.ts
```

**Example seed data** (`packages/db/src/seed/humans.ts`):

```typescript
import { db } from "../client";
import { humans, humanProfiles } from "../schema";
import bcrypt from "bcrypt";

export async function seedHumans() {
  console.log("Seeding test humans...");

  // Test user 1: OAuth (Google)
  const [human1] = await db.insert(humans).values({
    email: "maya@example.com",
    displayName: "Maya Chen",
    role: "human",
    oauthProvider: "google",
    oauthProviderId: "google-12345",
    emailVerified: true,
    emailVerifiedAt: new Date(),
    avatarUrl: "https://i.pravatar.cc/150?img=1",
    tokenBalance: 10, // Orientation reward already claimed
    reputationScore: "0",
  }).returning();

  await db.insert(humanProfiles).values({
    humanId: human1.id,
    skills: ["data_analysis", "python"],
    city: "Jakarta",
    country: "Indonesia",
    // PostGIS POINT (lng, lat) - snapped to 1km grid
    location: db.fn.raw("ST_MakePoint(106.85, -6.21)::geography"),
    serviceRadius: 10,
    languages: ["en", "id"],
    availability: JSON.stringify({
      weekdays: ["18:00-22:00"],
      weekends: ["09:00-17:00"],
      timezone: "Asia/Jakarta"
    }),
    bio: "University student passionate about environmental protection.",
    profileCompletenessScore: 75,
    orientationCompletedAt: new Date(),
  });

  // Test user 2: Email/password (not verified)
  const passwordHash = await bcrypt.hash("SecurePassword123!", 12);
  const [human2] = await db.insert(humans).values({
    email: "alex@example.com",
    displayName: "Alex Johnson",
    passwordHash,
    role: "human",
    emailVerified: false,
    tokenBalance: 0,
    reputationScore: "0",
  }).returning();

  console.log("✓ Seeded 2 test humans");
  console.log("  - maya@example.com (Google OAuth, verified, profile complete)");
  console.log("  - alex@example.com (Email/password, not verified, no profile)");
}
```

**Step 2: Run Seed Script**

```bash
# Add seed command to package.json
# "seed:humans": "tsx packages/db/src/seed/humans.ts"

# Run seed
pnpm --filter @betterworld/db seed:humans

# Verify seeded data
docker exec -it betterworld-postgres psql -U betterworld -d betterworld -c "SELECT email, oauth_provider, email_verified FROM humans;"

# Expected output:
#       email       | oauth_provider | email_verified
# ------------------+----------------+----------------
#  maya@example.com | google         | t
#  alex@example.com |                | f
```

---

## Running Services

**Step 1: Start All Services**

```bash
# Terminal 1: Docker services (PostgreSQL, Redis)
docker-compose up -d

# Terminal 2: API server (Hono)
pnpm --filter @betterworld/api dev

# Terminal 3: Web frontend (Next.js)
pnpm --filter @betterworld/web dev

# Terminal 4: Worker (BullMQ guardrail evaluation)
pnpm --filter @betterworld/api dev:worker
```

**Step 2: Verify Services**

```bash
# Check API health
curl http://localhost:4000/health

# Expected response:
# {"ok":true,"data":{"status":"healthy","timestamp":"2026-02-10T12:34:56.789Z"}}

# Check Web frontend
open http://localhost:3000

# Check Redis
redis-cli ping
# PONG
```

---

## Testing the Flow

### Test 1: Google OAuth Registration

**Step 1: Initiate OAuth Flow**

```bash
# Open browser to:
http://localhost:3000/auth/register

# Click "Sign up with Google"
# → Redirects to Google consent screen
# → Authorize access
# → Redirects back to localhost:3000/auth/callback?token=...
```

**Step 2: Verify User Created**

```bash
# Check database
docker exec -it betterworld-postgres psql -U betterworld -d betterworld -c "SELECT email, oauth_provider, email_verified FROM humans WHERE oauth_provider = 'google' ORDER BY created_at DESC LIMIT 1;"

# Expected: Your Google account email with oauth_provider='google', email_verified=true
```

**Step 3: Access Dashboard**

```bash
# Use access token from redirect URL
curl -H "Authorization: Bearer {token}" http://localhost:4000/v1/dashboard

# Expected: Dashboard data with tokens.balance = 0 (orientation not completed yet)
```

---

### Test 2: Email/Password Registration

**Step 1: Register**

```bash
curl -X POST http://localhost:4000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!",
    "displayName": "Test User"
  }'

# Expected response:
# {
#   "ok": true,
#   "data": {
#     "userId": "uuid-here",
#     "message": "Verification code sent to test@example.com"
#   }
# }
```

**Step 2: Get Verification Code** (Dev Mode)

```bash
# In dev mode, verification codes are logged to console
# Check API server logs:
# [INFO] Verification code for test@example.com: 123456

# Or query database directly
docker exec -it betterworld-postgres psql -U betterworld -d betterworld -c "SELECT token, expires_at FROM verification_tokens WHERE identifier = 'test@example.com' ORDER BY created_at DESC LIMIT 1;"
```

**Step 3: Verify Email**

```bash
curl -X POST http://localhost:4000/v1/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "code": "123456"
  }'

# Expected response:
# {
#   "ok": true,
#   "data": {
#     "accessToken": "eyJhbGci...",
#     "refreshToken": "rt_abc123...",
#     "expiresIn": 900,
#     "user": { ... }
#   }
# }
```

---

### Test 3: Profile Creation

**Step 1: Create Profile**

```bash
curl -X POST http://localhost:4000/v1/profile \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "skills": ["web_development", "react"],
    "city": "San Francisco",
    "country": "United States",
    "serviceRadius": 15,
    "languages": ["en", "es"],
    "availability": {
      "weekdays": ["09:00-17:00"],
      "weekends": ["10:00-14:00"],
      "timezone": "America/Los_Angeles"
    },
    "bio": "Full-stack developer passionate about social impact."
  }'

# Expected response:
# {
#   "ok": true,
#   "data": {
#     "humanId": "uuid-here",
#     "skills": ["web_development", "react"],
#     "city": "San Francisco",
#     "country": "United States",
#     "location": {
#       "latitude": 37.77,  // Snapped to 1km grid
#       "longitude": -122.42
#     },
#     "profileCompletenessScore": 75,
#     "completeness": {
#       "score": 75,
#       "suggestions": ["Add wallet address for future features", ...]
#     },
#     ...
#   }
# }
```

**Step 2: Verify Geocoding**

```bash
# Check location was geocoded
docker exec -it betterworld-postgres psql -U betterworld -d betterworld -c "SELECT city, ST_AsText(location) FROM human_profiles WHERE city = 'San Francisco';"

# Expected output:
#      city        |           st_astext
# -----------------+-------------------------------
#  San Francisco   | POINT(-122.42 37.77)
```

---

### Test 4: Orientation Reward

**Step 1: Claim Orientation Reward**

```bash
curl -X POST http://localhost:4000/v1/tokens/orientation-reward \
  -H "Authorization: Bearer {access_token}"

# Expected response:
# {
#   "ok": true,
#   "data": {
#     "transaction": {
#       "id": "tx-uuid",
#       "amount": 10,
#       "balanceBefore": 0,
#       "balanceAfter": 10,
#       "transactionType": "earn_orientation"
#     },
#     "newBalance": 10
#   }
# }
```

**Step 2: Verify Balance**

```bash
curl -H "Authorization: Bearer {access_token}" http://localhost:4000/v1/tokens/balance

# Expected response:
# {
#   "ok": true,
#   "data": {
#     "balance": 10,
#     "totalEarned": 10,
#     "totalSpent": 0
#   }
# }
```

**Step 3: Try Duplicate Claim (Should Fail)**

```bash
curl -X POST http://localhost:4000/v1/tokens/orientation-reward \
  -H "Authorization: Bearer {access_token}"

# Expected response (400 Bad Request):
# {
#   "ok": false,
#   "error": {
#     "code": "REWARD_ALREADY_CLAIMED",
#     "message": "Orientation reward has already been claimed"
#   }
# }
```

---

### Test 5: Token Spending (Idempotency)

**Step 1: Spend Tokens**

```bash
# Generate idempotency key
IDEMPOTENCY_KEY=$(uuidgen)

curl -X POST http://localhost:4000/v1/tokens/spend \
  -H "Authorization: Bearer {access_token}" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5,
    "type": "spend_vote",
    "referenceId": "problem-uuid-123",
    "referenceType": "problem",
    "description": "Voted on Problem: Plastic Pollution"
  }'

# Expected response (201 Created):
# {
#   "ok": true,
#   "data": {
#     "transaction": {
#       "amount": -5,
#       "balanceBefore": 10,
#       "balanceAfter": 5,
#       ...
#     },
#     "newBalance": 5
#   }
# }
```

**Step 2: Retry with Same Idempotency Key**

```bash
# Same request, same idempotency key
curl -X POST http://localhost:4000/v1/tokens/spend \
  -H "Authorization: Bearer {access_token}" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5,
    "type": "spend_vote",
    "referenceId": "problem-uuid-123",
    "referenceType": "problem",
    "description": "Voted on Problem: Plastic Pollution"
  }'

# Expected response (200 OK, not 201):
# {
#   "ok": true,
#   "data": {
#     "transaction": { ... },  // Same as before
#     "newBalance": 5,
#     "cached": true  // Indicates cached response
#   }
# }

# Balance should still be 5 (not 0), proving idempotency works
```

---

## Troubleshooting

### Issue: "PKCE code_verifier mismatch"

**Cause**: Frontend didn't send code_verifier during OAuth callback.

**Solution**:
```javascript
// Frontend must store code_verifier in session/localStorage
const codeVerifier = generateRandomString(128);
localStorage.setItem('pkce_verifier', codeVerifier);

// Include in callback
const params = new URLSearchParams({
  code: authCode,
  state: state,
  code_verifier: localStorage.getItem('pkce_verifier')
});
```

---

### Issue: "Geocoding failed" for valid city

**Cause**: Nominatim rate limit (1 req/s) or ambiguous city name.

**Solution**:
```bash
# Check Nominatim API directly
curl "https://nominatim.openstreetmap.org/search?q=Jakarta,Indonesia&format=json&limit=1"

# If working, check Redis cache
redis-cli GET "geocode:$(echo -n 'Jakarta,Indonesia' | sha256sum | cut -d' ' -f1)"

# Clear cache if stale
redis-cli DEL "geocode:$(echo -n 'Jakarta,Indonesia' | sha256sum | cut -d' ' -f1)"
```

---

### Issue: "JWT_SECRET must be at least 32 characters"

**Cause**: `.env` has a short JWT_SECRET.

**Solution**:
```bash
# Generate new 32-char secret
openssl rand -base64 32

# Update .env
JWT_SECRET="xK7vF3nL9wQ2zR8mP1aT4yH6jB5sD0cG8eV1qU3oI9pW2rN7tY6hM4lK5fA0bX3c"

# Restart API server
```

---

### Issue: "Email verification code not received"

**Cause**: SMTP not configured or Gmail blocking.

**Solution (Dev Mode)**:
```bash
# Option 1: Check API logs for printed code
# [INFO] Verification code for user@example.com: 123456

# Option 2: Query database directly
docker exec -it betterworld-postgres psql -U betterworld -d betterworld -c "SELECT token FROM verification_tokens WHERE identifier = 'user@example.com' ORDER BY created_at DESC LIMIT 1;"

# Option 3: Use Gmail App Password (not account password)
# https://myaccount.google.com/apppasswords
```

---

### Issue: "Insufficient balance" when balance > 0

**Cause**: Race condition or stale Redis cache.

**Solution**:
```bash
# Clear Redis cache for user's balance
redis-cli DEL "balance:human:{user_id}"

# Verify balance in database
docker exec -it betterworld-postgres psql -U betterworld -d betterworld -c "SELECT token_balance FROM humans WHERE id = '{user_id}';"

# Recalculate from transactions (audit check)
docker exec -it betterworld-postgres psql -U betterworld -d betterworld -c "SELECT SUM(amount) FROM token_transactions WHERE human_id = '{user_id}';"
```

---

### Issue: "PostGIS extension not installed"

**Cause**: PostgreSQL doesn't have PostGIS extension.

**Solution**:
```bash
# Install PostGIS extension
docker exec -it betterworld-postgres psql -U betterworld -d betterworld -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# Verify
docker exec -it betterworld-postgres psql -U betterworld -d betterworld -c "SELECT PostGIS_Version();"

# Expected output:
#          postgis_version
# ----------------------------------
#  3.4 USE_GEOS=1 USE_PROJ=1 ...
```

---

## Next Steps

With local environment verified:

1. ✅ Implement auth routes (`/auth/register`, `/auth/oauth/google`, etc.)
2. ✅ Implement profile routes (`GET /profile`, `POST /profile`, `PATCH /profile`)
3. ✅ Implement token routes (`GET /tokens/balance`, `POST /tokens/spend`, etc.)
4. ✅ Implement dashboard route (`GET /dashboard`)
5. ✅ Write integration tests (15+ tests covering full flows)
6. ✅ Update frontend with OAuth buttons + profile forms
7. ✅ Run E2E test suite (registration → profile → orientation → dashboard)

**Ready to implement**: All infrastructure is set up and verified ✅

---

**Quickstart Status**: ✅ **COMPLETE**
**Estimated completion time**: 30-45 minutes (assuming OAuth credentials ready)
