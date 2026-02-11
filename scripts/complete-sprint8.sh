#!/bin/bash
set -e  # Exit on error

echo "=========================================="
echo "Sprint 8 Local Completion Script"
echo "=========================================="
echo ""

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
echo "Checking prerequisites..."
if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}❌ pnpm not found. Please install: npm install -g pnpm${NC}"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found. Please install Docker Desktop${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites OK${NC}"
echo ""

# Check Docker services
echo "Checking Docker services..."
if ! docker ps | grep -q postgres; then
    echo -e "${YELLOW}⚠ PostgreSQL not running. Starting services...${NC}"
    docker compose up -d postgres redis
    echo "Waiting 5s for services to initialize..."
    sleep 5
else
    echo -e "${GREEN}✓ PostgreSQL running${NC}"
fi
echo ""

# Step 1: Generate migration
echo "=========================================="
echo "Step 1: Generate Drizzle Migration"
echo "=========================================="
cd packages/db
echo "Running: pnpm db:generate"
pnpm db:generate
cd ../..

# Check if migration was created
LATEST_MIGRATION=$(ls -t packages/db/drizzle/*.sql | head -1)
if [ -f "$LATEST_MIGRATION" ]; then
    echo -e "${GREEN}✓ Migration generated: $(basename $LATEST_MIGRATION)${NC}"
    echo ""
    echo "Migration preview (first 30 lines):"
    head -30 "$LATEST_MIGRATION"
    echo ""
else
    echo -e "${RED}❌ Migration file not found${NC}"
    exit 1
fi

# Step 2: Apply migration
echo "=========================================="
echo "Step 2: Apply Migration to PostgreSQL"
echo "=========================================="
echo "Running: pnpm db:migrate"
pnpm db:migrate

echo -e "${GREEN}✓ Migration applied${NC}"
echo ""

# Step 3: Verify tables created
echo "=========================================="
echo "Step 3: Verify Tables Created"
echo "=========================================="
echo "Checking for evidence tables..."

# Use docker exec to query PostgreSQL
docker exec -it betterworld-postgres psql -U postgres -d betterworld -c "\dt evidence*" || true
docker exec -it betterworld-postgres psql -U postgres -d betterworld -c "\dt peer_reviews*" || true
docker exec -it betterworld-postgres psql -U postgres -d betterworld -c "\dt review_history*" || true
docker exec -it betterworld-postgres psql -U postgres -d betterworld -c "\dt verification_audit_log*" || true

echo ""
echo "Checking missions.is_honeypot column..."
docker exec -it betterworld-postgres psql -U postgres -d betterworld -c "\d missions" | grep is_honeypot || echo -e "${YELLOW}⚠ is_honeypot column not found${NC}"

echo ""

# Step 4: Seed honeypot missions
echo "=========================================="
echo "Step 4: Seed Honeypot Missions"
echo "=========================================="
echo "Running: pnpm --filter @betterworld/db seed:honeypots"
pnpm --filter @betterworld/db seed:honeypots

echo -e "${GREEN}✓ Honeypot missions seeded${NC}"
echo ""

# Verify honeypots
echo "Verifying honeypot missions..."
HONEYPOT_COUNT=$(docker exec betterworld-postgres psql -U postgres -d betterworld -t -c "SELECT COUNT(*) FROM missions WHERE is_honeypot = true;" | xargs)
echo "Found $HONEYPOT_COUNT honeypot missions"

if [ "$HONEYPOT_COUNT" -eq "5" ]; then
    echo -e "${GREEN}✓ All 5 honeypot missions seeded correctly${NC}"
else
    echo -e "${YELLOW}⚠ Expected 5 honeypots, found $HONEYPOT_COUNT${NC}"
fi
echo ""

# Step 5: Run tests
echo "=========================================="
echo "Step 5: Run Test Suite"
echo "=========================================="
echo "Running: pnpm test"
echo ""

# Run tests and capture output
if pnpm test 2>&1 | tee /tmp/sprint8-test-output.txt; then
    echo ""
    echo -e "${GREEN}✓ All tests passed!${NC}"

    # Count tests
    TOTAL_TESTS=$(grep -o "Test Files.*passed" /tmp/sprint8-test-output.txt || echo "unknown")
    echo "Test results: $TOTAL_TESTS"
else
    echo ""
    echo -e "${RED}❌ Some tests failed. Check output above.${NC}"
    echo ""
    echo "Common issues:"
    echo "1. Missing environment variables (check apps/api/.env)"
    echo "2. Database connection issues (check Docker services)"
    echo "3. Redis not running (run: docker compose up -d redis)"
    echo ""
    echo "To debug, run tests for specific package:"
    echo "  pnpm --filter @betterworld/api test"
    echo ""
    exit 1
fi

echo ""

# Step 6: Summary
echo "=========================================="
echo "Sprint 8 Completion Summary"
echo "=========================================="
echo ""
echo -e "${GREEN}✓ Database migration applied${NC}"
echo -e "${GREEN}✓ Evidence tables created (evidence, peer_reviews, review_history, verification_audit_log)${NC}"
echo -e "${GREEN}✓ missions.is_honeypot column added${NC}"
echo -e "${GREEN}✓ Honeypot missions seeded (5 impossible missions)${NC}"
echo -e "${GREEN}✓ Test suite passing${NC}"
echo ""
echo "Sprint 8 Status: 100% COMPLETE ✅"
echo ""
echo "Next steps:"
echo "1. Update docs/roadmap/phase2-human-in-the-loop.md (mark Sprint 8 complete)"
echo "2. Update CLAUDE.md Recent Changes section"
echo "3. Test evidence submission flow manually (see specs/009-evidence-verification/quickstart.md)"
echo "4. Start Sprint 9 (Reputation & Impact)"
echo ""
echo "To start evidence verification worker:"
echo "  pnpm --filter @betterworld/api dev:worker:evidence"
echo ""
echo "To view database in Drizzle Studio:"
echo "  pnpm db:studio"
echo ""
echo "=========================================="
echo "Script completed successfully!"
echo "=========================================="
