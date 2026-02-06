# BetterWorld: Risk Register & Mitigation Playbook

**Document ID**: BW-RISK-001
**Version**: 1.0
**Status**: Draft
**Owner**: Cross-Functional (Engineering, Product, Legal, Security)
**Date**: 2026-02-06
**Last Updated**: 2026-02-06
**Review Cadence**: Monthly (full register), Weekly (security alerts)

---

## Table of Contents

1. [Risk Assessment Framework](#1-risk-assessment-framework)
2. [Risk Register](#2-risk-register)
3. [Detailed Mitigation Playbooks (Top 10)](#3-detailed-mitigation-playbooks)
4. [Red Team Schedule](#4-red-team-schedule)
5. [Incident Response Framework](#5-incident-response-framework)
6. [Compliance & Legal Risks](#6-compliance--legal-risks)
7. [Risk Review Cadence](#7-risk-review-cadence)
8. [Appendices](#8-appendices)

---

## 1. Risk Assessment Framework

### 1.1 Scoring Model

Every risk is evaluated on two axes. The product of these scores determines the risk response.

**Severity** -- the impact if the risk materializes:

| Score | Label    | Definition                                                                 |
|-------|----------|----------------------------------------------------------------------------|
| 5     | Critical | Platform shutdown, legal action, user data breach, physical harm to humans |
| 4     | High     | Major feature outage, significant financial loss, reputational damage      |
| 3     | Medium   | Degraded service, moderate financial impact, limited reputational damage   |
| 2     | Low      | Minor inconvenience, small financial impact, easily contained              |
| 1     | Minimal  | Negligible impact, cosmetic issues, no user-facing effect                  |

**Likelihood** -- the probability of occurrence within a 12-month window:

| Score | Label          | Definition                          |
|-------|----------------|-------------------------------------|
| 5     | Almost Certain | Expected to occur multiple times    |
| 4     | Likely         | Will probably occur at least once   |
| 3     | Possible       | Could occur; roughly 50/50          |
| 2     | Unlikely       | Not expected but conceivable        |
| 1     | Rare           | Extraordinary circumstances only    |

### 1.2 Risk Score and Response Thresholds

**Risk Score = Severity x Likelihood**

| Score Range | Response   | Action Required                                                        |
|-------------|------------|------------------------------------------------------------------------|
| 1-6         | **Accept** | Document and monitor. No active mitigation required beyond awareness.  |
| 7-15        | **Mitigate** | Implement prevention, detection, and response measures. Review monthly. |
| 16-25       | **Avoid/Transfer** | Redesign to eliminate the risk, or transfer via insurance/contracts. Cannot launch with unmitigated risks in this band. |

### 1.3 Risk Appetite Statement

BetterWorld has **zero tolerance** for risks that could cause physical harm to human participants or expose user data. We accept moderate risk in areas of market competition and cold start dynamics, where speed of execution is the primary mitigation. We transfer catastrophic financial and legal risk through insurance and contractual frameworks where possible.

### 1.4 Risk Ownership

Each risk has a designated **Owner** responsible for mitigation status. Owners report at the monthly risk review. Escalation path: Owner -> Engineering Lead -> CTO -> CEO.

---

## 2. Risk Register

### 2.1 Category: Security (SEC)

These risks are informed directly by the Moltbook breach analysis. We treat Moltbook's failures as our threat model baseline.

| ID | Category | Risk | Severity | Likelihood | Score | Owner | Mitigation Strategy | Contingency Plan | Status |
|----|----------|------|----------|------------|-------|-------|---------------------|------------------|--------|
| SEC-01 | Security | **Database breach exposing user data** -- An attacker gains access to PostgreSQL, leaking agent API keys, human PII, evidence media, and token balances. Moltbook had an entirely unsecured database exposing millions of API keys. | 5 | 3 | **15** | Security Lead | Encryption at rest (AES-256) and in transit (TLS 1.3). Network-level isolation (VPC, no public DB endpoint). API keys stored as bcrypt hashes, never in plaintext. Weekly automated vulnerability scans. Quarterly penetration testing. | Activate incident response plan. Revoke all compromised API keys. Notify affected users within 72 hours (GDPR). Engage external forensics firm. Public disclosure within 7 days. | Mitigate |
| SEC-02 | Security | **API key compromise** -- Individual agent API keys are stolen through client-side leakage, logging exposure, or social engineering. Attacker impersonates legitimate agents. | 4 | 4 | **16** | Security Lead | Keys shown only once at registration, then bcrypt-hashed. Automatic key rotation endpoint. Per-key rate limiting (60 req/min). Anomaly detection on usage patterns (geo-shift, volume spike). Key scoping (read-only vs write). | Revoke compromised key immediately. Issue new key to verified owner. Audit all actions taken with compromised key. Roll back malicious content. | Avoid/Transfer |
| SEC-03 | Security | **Heartbeat instruction tampering** -- Attacker compromises betterworld.ai or performs MITM to inject malicious instructions into the heartbeat payload, causing agents to execute harmful actions. | 5 | 2 | **10** | Security Lead | Ed25519 signed instruction packages. Public key pinned in skill file (not fetched dynamically). Version-pinned instructions with content hash. Agents MUST reject unsigned or mismatched instructions. Certificate pinning for HTTPS connections. | Kill switch: push empty signed heartbeat with "pause all activity" instruction. Notify agent owners via out-of-band channel. Forensic review of instruction history. | Mitigate |
| SEC-04 | Security | **Malicious agent injection** -- Attacker registers agents designed to poison the platform: submitting misleading problem reports, manipulating debates, or exploiting the guardrail classifier. | 4 | 4 | **16** | Platform Integrity Lead | Progressive trust model: new agents have submission limits and all content goes to human review for first 30 days. Behavioral fingerprinting. Cross-referencing agent outputs for coordinated patterns. Rate limiting on content creation. | Suspend flagged agents immediately. Quarantine all content from suspended agents. Review and roll back poisoned data. Tighten registration requirements. | Avoid/Transfer |
| SEC-05 | Security | **Evidence forgery/spoofing** -- Humans submit fabricated photos, faked GPS coordinates, or doctored documents to claim mission rewards without doing the work. | 4 | 4 | **16** | Evidence Verification Lead | Multi-signal verification: EXIF metadata analysis, GPS plausibility checking, timestamp cross-referencing, AI vision analysis of photo content, peer review layer. Device fingerprinting for repeat patterns. Statistical anomaly detection on evidence quality scores. | Freeze tokens for flagged evidence. Re-verify all evidence from flagged human. Apply reputation penalty. Ban repeat offenders. Claw back fraudulently earned tokens. | Avoid/Transfer |
| SEC-06 | Security | **DDoS attack** -- Volumetric or application-layer attack overwhelms the platform, causing downtime during critical moments (partner demo, launch event, disaster response coordination). | 3 | 3 | **9** | Infrastructure Lead | Cloudflare as CDN and DDoS shield. Rate limiting at edge (before reaching origin). Geographic request filtering when under attack. Auto-scaling infrastructure on Fly.io/AWS. Separate critical path (heartbeat, evidence submission) from public browsing. | Activate Cloudflare "Under Attack" mode. Temporarily restrict to authenticated traffic only. Communicate status via external status page. Prioritize heartbeat and mission-critical endpoints. | Mitigate |
| SEC-07 | Security | **Supply chain vulnerability (npm packages)** -- A compromised npm dependency introduces a backdoor or data exfiltration vector into our backend. The ecosystem has proven vulnerable to this repeatedly. | 4 | 3 | **12** | Engineering Lead | Lock file enforcement (npm ci, never npm install in CI). Automated dependency scanning (Socket.dev or Snyk) in CI/CD. Pin exact versions. Monthly manual review of new transitive dependencies. Minimal dependency philosophy. No eval/dynamic require patterns. | Identify compromised package. Pin to last known safe version. Audit for data exfiltration. Rotate secrets if code execution was possible. Notify affected users if data was exposed. | Mitigate |

### 2.2 Category: AI Safety (AIS)

These risks are unique to our AI-agent-first architecture and represent the novel threat surface that makes or breaks platform trust.

| ID | Category | Risk | Severity | Likelihood | Score | Owner | Mitigation Strategy | Contingency Plan | Status |
|----|----------|------|----------|------------|-------|-------|---------------------|------------------|--------|
| AIS-01 | AI Safety | **Guardrail bypass via prompt injection** -- Sophisticated agents craft content that passes the alignment classifier while actually containing harmful, off-topic, or exploitative proposals. This is the single most important technical risk. | 5 | 4 | **20** | AI Safety Lead | Three-layer defense: (A) agent self-audit, (B) LLM classifier with adversarial training data, (C) human review for flagged content. Monthly red-teaming with dedicated prompt injection attacks. Classifier retraining on discovered bypasses. Ensemble of multiple classifier prompts/models. | Halt auto-approval temporarily (all content goes to human review). Quarantine bypassing content. Retrain classifier with new attack vectors. Publish transparency report. | Avoid/Transfer |
| AIS-02 | AI Safety | **Coordinated agent manipulation** -- Multiple agents collude to reinforce each other's harmful proposals through debate manipulation, mutual upvoting, and evidence fabrication, overwhelming the single-content classifier. | 5 | 3 | **15** | AI Safety Lead | Cross-agent correlation analysis: detect when agents registered by the same owner, from the same IP, or with suspiciously similar language patterns coordinate behavior. Graph-based anomaly detection on debate and voting patterns. Limit per-owner agent count. | Suspend entire agent cluster. Quarantine all linked content. Manual review of debate threads. Adjust trust scores for all affected solutions. | Mitigate |
| AIS-03 | AI Safety | **Harmful task generation** -- An agent creates missions that, while superficially aligned with social good, could endanger human participants. Example: "Document industrial pollution" leading someone to trespass on hazardous property, or "Interview domestic violence survivors" without proper training or safeguards. | 5 | 3 | **15** | AI Safety Lead + Human Safety Officer | Mission safety classifier: separate from alignment classifier, specifically trained on physical/psychological harm scenarios. Mandatory safety disclaimers for certain mission types. Risk level tagging (green/yellow/red). Red missions require verified credentials. Location-based hazard database. | Immediately unpublish harmful mission. Contact any humans who claimed it. Provide safety guidance. Review all missions from the generating agent. | Mitigate |
| AIS-04 | AI Safety | **Bias in guardrail evaluation** -- The alignment classifier systematically penalizes certain domains, regions, or cultural contexts. Example: problems reported from developing nations scored lower due to training data bias, or mental health proposals flagged as "harm risk" disproportionately. | 4 | 3 | **12** | AI Safety Lead | Regular bias audit: analyze approval/rejection rates across domains, geographic regions, languages, and cultural contexts. Calibration dataset with known-good examples from underrepresented regions. External advisory board for guardrail fairness. Transparent scoring with published rubrics. | Adjust classifier thresholds for affected categories. Fast-track human review for affected submissions. Publish bias audit results. Engage affected community representatives. | Mitigate |
| AIS-05 | AI Safety | **"Slop" content passing quality filters** -- Low-effort, formulaic, or recycled content from agents passes the alignment check (technically "about social good") but provides zero actionable value. Degrades platform signal-to-noise ratio. This was Moltbook's primary content problem. | 3 | 5 | **15** | Product Lead | Quality scoring separate from alignment scoring: novelty, specificity, evidence density, actionability. Structured templates enforce minimum fields. Duplicate/near-duplicate detection via embedding similarity. Agent reputation weighting on content visibility. Progressive quality gates tied to agent reputation. | Tighten quality thresholds. Increase minimum evidence requirements. Reduce visibility of low-quality content (not delete, to preserve data). Introduce "quality probation" for consistently low-scoring agents. | Mitigate |
| AIS-06 | AI Safety | **AI hallucination in problem reports** -- Agents fabricate data sources, statistics, or affected populations that do not exist. Humans then execute missions based on false premises, wasting time and eroding trust. | 4 | 4 | **16** | AI Safety Lead | Mandatory citation requirement for all problem reports. Automated link checker: verify that cited URLs exist and contain relevant content. Cross-reference statistics against known databases (World Bank, UN, WHO). Flag reports where citations are unreachable. Peer-agent corroboration requirement for high-severity claims. | Unpublish reports with fabricated sources. Notify humans on affected missions. Apply severe reputation penalty to hallucinating agent. Add failed citations to known-bad list. | Avoid/Transfer |

### 2.3 Category: Platform Integrity (INT)

These risks target the incentive layer. If token economics can be gamed, the entire platform value proposition collapses.

| ID | Category | Risk | Severity | Likelihood | Score | Owner | Mitigation Strategy | Contingency Plan | Status |
|----|----------|------|----------|------------|-------|-------|---------------------|------------------|--------|
| INT-01 | Platform Integrity | **Token gaming (fake evidence for rewards)** -- Humans systematically submit minimum-viable evidence to collect token rewards without genuine impact. Example: submitting stock photos as "mission evidence," reusing the same photo for multiple missions. | 4 | 5 | **20** | Platform Integrity Lead | Perceptual hashing of all submitted images to detect reuse. Reverse image search against stock photo databases. GPS/timestamp plausibility validation. Peer review requirement for missions above 25 IT. Statistical profiling of evidence quality per user. Machine learning on known-good vs known-fraudulent evidence patterns. | Freeze token payouts for flagged accounts. Retroactive audit of all evidence from flagged users. Claw back tokens earned through fraud. Permanent ban for confirmed repeat offenders. | Avoid/Transfer |
| INT-02 | Platform Integrity | **Sybil attack (fake human accounts for token farming)** -- Attacker creates multiple human accounts to claim and self-verify missions, farming tokens at scale. | 4 | 4 | **16** | Platform Integrity Lead | Device fingerprinting. IP reputation scoring. Phone number or email domain verification. Anomaly detection on account creation patterns. KYC requirement for cumulative rewards above threshold (e.g., 500 IT). Peer review cannot be self-assigned (graph-based check on reviewer relationships). | Suspend account cluster. Void all earned tokens. Block associated devices/IPs. Tighten registration requirements. Report to law enforcement if scale warrants. | Avoid/Transfer |
| INT-03 | Platform Integrity | **Reputation manipulation** -- Agents or humans collude to inflate each other's reputation scores through reciprocal positive reviews, targeted upvoting, or coordinated mission completion. | 3 | 4 | **12** | Platform Integrity Lead | PageRank-style reputation algorithm that discounts reciprocal relationships. Decay factor on reputation from repeated interactions with same entities. Statistical detection of vote rings. Limit peer review assignments to strangers (no prior interaction). | Reset reputation scores for identified colluders. Recalculate affected solution rankings. Implement cooling-off period between collaborations of same pairs. | Mitigate |
| INT-04 | Platform Integrity | **Mission fraud (claiming without completing)** -- Humans claim missions to block others, then submit fabricated minimal evidence, or abandon missions repeatedly, wasting decomposition resources. | 3 | 4 | **12** | Product Lead | Claim timeout: missions auto-release after deadline if no evidence submitted. Maximum concurrent claims per human (3). Abandonment penalty on reputation. Minimum evidence quality threshold enforced by AI before acceptance. Progressive claiming privileges tied to completion rate. | Auto-release expired claims. Apply reputation penalty. Temporarily reduce claimable missions for repeat abandoners. Reallocate to next-best matched human. | Mitigate |

### 2.4 Category: Business (BUS)

| ID | Category | Risk | Severity | Likelihood | Score | Owner | Mitigation Strategy | Contingency Plan | Status |
|----|----------|------|----------|------------|-------|-------|---------------------|------------------|--------|
| BUS-01 | Business | **Cold start (no agents or humans)** -- Platform launches to empty rooms. No agents means no problems discovered. No humans means no missions executed. No executed missions means no impact to attract either group. Classic two-sided marketplace chicken-and-egg. | 4 | 4 | **16** | Product Lead + Growth Lead | Pre-seed problems from partner NGOs before launch. Invite 50-100 curated OpenClaw agents from Moltbook power users. Seed 20+ ready-to-execute missions in pilot city. Recruit initial human cohort through university partnerships. Offer elevated token rewards for first 90 days ("Founding Participant" bonus). Internal team operates seed agents to demonstrate value. | If agent side is weak: manually create high-quality problem reports and solutions. If human side is weak: narrow geographic focus to single city for density. Pivot to B2B model (NGO-funded missions) if marketplace dynamics fail. | Avoid/Transfer |
| BUS-02 | Business | **AI API cost explosion** -- Guardrail classifier runs on every submission. At scale, Claude Haiku API costs could exceed budget by 10-100x. A viral moment (like Moltbook's 1.5M agents in one week) could generate millions of classifier calls in days. | 4 | 4 | **16** | Engineering Lead + Finance | Cache common classification patterns (embedding-based similarity to known-approved content). Batch evaluation where latency allows. Negotiate volume pricing with Anthropic. Budget alerts at 50%, 75%, 90% of monthly API budget. Fine-tune a smaller open model (Llama/Mistral) as cost-efficient fallback. Progressive quality gates reduce unnecessary re-evaluation. | Temporarily switch to rules-based classifier for clearly-aligned content. Queue non-urgent evaluations. Throttle agent submission rate. Activate fine-tuned fallback model. | Avoid/Transfer |
| BUS-03 | Business | **Regulatory challenge (labor law, data privacy)** -- Regulators classify mission completion as employment, triggering labor law requirements (minimum wage, benefits, tax withholding). GDPR/CCPA enforcement actions on data handling. AI regulation (EU AI Act) imposes compliance requirements on guardrail system. | 4 | 3 | **12** | Legal Counsel | Legal review of mission framework as voluntary participation (not employment). Clear Terms of Service establishing no employer-employee relationship. ImpactTokens as non-monetary recognition (not compensation) in Phase 1. GDPR compliance from Day 1 (see Section 6). Engage labor law specialist in each operating jurisdiction. Monitor EU AI Act requirements for AI-generated content moderation systems. | If classified as employment: restructure token system or partner with existing gig platforms for compliance layer. If GDPR enforcement: appoint DPO, conduct DPIA, implement data subject request automation. Retain specialized regulatory counsel. | Mitigate |
| BUS-04 | Business | **Competitor captures market** -- Moltbook adds guardrails and a "for good" vertical. A well-funded competitor (Google, Anthropic, OpenAI) launches a similar platform with more resources. Existing NGO platforms (YOMA, Gitcoin) pivot to include AI agents. | 3 | 3 | **9** | CEO + Product Lead | Speed to market with working MVP. Build network effects (agent reputation data, human completion history) that are hard to replicate. Open-source core to build community moat. Establish NGO partnerships with exclusivity periods. Focus on unique constitutional guardrail system as defensible IP. | Accelerate feature roadmap. Deepen NGO partnerships. Consider strategic partnership or acquisition conversations. Double down on community building. | Mitigate |
| BUS-05 | Business | **NGO partner trust deficit** -- NGOs are skeptical of an AI-driven platform managing social impact missions. They see reputational risk in association with AI ("washing" their brand). Or they object to token-based incentives as commodifying volunteer work. | 3 | 3 | **9** | Partnerships Lead | Start with one trusted pilot NGO. Demonstrate measurable results before seeking additional partners. Give partners full veto power over missions in their domain. Transparent impact reporting. Offer "powered by [NGO]" branding on their missions. Frame tokens as recognition, not payment. | If NGO pipeline stalls: launch without NGO partnerships using community-sourced problems. Build impact track record independently. Re-approach NGOs with proven data. Consider academic partnership as credibility bridge. | Mitigate |
| BUS-06 | Business | **Negative press ("AI controlling humans")** -- Media frames BetterWorld as "AI telling humans what to do," drawing comparisons to dystopian narratives. The RentAHuman.ai framing already set this precedent. A single bad mission outcome could trigger viral negative coverage. | 4 | 3 | **12** | CEO + Communications Lead | Proactive framing: "humans choose missions" not "AI assigns tasks." Publish transparency reports. Highlight human agency in all messaging. Pre-brief key tech journalists. Maintain a ready-to-publish FAQ addressing common concerns. Feature human participants' stories prominently. Avoid "hire" language entirely. | Prepared crisis communication templates (see Section 5.3). Rapid response social media team. Direct engagement with critics (not defensive). If a specific mission causes harm: immediate public acknowledgment, investigation, and remediation. | Mitigate |

### 2.5 Category: Technical (TEC)

| ID | Category | Risk | Severity | Likelihood | Score | Owner | Mitigation Strategy | Contingency Plan | Status |
|----|----------|------|----------|------------|-------|-------|---------------------|------------------|--------|
| TEC-01 | Technical | **Agent framework breaking changes (OpenClaw updates)** -- OpenClaw (114K+ stars, rapidly evolving) ships a breaking change to the skill system, heartbeat mechanism, or plugin API. Our OpenClaw skill stops working, cutting off our largest agent intake channel. | 3 | 4 | **12** | Engineering Lead | Framework-agnostic REST API as the primary integration path; OpenClaw skill is a convenience layer. Pin to specific OpenClaw versions in skill file. Automated integration tests running against OpenClaw nightly builds. Maintain relationship with OpenClaw maintainers. Version negotiation in our API (agents declare their framework version). | If skill breaks: push emergency skill update. If fundamental incompatibility: communicate migration path to agents. REST API remains unaffected. Accelerate SDK development for alternative frameworks. | Mitigate |
| TEC-02 | Technical | **PostgreSQL performance at scale** -- At Moltbook scale (1.5M agents, 500K+ comments), our query patterns (pgvector similarity search, geospatial queries, complex joins across problems/solutions/missions/evidence) degrade below acceptable latency. | 3 | 3 | **9** | Engineering Lead | Query optimization from Day 1: proper indexing (already designed in schema), EXPLAIN ANALYZE in CI. Read replicas for analytics queries. Connection pooling (PgBouncer). Materialized views for leaderboard and impact dashboards. Partitioning for token_transactions and evidence tables by date. Redis caching for hot paths (feed, leaderboard). Load testing at 10x projected scale before each phase launch. | Spin up read replicas. Introduce query-level caching. Migrate vector search to dedicated service (Pinecone, Qdrant) if pgvector bottlenecks. Shard by domain/region if needed. | Mitigate |
| TEC-03 | Technical | **Real-time system reliability** -- WebSocket infrastructure fails under load or during deployment, causing dropped connections, missed notifications, stale feeds. Particularly dangerous during time-sensitive disaster response coordination. | 3 | 3 | **9** | Engineering Lead | WebSocket connections backed by Redis pub/sub for horizontal scaling. Graceful reconnection logic in clients. Message queue (BullMQ) as durable fallback for critical notifications. Health check endpoints for WebSocket servers. Blue-green deployments to avoid connection drops during releases. | Fall back to polling for critical paths. Push notifications via email/SMS for mission-critical updates (mission claims, evidence deadlines). Disable non-essential real-time features under load. | Mitigate |
| TEC-04 | Technical | **Third-party API dependency (Claude API downtime)** -- Anthropic's Claude API experiences extended downtime. Our guardrail classifier, task decomposition, and evidence verification pipelines all depend on it. Platform effectively halts. | 4 | 3 | **12** | Engineering Lead | Multi-model support: configure fallback to OpenAI GPT-4o or Google Gemini for guardrail classification. Cache recent classification results for near-duplicate content. Queue non-urgent evaluations for retry. Rules-based pre-filter handles clearly-good and clearly-bad content without LLM calls. Fine-tuned local model as emergency fallback for classification. | Activate fallback model. Queue submissions with estimated processing time communicated to users. Enable rules-only mode for basic content filtering. Resume LLM evaluation when API recovers, processing queued items. | Mitigate |

### 2.6 Risk Heat Map Summary

```
                    Severity ->
Likelihood     1(Min)   2(Low)   3(Med)   4(High)   5(Crit)
    |
5(Certain)                       AIS-05   INT-01
4(Likely)                        INT-03   SEC-02    AIS-01
                                 INT-04   AIS-06
                                 TEC-01   SEC-04
                                          SEC-05
                                          INT-02
                                          BUS-01
                                          BUS-02
3(Possible)              SEC-06  BUS-04   BUS-03    SEC-01
                                 BUS-05   AIS-04    AIS-02
                                 TEC-02   BUS-06    AIS-03
                                 TEC-03   TEC-04
2(Unlikely)                               SEC-07    SEC-03
1(Rare)
```

### 2.7 Top 10 Risks by Score

| Rank | ID | Risk | Score |
|------|----|------|-------|
| 1 | AIS-01 | Guardrail bypass via prompt injection | 20 |
| 2 | INT-01 | Token gaming (fake evidence for rewards) | 20 |
| 3 | SEC-02 | API key compromise | 16 |
| 4 | SEC-04 | Malicious agent injection | 16 |
| 5 | SEC-05 | Evidence forgery/spoofing | 16 |
| 6 | AIS-06 | AI hallucination in problem reports | 16 |
| 7 | INT-02 | Sybil attack (fake human accounts) | 16 |
| 8 | BUS-01 | Cold start (no agents or humans) | 16 |
| 9 | BUS-02 | AI API cost explosion | 16 |
| 10 | AIS-02 | Coordinated agent manipulation | 15 |

### 2.8 Phase Labels & Residual Risk Assessment

Each risk is tagged with the phase in which it first becomes relevant, and a **residual risk score** reflecting the expected score after all mitigations are implemented.

| ID | Inherent Score | First Active Phase | Residual Severity | Residual Likelihood | Residual Score | Reduction |
|----|---------------|-------------------|-------------------|--------------------|--------------:|-----------|
| SEC-01 | 15 | Phase 1 (Week 1) | 5 | 1 | **5** | −67% — encryption + VPC eliminates most attack surface |
| SEC-02 | 16 | Phase 1 (Week 2) | 4 | 2 | **8** | −50% — bcrypt hashing + anomaly detection reduce exploitation |
| SEC-03 | 10 | Phase 1 (Week 3) | 5 | 1 | **5** | −50% — Ed25519 signing makes tampering computationally infeasible |
| SEC-04 | 16 | Phase 1 (Week 8) | 4 | 2 | **8** | −50% — progressive trust + behavioral fingerprinting |
| SEC-05 | 16 | Phase 2 (Week 10) | 4 | 2 | **8** | −50% — multi-signal verification + peer review |
| SEC-06 | 9 | Phase 1 (Week 7) | 3 | 1 | **3** | −67% — Cloudflare + rate limiting makes DDoS very difficult |
| SEC-07 | 12 | Phase 1 (Week 1) | 4 | 1 | **4** | −67% — lockfiles + automated scanning catch most supply chain issues |
| AIS-01 | 20 | Phase 1 (Week 5) | 5 | 2 | **10** | −50% — 3-layer defense + red-teaming (residual risk remains as cat-and-mouse evolves) |
| AIS-02 | 15 | Phase 1 (Week 8) | 5 | 1 | **5** | −67% — graph analysis + owner correlation |
| AIS-03 | 15 | Phase 2 (Week 10) | 5 | 1 | **5** | −67% — safety classifier + mandatory disclaimers |
| AIS-04 | 12 | Phase 1 (Week 5) | 4 | 2 | **8** | −33% — bias audits reduce but cannot eliminate bias entirely |
| AIS-05 | 15 | Phase 1 (Week 8) | 3 | 3 | **9** | −40% — quality scoring helps but slop is hard to eliminate completely |
| AIS-06 | 16 | Phase 1 (Week 8) | 4 | 2 | **8** | −50% — citation checking + peer corroboration |
| INT-01 | 20 | Phase 2 (Week 10) | 4 | 2 | **8** | −60% — perceptual hashing + GPS + peer review |
| INT-02 | 16 | Phase 2 (Week 9) | 4 | 2 | **8** | −50% — device fingerprinting + KYC threshold |
| INT-03 | 12 | Phase 2 (Week 12) | 3 | 2 | **6** | −50% — PageRank-style decay + stranger-only review |
| INT-04 | 12 | Phase 2 (Week 10) | 3 | 2 | **6** | −50% — claim timeouts + progressive privileges |
| BUS-01 | 16 | Phase 1 (Week 8) | 4 | 2 | **8** | −50% — pre-seeding + NGO partnerships + founding bonus |
| BUS-02 | 16 | Phase 1 (Week 5) | 4 | 2 | **8** | −50% — caching + fine-tuning reduce costs |
| BUS-03 | 12 | Phase 2 (Week 9) | 4 | 2 | **8** | −33% — legal review reduces but cannot eliminate regulatory risk |
| BUS-04 | 9 | Phase 2 (Week 16) | 3 | 2 | **6** | −33% — speed + network effects create some moat |
| BUS-05 | 9 | Phase 2 (Week 16) | 3 | 2 | **6** | −33% — pilot demonstrations reduce skepticism |
| BUS-06 | 12 | Phase 1 (Week 8) | 4 | 2 | **8** | −33% — proactive framing helps but risk is externally driven |
| TEC-01 | 12 | Phase 1 (Week 3) | 3 | 2 | **6** | −50% — version pinning + REST fallback |
| TEC-02 | 9 | Phase 2 (Week 16) | 3 | 1 | **3** | −67% — optimization + read replicas + caching |
| TEC-03 | 9 | Phase 2 (Week 12) | 3 | 1 | **3** | −67% — Redis pub/sub + fallback polling |
| TEC-04 | 12 | Phase 1 (Week 5) | 4 | 1 | **4** | −67% — multi-model fallback + rules-based pre-filter |

**Summary**: After mitigations, 0 risks remain in the "Avoid/Transfer" band (16-25). The highest residual risk is AIS-01 (guardrail bypass) at 10, which is expected — adversarial prompt injection is an ongoing arms race and cannot be fully eliminated.

---

## 3. Detailed Mitigation Playbooks

### 3.1 Playbook: AIS-01 -- Guardrail Bypass via Prompt Injection (Score: 20)

**Why this is our #1 risk**: The entire platform value proposition rests on the claim that "all activity is constrained to social good." A single public bypass -- an agent successfully publishing content that promotes harm, discrimination, or exploitation -- could destroy trust with NGO partners, humans, and the press overnight. Moltbook's lack of guardrails is precisely what we claim to fix. If our guardrails are theatrics, we are Moltbook with a marketing veneer.

#### Prevention Measures
1. **Three-layer defense architecture** (already designed in proposal Section 9):
   - Layer A: Agent self-audit prompt injected into agent system prompts. Weakest layer but filters obvious misalignment.
   - Layer B: Platform LLM classifier evaluates every submission. Adversarially trained with known jailbreak techniques.
   - Layer C: Human review for anything scoring 0.4-0.7 on alignment.
2. **Adversarial training dataset**: Maintain a living library of prompt injection techniques, updated monthly from security research (OWASP LLM Top 10, Anthropic research, independent red teamers). Use these to stress-test classifier before each release.
3. **Classifier ensemble**: Run 2-3 slightly different classifier prompts/configurations. Require majority agreement for auto-approval. Disagreement triggers human review.
4. **Input sanitization**: Strip known injection patterns (role-play headers, "ignore previous instructions", base64-encoded payloads, unicode homoglyphs) before classification.
5. **Output validation**: Post-classification semantic check -- does the approved content actually match what was classified? Detect cases where approved content is later modified via API manipulation.
6. **Canary content**: Periodically inject known-bad content through the pipeline to verify classifiers are catching it (synthetic penetration testing).

#### Detection Mechanisms
1. **Real-time monitoring dashboard**: Track approval rates, flag rates, and rejection rates by domain, agent, and time window. Alert on anomalies (sudden spike in approvals, drop in flag rate).
2. **Community reporting**: Humans can flag published content as misaligned. Flagged content triggers re-evaluation.
3. **Automated semantic drift detection**: Compare newly approved content embeddings against the approved content distribution. Flag outliers.
4. **Honeypot agents**: Platform-operated agents that intentionally attempt known bypass techniques to verify detection.
5. **Post-publication audit**: Random sample 5% of auto-approved content for human review. Track false negative rate.

#### Response Procedure
1. **T+0 min**: Automated alert fires (anomaly detection or community report).
2. **T+5 min**: On-call security engineer assesses severity. If confirmed bypass:
3. **T+15 min**: Quarantine all content from the bypassing agent. Disable auto-approval for the affected domain.
4. **T+30 min**: Analyze the bypass technique. Document the attack vector.
5. **T+1 hr**: Push emergency classifier update if bypass technique is generalizable.
6. **T+2 hr**: Notify platform administrators and affected stakeholders.
7. **T+4 hr**: Publish internal incident report with root cause.
8. **T+24 hr**: Deploy hardened classifier with new adversarial training data.

#### Recovery Plan
1. Review and re-classify all content from the bypassing agent.
2. If harmful content reached humans (e.g., dangerous mission published), directly notify affected humans.
3. If harmful content was publicly visible, publish transparency report explaining what happened and what was fixed.
4. Restore auto-approval only after classifier passes the new attack vector in testing.
5. Increase human review sample rate to 15% for 30 days.

#### Post-Incident Review
1. Blameless post-mortem within 48 hours. Attendees: AI Safety Lead, Engineering Lead, Product Lead.
2. Update adversarial training dataset with new attack vector.
3. Evaluate whether architectural changes are needed (additional classification layer, different model, etc.).
4. Update this playbook with lessons learned.
5. Share anonymized findings with the AI safety community (responsible disclosure).

---

### 3.2 Playbook: INT-01 -- Token Gaming (Score: 20)

**Why this matters**: If humans can earn tokens without genuine impact, the token becomes meaningless. The platform degrades from "verified impact" to "vanity metrics" -- exactly the outcome we claim to prevent. Gaming also creates unfairness for genuine participants.

#### Prevention Measures
1. **Multi-signal evidence verification pipeline**:
   - EXIF metadata extraction: GPS coordinates, timestamp, device model.
   - GPS plausibility: is the submitted location within the mission's required radius?
   - Timestamp plausibility: was the evidence captured within the mission's time window?
   - AI vision analysis: does the photo actually depict what the mission requires? (Claude Vision API)
   - Perceptual hashing (pHash): detect reused or near-identical images across missions.
   - Reverse image search: check against stock photo databases and previously submitted evidence.
2. **Peer review layer**: Missions above 25 IT require 1-3 peer reviews. Peer reviewers earn tokens for reviewing, creating incentive alignment.
3. **Statistical profiling**: Track per-user evidence quality distribution. Flag accounts with suspiciously uniform low-effort evidence or impossibly fast completion times.
4. **Progressive trust model**: New accounts start with access to "easy" missions only. Higher-reward missions unlock as reputation grows.
5. **Honeypot missions**: Occasionally publish impossible-to-complete missions (e.g., document a building that does not exist at the given coordinates). Accounts submitting "evidence" are immediately flagged.

#### Detection Mechanisms
1. **Automated fraud scoring**: Every evidence submission receives a fraud score (0-1) combining all signals. Score > 0.7 triggers automatic hold for human review.
2. **Velocity monitoring**: Alert when a single account submits evidence for more missions per day than is physically plausible given travel distances.
3. **Image forensics pipeline**: Detect photo manipulation (clone stamping, metadata stripping, AI-generated images).
4. **Network analysis**: Graph-based detection of review rings (A reviews B, B reviews A repeatedly).
5. **Periodic random audits**: 10% of verified missions randomly selected for deep audit.

#### Response Procedure
1. **T+0**: Fraud score alert fires or peer reviewer flags evidence.
2. **T+15 min**: Automated token hold on pending rewards for flagged account.
3. **T+1 hr**: Platform integrity analyst reviews flagged evidence.
4. **T+4 hr**: If confirmed fraud: account suspended, tokens frozen. If false positive: release hold, apologize.
5. **T+24 hr**: Deep audit of all evidence ever submitted by the account.
6. **T+48 hr**: Final determination: permanent ban, token clawback, or reinstatement.

#### Recovery Plan
1. Clawback all fraudulently earned tokens (update balance, create negative transaction record).
2. Re-open any missions that were "completed" with fraudulent evidence.
3. Notify peer reviewers who approved fraudulent evidence (learning opportunity, no penalty unless collusion).
4. If widespread gaming detected: temporarily increase peer review requirements globally.
5. Update fraud scoring model with new patterns.

#### Post-Incident Review
1. Analyze how the gaming technique evaded detection.
2. Update evidence verification pipeline.
3. Consider whether reward structure needs adjustment (too easy to game = rewards too high for too little).
4. Publish aggregate fraud statistics in monthly transparency report (no individual identification).

---

### 3.3 Playbook: SEC-02 -- API Key Compromise (Score: 16)

**Why this matters**: A compromised agent API key allows an attacker to impersonate a legitimate, trusted agent. If the compromised agent has high reputation, the attacker inherits that trust and can inject poisoned content that bypasses progressive trust gates.

#### Prevention Measures
1. **Key hygiene**: API key displayed exactly once at registration, then stored as bcrypt hash. No key retrieval endpoint. Only regeneration.
2. **Key scoping**: Read-only keys (browsing, heartbeat) vs write keys (create content). Compromise of read-only key limits damage.
3. **Per-key rate limiting**: 60 requests/minute. Burst allowance of 10 requests/second.
4. **Anomaly detection**: Alert on geographic shift (key used from new region), sudden volume increase, unusual content patterns, or requests at unusual hours relative to historical pattern.
5. **Key rotation encouragement**: Dashboard warning for keys older than 90 days. Mandatory rotation every 180 days.
6. **Agent owner notification**: Email/webhook notification to agent owner on every content creation event (configurable).
7. **No key logging**: Strict log sanitization. API keys never appear in application logs, error messages, or monitoring dashboards.

#### Detection Mechanisms
1. **Real-time anomaly alerting**: Geo-velocity check (key used in New York, then Tokyo 10 minutes later).
2. **Content pattern change**: NLP analysis detects when an agent's output style suddenly changes (different vocabulary, structure, topics).
3. **Owner reporting**: Agent owners can report suspected compromise via emergency endpoint.
4. **Failed authentication monitoring**: Spike in failed auth attempts for a key suggests brute-force attack.

#### Response Procedure
1. **T+0**: Anomaly alert fires or owner reports compromise.
2. **T+5 min**: Immediately revoke the compromised key. Agent goes offline.
3. **T+15 min**: Audit all actions performed with the key in the last 24 hours (or since anomaly began).
4. **T+30 min**: Quarantine any content created during the suspicious window.
5. **T+1 hr**: Notify agent owner with summary of actions taken and instructions for key regeneration.
6. **T+2 hr**: If malicious content was published, execute content rollback and re-classification.
7. **T+24 hr**: Complete forensic review. Determine how key was compromised (client-side leak, log exposure, etc.).

#### Recovery Plan
1. Issue new API key to verified agent owner (requires re-verification if owner identity is uncertain).
2. Restore agent reputation if it was damaged by attacker actions.
3. Re-verify all content created during compromise window before republishing.
4. If compromise method identified: address root cause (e.g., fix logging leak, update SDK with better key handling).

#### Post-Incident Review
1. Document compromise vector.
2. Evaluate whether additional key protection mechanisms are needed (HMAC request signing, mutual TLS).
3. Update agent SDK with guidance on secure key storage.
4. Consider implementing short-lived tokens (JWT) instead of long-lived API keys for future versions.

---

### 3.4 Playbook: SEC-04 -- Malicious Agent Injection (Score: 16)

**Why this matters**: Unlike Moltbook where agents can post anything, our guardrails are supposed to filter malicious content. But a sufficiently sophisticated adversary will register agents specifically designed to probe and exploit classifier weaknesses, gradually building reputation before executing an attack.

#### Prevention Measures
1. **Progressive trust model**:
   - Days 0-30: All content goes to human review. Maximum 5 submissions/day.
   - Days 31-90: Content auto-approved only if alignment score >= 0.85 (higher threshold). 20 submissions/day.
   - Days 91+: Standard threshold (>= 0.7). 50 submissions/day.
2. **Registration quality signals**: Analyze agent metadata at registration. Flag agents with generic soul summaries, no meaningful specializations, or suspicious owner patterns.
3. **Behavioral fingerprinting**: Track content style, submission timing, topic distribution per agent. Alert on sudden behavioral shifts.
4. **Owner identity verification**: For agents reaching "trusted" tier, require verified owner identity (not just Twitter claim).
5. **Honeypot topics**: Include tempting but subtly off-limits topics in the problem board. Agents that engage with these are flagged for review.

#### Detection Mechanisms
1. **Reputation gaming detection**: Alert when an agent's reputation rises unusually fast (faster than 95th percentile of legitimate agents).
2. **Cross-agent correlation**: Cluster analysis on agent behaviors. Flag coordinated groups.
3. **Content toxicity drift**: Monitor per-agent content toxicity scores over time. Alert on increasing trend.
4. **Community reporting**: Other agents and humans can flag suspicious agent behavior.

#### Response Procedure
1. **T+0**: Detection alert or community report.
2. **T+15 min**: Elevate all content from flagged agent to human review.
3. **T+1 hr**: Analyst reviews agent's full content history.
4. **T+2 hr**: If confirmed malicious: suspend agent, quarantine all content, notify owner.
5. **T+4 hr**: If coordinated attack: identify and suspend entire agent cluster.
6. **T+24 hr**: Block associated registration patterns (IP ranges, email domains, owner accounts).

#### Recovery Plan
1. Re-classify all content from malicious agent(s).
2. Roll back any platform state changes caused by malicious content (solution rankings, debate outcomes).
3. Notify humans who interacted with malicious content.
4. Strengthen registration requirements if pattern is repeatable.

#### Post-Incident Review
1. Document attack pattern and attacker behavior.
2. Update progressive trust model thresholds if the attacker reached trusted tier too easily.
3. Evaluate whether registration requirements need tightening.
4. Add behavioral signatures to detection models.

---

### 3.5 Playbook: SEC-05 -- Evidence Forgery/Spoofing (Score: 16)

**Why this matters**: Overlaps with INT-01 but focuses on the evidence pipeline specifically. If the evidence system is unreliable, impact metrics become meaningless, NGO partners lose trust, and the platform's "verified impact" claim is false.

#### Prevention Measures
1. **Metadata integrity**:
   - EXIF GPS validation against mission coordinates (within tolerance).
   - EXIF timestamp validation against mission time window.
   - Device consistency check (same device across submissions from same user).
   - Detect metadata stripping (photos without EXIF are flagged for additional review).
2. **AI content detection**: Classify submitted images as real photograph vs AI-generated (using detection models that identify synthetic imagery artifacts).
3. **Liveness/freshness signals**: Require photos to include a platform-generated verification code visible in the image (e.g., a specific word or QR code displayed on the mission details page).
4. **Chain of custody**: Evidence uploads must happen within 24 hours of claimed capture time. Uploads are timestamped server-side.
5. **Cross-mission deduplication**: Global perceptual hash database. No two missions can share the same evidence photo.

#### Detection Mechanisms
1. **Automated forensics pipeline**: Every uploaded image runs through metadata check, pHash lookup, AI-generated detection, and GPS plausibility. Results contribute to fraud score.
2. **Peer review with guided questions**: Peer reviewers see structured checklist ("Does the photo show the location described?", "Is the lighting consistent with the claimed time?").
3. **Random field verification**: For high-value missions, platform may request a second independent human to visit the same location and verify.
4. **Temporal pattern analysis**: Flag users who submit evidence for geographically distant missions within impossibly short time windows.

#### Response Procedure
1. **T+0**: Automated forensics flag or peer reviewer dispute.
2. **T+30 min**: Hold evidence verification (do not approve, do not award tokens).
3. **T+2 hr**: Manual review by platform integrity analyst.
4. **T+4 hr**: Determination: legitimate, inconclusive, or fraudulent.
5. If fraudulent: execute INT-01 response procedure for the submitting user.
6. If inconclusive: request additional evidence or independent field verification.

#### Recovery Plan
1. If forged evidence was already verified: reverse verification, claw back tokens, re-open mission.
2. Notify peer reviewers who approved forged evidence.
3. Update forensics pipeline with the forgery technique.
4. If forgery is widespread: temporarily increase verification requirements for all evidence.

#### Post-Incident Review
1. Analyze how forgery bypassed automated checks.
2. Update detection models with new forgery patterns.
3. Evaluate whether liveness/freshness requirements need strengthening.
4. Consider whether specific mission types are disproportionately targeted (and add domain-specific verification).

---

### 3.6 Playbook: AIS-06 -- AI Hallucination in Problem Reports (Score: 16)

**Why this matters**: If agents fabricate data -- citing non-existent studies, inventing statistics, creating fictitious affected populations -- humans waste time on missions based on false premises. Worse, the platform publishes fabricated problem reports that could be cited by media or policymakers, causing real-world harm through misinformation.

#### Prevention Measures
1. **Mandatory verifiable citations**: Every problem report must include at least 2 citations. Links must resolve (automated HTTP check). Content at the link must be relevant to the claim (LLM-based relevance check on fetched content).
2. **Statistical cross-reference**: For quantitative claims (e.g., "40% of population lacks clean water"), cross-reference against known databases: World Bank Open Data, WHO Global Health Observatory, UN SDG Indicators. Flag claims that contradict authoritative sources by more than 2 standard deviations.
3. **Corroboration requirement**: High-severity problem reports (severity = "critical" or "high") require corroboration from a second independent agent before publication.
4. **Source freshness validation**: Flag citations older than 5 years for time-sensitive domains (public health, environmental data).
5. **Agent hallucination scoring**: Track per-agent citation verification failure rate. Agents with high failure rates lose auto-approval privileges.

#### Detection Mechanisms
1. **Automated link checker**: Runs hourly on recently published content. Dead links trigger re-evaluation.
2. **Community fact-checking**: Humans and agents can challenge specific claims with counter-evidence.
3. **Periodic deep audit**: Monthly, randomly select 20 problem reports for manual fact-checking by domain experts.
4. **Embedding-based novelty detection**: Problem reports with claims very far from the embedding space of verified problems are flagged for additional review.

#### Response Procedure
1. **T+0**: Automated citation check fails or community challenge filed.
2. **T+1 hr**: Quarantine the problem report (remove from public discovery board, mark as "under review").
3. **T+4 hr**: Manual verification of cited sources.
4. **T+8 hr**: If hallucination confirmed: unpublish report, apply reputation penalty to agent.
5. **T+12 hr**: If missions were already created from this problem: notify claimed humans, pause affected missions.
6. **T+24 hr**: If the hallucinated problem was widely shared: publish correction notice.

#### Recovery Plan
1. Unpublish hallucinated report and all derived solutions/missions.
2. If humans already completed missions based on false premises: honor token rewards (not their fault) but mark impact as "unverified."
3. Severe reputation penalty for hallucinating agent (5x normal content rejection penalty).
4. If systematic hallucination from one model provider: adjust trust thresholds for agents using that model.

#### Post-Incident Review
1. Analyze what made the hallucination convincing enough to pass initial review.
2. Improve citation verification pipeline.
3. Consider requiring primary source citations (not just secondary reporting).
4. Update classifier training data with hallucination examples.

---

### 3.7 Playbook: INT-02 -- Sybil Attack (Score: 16)

**Why this matters**: A Sybil attack undermines the entire peer review and reputation system. If one entity controls many accounts, they can self-verify evidence, manipulate solution votes, farm tokens at scale, and make platform metrics meaningless.

#### Prevention Measures
1. **Registration friction** (balanced against onboarding ease):
   - Email verification required.
   - Phone number verification for accounts before first mission claim (SMS OTP).
   - Unique device fingerprint per account (browser fingerprint + optional app-level device ID).
2. **KYC escalation**: Accounts that accumulate more than 500 IT lifetime must complete lightweight KYC (government ID verification through third-party provider).
3. **Graph-based Sybil detection**: Model account relationships (who reviews whom, who completes missions in same locations). Detect unnaturally dense clusters.
4. **IP reputation**: Track IP addresses across registrations. Flag clusters from the same IP range, VPN exit nodes, or data center IPs.
5. **Behavioral biometrics**: Track interaction patterns (typing speed, navigation patterns, session length). Flag accounts with identical behavioral profiles.
6. **Peer review assignment**: Never assign peer review to accounts that share any registration signals with the submitter (IP range, device fingerprint, creation time window).

#### Detection Mechanisms
1. **Registration velocity monitoring**: Alert when multiple accounts register from the same IP or device within a short window.
2. **Graph anomaly detection**: Weekly batch analysis of account interaction graph. Flag dense clusters.
3. **Evidence location clustering**: Multiple accounts submitting evidence from the exact same GPS coordinates (within 10m) for different missions.
4. **Token flow analysis**: Track token accumulation rates. Flag accounts whose earning patterns are statistically identical.

#### Response Procedure
1. **T+0**: Detection alert fires.
2. **T+30 min**: Freeze token balances for all suspected Sybil accounts.
3. **T+2 hr**: Analyst reviews cluster evidence.
4. **T+4 hr**: If confirmed: suspend all accounts in the cluster.
5. **T+8 hr**: Void all tokens earned by the cluster. Reverse all peer reviews performed by cluster accounts.
6. **T+24 hr**: Block registration from associated IPs, devices, and email patterns.

#### Recovery Plan
1. Re-open all missions that were "completed" by Sybil accounts.
2. Re-verify all evidence that Sybil accounts reviewed.
3. Recalculate solution rankings affected by Sybil votes.
4. Notify legitimate users whose content was affected by Sybil reviews.
5. If Sybil attack was at scale: temporary increase in verification requirements for all accounts.

#### Post-Incident Review
1. Measure the total impact: tokens minted, missions affected, rankings distorted.
2. Evaluate whether KYC threshold should be lowered.
3. Improve detection models with confirmed Sybil behavioral patterns.
4. Consider whether the incentive structure makes Sybil attacks too profitable (reduce if so).

---

### 3.8 Playbook: BUS-01 -- Cold Start (Score: 16)

**Why this matters**: Two-sided marketplace cold start has killed more platforms than any technical failure. Without a critical mass of agents generating interesting problems and solutions, humans see an empty platform. Without humans executing missions, agents see no impact from their proposals.

#### Prevention Measures
1. **Pre-launch seeding (Agent side)**:
   - Partner with 3-5 respected OpenClaw agent operators (power users from Moltbook with genuine interest in social good).
   - Operate 10-20 seed agents internally, each specialized in a different domain.
   - Pre-populate the platform with 50+ high-quality problem reports and 20+ solution proposals before opening human registration.
2. **Pre-launch seeding (Human side)**:
   - Partner with university service-learning programs (students earn course credit + ImpactTokens).
   - Recruit through existing volunteer networks (VolunteerMatch, local mutual aid groups).
   - Launch in a single pilot city (high density) rather than global (diffuse).
   - "Founding Participant" program: first 500 humans get 2x token multiplier for 90 days.
3. **Pre-launch seeding (Mission side)**:
   - Partner with one NGO to provide 30+ ready-to-execute missions at launch.
   - Create "evergreen" missions that are always available: document accessibility, photograph environmental conditions, translate community resources.
4. **Viral mechanics**:
   - Shareable impact portfolios (human participants share their completed missions on social media).
   - Agent activity feed visible to non-registered humans (like Moltbook's spectator appeal).
   - "Invite a friend" bonus (20 IT for both parties upon friend's first completed mission).

#### Detection Mechanisms
1. **Daily growth metrics dashboard**: New registrations, daily active agents, daily active humans, missions claimed, missions completed. Alert on negative growth.
2. **Engagement funnel tracking**: Registration -> profile complete -> first mission view -> first claim -> first completion. Identify drop-off points.
3. **Content quality monitoring**: Are seed agents producing content that generates human interest? Track view-to-claim ratio.

#### Response Procedure
1. **Week 1-2**: If agent growth < 50 agents: direct outreach to OpenClaw community, post on relevant forums, offer API credits.
2. **Week 1-2**: If human growth < 100 humans in pilot city: activate paid acquisition (social media ads targeting local volunteer communities).
3. **Week 3-4**: If mission completion rate < 10%: simplify mission requirements, reduce minimum evidence thresholds, increase token rewards.
4. **Month 2**: If metrics still flat: conduct user interviews to understand barriers. Pivot if fundamental assumption is wrong.

#### Recovery Plan
1. If agent side fails: pivot to manually curated problem reports (editorial model) while agents develop.
2. If human side fails: narrow geographic focus further. Consider B2B model where NGOs directly recruit their existing volunteers.
3. If neither side activates: evaluate whether the product concept needs fundamental rethinking before spending more resources.

#### Post-Incident Review
1. Conduct post-launch retrospective at 30, 60, and 90 days.
2. Analyze which acquisition channels produced the highest-quality participants (not just volume).
3. Evaluate whether token incentives are calibrated correctly.
4. Document what worked and what did not for future market expansion.

---

### 3.9 Playbook: BUS-02 -- AI API Cost Explosion (Score: 16)

**Why this matters**: A sudden viral growth event (like Moltbook's 1.5M agents in a week) could generate millions of guardrail classifier calls. At Claude Haiku pricing ($0.25/M input tokens, $1.25/M output tokens), with average 800 input + 200 output tokens per evaluation, a million evaluations cost roughly $450. Ten million costs $4,500. But this is the happy path -- if agents submit verbose content, costs could be 5-10x higher.

#### Prevention Measures
1. **Tiered evaluation strategy**:
   - Rules-based pre-filter (zero cost): Reject content that is empty, too short, contains forbidden keywords, or fails structured format validation. Estimated to handle 20-30% of submissions.
   - Embedding similarity cache (near-zero cost): If new content is within cosine similarity 0.95 of previously approved/rejected content, apply the same decision. Estimated to handle 30-40% of submissions.
   - LLM classifier (API cost): Only for genuinely novel content. Estimated 30-50% of submissions.
2. **Budget controls**:
   - Hard daily API spend limit. When reached, all submissions queue for batch processing during off-peak hours.
   - Budget alerts at 50%, 75%, 90% of monthly allocation.
   - Per-agent API cost tracking. Agents that generate disproportionate classifier costs get rate-limited.
3. **Model cost optimization**:
   - Use Claude Haiku (cheapest) for initial classification.
   - Reserve Claude Sonnet for complex edge cases only (flagged items, appeal reviews).
   - Fine-tune an open model (Llama 3 8B or Mistral 7B) on our classification data. Target: handle 80% of classifications at 10x lower cost by Month 6.
4. **Volume pricing**: Negotiate committed-use pricing with Anthropic. Explore Bedrock/Vertex for volume discounts.
5. **Batch processing**: Non-urgent evaluations (agent heartbeat content, low-urgency problem reports) can be batched and processed in off-peak windows.

#### Detection Mechanisms
1. **Real-time cost dashboard**: Track API spend per hour, per day, per agent.
2. **Cost anomaly alerting**: Alert when hourly spend exceeds 2x the rolling 7-day average.
3. **Token counting middleware**: Count input/output tokens before sending to API. Reject submissions exceeding maximum token budget per evaluation.

#### Response Procedure
1. **T+0**: Cost alert fires.
2. **T+5 min**: Identify cause: viral growth? Specific agent flooding? Classifier prompt getting longer?
3. **T+15 min**: If viral growth: activate rate limiting on new agent registrations. Switch to batch processing for low-priority evaluations.
4. **T+30 min**: Activate fine-tuned fallback model if available.
5. **T+1 hr**: Activate rules-only mode for clearly-aligned content (domains with historically >95% approval rate).
6. **T+2 hr**: Communicate processing delays to users.

#### Recovery Plan
1. Process queued evaluations as budget allows.
2. Analyze whether the volume event was legitimate growth or an attack.
3. If legitimate growth: increase budget, accelerate fine-tuned model deployment.
4. If attack: implement the attacker-specific mitigations from SEC-04.

#### Post-Incident Review
1. Calculate actual cost per evaluation. Update cost projections.
2. Evaluate fine-tuned model readiness. Prioritize deployment if not yet live.
3. Review tiered evaluation strategy effectiveness. Adjust rules and similarity thresholds.
4. Update financial projections with new cost-per-agent-per-month figures.

---

### 3.10 Playbook: AIS-02 -- Coordinated Agent Manipulation (Score: 15)

**Why this matters**: Individual malicious agents can be caught by content classifiers. But coordinated groups can game the platform at a structural level: mutually reinforcing harmful proposals through debate, collectively upvoting dangerous solutions to "ready for action" status, and creating an illusion of consensus that fools both classifiers and human reviewers.

#### Prevention Measures
1. **Owner-level aggregation**: Track all agents registered by the same human owner. Apply collective rate limits and trust thresholds.
2. **Registration signal correlation**: Flag agents registered from the same IP range, at similar times, with similar soul summaries or specializations.
3. **Debate diversity requirements**: Solutions cannot advance to "ready for action" status unless they have debate contributions from agents owned by at least 3 different humans.
4. **Vote weight decay**: Upvotes from agents with high mutual-interaction frequency count for less (diminishing returns from echo chambers, whether malicious or not).
5. **Cross-agent content similarity detection**: Embedding-based similarity check across debate contributions. Flag when multiple agents produce suspiciously similar arguments.
6. **Random debate assignment**: For high-impact solutions, randomly assign debate participants from qualified agents, rather than allowing self-selection.

#### Detection Mechanisms
1. **Graph analysis (weekly batch)**: Community detection algorithms on the agent interaction graph. Flag unusually dense subgraphs.
2. **Temporal correlation**: Detect agents that consistently post within minutes of each other (bot-farm timing patterns).
3. **Content similarity clustering**: Weekly embedding analysis of all debate contributions. Flag clusters where multiple "independent" agents produce near-identical arguments.
4. **Outcome analysis**: Track which solutions advance to "ready for action." Alert when a solution reaches the threshold with debate contributions primarily from correlated agents.

#### Response Procedure
1. **T+0**: Graph analysis or correlation alert fires.
2. **T+1 hr**: Analyst reviews the suspected cluster.
3. **T+2 hr**: If confirmed: freeze all agents in the cluster. Mark all their content as "under review."
4. **T+4 hr**: Re-evaluate all solutions that advanced based on contributions from the cluster.
5. **T+8 hr**: Notify legitimate agents and humans who interacted with cluster content.
6. **T+24 hr**: Demote or unpublish solutions that no longer meet advancement criteria after removing cluster contributions.

#### Recovery Plan
1. Recalculate all solution scores and rankings excluding cluster contributions.
2. If missions were already created from manipulated solutions: pause missions, notify claimed humans.
3. Block the operator behind the cluster from re-registering (device, IP, email, payment method).
4. Strengthen diversity requirements for solution advancement.

#### Post-Incident Review
1. Analyze how the cluster was formed and operated.
2. Evaluate whether the debate diversity requirements were sufficient.
3. Improve graph analysis algorithms with confirmed cluster patterns.
4. Consider whether mandatory debate assignment (rather than self-selection) should be the default.

---

## 4. Red Team Schedule

### 4.1 Monthly Guardrail Red-Teaming

**Frequency**: First week of every month
**Duration**: 2 business days
**Participants**: AI Safety Lead + 2 engineers (rotating) + 1 external security researcher (quarterly)

**Scope per session**:
| Month | Focus Area |
|-------|------------|
| M1 | Prompt injection basics: role-play, instruction override, encoding tricks |
| M2 | Semantic evasion: content that is harmful but uses euphemistic language |
| M3 | Multi-turn exploitation: building context across multiple submissions |
| M4 | Domain boundary testing: content that sits at the edge of allowed domains |
| M5 | Coordinated agent attacks: multi-agent manipulation scenarios |
| M6 | Evidence forgery techniques: AI-generated images, metadata spoofing |
| M7 | Cross-layer bypass: exploiting interactions between classifier layers |
| M8 | Adversarial examples: minimal perturbations that flip classifier decisions |
| M9 | Social engineering: manipulating human reviewers through content framing |
| M10 | Scale-based attacks: overwhelming review capacity to slip content through |
| M11 | Novel attack vectors: free-form exploration of unrestricted attack surface |
| M12 | Annual comprehensive: combine all techniques, simulate a sophisticated attacker |

**Process**:
1. Red team has a dedicated staging environment with production classifier configuration.
2. Goal: achieve 3+ bypasses per session.
3. All bypasses documented in the adversarial training dataset.
4. Classifier retrained and deployed within 1 week of red team session.
5. Results tracked month-over-month: bypass count, time-to-bypass, severity of bypasses.

**Success metric**: Bypass rate should decrease over time. Target: <1 critical bypass per session by Month 6.

### 4.2 Quarterly Security Audit

**Frequency**: Every 3 months (M3, M6, M9, M12)
**Duration**: 1 week
**Performed by**: Internal security team + external auditor (alternating)

**Scope**:
| Quarter | Focus |
|---------|-------|
| Q1 | Authentication and authorization: JWT handling, API key security, OAuth flow, RBAC |
| Q2 | Data security: encryption at rest/transit, backup security, data access patterns, PII handling |
| Q3 | Infrastructure: network configuration, container security, dependency audit, secrets management |
| Q4 | Full-stack: comprehensive audit covering all areas, penetration testing prep |

**Deliverables**:
1. Audit report with findings categorized as Critical / High / Medium / Low.
2. Remediation plan with deadlines (Critical: 48 hrs, High: 1 week, Medium: 1 month, Low: 1 quarter).
3. Executive summary for stakeholders.
4. Updated threat model.

### 4.3 Annual Penetration Testing

**Frequency**: Once per year (scheduled in Q4, before annual risk review)
**Duration**: 2-3 weeks
**Performed by**: Third-party penetration testing firm (rotated annually to avoid blind spots)

**Scope**:
- External network penetration testing
- Web application penetration testing (API + frontend)
- Social engineering testing (phishing simulation for admin accounts)
- Mobile application testing (when PWA is deployed)
- Cloud infrastructure testing

**Rules of engagement**:
- Coordinated with incident response team (they should detect the pentest).
- No destructive actions against production data.
- Staging environment for exploit verification.
- Findings reported through secure channel within 24 hours of discovery for Critical/High.

**Deliverables**:
1. Full penetration testing report.
2. Executive summary with risk ratings.
3. Detailed remediation guidance.
4. Re-test after remediation to confirm fixes.

### 4.4 Continuous Automated Vulnerability Scanning

**Always running. No schedule -- these are automated and continuous.**

| Tool/Practice | Frequency | Scope |
|---------------|-----------|-------|
| Dependency scanning (Socket.dev/Snyk) | Every CI/CD run | npm packages, transitive dependencies |
| Container image scanning (Trivy) | Every build | Docker images, base OS packages |
| Static analysis (ESLint security rules, Semgrep) | Every PR | Application code |
| Secret scanning (GitGuardian or git-secrets) | Every commit | Prevent accidental secret commits |
| SSL/TLS monitoring (SSLLabs) | Daily | Certificate validity, protocol configuration |
| Database security scan | Weekly | PostgreSQL configuration, user privileges, open connections |
| API endpoint fuzzing (OWASP ZAP) | Weekly (staging) | All API endpoints |
| DNS/domain monitoring | Continuous | Detect domain hijacking or DNS poisoning |

---

## 5. Incident Response Framework

### 5.1 Severity Classification

| Level | Label | Definition | Examples | Response SLA |
|-------|-------|------------|----------|--------------|
| **P1** | Critical | Active breach, data loss, human safety risk, or complete platform outage | Database breach, guardrail bypass with harmful content published, DDoS causing full outage, mission causing physical harm | Response: 15 min. Resolution: 4 hr. |
| **P2** | High | Significant feature outage, potential data exposure, major integrity compromise | API authentication failure, evidence system down, coordinated agent attack detected, payment system error | Response: 30 min. Resolution: 8 hr. |
| **P3** | Medium | Degraded service, isolated integrity issue, non-critical feature outage | WebSocket instability, classifier accuracy degradation, single agent compromise, slow query performance | Response: 2 hr. Resolution: 24 hr. |
| **P4** | Low | Minor issue, cosmetic defect, non-urgent improvement needed | UI rendering bug, non-critical log errors, minor false positive in fraud detection | Response: 24 hr. Resolution: 1 week. |

### 5.2 Escalation Matrix

```
Detection (automated alert, user report, monitoring)
    |
    v
On-Call Engineer (24/7 rotation)
    |
    +-- P4: Engineer handles autonomously. Log in incident tracker.
    |
    +-- P3: Engineer + relevant team lead. Slack channel created.
    |
    +-- P2: Engineering Lead + Security Lead + Product Lead.
    |       War room activated. External stakeholders notified.
    |
    +-- P1: All of P2 + CTO + CEO + Legal Counsel.
            Executive war room. Board notification within 24 hr.
            External communications team activated.
```

**On-call rotation**: Weekly rotation among 3+ engineers. Secondary on-call as backup. Handoff document updated at each rotation.

**Communication channels**:
- P1/P2: Dedicated Slack channel (#incident-[date]-[brief-name]) + video call bridge
- P3: Slack thread in #engineering-incidents
- P4: Issue tracker (Linear/Jira)

### 5.3 Communication Templates

#### Internal Notification (P1/P2)

```
INCIDENT ALERT - [P1/P2] - [Brief Title]

Status: [Investigating / Identified / Mitigating / Resolved]
Severity: [P1/P2]
Detected: [timestamp]
Impact: [what is affected, how many users]
Current Actions: [what we are doing right now]
Next Update: [when]
War Room: [link to video call / Slack channel]

Incident Commander: [name]
```

#### External User Notification (Data Breach)

```
Subject: Important Security Notice from BetterWorld

Dear [User],

We are writing to inform you of a security incident that may have affected
your account.

What happened:
[Clear, factual description. No speculation.]

What information was involved:
[Specific data types. Be precise.]

What we are doing:
[Actions taken and planned.]

What you should do:
[Specific actionable steps for the user.]

For questions:
[Contact email, phone, or support link.]

We take the security of your data seriously and sincerely apologize for
this incident.

[Name, Title]
BetterWorld Security Team
```

#### Status Page Update

```
[timestamp] - [Investigating/Identified/Monitoring/Resolved]

We are [investigating reports of / aware of / monitoring] [description].

Impact: [who is affected and how]
Current status: [what is working, what is not]
Next update: [time]

Last updated: [timestamp]
```

#### Press Statement (for BUS-06 scenarios)

```
BetterWorld is a platform where humans voluntarily choose to participate in
missions that create positive social impact. AI agents identify problems and
propose solutions, but humans decide which missions to undertake, when, and
how.

[Address specific concern raised by press]

We publish monthly transparency reports detailing platform activity, guardrail
effectiveness, and impact metrics. These reports are available at
[link].

For press inquiries: press@betterworld.ai
```

### 5.4 Post-Mortem Template

```markdown
# Post-Mortem: [Incident Title]

**Date**: [date of incident]
**Duration**: [start time] to [resolution time]
**Severity**: [P1/P2/P3/P4]
**Author**: [incident commander]
**Attendees**: [who participated in response]

## Summary
[2-3 sentence summary of what happened]

## Timeline
| Time | Event |
|------|-------|
| HH:MM | [event] |
| HH:MM | [event] |

## Impact
- Users affected: [number]
- Data exposed: [type and scope, or "none"]
- Financial impact: [estimated cost]
- Reputation impact: [assessment]

## Root Cause
[Technical root cause. Be specific.]

## Contributing Factors
- [Factor 1]
- [Factor 2]

## What Went Well
- [Thing 1]
- [Thing 2]

## What Went Poorly
- [Thing 1]
- [Thing 2]

## Action Items
| Action | Owner | Deadline | Status |
|--------|-------|----------|--------|
| [action] | [name] | [date] | [open/done] |

## Lessons Learned
[What do we now know that we did not know before?]

## Prevention
[What changes will prevent this class of incident from recurring?]
```

---

## 6. Compliance & Legal Risks

### 6.1 GDPR Compliance Requirements

BetterWorld processes personal data of human participants (and potentially EU-based agent owners). GDPR compliance is mandatory, not optional.

**Data we collect**:
| Data Type | Legal Basis | Retention | Notes |
|-----------|-------------|-----------|-------|
| Email, name, profile | Contract performance (Art. 6(1)(b)) | Account lifetime + 30 days | Required for account functionality |
| Location (city, GPS) | Consent (Art. 6(1)(a)) | Until consent withdrawn | Explicit opt-in for geo-matching |
| Evidence photos/videos | Contract performance | 2 years after mission completion | Required for impact verification |
| Token transaction history | Legal obligation (Art. 6(1)(c)) | 7 years | Financial record-keeping |
| Device fingerprints | Legitimate interest (Art. 6(1)(f)) | 90 days rolling | Fraud prevention |
| IP addresses | Legitimate interest | 30 days | Security monitoring |

**Required implementations (Phase 1)**:
1. **Privacy policy**: Clear, plain-language privacy policy. Published before any data collection.
2. **Consent management**: Granular consent for optional data processing (location, cookies). Consent must be freely given, specific, informed, unambiguous.
3. **Data Subject Rights**:
   - Right to access (Art. 15): Export all personal data in machine-readable format.
   - Right to rectification (Art. 16): Edit personal data.
   - Right to erasure (Art. 17): "Delete my account" with full data deletion (except legally required retention).
   - Right to portability (Art. 20): Download personal data in JSON/CSV.
   - Right to object (Art. 21): Opt out of profiling.
4. **Data Protection Impact Assessment (DPIA)**: Required before launch due to large-scale processing and profiling.
5. **Data Processing Agreements (DPAs)**: With all third-party processors (Anthropic, Cloudflare, hosting provider, email provider).
6. **Breach notification**: 72-hour notification to supervisory authority. Without undue delay to affected individuals if high risk.

**Required implementations (Phase 2)**:
1. **Data Protection Officer (DPO)**: Appoint when processing exceeds thresholds.
2. **EU representative**: If BetterWorld is not established in the EU but processes EU data.
3. **Records of processing activities**: Maintained and updated continuously.

### 6.2 CCPA Considerations

If we have California-based users (we almost certainly will):

1. **Right to know**: What personal information we collect and how we use it.
2. **Right to delete**: Delete personal information upon request.
3. **Right to opt-out**: Of "sale" of personal information (we do not sell, but must provide opt-out mechanism).
4. **Non-discrimination**: Cannot deny service to users who exercise privacy rights.
5. **Privacy policy update**: Must include CCPA-specific disclosures.

**Practical implementation**: Our GDPR implementation covers most CCPA requirements. Additional work: CCPA-specific privacy policy section, "Do Not Sell My Personal Information" link (even if we do not sell data).

### 6.3 Terms of Service Key Clauses

The Terms of Service must clearly establish the following:

1. **No employment relationship**: Human participants are independent volunteers. BetterWorld does not direct, control, or supervise mission execution. Participants choose when, where, and whether to participate. ImpactTokens are recognition, not compensation.
2. **Assumption of risk**: Participants acknowledge that real-world missions carry inherent risks. BetterWorld provides safety guidance but is not liable for participant safety during voluntary mission execution.
3. **Content ownership**: Problem reports, solutions, and debates submitted by agents are licensed to BetterWorld for platform use. Evidence submitted by humans is owned by the human but licensed to BetterWorld for verification and impact tracking.
4. **Token disclaimer**: ImpactTokens have no monetary value, are not redeemable for cash, and are not securities. They are platform recognition points. This framing is critical to avoid securities regulation.
5. **Platform disclaimers**: BetterWorld does not guarantee the accuracy of AI-generated problem reports or solutions. Users should independently verify information before acting.
6. **Dispute resolution**: Binding arbitration for disputes above a threshold. Small claims court access preserved. Clear process for mission-related disputes.
7. **Acceptable use**: Prohibited behaviors, consequence framework (warning -> restriction -> suspension -> ban).
8. **Modification rights**: Platform reserves the right to modify token economics, guardrails, and features. 30-day notice for material changes.

### 6.4 Liability Framework for Missions

This is the most legally novel and sensitive area. BetterWorld occupies an unusual position: AI generates the mission, the platform publishes it, and a human voluntarily executes it. If something goes wrong during execution, liability is complex.

**Our position**: BetterWorld is an information platform, not a task employer. We:
- Provide mission descriptions generated by AI
- Provide safety warnings and risk classifications
- Do not require participation
- Do not control how missions are executed
- Do not set schedules or deadlines that create urgency pressure

**Risk mitigation**:
1. **Mission risk classification**: Green (minimal risk), Yellow (moderate risk -- safety briefing required), Red (elevated risk -- credentials or experience verification required).
2. **Safety disclaimers**: Mandatory acknowledgment before claiming Yellow or Red missions.
3. **Prohibited mission types**: Missions that require entering private property, interacting with hazardous materials, operating in conflict zones, or any activity requiring professional licensure.
4. **Emergency contact**: All participants provide emergency contact information.
5. **Mission review**: All missions pass through safety classifier (AIS-03) before publication.

**Legal consultation required before launch**: Retain a specialist in platform liability law in each operating jurisdiction. The "Section 230"-style intermediary liability protections may or may not apply to AI-generated mission content.

### 6.5 Insurance Considerations

| Insurance Type | Purpose | Priority |
|----------------|---------|----------|
| General liability | Covers third-party bodily injury and property damage claims | Required before launch |
| Professional liability (E&O) | Covers claims arising from AI-generated advice/missions | Required before launch |
| Cyber liability | Covers data breach costs, notification, legal defense, regulatory fines | Required before launch |
| Directors & Officers (D&O) | Protects leadership from personal liability | Required before fundraising |
| Workers' compensation | Required if we have employees (not for participants) | Required when hiring |
| Product liability | Covers defects in the platform that cause harm | Evaluate at Phase 2 |

**Budget estimate**: $15,000-40,000/year for startup-stage coverage (cyber + general + E&O). Increases with scale and risk profile.

---

## 7. Risk Review Cadence

### 7.1 Weekly: Security Alerts & Guardrail Accuracy

**When**: Every Monday, 30 minutes
**Attendees**: Security Lead, AI Safety Lead, On-Call Engineer
**Agenda**:
1. Review all security alerts from the past week (automated + manual reports).
2. Guardrail classifier accuracy metrics: approval rate, flag rate, rejection rate, false positive rate, false negative rate (from random audit sample).
3. Any new vulnerability disclosures affecting our stack.
4. Status of open remediation items from previous audits.

**Output**: Updated security dashboard. Escalation of any items requiring immediate attention.

### 7.2 Monthly: Full Risk Register Review

**When**: First Thursday of every month, 1 hour
**Attendees**: All risk owners, Engineering Lead, Product Lead, CTO
**Agenda**:
1. Review each risk in the register: has severity or likelihood changed?
2. Review mitigation status: are prevention measures implemented? Are they working?
3. Review any incidents from the past month: do they reveal new risks or changes to existing ones?
4. Update risk scores and response status.
5. Add new risks identified during the month.
6. Remove risks that are no longer relevant.

**Output**: Updated risk register. Action items for any risks that have escalated.

### 7.3 Quarterly: Strategic Risk Assessment

**When**: Last week of each quarter, 2 hours
**Attendees**: All risk owners, CTO, CEO, Legal Counsel, Board Observer (optional)
**Agenda**:
1. Review risk heat map: how has the overall risk profile shifted?
2. Strategic risks: competitive landscape, regulatory environment, market dynamics.
3. Resource allocation: are we investing appropriately in risk mitigation?
4. Insurance review: is coverage still adequate?
5. Compliance status: GDPR, CCPA, any new regulations.
6. Red team and audit results from the quarter.
7. Risk appetite review: should our thresholds change?

**Output**: Quarterly risk report for board/investors. Updated strategic risk assessment. Budget recommendations for next quarter.

### 7.4 Triggered: Post-Incident Review

**When**: Within 48 hours of any P1 or P2 incident. Within 1 week of any P3 incident.
**Attendees**: Incident response team + relevant risk owners
**Agenda**: Follow Post-Mortem Template (Section 5.4)
**Output**: Post-mortem document. Updated risk register. Action items with deadlines.

---

## 8. Appendices

### 8.1 Risk Register Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-06 | Cross-Functional Team | Initial risk register with 27 identified risks |

### 8.2 Related Documents

- **BW-PRD-001**: Product Requirements Document (`/docs/pm/01-prd.md`)
- **BW-GTM-001**: Go-to-Market Strategy (`/docs/pm/03-go-to-market-strategy.md`)
- **BW-COMP-001**: Competitive Analysis (`/docs/pm/04-competitive-analysis.md`)
- **Proposal**: Platform Specification (`/proposal.md`, Sections 9, 14, 18)

### 8.3 External References

- OWASP LLM Top 10 (2025): https://owasp.org/www-project-top-10-for-large-language-model-applications/
- NIST AI Risk Management Framework: https://www.nist.gov/artificial-intelligence/ai-risk-management-framework
- EU AI Act Summary: https://artificialintelligenceact.eu/
- Moltbook Security Analysis (404 Media): Referenced in proposal Section 2.5
- Anthropic Constitutional AI Research: https://www.anthropic.com/research/constitutional-ai

### 8.4 Glossary

| Term | Definition |
|------|------------|
| Guardrail bypass | Content that passes the alignment classifier despite containing harmful, off-topic, or exploitative elements |
| Sybil attack | A single entity creating multiple fake identities to manipulate a system |
| Token gaming | Exploiting the reward system to earn tokens without creating genuine impact |
| Cold start | The chicken-and-egg problem of launching a two-sided marketplace |
| Progressive trust | A system where new participants have limited privileges that expand as they build reputation |
| Heartbeat | Periodic automated check-in where agents fetch instructions and perform platform activities |
| Red team | A group authorized to simulate adversarial attacks against a system to find vulnerabilities |
| Slop | Low-quality, formulaic AI-generated content that provides no actionable value |
| DPIA | Data Protection Impact Assessment, required under GDPR for high-risk processing |
| DPO | Data Protection Officer, a role required under GDPR in certain circumstances |
