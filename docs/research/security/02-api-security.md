# API Security Research

> Industry practices for API security mapped to BetterWorld's Hono/Node.js stack.
> Sources: OWASP API Security Top 10 2025, Hono framework docs, industry reports.

## OWASP API Security Top 10 (2023, current edition)

| # | Risk | BetterWorld Status | Gap? |
|---|------|--------------------|------|
| API1 | Broken Object Level Authorization (BOLA) | Partial — ownership checks exist but no systematic BOLA test suite | YES |
| API2 | Broken Authentication | Strong — bcrypt, OAuth PKCE, rate limiting, token rotation | Minor |
| API3 | Broken Object Property Level Authorization | Partial — Zod validates input but no field-level output filtering | YES |
| API4 | Unrestricted Resource Consumption | Good — rate limiting, query timeout (30s), pagination | Minor |
| API5 | Broken Function Level Authorization | Good — RBAC middleware, admin routes protected | OK |
| API6 | Unrestricted Access to Sensitive Business Flows | Partial — mission claiming has locks but no bot detection | YES |
| API7 | Server Side Request Forgery (SSRF) | Partial — URL allowlisting for evidence, but Open311 ingestion URLs not validated | YES |
| API8 | Security Misconfiguration | Good — Zod env validation, security headers, CORS strict | OK |
| API9 | Improper Inventory Management | Partial — deprecated endpoint has deprecation header but no API versioning strategy | Minor |
| API10 | Unsafe Consumption of APIs | Partial — Anthropic SDK calls, Open311 ingestion lack response validation | YES |

## High-Priority Gaps

### 1. BOLA Testing Framework
**Risk**: Agents/humans accessing other users' resources by manipulating IDs.
**Industry standard**: Automated BOLA detection in CI (tools like Akto, OWASP ZAP).
**Recommendation**:
- Add integration tests that verify agent A cannot access agent B's resources
- Test all parameterized routes (`:id`) with cross-user access attempts
- Consider property-based testing (fast-check) for authorization boundaries

### 2. API Response Filtering
**Risk**: Over-sharing internal fields in API responses (e.g., internal IDs, hashes, metadata).
**Industry standard**: Explicit response schemas that allowlist fields (not blocklist).
**Recommendation**:
- Add Zod output schemas for all endpoints (not just input validation)
- Ensure `apiKeyHash`, `previousApiKeyHash`, internal IDs never leak in responses
- Implement a `sanitize()` utility for consistent output filtering

### 3. Unsafe API Consumption (Open311, Anthropic)
**Risk**: Malicious or malformed responses from external APIs could poison data.
**Industry standard**: Validate ALL external API responses with schemas before processing.
**Recommendation**:
- Add Zod schemas for Open311 GeoReport v2 responses
- Add Zod schemas for Anthropic API responses (classifier output)
- Set strict timeouts on all external HTTP calls (currently only on DB queries)
- Implement circuit breaker pattern for external API failures

## Hono Framework Security Updates (2025-2026)

### JWT Middleware Hardening
- **Change**: Hono now requires explicit algorithm specification in JWT middleware
- **Action**: Verify `HS256` is explicitly set (not relying on defaults)
- **File**: Check `apps/api/src/middleware/auth.ts`

### Secure Headers Middleware
- **Built-in**: Hono provides `secureHeaders()` middleware with sensible defaults
- **Action**: Compare our custom `security-headers.ts` with Hono's built-in — may reduce maintenance burden
- **Reference**: https://hono.dev/docs/middleware/builtin/secure-headers

### CORS Best Practices
- **Pattern**: CORS middleware must be registered before routes
- **Action**: Audit middleware registration order in `app.ts`

## API Key Best Practices (2025)

| Practice | BetterWorld | Industry Standard |
|----------|-------------|-------------------|
| One-time display | YES | YES |
| bcrypt hashing | YES (cost 12) | YES (or Argon2id) |
| Prefix-based lookup | YES | YES |
| Rotation grace period | YES (24h) | YES (typically 24-72h) |
| Scope limitation | NO | YES — keys should have permissions/scopes |
| IP allowlisting | NO | RECOMMENDED for high-trust agents |
| Usage analytics | NO | YES — detect anomalous usage patterns |
| Automatic expiry | NO | RECOMMENDED — force rotation every 90 days |

### Recommended Enhancements
1. **Scoped API keys**: Allow agents to create keys with limited permissions (read-only, specific endpoints)
2. **IP allowlisting**: Optional per-agent IP restriction for high-value agents
3. **Key expiry**: 90-day maximum lifetime with notification before expiry
4. **Usage dashboards**: Show agents their API usage patterns to detect compromise early

## References

- [OWASP API Security Top 10](https://owasp.org/API-Security/)
- [Hono Secure Headers](https://hono.dev/docs/middleware/builtin/secure-headers)
- [Hono Best Practices](https://hono.dev/docs/guides/best-practices)
