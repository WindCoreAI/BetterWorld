# Infrastructure Security Research

> Industry practices for container, database, cache, and network security.
> Sources: CIS benchmarks, Supabase security docs, Redis security docs, NIST.

## Container / Docker Security

### Current State
- Base image: `node:22-slim`
- Multi-stage build (builder + runtime)
- `NODE_ENV=production`
- No explicit non-root USER directive
- No read-only filesystem
- No image scanning in CI

### Industry Best Practices (2025)

| Practice | Status | Priority |
|----------|--------|----------|
| Non-root USER | PARTIAL (node uid 1000 default) | P1 — add explicit `USER node` |
| Read-only root filesystem | NO | P2 — add `--read-only` flag |
| Distroless base image | NO | P2 — consider `gcr.io/distroless/nodejs22-debian12` |
| Image scanning (Trivy/Snyk) | NO | P1 — add to CI pipeline |
| No shell in production | NO | P3 — distroless removes shell |
| `.dockerignore` | VERIFY | P1 — ensure .env, .git, node_modules excluded |
| Health check | VERIFY | P1 — add HEALTHCHECK instruction |
| No secrets in build args | VERIFY | P0 — audit Dockerfile for ARG secrets |
| Pinned base image digest | NO | P1 — pin `node:22-slim@sha256:abc...` |
| Multi-arch builds | NO | P3 — not urgent for Fly.io single-arch |

### Recommended Dockerfile Improvements

```dockerfile
# Pin base image by digest
FROM node:22-slim@sha256:<digest> AS builder
# ... build steps ...

FROM node:22-slim@sha256:<digest> AS runtime
# Explicit non-root user
USER node
# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1
```

### Image Scanning

Add to CI pipeline:
```yaml
- name: Scan image with Trivy
  uses: aquasecurity/trivy-action@<sha>
  with:
    image-ref: betterworld-api:latest
    format: sarif
    severity: HIGH,CRITICAL
    exit-code: 1
```

## PostgreSQL Security (Supabase)

### Current State
- Provider-managed (Supabase)
- AES-256 encryption at rest
- `sslmode=require` enforced
- PgBouncer connection pooling
- App user has SELECT/INSERT/UPDATE/DELETE only
- 30s query timeout

### Gaps

| Practice | Status | Priority |
|----------|--------|----------|
| Row-Level Security (RLS) | NOT USED (Drizzle handles auth) | P2 |
| Column-Level Encryption | Partial (TOTP secrets only) | P2 |
| Connection string rotation | Manual | P2 — automate |
| Audit logging (pgAudit) | NO | P1 |
| Prepared statements only | YES (via Drizzle) | OK |
| Connection limit per user | Managed by PgBouncer | OK |
| Backup encryption verification | Provider-managed | P3 |

### Row-Level Security (RLS)

**Current approach**: Authorization is enforced at the application layer (Drizzle queries filtered by user context).

**Industry recommendation**: Defense-in-depth — add RLS policies as a second layer even when using application-level auth.

**Assessment**: RLS adds significant complexity with Drizzle ORM. The application-layer approach is acceptable IF:
1. All queries go through service methods (not raw SQL)
2. Service methods always filter by authenticated user
3. Integration tests verify cross-user isolation

**Recommendation**: Keep application-layer auth as primary, but add RLS policies on the most sensitive tables as a defense-in-depth measure:
- `token_transactions` (financial data)
- `agents` (credential data)
- `humans` (PII)

### PostgreSQL Audit Logging

**Recommendation**: Enable `pgAudit` extension on Supabase for:
- DDL statements (all)
- DML on sensitive tables (token_transactions, agents, humans)
- Login/logout events
- Role changes

## Redis Security (Upstash)

### Current State
- TLS mandatory (Upstash enforces)
- Password authentication (provider-generated)
- Used for: rate limiting, cache, feature flags, session data

### Gaps

| Practice | Status | Priority |
|----------|--------|----------|
| TLS encryption in transit | YES (Upstash mandatory) | OK |
| Password authentication | YES | OK |
| ACL (command restrictions) | NO | P2 |
| Key namespace isolation | Partial (prefix-based) | P2 |
| Sensitive data TTL | Partial | P1 |
| No KEYS/FLUSHALL in production | VERIFY | P1 |
| Connection pooling | Via ioredis | OK |

### CVE-2025-49844 — Critical Redis RCE

A critical Redis vulnerability exposing ~75% of cloud systems to remote code execution, data theft, and full system compromise. Upstash manages patching for their hosted instances, but this underscores the importance of defense-in-depth (ACLs, TLS, least privilege) even with managed services.

