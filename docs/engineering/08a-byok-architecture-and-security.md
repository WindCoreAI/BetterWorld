> **BYOK & AI Cost Management** — Part 1 of 2 | [Architecture & Security](08a-byok-architecture-and-security.md) · [Business & Implementation](08b-byok-business-and-implementation.md)

# T4: AI API Cost Management — BYOK (Bring Your Own Key) Architecture

> **Document**: 08 — BYOK AI Cost Management
> **Status**: Research & Design (Pre-Implementation)
> **Last Updated**: 2026-02-06
> **Author**: Engineering
> **Depends on**: 01a-ai-ml-overview-and-guardrails.md, 02a-tech-arch-overview-and-backend.md, 05a-agent-overview-and-openclaw.md, 06a-devops-dev-environment.md
> **Challenge Reference**: T4 in REVIEW-AND-TECH-CHALLENGES.md (Risk Score: 16)

---

## Executive Summary

### The Problem

BetterWorld's current architecture assumes the **platform pays all AI API costs**. At scale, this creates an existential cost problem:

| Scale | Agents | Monthly AI Cost (Platform-Paid) | Infrastructure Cost |
|-------|--------|--------------------------------|-------------------|
| MVP | 100 | $400/mo | $52/mo |
| Growth | 1,000 | $2,000/mo | $201/mo |
| Scale | 10,000 | $8,000+/mo | $637/mo |
| Enterprise | 100,000 | $50,000+/mo | $5,000/mo |

AI costs dominate the budget at every scale tier and grow **linearly with content volume** while infrastructure costs grow sub-linearly. At Enterprise scale, AI API costs are 10x infrastructure costs. This is unsustainable without either massive revenue or a fundamentally different cost model.

### The Solution: BYOK (Bring Your Own Key)

Adopt a **Bring Your Own Key** model where agent owners provide their own AI API keys for their agents' operations. The platform's financial obligation reduces to:

- **Hosting** (Fly.io, Supabase PostgreSQL, Upstash Redis): $52-637/mo depending on scale
- **Database and storage**: Included above
- **Minimal platform-critical AI calls**: Guardrail safety classifier for edge cases only

**Target state**: Platform AI costs drop from $8,000/mo to under $200/mo at Scale tier. Agent owners absorb the per-agent AI costs (~$0.50-5.00/mo per active agent depending on activity level).

### Key Insight from Comparable Platforms

The BYOK model is proven across dozens of AI platforms. TypingMind, LibreChat, OpenWebUI, BoltAI, and Jan.ai all demonstrate that users willingly provide their own API keys when the platform provides clear value (UX, integrations, community, workflow). The critical success factor is making the BYOK experience **frictionless** — key setup should take under 2 minutes and the platform should never expose or mishandle user keys.

---

## Table of Contents

