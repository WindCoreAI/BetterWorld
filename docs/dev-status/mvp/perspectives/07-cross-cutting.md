# Deep Scan: Cross-Cutting Concerns

**Perspective:** Logging, configuration, error handling, feature flags, dependencies, CI/CD, TypeScript strictness
**Agent:** ab6cec2
**Date:** 2026-02-13

---

## 1. LOGGING — Structured Logging Consistency

**Status:** GOOD

- Consistent Pino setup with proper log levels
- LOG_LEVEL configurable via environment
- Development: pino-pretty; Production: structured JSON
- Logger middleware logs requestId, method, path, status, duration

**Issue Found: PII Logging in Admin Routes**
**File:** `apps/api/src/routes/admin-rate.routes.ts` (lines 183-190)

Admin email logged in plaintext. Risk: MEDIUM.

**Positive Counter-Example:** `apps/api/src/services/email.service.ts` correctly masks emails: `email.replace(/(.{2}).*(@.*)/, "$1***$2")`

---

## 2. CONFIGURATION MANAGEMENT

**Status:** EXCELLENT

- Single source of truth via `loadConfig()` with Zod validation
- Configuration cached after first load
- Proper fallbacks for development
- JWT_SECRET enforces minimum 32 characters
- API key format validation

**Feature Flags Service:**
- Three-tier fallback: Redis -> Environment Variables -> Zod Defaults
- In-memory cache with 60s TTL
- Graceful Redis degradation
- Type-safe flag names

**Minor:** Some direct `process.env` access in logger, error-handler, crypto, email service — acceptable for runtime config.

---

## 3. ERROR HANDLING PATTERNS

**Status:** EXCELLENT

- Global error handler catches all unhandled errors
- AppError type with proper status codes
- Stack traces NOT leaked in production
- Consistent error response format with requestId
- Infrastructure errors log warnings, don't crash server
- Server continues in degraded mode if Redis unavailable

---

## 4. RATE LIMITING & DEGRADATION

**Status:** EXCELLENT

- Fail-open when Redis unavailable (allow requests in degraded mode)
- Sliding window algorithm with atomic Redis pipeline
- Proper rate limit headers (X-RateLimit-Limit, Remaining, Reset)
- Tiered rate limiting for agents based on claim status

---

## 5. TYPESCRIPT STRICTNESS

**Status:** EXCELLENT

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "forceConsistentCasingInFileNames": true,
  "isolatedModules": true
}
```

- No `@ts-ignore` or `@ts-expect-error` comments found
- All packages inherit and extend base tsconfig

---

## 6. DEPENDENCY MANAGEMENT

**Issue Found:** Pino version mismatch
- `apps/api/package.json`: `"pino": "^9.6.0"`
- `packages/guardrails/package.json`: `"pino": "^8.17.2"`

Risk: LOW-MEDIUM — Different major versions in same monorepo.

**All Other Dependencies:**
- No duplicate critical dependencies
- Dev dependencies properly separated
- Workspace dependencies use `workspace:*`
- `@anthropic-ai/sdk@^0.30.0` consistent across packages
- `drizzle-orm@^0.38.4` consistent
- `zod@^3.x` consistent

---

## 7. CI/CD PIPELINE

**Status:** EXCELLENT

- Lint (ESLint) + Type checking (tsc) + Unit tests with coverage
- Integration tests (Docker Postgres + Redis)
- Guardrail Regression Suite (200+ adversarial cases)
- Security audit (`pnpm audit --prod --audit-level=high`)
- Build verification

**Note:** Deployment workflow is intentionally disabled (manual trigger only) for current development phase.

---

## 8. SECURITY HEADERS

**Status:** EXCELLENT — OWASP-aligned

- `Strict-Transport-Security: max-age=63072000` (2 years, includeSubDomains, preload)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 0` (modern approach)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy: default-src 'none'`

---

## 9. AUTHENTICATION & SECRETS

**API Key Authentication:** EXCELLENT
- SHA-256 hashing for cache lookups
- bcrypt comparison for verification
- Redis caching with 5-minute TTL
- Prefix-based lookup for key rotation
- Deprecated key header notification

**Message Encryption:** EXCELLENT
- AES-256-GCM with proper IV length
- Authenticated encryption (128-bit auth tag)
- Key rotation support (current + previous)
- Version prefixing for decryption fallback

**Human Authentication:** GOOD
- JWT verification with jose library
- Account deactivation enforcement
- Non-sensitive logging on auth failure

---

## SUMMARY TABLE

| Concern | Status | Risk | Notes |
|---------|--------|------|-------|
| Logging | GOOD | MEDIUM | Email PII in admin-rate.routes.ts:185 |
| Configuration | EXCELLENT | LOW | Centralized Zod validation |
| Error Handling | EXCELLENT | LOW | Centralized handler, no stack trace leaks |
| Feature Flags | EXCELLENT | LOW | Robust Redis/env/default fallback |
| Dependencies | MINOR | LOW-MEDIUM | Pino v8 vs v9 mismatch |
| CI/CD Pipeline | EXCELLENT | LOW | Comprehensive checks |
| TypeScript | EXCELLENT | NONE | Strict mode, no bypasses |
| Security Headers | EXCELLENT | NONE | OWASP-aligned |
| Auth | EXCELLENT | LOW | bcrypt, Ed25519, AES-256-GCM |
| Rate Limiting | EXCELLENT | LOW | Fail-open degradation |

---

## Recommendations

1. **[URGENT]** Remove email PII from logs in admin-rate.routes.ts line 185
2. **[HIGH]** Align Pino versions: guardrails -> `"pino": "^9.6.0"`
3. **[MEDIUM]** Add request body logging redaction for sensitive fields
4. **[MEDIUM]** Document process.env access patterns outside Zod validation
5. **[LOW]** Verify `noImplicitAny` at monorepo level
