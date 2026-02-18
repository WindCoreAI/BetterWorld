# Authentication & Identity Security Research

> Industry practices for auth, identity, and session management.
> Sources: OAuth 2.1 draft, FIDO Alliance, OWASP Auth Cheat Sheet 2025.

## OAuth 2.1 (Draft Standard, Expected 2026 Finalization)

OAuth 2.1 consolidates OAuth 2.0 + security BCP into a single specification. Key changes:

| Change | BetterWorld Status | Action Needed? |
|--------|-------------------|---------------|
| PKCE required for all flows | YES (already implemented) | None |
| Implicit flow removed | N/A (not used) | None |
| Resource Owner Password removed | N/A (not used) | None |
| Refresh token rotation required | YES (one-time use refresh tokens) | None |
| Exact redirect URI matching | VERIFY | Audit redirect URI validation |
| Bearer token in body deprecated | VERIFY | Ensure tokens only in Authorization header |

### BetterWorld OAuth Assessment

**Current**: Using `better-auth` library with Google + GitHub providers, OAuth 2.0 + PKCE.

**Gaps**:
1. **Redirect URI validation**: Verify exact match (no pattern matching, no wildcard subdomains)
2. **State parameter**: Verify CSRF state cookie is bound to session and has short TTL
3. **Token storage**: Verify tokens are stored server-side only (not in localStorage)

## Passkeys / WebAuthn (FIDO2)

### Industry Trend
Passkeys are becoming the industry standard for phishing-resistant authentication. Major platforms (Google, Apple, Microsoft) now default to passkey enrollment.

### Relevance to BetterWorld

| Aspect | Assessment |
|--------|-----------|
| Human auth | HIGH value — passkeys eliminate credential phishing for human users |
| Agent auth | N/A — agents use API keys |
| Admin auth | HIGH value — replace TOTP 2FA with phishing-resistant WebAuthn |
| Implementation effort | Medium — `@simplewebauthn/server` + `@simplewebauthn/browser` |
| Browser support | 95%+ (all modern browsers) |

### Recommended Implementation

**Priority**: P2 (enhance existing auth, not replace)

1. **Phase 1**: Add passkey support as optional 2FA for human accounts
2. **Phase 2**: Add passkey support for admin accounts (replace TOTP)
3. **Phase 3**: Allow passkey-only login (no password)

**Libraries**:
- `@simplewebauthn/server` (Node.js)
- `@simplewebauthn/browser` (frontend)
- Store credentials in a new `webauthn_credentials` table

## Session Management (2025 Best Practices)

| Practice | BetterWorld Status | Gap? |
|----------|-------------------|------|
| Short-lived access tokens (15min) | YES | None |
| One-time refresh tokens | YES | None |
| HttpOnly + Secure + SameSite cookies | YES | None |
| Session token hashing (SHA-256) | YES | None |
| Concurrent session limiting | NO | YES — no limit on simultaneous sessions |
| Session revocation on password change | VERIFY | Check if all sessions invalidated |
| Idle timeout | NO | YES — no idle session expiry |
| Absolute timeout | Partial (30-day cookie max-age) | Acceptable |
| Device fingerprinting | NO | RECOMMENDED for anomaly detection |

### Recommended Enhancements

1. **Concurrent session limit**: Max 5 active sessions per human, with ability to view and revoke
2. **Idle timeout**: 30-minute idle timeout for admin sessions, 2-hour for regular humans
3. **Session activity tracking**: Track last-active timestamp, IP, user-agent per session
4. **Anomalous session detection**: Alert on login from new country/device

## Token Security Hardening

### JWT Best Practices (2025)

| Practice | Status | Action |
|----------|--------|--------|
| Algorithm pinning (HS256) | VERIFY | Ensure `algorithms: ['HS256']` in verification |
| No sensitive data in payload | VERIFY | Audit JWT payload contents |
| Short expiry (15min) | YES | None |
| `jti` claim for replay prevention | NO | RECOMMENDED for high-value operations |
| `aud` claim validation | NO | RECOMMENDED — verify intended audience |
| `iss` claim validation | NO | RECOMMENDED — verify token issuer |

### Recommendations

1. **Add `aud` and `iss` claims**: Prevent token reuse across services
2. **Add `jti` for admin tokens**: Prevent replay attacks on admin operations
3. **Token binding**: Consider DPoP (Demonstrating Proof of Possession) for high-security flows

## Credential Stuffing Protection

**Current**: Rate limiting on login endpoints.

**Gaps**:
1. **No breach correlation**: Not checking passwords against known breach databases
2. **No progressive delays**: Same rate limit for all failed attempts
3. **No CAPTCHA integration**: No challenge on suspicious login patterns

**Recommendations**:
1. **HaveIBeenPwned integration**: Check passwords on registration/change against breach DB (k-anonymity API — privacy-safe)
2. **Progressive delays**: Exponential backoff after 3 failed attempts per IP
3. **Account lockout**: Temporary lock after 10 failed attempts, require email verification to unlock

## References

- [OAuth 2.1 Draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-11)
- [FIDO Alliance - Passkeys](https://fidoalliance.org/passkeys/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [SimpleWebAuthn](https://simplewebauthn.dev/)
