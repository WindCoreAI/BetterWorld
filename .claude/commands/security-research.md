---
description: Research latest security threats, compare with BetterWorld's posture, and update the security research docs. Run monthly or when a major vulnerability is disclosed. Use when you want to refresh security findings or investigate a specific security topic.
context: fork
handoffs:
  - label: Plan Security Sprint
    agent: speckit.plan
    prompt: Create an implementation plan for the top priority items in docs/research/security/09-gap-analysis.md
  - label: Implement Security Fix
    agent: speckit.implement
    prompt: Implement the security fixes identified in the gap analysis
---

## User Input

~~~text
$ARGUMENTS
~~~

## Goal

Perform a comprehensive security research refresh for the BetterWorld platform. Compare industry best practices and recent vulnerabilities against our current implementation, update research docs, and produce actionable recommendations.

This is a **research and documentation** skill — it investigates, compares, and writes findings. It does NOT modify application code.

## Scope Determination

Parse $ARGUMENTS to determine research scope:

1. **No arguments / "full"**: Full refresh across all 8 security topic areas
2. **Topic name** (e.g., "supply chain", "ai security", "auth"): Focus on that specific area
3. **CVE or vulnerability name** (e.g., "CVE-2025-69263", "PackageGate"): Research specific vulnerability and assess BetterWorld impact
4. **"gap-analysis"**: Only refresh the gap analysis without re-researching all topics

## Research Process

### Phase 1: Understand Current State

Read the current security research docs to understand what's already documented:

1. Read `docs/research/security/README.md` for the index
2. Read `docs/research/security/01-current-posture.md` for baseline
3. Read the relevant topic file(s) based on scope
4. Read `docs/research/security/09-gap-analysis.md` for current gaps

### Phase 2: Research Latest Industry Developments

For each topic area in scope, search the web for:

1. **New CVEs and vulnerabilities** affecting our stack (Node.js 22, Hono, pnpm, PostgreSQL 16, Redis, Anthropic SDK)
2. **OWASP updates** (API Security Top 10, LLM Top 10, Cheat Sheet updates)
3. **Framework security advisories** (Hono, Next.js 15, Drizzle ORM, better-auth, BullMQ)
4. **Industry incidents** relevant to AI agent platforms, content moderation, or token economies
5. **New security tools and practices** that could strengthen our posture

Search queries should include the current year (2026) and our specific technology stack.

### Phase 3: Compare and Analyze

For each finding:

1. Check if it's already documented in our research files
2. If new: assess applicability to BetterWorld
3. If applicable: determine priority (P0-P3) based on:
   - P0: Active exploitation or compliance requirement
   - P1: Significant risk reduction, should address next sprint
   - P2: Defense-in-depth improvement, plan for next quarter
   - P3: Future consideration, track only
4. If an existing gap has been addressed: update status to completed

### Phase 4: Update Documentation

Update the relevant files in `docs/research/security/`:

1. **Topic files** (02-08): Add new findings, update tables, add new references
2. **Gap analysis** (09): Add new items, update existing item statuses, re-prioritize if needed
3. **Current posture** (01): Update if implementation has changed since last review
4. **README**: Update "Last updated" date

### Phase 5: Report

Produce a summary for the user:

```
## Security Research Refresh — [Date]

### New Findings
- [List of newly discovered threats, CVEs, or practices]

### Updated Gaps
- [Changes to gap analysis — new items, resolved items, re-prioritizations]

### Recommended Immediate Actions
- [Top 3 things to do based on findings]

### No Action Needed
- [Areas where BetterWorld is already aligned with latest standards]
```

## Topic Areas

| Area | File | Key Sources |
|------|------|-------------|
| API Security | 02-api-security.md | OWASP API Top 10, Hono advisories |
| AI/LLM Security | 03-ai-llm-security.md | OWASP LLM Top 10, Anthropic security blog |
| Supply Chain | 04-supply-chain.md | npm advisories, pnpm releases, Socket.dev blog |
| Auth & Identity | 05-auth-identity.md | OAuth WG, FIDO Alliance, better-auth releases |
| Infrastructure | 06-infrastructure.md | Supabase changelog, Upstash docs, Fly.io blog |
| Cryptography | 07-cryptography.md | NIST PQC, OWASP Password Storage |
| Privacy | 08-privacy-engineering.md | GDPR enforcement, ICO guidance |

## Constraints

- Do NOT modify application source code — documentation only
- Do NOT create new topic files without good reason — update existing files
- Always include source URLs for new findings
- Maintain the existing table format in gap analysis
- Keep priority assessments conservative (don't inflate urgency)
- If a finding contradicts existing documentation, flag it for human review
