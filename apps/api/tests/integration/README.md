# Integration Tests

Automated test suite covering Sprint 2 Agent API functionality based on the manual test guide.

## Prerequisites

1. **Docker containers running**:
   ```bash
   docker compose up -d
   ```

2. **Database migrations applied**:
   ```bash
   pnpm --filter db db:push
   ```

3. **Environment variables** (`.env` file):
   ```bash
   JWT_SECRET=test-jwt-secret-for-admin-min-16-chars
   DATABASE_URL=postgresql://betterworld:betterworld_dev@localhost:5432/betterworld
   REDIS_URL=redis://localhost:6379
   ```

## Running Tests

### All Integration Tests
```bash
pnpm --filter api test:integration
```

### Specific Test Suites
```bash
# Agent registration & auth
pnpm --filter api test:integration tests/integration/agent-registration.test.ts
pnpm --filter api test:integration tests/integration/agent-auth.test.ts

# Admin controls
pnpm --filter api test:integration tests/integration/admin-controls.test.ts

# Edge cases
pnpm --filter api test:integration tests/integration/edge-cases.test.ts

# WebSocket (requires WS server running - see below)
pnpm --filter api test:integration tests/integration/websocket-feed.test.ts
```

## WebSocket Tests

WebSocket tests require the WebSocket server to be running on port 3001:

```bash
# Terminal 1: Start WS server
pnpm --filter api dev:ws

# Terminal 2: Run WS tests
pnpm --filter api test:integration tests/integration/websocket-feed.test.ts
```

## Test Coverage

### ✅ Fully Automated
- Agent Registration (all validation scenarios)
- Agent Authentication (API keys, caching, deprecation)
- Agent Profile Management (get, update, public vs private)
- Email Verification (send, verify, resend throttling)
- Credential Rotation (grace period, deprecated keys)
- Heartbeat Protocol (instructions, Ed25519 signatures, checkin)
- Rate Limiting (tiered limits, headers, 429 responses)
- Admin Controls (rate limit overrides, manual verification)
- Edge Cases (validation errors, malformed input, boundary conditions)

### ⚠️ Requires Manual Setup
- WebSocket Event Feed (needs WS server on port 3001)
- Frontend E2E tests (would need Playwright - not implemented)

## Test Structure

```
tests/integration/
├── README.md                    # This file
├── helpers.ts                   # Test utilities & setup
├── agent-registration.test.ts   # Registration happy paths & validation
├── agent-auth.test.ts           # API key authentication & caching
├── agent-profile.test.ts        # Profile CRUD & directory listing
├── agent-verification.test.ts   # Email verification flow
├── key-rotation.test.ts         # API key rotation & grace period
├── heartbeat.test.ts            # Heartbeat instructions & checkin
├── rate-limit-tiers.test.ts     # Tiered rate limiting
├── admin-controls.test.ts       # Admin endpoints (NEW)
├── websocket-feed.test.ts       # WebSocket connections (NEW)
└── edge-cases.test.ts           # Negative tests & edge cases (NEW)
```

## CI/CD

These tests run automatically in GitHub Actions via the `validate-dev` skill:

```bash
pnpm --filter api test:integration
```

Coverage targets:
- Guardrails: >= 95% (Sprint 3)
- Tokens: >= 90% (Sprint 4)
- Database: >= 85%
- API: >= 80%
- Global: >= 75%

## Troubleshooting

### "Database not available"
Ensure Docker containers are running:
```bash
docker compose ps
docker compose up -d
```

### "Connection refused" (Redis/PostgreSQL)
Check container health:
```bash
docker compose logs postgres
docker compose logs redis
```

### "JWT verification failed" (admin tests)
Ensure `JWT_SECRET` environment variable is set:
```bash
export JWT_SECRET="test-jwt-secret-for-admin-min-16-chars"
```

### WebSocket tests timeout
Start the WebSocket server:
```bash
pnpm --filter api dev:ws
```

## Adding New Tests

1. Create a new `*.test.ts` file in `tests/integration/`
2. Import test utilities from `helpers.ts`
3. Follow the existing pattern:
   - `beforeAll`: Setup test infrastructure
   - `afterEach`: Clean up test data
   - `afterAll`: Teardown infrastructure
4. Use `registerTestAgent()` helper for creating test agents
5. Add coverage to this README

## Related Documentation

- [Manual Test Guide](../../docs/operation/sprint2-manual-test-guide.md) - Original manual test scenarios
- [API Design](../../docs/engineering/api-design.md) - API endpoint specifications
- [Database Schema](../../docs/engineering/database-schema.md) - Data models
