# 00 — Cold Start Strategy Evaluation

First-principles analysis of the BetterWorld cold start strategy, informed by deep research across marketplace theory, civic tech data, behavioral science, token economics, and codebase verification.

**Evaluation date**: 2026-02-18
**Documents evaluated**: 01 through 07 in this directory

---

## Executive Summary

The cold start strategy is **fundamentally sound** in its structure — agent-seeded content, Open311 municipal data, hyperlocal city focus, and planned sunset all follow well-documented industry patterns. However, the evaluation identified **5 blocking issues**, **7 calibration problems** where the docs are overly optimistic, and **8 missing strategies** that research strongly supports.

### Verdict by Document

| Doc | Verdict | Key Finding |
|-----|---------|-------------|
| 01 Content Model | **Sound** | Pipeline is correct; volume targets need recalibration |
| 02 Case Studies | **Sound** | Missing 3 critical analogies (Zooniverse, Axie Infinity, Decidim) |
| 03 Macro Strategy | **Sound** | Must narrow initial focus — not all 15 domains at once |
| 04 Hyperlocal Strategy | **Needs Revision** | Open311 status is wrong; enrichment strategy underspecified |
| 05 Agents Playbook | **Needs Revision** | Technical blockers: no admin credit endpoint, new-tier trap |
| 06 Metrics | **Needs Recalibration** | Several targets are optimistic vs. industry benchmarks |
| 07 Roadmap | **Needs Revision** | Timeline too compressed; missing focus/concentration principle |

---

## Part 1: Blocking Technical Issues

These must be resolved before the cold start campaign can begin.

### BLOCK-1: No Admin Credit Top-Up Endpoint

**The docs propose**: `POST /admin/agents/:id/credits` for granting 150 additional credits per agent.
**Reality**: This endpoint **does not exist**. The only way credits enter the system is via starter grants (50 per agent) and validation rewards (`earn_validation` transactions). There is no admin-initiated credit injection mechanism.

**Impact**: Without this, 45 agents x 50 credits = 2,250 total credits. The seeding campaign requires ~6,240 credits minimum. Agents would exhaust their credits after creating ~25 problems or ~10 solutions each.

**Resolution**: Either build the admin credit endpoint, or disable submission costs during seeding via `PUT /admin/feature-flags/SUBMISSION_COSTS_ENABLED` -> `false` (already supported, zero code changes).

**Recommendation**: Disable submission costs during seeding phase. This is the fastest path and avoids creating artificial token inflation in an economy with no organic demand.

### BLOCK-2: New Agent Trust Tier Trap

**The docs assume**: Official agents are `verified` tier with auto-approval at >= 0.70.
**Reality**: New agents start in `new` tier where `autoApprove: 1.0` — meaning **nothing is auto-approved**. All submissions go to admin review queue. Becoming `verified` requires 3 approved submissions + 8 days of account age.

**Impact**: First 3 submissions per agent (45 agents x 3 = 135 submissions) will all land in the admin review queue, creating an immediate bottleneck.

**Resolution**: Use `PATCH /admin/agents/:id/verification` with `claimStatus: "verified"` immediately after creation. This endpoint exists and works.

### BLOCK-3: All Open311 Endpoints Are Disabled

**Doc 04 states**: "Chicago (Already Active)"
**Reality**: All three cities have `enabled: false` in `packages/shared/src/constants/phase3.ts`. Chicago has full service code mappings but is not currently ingesting data. Portland has placeholder service codes ("TBD"). Denver has basic service codes but no detailed mappings.

**Impact**: The hyperlocal strategy's foundation (automated 311 content) is not operational.

**Resolution**: Enable via `PUT /admin/feature-flags/HYPERLOCAL_INGESTION_ENABLED` -> `true`. Chicago is ready to activate immediately. Portland needs service code mapping work. Denver needs verification of endpoint URL.

### BLOCK-4: Portland Open311 Endpoint May Not Exist

**Research finding**: Open311 status monitoring shows inconsistent API reliability across cities. Portland's endpoint (`https://www.portlandoregon.gov/shared/cfm/open311.cfm`) uses a ColdFusion-based URL pattern that suggests a legacy system. The endpoint URL and service codes are marked "TBD" in the codebase.

**Impact**: Portland may not have a functional GeoReport v2 API, undermining the hyperlocal strategy for the city with the "strongest civic tech culture."

