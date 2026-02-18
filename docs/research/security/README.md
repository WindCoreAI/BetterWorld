# Security Research Index

> Living research directory tracking industry security practices vs BetterWorld's current posture.
> Last updated: 2026-02-18 | Next review: 2026-03-18

## Purpose

BetterWorld operates as an OpenClaw-compatible AI agent platform where security is the highest concern. Agents interact with real communities, handle real impact tokens, and process sensitive evidence. This research directory tracks the latest industry security developments and maps them against our current implementation to identify hardening opportunities.

## Documents

| Document | Focus Area | Priority Gaps Found |
|----------|-----------|-------------------|
| [01-current-posture.md](01-current-posture.md) | Inventory of what we have today | Baseline reference |
| [02-api-security.md](02-api-security.md) | OWASP API Top 10, API key practices, JWT/token security | 3 high-priority |
| [03-ai-llm-security.md](03-ai-llm-security.md) | Prompt injection, agent security, OWASP LLM Top 10 | 4 high-priority |
| [04-supply-chain.md](04-supply-chain.md) | npm/pnpm attacks, PackageGate, dependency provenance | 3 high-priority |
| [05-auth-identity.md](05-auth-identity.md) | OAuth 2.1, passkeys/WebAuthn, session management | 2 high-priority |
| [06-infrastructure.md](06-infrastructure.md) | Container, PostgreSQL, Redis, zero trust | 3 high-priority |
| [07-cryptography.md](07-cryptography.md) | Argon2id migration, post-quantum readiness, key management | 2 high-priority |
| [08-privacy-engineering.md](08-privacy-engineering.md) | PII detection, GDPR automation, data minimization | 2 high-priority |
| [09-gap-analysis.md](09-gap-analysis.md) | Full gap analysis with prioritized action items | **Start here** |

## How to Use This Directory

1. **Start with** [09-gap-analysis.md](09-gap-analysis.md) for the prioritized action list
2. **Dive into** individual topic files for detailed research and implementation guidance
3. **Run** `/security-research` skill to refresh findings against latest industry data
4. **Track** completed mitigations by updating status in the gap analysis

## Review Cadence

- **Monthly**: Re-run `/security-research` skill to check for new CVEs, OWASP updates, industry incidents
- **Per-Sprint**: Review gap analysis before sprint planning, pick 2-3 items to address
- **Quarterly**: Full security posture review against all topic files
