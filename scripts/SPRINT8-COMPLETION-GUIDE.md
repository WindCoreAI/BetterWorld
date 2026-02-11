# Sprint 8 Local Completion Guide

**Date**: 2026-02-11
**Current Status**: 90% code-complete, migration pending
**Goal**: Complete Sprint 8 locally (100%)

---

## Quick Start (Automated)

Run the automated completion script:

```bash
cd /Users/zhiruifeng/Workspace/WindCore/BetterWorld
./scripts/complete-sprint8.sh
```

This script will:
1. ✅ Generate Drizzle migration for 4 new evidence tables
2. ✅ Apply migration to local PostgreSQL
3. ✅ Verify tables created
4. ✅ Seed 5 honeypot missions
5. ✅ Run full test suite

**Estimated Time**: 5-10 minutes

---

## Manual Steps (If Automated Script Fails)

### Prerequisites Check

```bash
# Check pnpm installed
pnpm --version  # Should show 9.15.4+

# Check Docker services running
docker ps | grep postgres  # Should show betterworld-postgres
docker ps | grep redis     # Should show betterworld-redis

# If not running:
docker compose up -d postgres redis
```

### Step 1: Generate Migration (2 min)

```bash
cd /Users/zhiruifeng/Workspace/WindCore/BetterWorld

# Generate migration from schema files
pnpm --filter @betterworld/db db:generate

# Or use root script:
pnpm db:generate
```

**Expected Output**:
- New file created: `packages/db/drizzle/0006_*.sql`
- Should contain: CREATE TABLE evidence, peer_reviews, review_history, verification_audit_log
- Should contain: ALTER TABLE missions ADD COLUMN is_honeypot

**Verify**:
```bash
ls -la packages/db/drizzle/*.sql
# Should show 0006_*.sql as newest file

head -50 packages/db/drizzle/0006_*.sql
# Preview migration contents
```

### Step 2: Apply Migration (1 min)

```bash
# Apply migration to PostgreSQL
pnpm --filter @betterworld/db db:migrate

# Or use root script:
pnpm db:migrate
```

**Expected Output**:
```
Migration applied successfully
Applied migration: 0006_*
```

**Verify Tables Created**:
```bash
# Connect to PostgreSQL
docker exec -it betterworld-postgres psql -U postgres -d betterworld

# Check tables
\dt evidence*
\dt peer_reviews*
\dt review_history*
\dt verification_audit_log*

# Check missions.is_honeypot column
\d missions

# Should show:
# is_honeypot | boolean | default false

# Exit psql
\q
```

### Step 3: Seed Honeypot Missions (1 min)

```bash
# Run honeypot seed script
pnpm --filter @betterworld/db seed:honeypots
```

**Expected Output**:
```
Seeding 5 honeypot missions...
✓ Honeypot 1: GPS in Pacific Ocean
✓ Honeypot 2: GPS in Antarctica
✓ Honeypot 3: Future deadline (2099)
✓ Honeypot 4: Non-existent address
✓ Honeypot 5: Impossible task
All honeypots seeded successfully!
```

**Verify**:
```bash
docker exec -it betterworld-postgres psql -U postgres -d betterworld -c \
  "SELECT id, title, is_honeypot FROM missions WHERE is_honeypot = true;"

# Should show 5 missions with is_honeypot = true
```

### Step 4: Run Tests (5-10 min)

```bash
# Run full test suite
pnpm test

# Or run only API tests (includes Sprint 8 evidence tests)
pnpm --filter @betterworld/api test

# Or run specific test files
pnpm --filter @betterworld/api test evidence-submission
pnpm --filter @betterworld/api test evidence-verification
pnpm --filter @betterworld/api test peer-review
```

**Expected Results**:
- 810 existing tests (Phase 1 + Sprint 6 + Sprint 7) ✅ passing
- 42 new Sprint 8 tests ✅ passing
- **Total**: 852+ tests passing

**Common Test Failures & Fixes**:

1. **"relation does not exist" errors**
   - Cause: Migration not applied
   - Fix: Re-run Step 2 (apply migration)

2. **Connection timeout / ECONNREFUSED**
   - Cause: PostgreSQL/Redis not running
   - Fix: `docker compose up -d postgres redis`

3. **"SUPABASE_URL is not defined"**
   - Cause: Missing environment variables
   - Fix: Check `apps/api/.env` has all required vars:
     ```bash
     SUPABASE_URL=http://localhost:54321
     SUPABASE_SERVICE_KEY=your-key
     SUPABASE_STORAGE_BUCKET=evidence
     VISION_DAILY_BUDGET_CENTS=3700
     PEER_REVIEW_REWARD=2
     ```

4. **Claude Vision API errors**
   - Cause: Missing or invalid ANTHROPIC_API_KEY
   - Fix: Set in `apps/api/.env`:
     ```bash
     ANTHROPIC_API_KEY=sk-ant-...
     ```
   - Note: Tests mock the API, so this shouldn't fail locally

### Step 5: Verify in Drizzle Studio (Optional)

```bash
# Open database browser
pnpm db:studio

# Opens at http://localhost:4983
# Browse: evidence, peer_reviews, review_history, verification_audit_log tables
```

---

## Troubleshooting

### Issue: "drizzle-kit: command not found"

```bash
# Install dependencies
pnpm install

# Or just in db package
cd packages/db && pnpm install
```

### Issue: "Cannot connect to database"

```bash
# Check PostgreSQL running
docker ps | grep postgres

# Check connection string
cat packages/db/src/config.ts | grep DATABASE_URL

# Default: postgresql://postgres:postgres@localhost:5432/betterworld

# Test connection manually
docker exec -it betterworld-postgres psql -U postgres -d betterworld -c "SELECT 1;"
```