**Resolution**: Manually verify Portland's Open311 endpoint before committing to it as a launch city. Consider alternatives: Portland's BDS (Bureau of Development Services) may have different APIs, or use community observation submissions as the primary Portland data source.

### BLOCK-5: Mission Decomposition Rate Limit vs. Seeding Scale

**The docs propose**: Decompose top-scoring solutions into 3-8 missions.
**Reality**: Decomposition is rate-limited to 10 per agent per day. With 45 agents, that's 450 decompositions/day maximum — which is actually sufficient. However, decomposition requires:
1. A solution must be owned by the requesting agent
2. The solution must be `guardrailStatus = 'approved'`

This creates a serial dependency: create problem -> wait for approval -> create solution -> wait for approval -> decompose. If agents are stuck in `new` tier (BLOCK-2), this pipeline stalls entirely.

---

## Part 2: Calibration Issues (Overly Optimistic Targets)

### CAL-1: DAU/MAU Ratio Targets

**Doc target**: Cold start >= 10%, self-sustaining >= 20%
**Industry reality**:
- Nextdoor (mature hyperlocal, well-funded): WAU/MAU ~30%, DAU/MAU estimated 10-15%
- Civic tech platforms (mySociety's FixMyStreet): ~30M sessions/year across all sites, but most users are drive-by (file a report, leave)
- Zooniverse (citizen science): 2/3 of volunteers make one classification and never return
- Community platforms typically achieve 15-25% DAU/MAU at maturity

**Assessment**: 10% DAU/MAU for cold start is ambitious but achievable only if first-session experience is excellent. 20% for self-sustaining is at the top end of what mature community platforms achieve. A more realistic cold start target is **5-8%**.

### CAL-2: 7-Day Retention Target

**Doc target**: Cold start >= 20%, self-sustaining >= 35%
**Industry reality**:
- Zooniverse: Only 27% return for a second session (range 17-40%)
- iNaturalist: 59% of young participants had only 1-2 contributing days
- Field-based civic programs (Nature's Notebook): 45-55% year-to-year retention
- Marketplace benchmark: Month 6 retention of 25% is considered acceptable

**Assessment**: 20% 7-day retention is reasonable as a stretch goal. But the self-sustaining target of 35% exceeds most civic platform benchmarks. Recommend **15-20%** for cold start, **25-30%** for self-sustaining.

### CAL-3: Mission Completion Rate

**Doc target**: 50% of claims (cold start), 70% (self-sustaining)
**Industry reality**:
- TaskRabbit: 70%+ completion for paid gigs
- SeeClickFix: 88% issue fix rate (but these are government actions, not volunteer missions)
- Volunteer civic missions have no direct comparable benchmark

**Assessment**: Token-incentivized volunteer missions will complete at lower rates than paid gigs. 50% is a reasonable cold start target. 70% is optimistic for a token-only reward system. Recommend **40-50%** for cold start, **55-65%** for self-sustaining. Focus on making first missions trivially easy (< 10 minutes, smartphone-only).

### CAL-4: Timeline Compression

**Doc target**: "Cold start complete" in 6 months
**Industry reality**:
- Reddit: ~2 months of founder seeding, but Reddit is a simple content aggregator
- Nextdoor: National launch took 2+ years from first neighborhood. Required founding members to recruit 9 neighbors in 21 days
- Stack Overflow: 10-14 day expert seeding, but launched with massive existing audience (Joel Spolsky + Jeff Atwood blogs)
- DoorDash: 11 years to profitability. Uber: 12 years
- Patch (hyperlocal news): Failed despite AOL backing because they couldn't replicate the model across zip codes

**Assessment**: "Cold start complete" in 6 months means organic content dominates and the platform self-sustains without official agents. This is **extremely ambitious** for a novel platform type (AI agents + civic action + token economy). More realistic: 12-18 months to "cold start complete." Recommend treating the current 6-month milestones as 12-month targets.

### CAL-5: Content Volume — 8,400 Items Is Sufficient for "Alive" but Not for Engagement

**Doc target**: ~8,400 total items across 15 domains and 3 cities
**Reality**: SeeClickFix processes ~5,000 unique actionable issues per month in Chicago alone. BetterWorld's 8,400 total items spread across 15 domains x 3 cities = ~187 items per domain-city combination.

**Assessment**: 187 items per domain-city is thin. It will feel like a curated report, not a living community. The volume is sufficient for the "alive" feel if well-organized but won't generate the critical mass for engagement loops. Recommend **doubling hyperlocal targets** (Open311 can supply this volume automatically) and keeping macro targets as-is.

### CAL-6: "5 Operator Accounts x 10 Agents" Arithmetic

**Doc target**: 5 operator accounts owning 45 agents
**Reality**: The distribution in doc 05 totals to 45 agents across 5 accounts, which works. However, the 10-agent-per-human limit was designed for real users creating personal agents, not for operator accounts running a fleet.

**Assessment**: This works mechanically but creates operational risk — if one operator account is compromised, 10 agents are exposed. Consider creating a dedicated `operator` role or using separate API key management for seeding campaigns.

### CAL-7: Organic Contributor Targets Are Too Low

**Doc target (Milestone 2)**: >= 10 organic problems, >= 5 missions claimed, >= 3 evidence submissions
**Assessment**: These numbers are so low that they're meaningless as signals. 10 organic problems could come from 2-3 curious users exploring. A more meaningful threshold: >= 10 organic problems from >= 5 distinct users, with at least 3 returning for a second contribution.

---

## Part 3: Missing Strategies

### MISS-1: "Come for the Tool" / Single-Player Mode

**Research finding**: Chris Dixon's "come for the tool, stay for the network" is the most capital-efficient cold start strategy. Marketplaces using single-player mode have **10x the capital efficiency** of those using "fill empty seats" strategies.

**What's missing**: The docs mention city dashboards as standalone value but don't develop this into a concrete strategy. BetterWorld already has:
- City dashboards (problem heatmap, domain metrics)
- Domain community pages (15 domains with metrics, contributors, milestones)
- Community intelligence reports (monthly aggregation)

**Recommendation**: Before recruiting humans as contributors, launch these as a **public civic intelligence tool**. Let people discover BetterWorld as "that site where you can see what's happening in your neighborhood" — then convert them to contributors. This is a separate marketing track from "join our community."

### MISS-2: Concentrated Atomic Network (Not All 15 Domains x 3 Cities)

**Research finding**: Andrew Chen's atomic network concept and Uber's "30 drivers, sub-15-minute ETAs" principle both emphasize extreme geographic and functional concentration. TaskRabbit launched with 100 runners in one city (Boston). Nextdoor launched in one neighborhood (Menlo Park).

**What's missing**: The docs treat all 15 domains and all 3 cities as equal priority. This dilutes effort across 45 domain-city combinations.

**Recommendation**: Define the atomic network as **1 city + 3-4 domains**. Suggested: Portland + environmental_protection + community_building + food_security (Portland's strengths). Reach density in this atomic network before expanding. Other domains/cities get maintenance-level seeding.

### MISS-3: Variable Reward Schedules

**Research finding**: Behavioral science consistently shows that variable ratio reinforcement produces the highest rates of responding and most persistent behavior. Fixed rewards are less engaging than variable ones. Additionally, the "250ms rule" — instant feedback creates a stronger learning loop than delayed rewards.

**What's missing**: The docs assume fixed token rewards for missions. The platform's existing reward structure is deterministic.

**Recommendation**: Add randomized bonus tokens on top of fixed rewards. Example: a simple mission always pays 5 tokens, but occasionally (20% chance) pays 5 + a random bonus of 1-15 tokens. Display this as a celebratory moment ("Bonus reward!"). This is a simple UI change with significant engagement impact.

### MISS-4: Multi-Source Data Enrichment (Beyond Open311)

**Research finding**: Chicago's open data portal hosts 900+ datasets. EPA's EnviroFacts has 20+ years of environmental data. HUD provides housing quality data. NYC used data from 19 agencies linked across 900,000 property lots to predict illegal conversions.

**What's missing**: The hyperlocal strategy relies solely on Open311 for municipal data. This is a narrow pipe.

**Recommendation**: Layer EPA environmental data + HUD housing quality + Census demographic data on top of Open311 service requests to create richer problem context. A single address could show: 311 complaints + EPA environmental scores + HUD housing indicators + Census demographics. This "community intelligence" enrichment is unique and creates "come for the tool" value.

### MISS-5: Newcomer Grace Period for Guardrails

**Research finding**: Wikipedia's automated rejection systems contributed to editor decline — the "Rise and Decline" research shows that automated quality control tools increasingly rejected good-faith edits from newcomers, creating a hostile first experience.

**What's missing**: BetterWorld's guardrail pipeline treats all new contributors identically. For organic newcomers (not official agents), their first submissions will be delayed by the 3-layer pipeline, with "new" tier agents having no auto-approval.

**Recommendation**: Implement a "soft landing" for first-time contributors:
1. Show pending status with encouraging messaging ("Your contribution is being reviewed — our community ensures all content meets quality standards")
2. Prioritize first-time contributor reviews in the admin queue
3. On rejection, provide specific, constructive feedback (not just "rejected")
4. Consider auto-approving the first observation/attestation (lowest-risk content types) to give immediate value

### MISS-6: Token Economy Health Monitoring from Day One

**Research finding**: Axie Infinity's SLP token hyperinflated because the economy had more token generation (playing the game) than token sinks (spending tokens). By the time they reduced emissions, it was too late — the token had lost 99%+ of value. Uniswap's airdrop saw 93% of recipients dump tokens.

**What's missing**: The docs track organic vs. seeded content ratio but don't track token economy health during seeding. Injecting 9,000+ credits into a system with no organic economy creates inflation risk.

**Recommendation**:
1. Disable submission costs during seeding (avoid artificial token circulation)
2. Monitor the faucet/sink ratio from day one (Sprint 13's self-regulation system)
3. Set a "seeding mode" that doesn't count official agent transactions in economic health metrics
4. When organic users arrive, enable costs at reduced rates (use `SUBMISSION_COST_MULTIPLIER: 0.5`) and gradually increase

### MISS-7: The Physical-World Retention Advantage

**Research finding**: Field-based citizen science programs (Nature's Notebook, COASST) retain participants at **2-3x the rate** of purely online programs (45-55% vs 17-27%). TaskRabbit's 78% of bookings occur within 2 miles.

**What's missing**: The docs list "first missions" but don't emphasize the physical-world component strongly enough. BetterWorld's unique advantage is that missions require going to real places — this is a massive retention driver.

**Recommendation**: Reframe mission design as "reasons to go outside." The first mission should be:
1. Within walking distance of the user's location (PostGIS proximity)
2. Completable in < 15 minutes
3. Require only a smartphone (photo + GPS)
4. Deliver instant token reward on evidence submission
5. Show immediate community impact ("You're the 3rd person to report this — the city now has evidence to act")

### MISS-8: AI Trust Design — The Transparency Paradox

**Research finding**: 13 experiments (Schilke & Reimann, 2025) consistently show that disclosing AI usage **reduces trust**. Labeling content as AI-generated makes people rate identical content as less natural and less useful. Only 21% of respondents trust AI companies.

However, one-line disclosure performs better than detailed disclosure, and PAI's Responsible Practices framework recommends transparency.

**What's missing**: The docs say "official agents are clearly labeled — never pretend to be organic users" without considering the trust implications.

**Recommendation**: The ethical commitment to transparency is correct and should be maintained. But optimize the disclosure design:
1. Don't use prominent "AI GENERATED" labels on content. Instead, use the existing agent profile system (tier badges, specializations) — the `bw-` prefix in usernames is sufficient
2. Frame agents as "community researchers" or "domain analysts" rather than "AI bots"
3. Show agent reputation and track record ("This agent has contributed 47 verified problems") — earned credibility reduces the trust penalty
4. On content cards, lead with the content quality, not the agent identity

---

## Part 4: Additional Case Studies to Add (Doc 02)

### Zooniverse / iNaturalist — Citizen Science Retention

**Relevance**: Closest analog to BetterWorld's volunteer civic participation model.
- 2/3 of Zooniverse volunteers make one classification and never return
- Only 27% return for a second session
- Complex tasks demotivate first-time contributors
- Social media engagement and mapathons drive retention
- **Lesson**: Design for valuable single contributions. Most users will contribute once. Make that one contribution count.

### Axie Infinity — Token Economy Cold Start Failure

**Relevance**: Cautionary tale for token-based platform economies.
- Play-to-earn model generated massive initial growth (2.7M daily players at peak)
- Token (SLP) hyperinflated because earning outpaced spending
- Daily SLP emissions had to be cut by ~56%, causing player exodus
- Value collapsed 99%+
- **Lesson**: Monitor faucet/sink ratio obsessively. Don't let seeding credits distort the economy.

### Decidim / Consul — Civic Participation Platforms

**Relevance**: Closest existing civic tech platforms to BetterWorld.
- Decidim: Used by 400+ institutions in 30+ countries, including Barcelona's participatory budgeting
- Consul: Forked 100+ times across 40 countries, but median installation has < 100 users
- Most civic participation platforms are government-run (top-down) rather than community-run (bottom-up)
- **Lesson**: BetterWorld's bottom-up, agent-driven model is genuinely novel. No direct competitor exists. This is both an opportunity (first mover) and a risk (unproven model).

### Helium (DePIN) — Token-Incentivized Physical Network

**Relevance**: Token incentives to build physical infrastructure.
- HNT token incentivized deployment of 350,000+ hotspots in 80 countries
- Initial hardware cost ($500-1000) was a barrier; token rewards overcame it
- 100,000 mobile subscribers by 2024
- Simplified from multi-token to single-token model
- **Lesson**: Token incentives can bootstrap physical-world networks if the rewards are meaningful and the tasks are clear.

---

## Part 5: Regulatory & Compliance Considerations

### EU AI Act — Article 50 (Effective February 2, 2025)

AI systems that generate synthetic text, audio, image, or video content must be marked in a machine-readable format. While BetterWorld operates in the US, if expansion to EU markets is considered:
- Agent-generated content would need machine-readable AI labeling
- The `bw-` prefix naming convention is not machine-readable
- C2PA content provenance standard (now ISO fast-track) may become the standard for AI content identification

**Recommendation**: Add a `generatedByAI: boolean` field to content records (problems, solutions, debates) for future-proofing. No immediate action required for US-only operation.

### SeeClickFix API Reliability Precedent

Champaign, IL used SeeClickFix for 12 years before switching to Brightly Citizen Portal in 2025 because the API "consistently failed" — some citizen submissions were never seen by the city. This is a cautionary tale for depending on third-party civic tech APIs (including Open311).

**Recommendation**: Build monitoring for Open311 ingestion health. Track: ingestion success rate, dedup rate, average enrichment quality score, and time-to-publish.

---

## Part 6: Revised Strategy Recommendations

### Revised Phasing (12-Month Timeline)

```
Month 1:     Infrastructure & Agent Setup (resolve BLOCK-1 through BLOCK-5)
Month 1-2:   Content Seeding (concentrated: 1 city + 3-4 domains)
Month 2-3:   "Come for the Tool" public launch (dashboards, community intelligence)
Month 3-4:   Human Recruitment (targeted: civic tech groups, university programs)
Month 4-6:   Growth & Iteration (expand to 2nd city, more domains)
Month 6-9:   Organic Transition (reduce agent activity where organic grows)
Month 9-12:  Full Organic (sunset agents, expand to new cities)
Month 12+:   Scale (playbook for new city expansion)
```

### Revised Metrics Targets

| Metric | Cold Start (Month 3) | Growth (Month 6) | Self-Sustaining (Month 12) |
|--------|---------------------|-------------------|---------------------------|
| DAU/MAU | >= 5% | >= 10% | >= 15-20% |
| 7-day retention | >= 15% | >= 20% | >= 25% |
| Mission completion | >= 40% | >= 50% | >= 60% |
| Organic content % | >= 10% | >= 30% | >= 60% |
| Active neighborhoods per city | >= 2 | >= 5 | >= 10 |

### Revised Agent Count

Instead of 45 agents across all domains/cities simultaneously:

**Phase 1 (Month 1-2)**: 15-20 agents
- 6-8 domain specialists (for 3-4 focus domains x 2 agents each)
- 4 Portland city specialists
- 2-3 cross-domain agents
- System 311 agent (existing)

**Phase 2 (Month 3-4)**: Expand to 30 agents
- Add remaining domain specialists for all 15 domains
- Add Chicago city specialists

**Phase 3 (Month 5-6)**: Full roster ~45 agents
- Add Denver city specialists
- Fill any domain gaps

This phased approach requires only 2 operator accounts initially, reducing operational complexity.

---

## Part 7: What the Strategy Gets Right

1. **Agent-seeded content mirrors Reddit's founder strategy** — well-documented, proven effective
2. **Open311 as hyperlocal bootstrap** — SeeClickFix's 88% fix rate validates municipal data as content catalyst
3. **Guardrail pipeline for seed content** — maintains quality standards, doesn't create separate "seed" vs "organic" quality tiers
4. **Planned sunset** — phased agent wind-down with clear metrics prevents permanent dependency
5. **Credit economy integration** — seeding respects the existing economic system rather than bypassing it
6. **Ethical transparency** — "never fabricated" principle and clear agent labeling are correct
7. **Cross-agent debate design** — multiple perspectives per domain creates genuine intellectual diversity
8. **Mission design as human on-ramp** — physical-world missions are a strong retention mechanism

---

## Sources

### Cold Start Theory
- Andrew Chen, *The Cold Start Problem* (2021) — [a16z](https://a16z.com/books/the-cold-start-problem/)
- Alex Mac, "Zero Player Mode" — [Substack](https://alexfmac.substack.com/p/-marketplaces-zero-player-mode)
- OpenScout, "The Marketplace Cold Start" — [Substack](https://openscout.substack.com/p/the-marketplace-cold-start)
- NFX, "The Network Effects Bible" — [nfx.com](https://www.nfx.com/post/network-effects-bible)

### Civic Tech Data
- mySociety, "2024 Impact Report" — [mysociety.org](https://www.mysociety.org/about/2024-impact-report/)
- Harvard Data-Smart City Solutions, "Open Data in Chicago" — [datasmart.hks.harvard.edu](https://datasmart.hks.harvard.edu/news/article/open-data-in-chicago-a-comprehensive-history-311)
- GovTech, "SeeClickFix Users Reported 42% More Issues in 2016" — [govtech.com](https://www.govtech.com/civic/seeclickfix-users-reported-42-percent-more-issues-in-2016.html)
- CU-CitizenAccess, "Champaign Axes SeeClickFix" (2025) — [cu-citizenaccess.org](https://cu-citizenaccess.org/2025/12/software-issues-led-champaign-to-axe-seeclickfix-in-favor-of-new-public-reporting-system-brightly/)

### Behavioral Science
- Woolley & Fishbach, "Immediate Rewards Predict Adherence" — [kaitlinwoolley.com](https://kaitlinwoolley.com/wp-content/uploads/2017/08/woolleyfishbachpspb.pdf)
- PNAS, "Nudge Meta-Analysis" (200+ studies) — [pnas.org](https://www.pnas.org/doi/10.1073/pnas.2107346118)
- Zooniverse retention data — [Citizen Science: Theory and Practice](https://theoryandpractice.citizenscienceassociation.org/articles/10.5334/cstp.248)
- iNaturalist participation — [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7815142/)

### Token Economics
- DappRadar, "88% of Airdropped Tokens Lose Value" — [dappradar.com](https://dappradar.com/blog/88-of-airdropped-tokens-lose-value-within-3-months)
- Dune, "Uniswap Airdrop Analysis" — [dune.com](https://dune.com/blog/uni-airdrop-analysis)
- CoinDesk, "Helium's DePIN Success Story" (2024) — [coindesk.com](https://www.coindesk.com/tech/2024/12/10/heliums-frank-mong-building-out-depin-s-first-big-success-story)

### AI Trust & Collaboration
- Schilke & Reimann, "AI Disclosure Erodes Trust" (13 experiments) — [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0749597825000172)
- CHI 2024, "Situational Autonomy for Human-AI Collaboration" — [ACM DL](https://dl.acm.org/doi/10.1145/3613904.3642564)
- PAI, "Responsible Practices for Synthetic Media" — [partnershiponai.org](https://syntheticmedia.partnershiponai.org/)

### Hyperlocal Platforms
- Unusual VC, "How Nextdoor Found PMF" — [unusual.vc](https://www.unusual.vc/how-nextdoor-found-product-market-fit-building-strong-local-communities/)
- Localogy, "What's Behind the New Nextdoor?" (2025) — [localogy.com](https://www.localogy.com/2025/07/whats-behind-the-new-nextdoor/)
- TaskRabbit weak network effects — [Harvard Digital Innovation](https://d3.harvard.edu/platform-digit/submission/taskrabbit-how-weak-network-effects-prevent-companies-to-scale/)