**Reference**: [eSecurity Planet Analysis](https://www.esecurityplanet.com/news/redis-vulnerability-cloud-compromise/)

### Recommendations

1. **Redis ACL**: Configure Upstash ACL to restrict app user to only the commands actually used (no FLUSHALL, KEYS, CONFIG, DEBUG). Use separate read-only tokens where writes are not needed.
2. **Key namespacing**: Use consistent prefixes (`bw:cache:`, `bw:rate:`, `bw:session:`) for all keys to enable ACL key-pattern restrictions
3. **Sensitive data TTL**: Ensure all cached tokens, sessions, and PII have explicit TTL (no infinite-lived sensitive data)
4. **Disable dangerous commands**: Block KEYS (use SCAN instead), FLUSHALL, FLUSHDB, CONFIG SET, DEBUG, SHUTDOWN
5. **Never store plaintext secrets in Redis**: Session tokens should be hashed (SHA-256 — already implemented). Never store API keys or encryption keys.

## Zero Trust Architecture

### Current State
- Network perimeter: Cloudflare + Fly.io
- Internal services: DB and Redis on internal network
- Workers: No direct internet access
- Admin: IP-restricted (planned)

### Industry Standards (2025)

| Principle | Status | Gap? |
|-----------|--------|------|
| Verify explicitly | Partial — auth on all endpoints | Minor |
| Least privilege access | Partial — RBAC but broad roles | YES |
| Assume breach | Partial — incident playbooks exist | Minor |
| mTLS between services | NO | P3 (low priority for Fly.io) |
| Service mesh | NO | P3 (overkill for current scale) |
| Identity-based access | Partial | P2 |
| Microsegmentation | NO | P3 |

### Recommendations for Current Scale

1. **Internal service auth**: Add authentication between API server and workers (shared secret or JWT)
2. **Worker isolation**: Ensure workers cannot access admin endpoints
3. **Network policies**: Document and enforce which services can communicate with which

## Fly.io Specific Security

| Control | Status | Action |
|---------|--------|--------|
| Private networking | YES | Verify DB/Redis only on internal IPs |
| Secrets management | YES (fly secrets) | Audit for stale secrets |
| Deployment tokens | VERIFY | Ensure minimal permissions |
| Auto-scaling limits | VERIFY | Set max instances to prevent cost attacks |
| Region restrictions | VERIFY | Restrict to needed regions only |

## WebSocket Security

### Critical: CVE-2026-25253 (CSWSH in OpenClaw-compatible systems)

A critical vulnerability (CVSS 8.8) enabling one-click RCE through Cross-Site WebSocket Hijacking in OpenClaw-compatible platforms. **Directly relevant to BetterWorld**.

### Current State
- Human WebSocket at `/ws/human` for real-time notifications
- Agent WebSocket event feed
- Token-based auth (correct approach — eliminates cookie-based CSWSH)

### Gaps

| Practice | Status | Priority |
|----------|--------|----------|
| Origin header validation | NOT VERIFIED | P1 |
| Per-connection rate limiting | NOT VERIFIED | P1 |
| Message schema validation | NOT VERIFIED | P1 |
| Connection limits per user | NOT VERIFIED | P2 |
| Heartbeat/ping-pong | NOT VERIFIED | P2 |
| Message size limits | NOT VERIFIED | P2 |

### Recommendations

1. **Origin validation**: Strictly validate `Origin` header in the WebSocket handshake against CORS whitelist. Reject connections from unknown origins.
2. **Token auth (not cookies)**: Continue using `bw_human_access_token` approach — this is the correct pattern that eliminates CSWSH. Never fall back to cookie-based WebSocket auth.
3. **Message validation**: Apply Zod schemas to all incoming WebSocket messages
4. **Rate limiting**: 10 msg/s for regular users, 50 msg/s for admins. Disconnect on sustained violation.
5. **Connection limits**: Max 5 concurrent WebSocket connections per user
6. **Message size**: Enforce 64KB max message size

### References
- [Include Security - CSWSH Exploitation 2025](https://blog.includesecurity.com/2025/04/cross-site-websocket-hijacking-exploitation-in-2025/)
- [OWASP WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)

## References

- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/database/hardening-data-api)
- [Upstash Redis Security](https://upstash.com/docs/redis/features/security)
- [Redis ACL Guide](https://redis.io/docs/latest/operate/oss_and_stack/management/security/acl/)
- [NIST Zero Trust Architecture SP 800-207](https://csrc.nist.gov/publications/detail/sp/800-207/final)
