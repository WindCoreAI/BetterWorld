# Cryptography Research

> Industry practices for hashing, encryption, and post-quantum readiness.
> Sources: OWASP Password Storage 2025, NIST PQC standards, Node.js crypto docs.

## Password/Key Hashing: Argon2id vs bcrypt

### OWASP 2025 Recommendation

**Primary**: Argon2id (Password Hashing Competition winner)
**Acceptable**: bcrypt (cost >= 10), scrypt
**Deprecated**: PBKDF2 (still acceptable with high iterations)

### Argon2id Configuration (OWASP recommended)

| Parameter | Option 1 | Option 2 |
|-----------|----------|----------|
| Memory (m) | 47,104 KB (46 MiB) | 19,456 KB (19 MiB) |
| Iterations (t) | 1 | 2 |
| Parallelism (p) | 1 | 1 |

### BetterWorld Assessment

| Use Case | Current | Industry Best | Action |
|----------|---------|--------------|--------|
| API key hashing | bcrypt (cost 12) | Argon2id | P2 — migrate |
| Password hashing | bcrypt (cost 12) | Argon2id | P2 — migrate |
| TOTP secrets | AES-256-GCM | AES-256-GCM | OK |
| Session tokens | SHA-256 | SHA-256 | OK |

### Migration Strategy (bcrypt -> Argon2id)

**Approach**: Transparent rehashing on login (zero downtime).

1. Add `argon2` npm package
2. Add `hashAlgorithm` column to `agents` and `humans` tables (default: 'bcrypt')
3. On successful authentication:
   - If `hashAlgorithm` is 'bcrypt', verify with bcrypt
   - Rehash with Argon2id, update hash and `hashAlgorithm` column
4. New registrations use Argon2id immediately
5. After 90 days, audit remaining bcrypt hashes (force rotation if needed)

**Library**: `argon2` (Node.js native binding, well-maintained)

```typescript
import argon2 from 'argon2';

// Hash
const hash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 47104, // 46 MiB
  timeCost: 1,
  parallelism: 1,
});

// Verify
const valid = await argon2.verify(hash, password);
```

**Priority**: P2 — bcrypt-12 is still secure, but Argon2id provides better resistance to GPU/ASIC attacks. Plan migration for next security sprint.

## Post-Quantum Cryptography (PQC)

### NIST PQC Standards (Finalized August 2024)

| Standard | Algorithm | Use Case |
|----------|-----------|----------|
| FIPS 203 | ML-KEM (Kyber) | Key Encapsulation |
| FIPS 204 | ML-DSA (Dilithium) | Digital Signatures |
| FIPS 205 | SLH-DSA (SPHINCS+) | Stateless Hash-Based Signatures |

### BetterWorld Relevance

| Crypto Use | PQ Risk | Timeline |
|-----------|---------|----------|
| TLS 1.3 | Low — Cloudflare handles TLS, already deploying PQ | No action needed |
| JWT signing (HS256) | Low — symmetric crypto, not vulnerable to Shor's | No action needed |
| Ed25519 heartbeat | Medium — asymmetric, vulnerable to quantum | P3 (5+ year horizon) |
| bcrypt/Argon2id | Low — hash functions not significantly weakened by QC | No action needed |
| AES-256-GCM | Low — Grover's algorithm halves effective key length (still 128-bit) | No action needed |

### Recommendation

**No immediate action needed**. BetterWorld's cryptographic posture is not urgently threatened by quantum computing because:
1. TLS is provider-managed (Cloudflare deploying PQ hybrids)
2. Most critical crypto is symmetric (AES, SHA-256, HMAC) — quantum-resistant
3. Ed25519 heartbeat is the only asymmetric crypto at risk, and quantum computers capable of breaking it are 5-10+ years away

**Track**: Monitor Node.js and `jose` library for PQ-ready algorithm support. When available, add ML-DSA as an option for agent heartbeat signatures.

## Key Management

### Current State

| Key | Storage | Rotation | Concern |
|-----|---------|----------|---------|
| JWT_SECRET | Fly.io secrets | Quarterly (planned) | Single key — no key versioning |
| ANTHROPIC_API_KEY | Fly.io secrets | On demand | OK |
| TOTP_ENCRYPTION_KEY | Fly.io secrets | Rarely | No rotation mechanism |
| MESSAGE_ENCRYPTION_KEY | Fly.io secrets | On demand | No rotation mechanism |
| DATABASE_URL | Fly.io secrets | Annually | OK |

### Gaps

1. **No key versioning**: JWT_SECRET rotation would invalidate all active tokens instantly
2. **No automated rotation**: All rotation is manual
3. **No HSM/KMS**: Keys stored as environment variables (acceptable for current scale)

### Recommendations

1. **JWT key versioning**: Support multiple JWT secrets (current + previous) with graceful rollover
   - Add `kid` (key ID) header to JWTs
   - Verify against matching key based on `kid`
   - Allows zero-downtime secret rotation

2. **Encryption key versioning**: For TOTP and message encryption
   - Add `encryptionKeyVersion` column alongside encrypted fields
   - Decrypt with versioned key, re-encrypt with latest on access

3. **Automated rotation workflow**: GitHub Actions workflow that:
   - Generates new key
   - Updates Fly.io secrets
   - Triggers rolling deployment
   - Verifies health after deploy

## Hashing Algorithm Comparison (2025)

| Algorithm | GPU Resistance | Memory-Hard | Side-Channel Resistant | OWASP 2025 |
|-----------|---------------|-------------|----------------------|------------|
| Argon2id | Excellent | YES (configurable) | YES (hybrid) | Primary |
| bcrypt | Good | NO | Partial | Acceptable (cost >= 10) |
| scrypt | Good | YES | NO | Acceptable |
| PBKDF2 | Poor | NO | NO | Legacy only |

## References

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [NIST Post-Quantum Cryptography Standards](https://csrc.nist.gov/projects/post-quantum-cryptography)
- [Node.js argon2 package](https://github.com/ranisalt/node-argon2)
- [Evaluating Argon2 Adoption](https://arxiv.org/html/2504.17121v1)