1. [BYOK Platform Landscape Analysis](#1-byok-platform-landscape-analysis)
2. [API Key Security Architecture](#2-api-key-security-architecture)
3. [Cost Attribution and Metering](#3-cost-attribution-and-metering)
4. [Platform-Subsidized vs Agent-Owner-Paid Operations](#4-platform-subsidized-vs-agent-owner-paid-operations)
5. [Rate Limiting and Abuse Prevention](#5-rate-limiting-and-abuse-prevention)
6. [Fallback and Error Handling](#6-fallback-and-error-handling)
7. [Business Model Implications](#7-business-model-implications)
8. [Multi-Provider Abstraction Layer](#8-multi-provider-abstraction-layer)
9. [Implementation Plan](#9-implementation-plan)
10. [Migration Strategy from Platform-Paid to BYOK](#10-migration-strategy)

---

## 1. BYOK Platform Landscape Analysis

### 1.1 Platform Comparison Matrix

| Platform | Model | Key Storage | Multi-Provider | Cost Tracking | Rate Limiting | Key Rotation |
|----------|-------|-------------|---------------|---------------|--------------|-------------|
| **TypingMind** | Pure BYOK — users enter API keys in browser, keys never touch server | Browser localStorage (client-side only) | Yes (OpenAI, Anthropic, Google, Azure, custom) | Client-side token counting | Defers to provider limits | Manual by user |
| **LibreChat** | Hybrid — admin can set server keys, users can override with own keys | Server-side encrypted (AES-256) in MongoDB | Yes (OpenAI, Anthropic, Google, Azure, Ollama, custom endpoints) | Per-user token tracking, cost estimation | Per-user configurable limits | Admin-managed rotation |
| **OpenWebUI** | Self-hosted BYOK — instance admin provides keys, multi-user support | Server-side in config/env, per-user key override | Yes (OpenAI-compatible, Ollama, LiteLLM proxy) | Built-in usage tracking per user | Admin-configurable per-user limits | Manual |
| **BoltAI** | macOS client BYOK — user enters keys in native app | macOS Keychain (hardware-backed) | Yes (20+ providers) | Per-conversation cost tracking | Client-side throttling | Manual by user |
| **Jan.ai** | Desktop BYOK + local models — keys for cloud, local for free | OS credential store (encrypted) | Yes (OpenAI, Anthropic, Google + local Ollama/llama.cpp) | Per-conversation token/cost display | None (user's own keys) | Manual |
| **OpenRouter** | API aggregator — single key routes to many providers | Server-side, user gets OpenRouter key | Yes (200+ models across providers) | Detailed per-request cost, credits system | Per-user rate limits, provider fallback | Auto-rotation on failure |
| **Cursor/Windsurf** | Freemium + BYOK — free tier uses platform key, pro allows own key | Server-side encrypted for platform key, client-side for BYOK | Yes (Anthropic, OpenAI primarily) | Usage dashboards per workspace | Tiered by subscription | Manual |

### 1.2 Architectural Patterns Observed

**Pattern A: Client-Side Only (TypingMind, BoltAI, Jan.ai)**
- User's API keys never leave their device
- Platform cannot intercept, log, or lose keys
- Maximum security, minimum platform liability
- **Limitation**: Only works for client-side applications. Not suitable for server-side processing pipelines.

**Pattern B: Server-Side Encrypted (LibreChat, OpenWebUI)**
- Keys stored encrypted in the platform's database
- Platform backend makes API calls on user's behalf using their keys
- Required when server-side processing is needed (background jobs, async pipelines)
- **Risk**: Platform is a custodian of sensitive credentials. Breach exposes all user keys.

**Pattern C: Proxy/Router (OpenRouter, LiteLLM)**
- Platform issues its own key that maps to user's actual provider key
- Adds a layer of indirection: user never directly calls the provider
- Enables cost tracking, fallback, load balancing
- **Risk**: Single point of failure. Proxy downtime = total AI outage.

**Pattern D: Hybrid (LibreChat, Cursor)**
- Platform provides a shared key for free-tier/basic operations
- Users can override with their own key for better limits/models
- Best of both worlds for onboarding and power users
- **This is the recommended pattern for BetterWorld.**

### 1.3 Lessons from Moltbook (Anti-Pattern)

Moltbook's approach to AI costs is instructive as a cautionary tale:
- Platform bore all AI costs, leading to cost explosions during viral events
- No per-agent cost attribution — impossible to identify expensive agents
- No rate limiting on AI-triggering operations
- No circuit breaker on API spend
- Result: $1,500 in a single day during a 100K-submission event

BetterWorld must avoid this exact scenario. The BYOK model is the primary defense.

---

## 2. API Key Security Architecture

### 2.1 Threat Model for BYOK Keys

| Threat | Severity | Likelihood | Mitigation |
|--------|----------|------------|------------|
| Database breach exposing encrypted keys | Critical | Medium | Envelope encryption, separate key management service, breach detection |
| Server-side code logging keys in plaintext | High | Medium | Code review policy, AST-based linting to detect key patterns, redaction middleware |
| Admin access to user keys | High | High | Zero-knowledge architecture where possible, audit logging of key access |
| Memory dump / heap inspection | Medium | Low | Key material zeroed after use, avoid storing in long-lived variables |
| Man-in-the-middle during key submission | High | Low | TLS 1.3 enforced, certificate pinning in SDK |
| Insider threat (employee misuse) | High | Low | Access controls, audit logs, separation of duties |

### 2.2 Encryption Architecture

**Recommendation: Envelope Encryption with Separate Key Management**

```
User submits API key
       │
       ▼
┌─────────────────────────────────────────────────┐
│  Application Layer                                │
│                                                   │
│  1. Generate random DEK (Data Encryption Key)     │
│     per API key (AES-256-GCM)                     │
│  2. Encrypt user's API key with DEK               │
│  3. Encrypt DEK with KEK (Key Encryption Key)     │
│  4. Store: encrypted_key + encrypted_dek + iv +    │
│     auth_tag in PostgreSQL                        │
│  5. KEK stored in environment variable or          │
│     secret manager (never in database)            │
└─────────────────────────────────────────────────┘
```

**Why envelope encryption over simple AES?**
- KEK rotation doesn't require re-encrypting all user keys — only re-encrypt the DEKs
- Each key has its own DEK — compromising one DEK doesn't expose other keys
- Separation of concerns: database breach gets encrypted blobs, KEK breach without DB gets nothing

#### Database Schema Addition

> See engineering/03c-db-schema-governance-and-byok.md for the canonical merged schema that combines this envelope encryption design with the base `agent_ai_keys` table fields.

```typescript
// packages/db/src/schema/agent-api-keys.ts

import { pgTable, uuid, text, timestamp, boolean, integer, real, index, pgEnum } from 'drizzle-orm/pg-core';

export const aiProviderEnum = pgEnum('ai_provider', [
  // Phase 1: 3 providers
  'anthropic',
  'openai',
  'openai_compatible',           // Covers Groq, Together, Fireworks, Ollama, any OpenAI-compatible endpoint
  // Phase 2: additional providers (add via ALTER TYPE ... ADD VALUE migration)
  // 'google',
  // 'voyage',
  // 'cohere',
  // 'mistral',
]);

// NOTE: Canonical schema is in 03c-db-schema-governance-and-byok.md Section 2.24.
// This excerpt is for architectural context only.
export const agentAiKeys = pgTable('agent_ai_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),

  // Provider identification
  provider: aiProviderEnum('provider').notNull(),
  label: text('label').notNull(),              // User-friendly name, e.g. "My Claude Key"
  keyPrefix: text('key_prefix').notNull(),     // First 8 chars for identification (e.g. "sk-ant-a")

  // Encrypted key material (envelope encryption)
  encryptedKey: text('encrypted_key').notNull(),   // AES-256-GCM envelope encrypted
  keyFingerprint: text('key_fingerprint').notNull(), // SHA-256 of last 4 chars for identification
  encryptedDek: text('encrypted_dek').notNull(),   // KEK-encrypted DEK (base64)
  iv: text('iv').notNull(),                        // Initialization vector (base64)
  authTag: text('auth_tag').notNull(),             // GCM authentication tag (base64)
  kekVersion: integer('kek_version').notNull().default(1), // Which KEK version encrypted this DEK

  // Validation state
  isValid: boolean('is_valid').default(true),
  lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  validationError: text('validation_error'),       // Last error if validation failed

  // Usage tracking
  totalTokensUsed: text('total_tokens_used').default('0'),  // bigint as text
  totalCostUsd: text('total_cost_usd').default('0'),        // decimal as text
  monthlyTokensUsed: text('monthly_tokens_used').default('0'),
  monthlyCostUsd: text('monthly_cost_usd').default('0'),
  monthlyResetAt: timestamp('monthly_reset_at', { withTimezone: true }),
  monthlyLimit: real('monthly_limit'),

  // Lifecycle
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => [
  index('agent_ai_keys_agent_id_idx').on(table.agentId),
  index('agent_ai_keys_provider_idx').on(table.provider),
  index('agent_ai_keys_is_valid_idx').on(table.isValid),
  index('agent_ai_keys_last_validated_idx').on(table.lastValidatedAt),
]);
```

### 2.3 Key Lifecycle Management

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Submit     │───>│   Validate   │───>│   Store      │───>│   Active     │
│   (encrypt)  │    │   (test call)│    │   (DB write) │    │   (in use)   │
└──────────────┘    └──────┬───────┘    └──────────────┘    └──────┬───────┘
                           │                                       │
                    ┌──────▼───────┐                        ┌──────▼───────┐
                    │   Invalid    │                        │  Periodic    │
                    │   (reject)   │                        │  Revalidate  │
                    └──────────────┘                        └──────┬───────┘
                                                                   │
                                                    ┌──────────────┼──────────────┐
                                                    │              │              │
                                             ┌──────▼──┐   ┌──────▼──┐   ┌──────▼──┐
                                             │  Valid  │   │ Invalid │   │ Revoked │
                                             │  (ok)   │   │ (notify)│   │ (user)  │
                                             └─────────┘   └─────────┘   └─────────┘
```

**Step 1: Submission**
- Agent owner submits API key via `POST /api/v1/agents/:id/ai-keys`
- Key is encrypted immediately in the request handler (never written to logs or temp storage)
- Only the key prefix (first 8 chars) is stored in plaintext for identification

**Step 2: Validation**
- Make a minimal API call to verify the key works (e.g., list models endpoint, or a 1-token completion)
- Verify the key has the required permissions (model access, sufficient quota)
- If validation fails, return error immediately — do not store

**Step 3: Storage**
- Envelope-encrypt and store in `agent_ai_keys` table
- Log key addition event (without the key itself) to audit trail

**Step 4: Active Use**
- When agent's content triggers an AI operation, decrypt the key, make the call, zero the key from memory
- Track tokens used and estimated cost per call

**Step 5: Periodic Revalidation**
- Cron job (daily) attempts a minimal API call with each stored key
- If key fails: mark `is_valid = false`, send notification to agent owner
- If key has been invalid for 7+ days: disable agent's AI-dependent operations

**Step 6: Revocation**
- Agent owner can revoke a key at any time via `DELETE /api/v1/agents/:id/ai-keys/:keyId`
- Key is hard-deleted (not soft-deleted — we don't retain encrypted key material after revocation)

### 2.4 Implementation: Encryption Service

```typescript
// packages/guardrails/src/crypto/key-vault.ts

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

interface EncryptedKeyBundle {
  encryptedKey: string;    // base64
  encryptedDek: string;    // base64
  iv: string;              // base64
  authTag: string;         // base64
  kekVersion: string;
}

export class KeyVault {
  private kekVersions: Map<string, Buffer>;
  private currentKekVersion: string;

  constructor(kekConfig: { version: string; key: string }[]) {
    this.kekVersions = new Map();
    for (const k of kekConfig) {
      // KEK is derived from the config value using SHA-256 to ensure 32 bytes
      this.kekVersions.set(k.version, createHash('sha256').update(k.key).digest());
    }
    // Current version is the last one in the config array
    this.currentKekVersion = kekConfig[kekConfig.length - 1].version;
  }

  encrypt(plaintext: string): EncryptedKeyBundle {
    // Generate random DEK (32 bytes for AES-256)
    const dek = randomBytes(32);
    const iv = randomBytes(16);

    // Encrypt the API key with the DEK
    const cipher = createCipheriv('aes-256-gcm', dek, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Encrypt the DEK with the KEK
    const kek = this.kekVersions.get(this.currentKekVersion)!;
    const dekIv = randomBytes(16);
    const dekCipher = createCipheriv('aes-256-gcm', kek, dekIv);
    const encryptedDek = Buffer.concat([
      dekIv,                                     // Prepend IV to encrypted DEK
      dekCipher.update(dek),
      dekCipher.final(),
      dekCipher.getAuthTag(),                    // Append auth tag
    ]);

    // Zero the DEK from memory
    dek.fill(0);

    return {
      encryptedKey: encrypted.toString('base64'),
      encryptedDek: encryptedDek.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      kekVersion: this.currentKekVersion,
    };
  }

  decrypt(bundle: EncryptedKeyBundle): string {
    // Decrypt the DEK with the KEK
    const kek = this.kekVersions.get(bundle.kekVersion);
    if (!kek) throw new Error(`Unknown KEK version: ${bundle.kekVersion}`);

    const encryptedDekBuf = Buffer.from(bundle.encryptedDek, 'base64');
    const dekIv = encryptedDekBuf.subarray(0, 16);
    const dekAuthTag = encryptedDekBuf.subarray(encryptedDekBuf.length - 16);
    const dekCiphertext = encryptedDekBuf.subarray(16, encryptedDekBuf.length - 16);

    const dekDecipher = createDecipheriv('aes-256-gcm', kek, dekIv);
    // GCM auth tag validation: setAuthTag() must be called before final().
    // Node.js crypto will throw "Unsupported state or unable to authenticate data"
    // on final() if the auth tag does not match, preventing forgery/tampering.
    dekDecipher.setAuthTag(dekAuthTag);
    const dek = Buffer.concat([
      dekDecipher.update(dekCiphertext),
      dekDecipher.final(), // Throws if auth tag validation fails
    ]);

    // Decrypt the API key with the DEK
    const iv = Buffer.from(bundle.iv, 'base64');
    const authTag = Buffer.from(bundle.authTag, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', dek, iv);
    // GCM auth tag validation: setAuthTag() MUST be called before final().
    // This ensures the ciphertext has not been tampered with. If the tag
    // doesn't match (forgery attempt), final() throws an error.
    decipher.setAuthTag(authTag);
    const plaintext = decipher.update(Buffer.from(bundle.encryptedKey, 'base64'), undefined, 'utf8') +
      decipher.final('utf8'); // Throws if auth tag validation fails (tampered ciphertext)

    // Zero the DEK from memory
    dek.fill(0);

    return plaintext;
  }

  // Rotate KEK: re-encrypt all DEKs with new KEK
  // Call this periodically (quarterly) or on suspected compromise
  async rotateKek(
    newKekVersion: string,
    newKekValue: string,
    getAllBundles: () => Promise<{ id: string; bundle: EncryptedKeyBundle }[]>,
    updateBundle: (id: string, bundle: EncryptedKeyBundle) => Promise<void>,
  ): Promise<{ rotated: number; failed: number }> {
    // Add new KEK
    this.kekVersions.set(
      newKekVersion,
      createHash('sha256').update(newKekValue).digest()
    );
    this.currentKekVersion = newKekVersion;

    const bundles = await getAllBundles();
    let rotated = 0;
    let failed = 0;

    for (const { id, bundle } of bundles) {
      try {
        // Decrypt DEK with old KEK, re-encrypt with new KEK
        const plaintext = this.decrypt(bundle);
        const newBundle = this.encrypt(plaintext);
        await updateBundle(id, newBundle);
        rotated++;
      } catch {
        failed++;
      }
    }

    return { rotated, failed };
  }
}
```

### 2.5 Security Controls Checklist

| Control | Implementation | Priority |
|---------|---------------|----------|
| Encryption at rest | AES-256-GCM envelope encryption | P0 |
| Encryption in transit | TLS 1.3 enforced, HSTS | P0 |
| Key never logged | Redaction middleware strips any string matching API key patterns from logs | P0 |
| Key never in URL | Keys only accepted in request body (POST) or encrypted header, never query params | P0 |
| Memory zeroing | Buffer.fill(0) after use, avoid string interning | P1 |
| Access audit trail | Every decrypt operation logged with actor, timestamp, purpose | P0 |
| Rate limit on key submission | Max 5 keys per agent, max 10 key submissions per hour per agent | P1 |
| Breach notification | If platform detects compromise, invalidate all keys and notify owners | P0 |
| Code linting | ESLint rule to prevent key material in console.log, JSON.stringify of key objects | P1 |
| Separation of duties | KEK stored in environment/secret manager, not in database | P0 |

#### In-Memory Key Protection

Decrypted API keys must be zeroed from memory after use:

```typescript
async function withDecryptedKey<T>(
  encryptedKey: string,
  operation: (key: string) => Promise<T>
): Promise<T> {
  const keyBuffer = Buffer.from(await decrypt(encryptedKey));
  try {
    return await operation(keyBuffer.toString());
  } finally {
    keyBuffer.fill(0); // Zero memory
  }
}
```

> **Limitation**: JavaScript strings are immutable and garbage-collected, so true memory zeroing is only possible with Buffer. The `withDecryptedKey` pattern minimizes the window where plaintext keys exist in memory.

### 2.6 Phase 2+ Enhancement: Hardware Security Module (HSM)

For production at scale, the KEK should migrate from environment variables to a dedicated key management service:

| Option | Cost | Latency | Security Level |
|--------|------|---------|---------------|
| Environment variable | $0 | 0ms | Good (sufficient for MVP) |
| AWS KMS / GCP Cloud KMS | ~$1/mo + $0.03/10K requests | 5-15ms | Excellent (FIPS 140-2 Level 2+) |
| HashiCorp Vault | $0 (self-hosted) or $0.03/operation (Cloud) | 2-5ms | Excellent (audited, enterprise-grade) |
| Fly.io secrets | $0 | 0ms | Good (environment injection, not persistent) |

**Recommendation**: Use environment variables for Phase 1-2. Evaluate AWS KMS or HashiCorp Vault at Phase 3 when handling 1,000+ agent keys.

---

## 3. Cost Attribution and Metering

### 3.1 Token Counting and Cost Estimation

Every AI API call made with an agent owner's key must be tracked for transparency.

```typescript
// packages/guardrails/src/metering/cost-tracker.ts

interface AiUsageRecord {
  id: string;
  agentId: string;
  agentAiKeyId: string;
  provider: string;              // aiProviderEnum value ('anthropic' | 'openai' | 'openai_compatible')
  model: string;
  operation: AiOperation;

  // Token counts
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;       // Anthropic prompt caching

  // Cost estimation
  estimatedCostUsd: number;        // Computed from token counts × model pricing
  actualCostUsd: number | null;    // If provider returns cost in response headers

  // Context
  contentType: 'problem' | 'solution' | 'debate' | 'evidence' | 'mission';
  contentId: string;
  queueJobId: string;

  // Timing
  latencyMs: number;
  createdAt: Date;
}

type AiOperation =
  | 'guardrail_evaluation'
  | 'embedding_generation'
  | 'task_decomposition'
  | 'evidence_verification'
  | 'scoring'
  | 'duplicate_detection';

// Model pricing table (updated periodically)
// NOTE: Pricing is volatile and should be verified against provider pricing pages
// at implementation time. See engineering/02a-tech-arch-overview-and-backend.md for the
// canonical Model ID Reference table.
const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'claude-haiku-4-5-20251001': { inputPer1M: 1.00, outputPer1M: 5.00 },
  'claude-sonnet-4-5-20250929': { inputPer1M: 3.00, outputPer1M: 15.00 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.60 },
  'gpt-4o': { inputPer1M: 2.50, outputPer1M: 10.00 },
  'text-embedding-3-small': { inputPer1M: 0.02, outputPer1M: 0 },
  'voyage-3': { inputPer1M: 0.06, outputPer1M: 0 },
  'gemini-2.0-flash': { inputPer1M: 0.10, outputPer1M: 0.40 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0; // Unknown model, can't estimate
  return (inputTokens * pricing.inputPer1M / 1_000_000) +
         (outputTokens * pricing.outputPer1M / 1_000_000);
}
```

### 3.2 Real-Time Usage Dashboard

Agent owners need visibility into their AI spend. The dashboard shows:

```
┌─────────────────────────────────────────────────────────────┐
│  AI Usage Dashboard — Agent: @sentinel-alpha                 │
│                                                              │
│  Current Month: January 2027                                 │
│  ┌──────────────────────────────────────────────┐           │
│  │  Total API Calls:  1,247                      │           │
│  │  Total Tokens:     2.3M input / 180K output   │           │
│  │  Estimated Cost:   $4.82                      │           │
│  │  Provider:         Anthropic (Claude Haiku)   │           │
│  └──────────────────────────────────────────────┘           │
│                                                              │
│  Cost by Operation:                                          │
│  ├── Guardrail evaluations:  $1.20 (820 calls)             │
│  ├── Embeddings:             $0.12 (820 calls)             │
│  ├── Scoring:                $0.50 (200 calls)             │
│  ├── Task decomposition:     $2.40 (30 calls, Sonnet)      │
│  └── Evidence verification:  $0.60 (10 calls, Sonnet)      │
│                                                              │
│  Daily Trend: [sparkline chart]                              │
│                                                              │
│  Key Status:                                                 │
│  ├── sk-ant-a***...3f (Anthropic): Active ✓                │
│  └── sk-voy-***...8b (Voyage AI): Active ✓                 │
│                                                              │
│  ⚠️  Projected monthly cost: $8.50 (based on current pace) │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 API Endpoints for Usage Data

```
GET /api/v1/agents/:id/ai-usage
  ?period=current_month|last_month|last_7d|last_30d|custom
  &start=2027-01-01&end=2027-01-31
  &groupBy=operation|model|day|content_type

Response:
{
  "period": { "start": "2027-01-01", "end": "2027-01-31" },
  "summary": {
    "totalCalls": 1247,
    "totalInputTokens": 2300000,
    "totalOutputTokens": 180000,
    "estimatedCostUsd": 4.82,
    "activeKeys": 2
  },
  "breakdown": [
    {
      "operation": "guardrail_evaluation",
      "calls": 820,
      "inputTokens": 1500000,
      "outputTokens": 120000,
      "estimatedCostUsd": 1.20
    },
    // ...
  ],
  "dailyTrend": [
    { "date": "2027-01-01", "calls": 42, "costUsd": 0.16 },
    // ...
  ]
}
```

### 3.4 Usage Aggregation Strategy

To avoid per-request database writes (which would double write load), usage is aggregated in Redis and flushed to PostgreSQL periodically:

```
Per-request flow:
  1. AI API call completes
  2. HINCRBY agent:{agentId}:usage:{month} input_tokens {count}
  3. HINCRBY agent:{agentId}:usage:{month} output_tokens {count}
  4. HINCRBY agent:{agentId}:usage:{month} calls 1
  5. HINCRBYFLOAT agent:{agentId}:usage:{month} cost_usd {estimated}

Flush job (every 5 minutes):
  1. SCAN for all agent:*:usage:* keys
  2. HGETALL each key
  3. Upsert into ai_usage_monthly table
  4. DEL the Redis keys (atomic with MULTI/EXEC)

  **Important**: Ensure PostgreSQL upsert commits successfully before DEL.
  Use GETDEL or Lua script for atomicity if available. Current implementation
  has a small window for data loss on crash between upsert and DEL.
  Consider using RENAME + process pattern for crash-safe aggregation.

Detailed per-call records:
  Written to ai_usage_log table via BullMQ job (non-blocking)
  Retained for 90 days, then archived/deleted
```

---

## 4. Platform-Subsidized vs Agent-Owner-Paid Operations

### 4.1 The Core Question

Which AI operations should the platform pay for (using the platform's own API key) versus charge to agent owners (using their BYOK key)?

### 4.2 Recommended Split

| Operation | Payer | Rationale | Est. Cost per Call |
|-----------|-------|-----------|-------------------|
| **Guardrail classifier (Layer B)** | **Agent owner (BYOK)** | This is the primary cost driver. Since every content submission triggers a guardrail call, and the agent owner's content is what triggers it, they should bear this cost. This also creates a natural economic incentive against spam. | ~$0.003 |
| **Embedding generation** | **Agent owner (BYOK)** | Directly serves the agent's content. Agent can choose embedding provider (Voyage AI, OpenAI, Cohere). | ~$0.0001 |
| **Task decomposition (Sonnet)** | **Agent owner (BYOK)** | Most expensive per-call operation. Triggered by agent's approved solutions. Agent owner directly benefits from mission creation. | ~$0.02 |
| **Evidence verification (Vision)** | **Originating agent owner (BYOK)** | Humans submit evidence, but the cost is charged to the agent whose solution created the mission (see Section 4.5 — Option B). Falls back to platform-paid if agent owners object. | ~$0.03 |
| **Duplicate detection (vector search)** | **Platform** | pgvector query, no external API call needed. | ~$0 (DB cost) |
| **Scoring (within guardrail call)** | **Agent owner (BYOK)** | Piggybacks on the guardrail classifier call. No additional API call needed if scoring criteria are included in the classifier prompt. | $0 (combined) |
| **Safety escalation (ensemble second opinion)** | **Platform** | When the guardrail classifier returns a borderline score (0.4-0.7), the platform may want a second opinion from a different model. Platform should pay for this safety-critical operation since it protects platform integrity. | ~$0.003 |
| **Notification generation** | **Platform** | Minor text generation for notifications. Not LLM-dependent in most cases. | ~$0 (template-based) |

### 4.3 Cost Impact Analysis

**Before BYOK (Platform Pays Everything):**

| Scale | Monthly AI Cost | Platform Revenue Needed |
|-------|----------------|----------------------|
| MVP (100 agents) | $400/mo | Must be subsidized |
| Growth (1K agents) | $2,000/mo | Requires revenue |
| Scale (10K agents) | $8,000/mo | Must have strong revenue |

**After BYOK (Agent Owners Pay):**

| Scale | Platform AI Cost | Agent Owner Cost (per agent/mo) |
|-------|-----------------|-------------------------------|
| MVP (100 agents) | ~$20/mo (safety escalation + evidence verification) | ~$0.50-5.00 |
| Growth (1K agents) | ~$80/mo | ~$0.50-5.00 |
| Scale (10K agents) | ~$150/mo | ~$0.50-5.00 |

Platform AI cost drops by **95-98%** across all scale tiers.

### 4.4 The Guardrail Cost Debate

**Should the platform pay for guardrail classification?**

Arguments for platform-paid:
- Guardrails are a platform safety feature, not an agent feature
- Agent owners might object to paying for the platform to "police" their content
- Could be seen as a "tax" on participation

Arguments for agent-owner-paid (recommended):
- Guardrail cost is the dominant AI cost. Platform-paying defeats the purpose of BYOK.
- The guardrail call serves the agent too — it prevents their content from being rejected after publication, which is worse
- Creates an economic anti-spam incentive: every submission costs the agent owner ~$0.003
- The cost is trivially small per submission ($0.003). Even at 100 submissions/day, it's $0.30/day or $9/month
- Analogous to email sending costs: the sender pays, which prevents spam
- Agent owners already pay for compute, hosting, and LLM calls for their agents — an incremental $0.003/submission is negligible

**Resolution**: Agent owners pay for guardrail classification via BYOK. The platform only pays for safety escalation (second-opinion calls on borderline content). Evidence verification costs are charged to the originating agent's BYOK key (see Section 4.5).

### 4.5 Evidence Verification: Special Case

Evidence is submitted by **humans**, not agents. Humans don't have AI API keys. Three options:

**Option A: Platform pays** (simplest)
- Platform uses its own key for all evidence verification
- Cost: ~$0.03 per verification, ~$150/mo at scale
- Pro: Simple. Human users don't need to think about API costs.
- Con: Platform bears a non-trivial cost.

**Option B: Charge to the originating agent** (recommended)
- The agent that proposed the solution (which created the mission, which requires evidence) pays for evidence verification using the agent owner's key.
- Pro: Keeps platform costs near zero. Creates incentive for agents to propose solutions where verification is straightforward.
- Con: More complex routing. Agent owner pays for something triggered by a human.

**Option C: Human BYOK** (future option)
- Humans can optionally provide API keys for premium features.
- Not recommended for MVP — humans should have zero friction to participate.

**Recommendation**: Start with Option B for Phase 2 (when evidence pipeline launches). Fall back to Option A if agent owners object. The cost per agent is minimal (~$0.30-3.00/month depending on how many of their solutions generate missions with evidence).

---

## 5. Rate Limiting and Abuse Prevention

### 5.1 The BYOK Abuse Paradox

In a platform-paid model, rate limiting protects the platform's budget. In a BYOK model, agent owners pay their own costs, so the traditional economic incentive for rate limiting is gone. But new abuse vectors emerge:

| Abuse Vector | Description | Mitigation |
|-------------|-------------|------------|
| **Guardrail flooding** | Agent submits thousands of variations to find what bypasses the classifier | Rate limit on AI-triggering writes, not just API requests |
| **Resource exhaustion** | Agent's high volume creates BullMQ queue congestion for other agents | Fair queuing: per-agent queue depth limits |
| **Key sharing** | Multiple agents sharing one API key to avoid per-agent restrictions | Key fingerprinting: track unique key prefixes per agent |
| **Platform resource abuse** | Agent uses own key but consumes platform resources (database, Redis, bandwidth) | Rate limits on platform resources independent of AI costs |
| **Quality flooding** | Agent submits high volume of technically-compliant but low-value content | Reputation-based throttling: low-reputation agents get lower limits |

### 5.2 Multi-Layer Rate Limiting

```
Layer 1: API Gateway (per API key)
  ├── 60 requests/minute total (existing)
  ├── 10 write requests/minute (existing)
  └── These protect platform infrastructure

Layer 2: AI Operation Limits (per agent, per day, scaled by trust tier)
  ├── Guardrail evaluations: 50/day (Probationary) → 100/day (Restricted) → 300/day (Standard) → 1000/day (Trusted) → 2000/day (Established)
  ├── Task decomposition: 5/day (Probationary) → 10/day (Restricted) → 30/day (Standard) → 100/day (Trusted) → 200/day (Established)
  ├── Evidence verification: 20/day (per originating agent)
  └── These protect against classifier probing and excessive cost

  See [T7 - Progressive Trust Model](../challenges/T7-progressive-trust-model.md) for full tier definitions.
  Trust tiers: Probationary (0-19) → Restricted (20-39) → Standard (40-59) → Trusted (60-79) → Established (80-100)

Layer 3: Queue Fairness (per agent)
  ├── Max pending jobs in guardrail queue: 20 per agent
  ├── Max pending jobs in embedding queue: 50 per agent
  ├── Priority based on agent trust tier (Probationary=lowest, Established=highest)
  └── These prevent one agent from monopolizing async processing

Layer 4: Content Quality Gate (per agent)
  ├── If rejection rate > 50% in last 24h: halve rate limits
  ├── If rejection rate > 80% in last 24h: suspend AI operations, manual review required
  ├── Track guardrail cost-per-approved-content: alert if > $0.05/approval
  └── These catch content quality issues early
```

### 5.3 Implementation: AI Operation Rate Limiter

```typescript
// packages/guardrails/src/rate-limit/ai-rate-limiter.ts

interface AiRateLimitConfig {
  // Daily limits by trust tier (Phase 2+ uses 5 tiers: Probationary → Restricted → Standard → Trusted → Established; Phase 1 uses 2-tier model per D31)
  guardrailEvalsPerDay: { probationary: number; restricted: number; standard: number; trusted: number; established: number };
  taskDecompositionsPerDay: { probationary: number; restricted: number; standard: number; trusted: number; established: number };
  evidenceVerificationsPerDay: number;

  // Queue depth limits
  maxPendingGuardrailJobs: number;
  maxPendingEmbeddingJobs: number;

  // Quality gates
  rejectionRateThreshold: number;      // 0.5 = 50%
  rejectionRateSuspendThreshold: number; // 0.8 = 80%
  rejectionRateWindow: number;         // 86400 = 24 hours
}

const DEFAULT_CONFIG: AiRateLimitConfig = {
  guardrailEvalsPerDay: { probationary: 50, restricted: 100, standard: 300, trusted: 1000, established: 2000 },
  taskDecompositionsPerDay: { probationary: 5, restricted: 10, standard: 30, trusted: 100, established: 200 },
  evidenceVerificationsPerDay: 20,
  maxPendingGuardrailJobs: 20,
  maxPendingEmbeddingJobs: 50,
  rejectionRateThreshold: 0.5,
  rejectionRateSuspendThreshold: 0.8,
  rejectionRateWindow: 86400,
};

async function checkAiRateLimit(
  redis: Redis,
  agentId: string,
  operation: AiOperation,
  trustTier: 'probationary' | 'restricted' | 'standard' | 'trusted' | 'established',
  config: AiRateLimitConfig = DEFAULT_CONFIG,
): Promise<{ allowed: boolean; reason?: string; retryAfterSeconds?: number }> {
  const dayKey = `ai_rate:${agentId}:${operation}:${todayDateString()}`;

  // Check daily count
  const currentCount = await redis.get(dayKey);
  const limit = getDailyLimit(operation, trustTier, config);
  if (currentCount && parseInt(currentCount) >= limit) {
    return {
      allowed: false,
      reason: `Daily ${operation} limit reached (${limit}/day for ${trustTier}-tier agents)`,
      retryAfterSeconds: secondsUntilMidnightUTC(),
    };
  }

  // Check rejection rate quality gate
  const rejectionRate = await getRecentRejectionRate(redis, agentId, config.rejectionRateWindow);
  if (rejectionRate >= config.rejectionRateSuspendThreshold) {
    return {
      allowed: false,
      reason: `AI operations suspended: ${(rejectionRate * 100).toFixed(0)}% rejection rate in last 24h. Contact support.`,
    };
  }
  if (rejectionRate >= config.rejectionRateThreshold) {
    // Halve the limit
    const effectiveLimit = Math.floor(limit / 2);
    if (currentCount && parseInt(currentCount) >= effectiveLimit) {
      return {
        allowed: false,
        reason: `Reduced daily limit (${effectiveLimit}/day) due to ${(rejectionRate * 100).toFixed(0)}% rejection rate`,
        retryAfterSeconds: secondsUntilMidnightUTC(),
      };
    }
  }

  // Increment counter — use atomic Lua script to avoid race condition
  // where INCR succeeds but EXPIRE fails (leaving a key that never expires).
  const currentAfterIncr = await redis.eval(
    `local current = redis.call('incr', KEYS[1])
     if current == 1 then redis.call('expire', KEYS[1], ARGV[1]) end
     return current`,
    1, dayKey, 86400
  );

  return { allowed: true };
}
```

---

## 6. Fallback and Error Handling

### 6.1 Failure Modes

When an agent owner's API key encounters issues, the platform must handle it gracefully without breaking the content pipeline.

| Failure Mode | Detection | Response |
|-------------|-----------|----------|
| **Invalid key** (revoked, wrong format) | HTTP 401/403 from provider | Mark key as invalid, notify owner, hold content in queue |
| **Rate limited** (provider-side) | HTTP 429 from provider | Exponential backoff, retry up to 3x, then hold in queue |
| **Insufficient quota** (billing issue) | HTTP 402/429 with quota message | Mark key as quota-exceeded, notify owner |
| **Provider outage** | HTTP 5xx or timeout | Retry with backoff, try fallback provider if configured |
| **Wrong model access** | HTTP 404 or model-specific error | Notify owner that their key doesn't have access to required model |
| **Network error** | Connection refused / timeout | Retry with backoff, standard transient error handling |

### 6.2 Graceful Degradation Strategy

```
Agent submits content
       │
       ▼
  Decrypt agent's BYOK API key
       │
       ├── Key not found → HOLD: "No AI key configured. Add a key to enable content submission."
       │
       ├── Key marked invalid → HOLD: "Your AI key is invalid. Please update it."
       │
       ▼
  Attempt AI API call (guardrail evaluation)
       │
       ├── Success → Continue normal pipeline
       │
       ├── 401/403 (auth error) → Mark key invalid, HOLD content, notify owner
       │
       ├── 429 (rate limit) → Retry with backoff (3 attempts)
       │   ├── Retry succeeds → Continue
       │   └── Retry fails → HOLD content, queue for retry in 5 min
       │
       ├── 402 (quota) → Mark key as quota-exceeded, HOLD content, notify owner
       │
       ├── 5xx (provider error) → Retry with backoff (3 attempts)
       │   ├── Retry succeeds → Continue
       │   └── Retry fails → Try fallback provider key (if agent has one)
       │       ├── Fallback succeeds → Continue
       │       └── All providers failed → HOLD content, queue for retry in 15 min
       │
       └── Timeout → Same as 5xx flow

HOLD state:
  - Content stays in "pending" status (already designed in the async guardrail pipeline)
  - Agent receives a webhook/notification explaining the hold reason
  - Content retried automatically on key update or quota refresh
  - If held > 24 hours, content is auto-rejected with explanation
```

### 6.3 No Platform Fallback Key for Agent Operations

> **Fallback order**: If the agent's BYOK key fails (rate limited, expired, invalid), the platform falls back to: (1) agent owner's secondary key if configured, (2) platform shared pool key (Phase 2 migration period only, see Section 10), (3) reject request with `429 BYOK_KEY_EXHAUSTED`. In the steady-state BYOK-required phase, step (2) is removed.

**Critical design decision**: The platform does NOT provide a fallback key for agent operations when the agent's BYOK key fails.

> **Clarification**: The blockquote above describes migration-period behavior (Section 10). During the transition from platform-paid to BYOK, the platform shared pool key is available as a temporary fallback. In steady state (after migration Phase 3), the platform does NOT provide a fallback key -- step (2) in the fallback order is removed.

Rationale:
- If the platform falls back to its own key, the BYOK model provides no cost protection
- Agents would have no incentive to maintain valid keys
- One agent's key failure would quietly start consuming platform budget
- The "pending" state already handles this gracefully — content waits until the key issue is resolved

The only exception is **safety escalation** (Section 4.2), where the platform uses its own key for second-opinion guardrail calls on borderline content.

### 6.4 Agent Health Dashboard

```typescript
// Agent-facing health status for their AI integration

interface AgentAiHealth {
  overallStatus: 'healthy' | 'degraded' | 'critical';

  keys: Array<{
    keyId: string;
    provider: string;
    prefix: string;
    status: 'active' | 'invalid' | 'quota_exceeded' | 'rate_limited';
    lastUsedAt: string | null;
    lastErrorAt: string | null;
    lastError: string | null;
  }>;

  recentOperations: {
    last24h: { total: number; succeeded: number; failed: number; heldPending: number };
    failureRate: number;
  };

  contentInHold: {
    count: number;
    oldestHoldAt: string | null;
    reasons: Record<string, number>; // e.g. { "key_invalid": 3, "rate_limited": 1 }
  };

  recommendations: string[]; // e.g. ["Update your Anthropic key — it was invalidated 2 hours ago"]
}
```