### Issue: Migration already applied (duplicate)

```bash
# Check migration journal
cat packages/db/drizzle/meta/_journal.json

# If 0006_* already exists, skip Step 1-2
# If tables exist but migration not in journal, run:
pnpm --filter @betterworld/db db:push
# This syncs schema without migration files
```

### Issue: Honeypot seed fails with "duplicate key"

```bash
# Honeypots already seeded, safe to skip
# Or delete and re-seed:
docker exec -it betterworld-postgres psql -U postgres -d betterworld -c \
  "DELETE FROM missions WHERE is_honeypot = true;"

# Then re-run seed
pnpm --filter @betterworld/db seed:honeypots
```

---

## Post-Completion Checklist

After all steps complete successfully:

- [ ] Migration file exists: `packages/db/drizzle/0006_*.sql`
- [ ] Tables visible in Drizzle Studio (4 new tables)
- [ ] Honeypot missions seeded (5 missions with `is_honeypot = true`)
- [ ] Test suite passing (852+ tests)
- [ ] Update Sprint 8 status in `docs/roadmap/phase2-human-in-the-loop.md`:
  - [ ] Change status from "90% code-complete" → "✅ COMPLETE"
  - [ ] Check all 16 exit criteria boxes
  - [ ] Update "Last Updated" date
- [ ] Update `CLAUDE.md` Recent Changes section:
  - [ ] Add Sprint 8 completion summary with stats
- [ ] Commit changes:
  ```bash
  git add packages/db/drizzle/0006_*.sql
  git add packages/db/drizzle/meta/
  git commit -m "Sprint 8: Apply evidence verification database migration"
  ```

---

## Manual Testing (Optional, ~30 min)

To manually test the complete evidence submission flow:

```bash
# Terminal 1: Start API server
pnpm dev

# Terminal 2: Start evidence verification worker
pnpm --filter @betterworld/api dev:worker:evidence

# Terminal 3: Follow manual test guide
# See: specs/009-evidence-verification/quickstart.md (lines 116-149)
```

**Test Flow**:
1. Register a human (POST `/api/v1/auth/register`)
2. Complete orientation (earn 10 IT)
3. Create a mission (via agent API)
4. Claim the mission (POST `/api/v1/missions/:id/claim`)
5. Submit evidence (POST `/api/v1/missions/:id/evidence` with photo)
6. Check verification status (GET `/api/v1/evidence/:id/status`)
7. Verify AI worker processed evidence (check logs in Terminal 2)
8. Check token balance increased (GET `/api/v1/tokens/balance`)

**Frontend Testing**:
```bash
# Open frontend
open http://localhost:3000

# Navigate to mission detail → "Submit Evidence" button
# Test mobile-first evidence submission UI
# - Camera capture
# - GPS detection
# - Checklist validation
# - Preview before submit
# - Verification status timeline
```

---

## Success Criteria Verification

Run this checklist after completion:

```bash
# 1. Migration applied
psql -U postgres -h localhost -d betterworld -c "\dt" | grep evidence
# ✓ Should show: evidence, peer_reviews, review_history, verification_audit_log

# 2. Honeypots seeded
psql -U postgres -h localhost -d betterworld -c \
  "SELECT COUNT(*) FROM missions WHERE is_honeypot = true;"
# ✓ Should show: 5

# 3. Tests passing
pnpm test 2>&1 | grep "Test Files"
# ✓ Should show: "X passed" with no failures

# 4. Worker script exists
ls -la apps/api/package.json | grep dev:worker:evidence
# ✓ Should show: "dev:worker:evidence": "tsx src/workers/evidence-verification.ts"

# 5. Frontend components exist
ls apps/web/src/components/evidence/*.tsx | wc -l
# ✓ Should show: 5 (EvidenceSubmitForm, GPSIndicator, EvidenceChecklist, EvidencePreview, VerificationStatus)

# 6. API routes registered
grep -r "evidence" apps/api/src/routes/v1.routes.ts
# ✓ Should show: evidence routes mounted
```

All checks passing = **Sprint 8: 100% Complete** ✅

---

## Next Steps

After Sprint 8 completion:

1. **Sprint 9: Reputation & Impact** (Weeks 17-18)
   - Reputation scoring engine
   - Leaderboards (reputation, impact, tokens, missions)
   - Impact Dashboard (platform-wide metrics + heatmap)
   - Impact Portfolio (shareable user pages)
   - Streak system with multipliers
   - **Fraud detection pipeline** (pHash duplicate detection using `blockhash-core`, velocity monitoring, statistical profiling)
   - Phase 2 Grafana dashboards
   - Load testing (k6: 5K concurrent users)

2. **Phase 3: Credit-System + Scaling** (Weeks 19+)
   - Peer agent validation (replace Claude API for 80% of validation)
   - Multi-tier reputation system
   - Advanced fraud detection ML models
   - Horizontal scaling (read replicas, CDN)

---

## Reference Documentation

- **Sprint 8 Spec**: `specs/009-evidence-verification/spec.md`
- **Sprint 8 Tasks**: `specs/009-evidence-verification/tasks.md` (57 tasks, all complete)
- **Sprint 8 Completeness Report**: `docs/archive/sprint8-completeness-report.md`
- **Database Schema**: `docs/engineering/03b-db-schema-missions-and-content.md`
- **API Contracts**: `specs/009-evidence-verification/contracts/` (5 files)
- **Quickstart Guide**: `specs/009-evidence-verification/quickstart.md`

---

**Last Updated**: 2026-02-11
**Author**: Claude Code
**Status**: Ready for execution
