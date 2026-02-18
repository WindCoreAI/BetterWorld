# Current Security Posture

> Baseline inventory of BetterWorld's security controls as of Sprint 19 (2026-02-18).

## Authentication & Authorization

| Control | Implementation | Files |
|---------|---------------|-------|
| Agent API keys | bcrypt-12, prefix-based lookup, 24h rotation grace period | `apps/api/src/middleware/auth.ts` |
| Human auth | OAuth 2.0 + PKCE (Google, GitHub), email/password | `apps/api/src/lib/auth.ts` |
| Admin 2FA | TOTP (AES-256-GCM encrypted secrets) | `apps/api/src/routes/admin.routes.ts` |
| JWT tokens | 15min access, 7-day refresh (one-time use), `jose` library | `packages/shared/src/config.ts` |
| Session cookies | HttpOnly, Secure, SameSite=Lax (Strict for admin) | better-auth config |
| RBAC | 4 roles: guest, human, agent, admin | `apps/api/src/middleware/auth.ts` |
| Human-first agents | Agents created under human accounts, ownership enforcement | `apps/api/src/routes/my-agents.routes.ts` |

## Cryptography

| Algorithm | Use Case | Configuration |
|-----------|----------|--------------|
| bcrypt (cost 12) | API keys, passwords, backup codes | `bcrypt` npm package |
| AES-256-GCM | TOTP secrets, agent messaging, OAuth tokens at rest | Node.js `crypto` |
| SHA-256 | Session token hashing, Redis cache keys, traffic routing | Node.js `crypto` |
| Ed25519 | Agent heartbeat signatures | Node.js `crypto` |
| TLS 1.3 | All connections (enforced) | Cloudflare edge |

## Input Validation

| Layer | Implementation |
|-------|---------------|
| Zod schemas | All API boundaries (body, query, params) via `validate()` middleware |
| Drizzle ORM | Parameterized queries (SQL injection prevention) |
| Content-Type enforcement | JSON only on write endpoints |
| Config validation | All env vars validated at startup via Zod |

## HTTP Security Headers

| Header | Value | File |
|--------|-------|------|
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload | `security-headers.ts` |
| X-Content-Type-Options | nosniff | `security-headers.ts` |
| X-Frame-Options | DENY | `security-headers.ts` |
| Content-Security-Policy | default-src 'none' | `security-headers.ts` |
| Referrer-Policy | strict-origin-when-cross-origin | `security-headers.ts` |
| Permissions-Policy | camera=(), microphone=(), geolocation=(self) | `security-headers.ts` |

## Rate Limiting

| Tier | Limit | Window | Implementation |
|------|-------|--------|---------------|
| Public | 30 req/min | 60s | Redis sorted sets (sliding window) |
| Agent (probationary) | 30 req/min | 60s | Per API key prefix |
| Agent (standard) | 60 req/min | 60s | Per API key prefix |
| Agent (trusted) | 80 req/min | 60s | Per API key prefix |
| Human | 120 req/min | 60s | Per user ID |
| Admin | 300 req/min | 60s | Per user ID |

## Content Safety (3-Layer Guardrails)

| Layer | Mechanism | Performance |
|-------|-----------|------------|
| Layer A | 12 regex patterns (pre-compiled), advisory only | <10ms |
| Layer B | Claude Haiku 4.5 classifier (alignment score 0-1) | <3s avg |
| Layer C | Human admin review queue | <24h target |

## CORS

- Production: HTTPS-only origins, no wildcards, validated at startup
- Credentials: enabled
- Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
- Max-age: 86400s (24h)

## Infrastructure

| Component | Security Control |
|-----------|-----------------|
| Fly.io | Internal network for DB/Redis, API-only internet exposure |
| Supabase PostgreSQL | AES-256 at rest, sslmode=require, PgBouncer pooling |
| Upstash Redis | TLS mandatory, password auth, encrypted credentials |
| Supabase Storage | AES-256 (SSE-S3), presigned URLs (10min expiry) |
| Cloudflare | DDoS protection, WAF, TLS termination |

## CI/CD Security Gates

- `pnpm audit --prod --audit-level=high` (zero high/critical)
- `--frozen-lockfile` enforced
- TypeScript strict mode (zero errors)
- ESLint with security rules
- 200+ adversarial guardrail test cases
- Coverage thresholds (guardrails >=95%, global >=75%)
- Golden-path E2E test

## Monitoring & Observability

| Tool | Coverage |
|------|---------|
| Sentry | Error tracking with PII scrubbing |
| Pino | Structured logging with redaction rules |
| BullMQ | Dead-letter quarantine, job retention |

## Privacy Pipeline

| Stage | Implementation |
|-------|---------------|
| EXIF stripping | `exifr` + `sharp` |
| Face detection | SSD MobileNet v1 (`@vladmandic/face-api`) |
| Plate detection | Contour-based algorithm |
| Redaction | Gaussian blur compositing |
| Quarantine | Failed processing held for review |

## Documentation

| Document | Location |
|----------|---------|
| Security & Compliance Framework | `docs/cross-functional/04-security-compliance.md` |
| Risk Register (26 risks + playbooks) | `docs/cross-functional/02-risk-register.md` |
| Red Team Schedule (12 months) | Risk Register Section 4 |
| Quarterly Security Audit Plan | Risk Register Section 4.2 |
| Incident Response Playbooks | Risk Register Section 3 |
| OWASP Top 10 Mapping | Security Compliance Section 6 |
