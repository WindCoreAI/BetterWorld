# Decentralized Peer Validation & Credit Economy Systems: Research Summary

**Date:** 2026-02-09
**Purpose:** Design foundations for BetterWorld's agent-based peer validation and credit economy system
**Scope:** Existing models, best practices, failure modes, and design lessons

---

## Executive Summary

This research examines existing peer validation and token economy systems across multiple domains: social platforms (Stack Overflow, Reddit, Hive/Steemit), blockchain consensus mechanisms (Ethereum, Cardano, Chainlink), prediction markets (Polymarket, Augur), decentralized networks (The Graph, Helium, Filecoin), game economies (EVE Online), and emerging AI agent validation frameworks.

**Key Insights:**
- **Peer review incentives work best** when combined with quality metrics, time decay, and anti-collusion detection
- **Stake-based validation** effectively incentivizes honest behavior through slashing (2.5-100% stake loss)
- **Token economies require** careful balance of sources (faucets) and sinks to avoid inflation/deflation spirals
- **Gaming attacks are inevitable** - defense requires multi-layered approaches (Sybil resistance, behavioral analysis, collusion detection)
- **Agent-based validation is emerging** in 2026 with A2A protocols, but quality assurance remains challenging
- **Mechanism design principles** show fundamental tradeoffs between efficiency, incentive compatibility, individual rationality, and budget balance

---

## 1. Peer Review Incentive Systems

### Stack Overflow

**Reputation Mechanics:**
- +10 points for upvoted question/answer
- 15 reputation needed for upvotes, 125 for downvotes
- Badges as gamification layer
- 2026 update: "free votes" to help new users participate in curation before earning reputation

**What Works:**
- Voting mechanism allows quality content and experts to emerge naturally
- Reputation gates privileges progressively (editing, moderation, chat access)
- Recognition through badges drives engagement beyond points

**What Fails:**
- **Reputation gaming:** Four fraud scenarios identified - voting rings, bounty gaming, revenge voting, closing rings
- **Quality vs activity misalignment:** Reputation indicates activity level, not necessarily expertise
- **New user barriers:** High reputation requirements can discourage participation

**Design Lessons:**
- Reputation should separate activity metrics from quality metrics (signal scores)
- Public reviewer behavior increases cooperation (open review)
- Algorithmic detection of suspicious patterns needed (automated fraud detection)

### Hive/Steemit (Proof-of-Brain)

**Economic Model:**
- Steem tokens reward content creators and curators on upvotes
- Steem Power (SP) as reputation token
- Curation rewards split between creator and validators

**Critical Failures:**
- **Unsustainable inflation:** System collapses if blockchain growth can't outpace inflation
- **Misalignment:** Profitable content rewarded over compelling/quality content
- **Vote trading culture:** Circle jerks, bot manipulation, reciprocal voting regardless of quality
- **Tragedy of the commons:** Token mechanisms don't account for short-term economic thinking
- **Conclusion:** "Proof-of-Brain as a failed concept, at least in its ideal form"

**Design Lessons:**
- **Don't rely on crowdsourced stake-based content discovery alone**
- Quality gates must be separate from economic incentives
- Anti-collusion mechanisms essential from day one
- Inflation must be balanced with real network growth

### Reddit

Limited detailed research available, but known for karma-based reputation with similar gaming concerns as Stack Overflow.

---

## 2. Stake-Based Validation Systems

### Ethereum & Cardano (Proof-of-Stake)

**Honest Validator Rewards:**
- **Ethereum:** Rewards for consistent votes with majority, proposing blocks, sync committee participation
  - Sources: new ETH issuance + priority fees + MEV
  - Current annual issuance: ~0.7% (~$46M/week)
- **Cardano:** Regular rewards per epoch for ~3,000 active staking pools
  - Delegated staking without custody surrender

**Slashing Mechanisms:**
- **Ethereum:**
  - Up to 1 ETH burned before validator removal (36-day exit)
  - 50% of indexing rewards burned, 50% to whistleblower
  - Malicious validators can lose all 32 ETH
- **Cardano:**
  - No slashing risk (500 ADA safe even for bad actors)
  - Maintains decentralization but less security pressure

**Design Lessons:**
- Economic pressure protects network: rewards for honesty, slashing for bad actors
- Slashing percentage must balance security with validator participation (too harsh = low participation)
- Non-slashable delegation encourages trust relationships but may hurt decentralization

### Chainlink (Oracle Network)

**Staking v0.2 Mechanics:**
- Stakers back oracle performance with LINK tokens
- **Alerting rewards:** 7,000 LINK for valid alerts
- **Delegation rewards:** 4% rate for Node Operator Stakers
- **Slashing:** 700 LINK per node operator if valid alerting condition met (ETH/USD Data Feed)

**Key Features:**
- Modular design for expanding to additional oracle services (CCIP)
- Reward sources: staking rewards + future user fees
- Community stakers delegate without node operators controlling their stake

**Design Lessons:**
- Alert-based validation rewards incentivize active monitoring
- Proportional rewards to staked amount align interests
- Future fee-based rewards create sustainable revenue beyond inflation

### The Graph Protocol

**Three-Role System:**
- **Indexers:** Allocate stake to subgraphs, earn indexing rewards (3% annual issuance) + query fees
- **Curators:** Signal quality subgraphs, earn 10% of query fees
- **Delegators:** Delegate to indexers (not currently slashable but capability exists)

**Slashing:**
- 2.5% of indexer self-stake slashed for malicious behavior
- 50% burned, 50% to fisherman (whistleblower)
- 50% of epoch rewards burned
- Delegation not slashable currently but may be in future

**Reward Distribution:**
- Exponential rebate function for query fees
- Proportional to allocated stake on subgraphs
- Curation signal determines subgraph reward proportions

**Design Lessons:**
- Three-role separation balances different skill sets (technical, curation, capital)
- Non-slashable delegation reduces risk but enables future security upgrades
- Query fee rebates create direct utility-to-reward link

### Helium (Proof-of-Coverage)

**Validation Mechanism:**
- Hotspots prove radio coverage via cryptographic challenges
- **Roles:** Challenger (0.95% rewards), Beaconer (19.3%), Witness (77.2%)
- Tests assigned randomly and automatically

**Anti-Gaming:**
- **HIP131:** High-value areas require Call Detail Record (CDR) correlation
- Malicious actors can't fake locations without valid CDR
- Transmit scale devalued for hotspots in close proximity (overlapping coverage)

**Design Lessons:**
- Physical proof of work (coverage) harder to fake than pure computational
- Correlation with real usage data (CDR) prevents location spoofing
- Proximity penalties prevent saturation attacks

---

## 3. Anti-Gaming Mechanisms

### Known Attack Vectors

**Sybil Attacks:**
- Attacker creates multiple pseudonymous identities for disproportionate influence
- Example: Split $100 into 10 accounts for higher quadratic funding match

**Collusion:**
- **Voting rings:** Communities upvote each other repeatedly
- **Validation cartels:** Coordinated validators rubber-stamp content
- **Multi-accounting (Gnoming):** One person controls multiple accounts

**Rubber-Stamping:**
- Validators approve without genuine review to maximize rewards
- Quantity over quality validation

**Gaming Patterns (Stack Overflow):**
1. Voting Ring: Coordinated upvoting
2. Bounty Gaming: Exploiting bounty mechanics
3. Revenge Voting: Retaliatory downvoting
4. Closing Ring: Coordinated question closure

### Defense Mechanisms

**Consensus-Based (Blockchain):**
- **PoW:** Computationally expensive to create blocks (Sybil resistance)
- **PoS:** Financially risky via slashing (2.5-100% stake loss)
- **Hybrid models:** Combine staked amount, coinage, reputation, randomness

**Reputation & Behavioral Analysis:**
- **Time decay:** Old violations forgiven over time with compliant behavior
- **Weighted validation:** Recent feedback weighted higher than old
- **Quality metrics:** Separate signal scores from activity scores
- **Behavioral monitoring:** ML algorithms detect unusual patterns

**Identity & Network Analysis:**
- **Rigorous verification:** Background checks, unique user details at account creation
- **Correlation analysis:** Timestamps, donation frequency, geographic location, account age
- **Pairwise algorithms:** Donations from highly correlated users get less matching (Gitcoin)

**Economic Disincentives:**
- **Slashing:** Loss of staked capital for malicious behavior
- **Collateral locks:** Capital taken out of circulation (Filecoin: 70% of minted FIL locked)
- **Confirmation requirements:** Multiple confirmations before transaction finality (blockchain)

**Algorithmic Detection:**
- **Graph analysis:** Matching pairs signal collusion clusters
- **Real-time monitoring:** Continuous transaction and activity monitoring
- **Automated flagging:** Suspicious scenarios flagged for review

### Gitcoin Quadratic Funding

**Collusion Resistance:**
- Pairwise funding algorithm: Correlated donors eligible for less matching
- Detection via timestamps, donation frequency, geography, GitHub account age
- Community flagging + SybilScores
- MACI (Minimal Anti-Collusion Infrastructure) design

**Attack Example:**
- Attacker splits $100 into 10 accounts for higher CLR match
- Defense: Correlation analysis penalizes suspicious patterns

**Design Lessons:**
- Quadratic mechanisms incentivize many small contributions (democratic)
- But require sophisticated collusion detection
- Pairwise correlation analysis essential
- Community + algorithmic detection layered approach

---

## 4. Credit Sink/Source Balance

### Game Economies

**EVE Online (Sustained Balance):**
- Decades-long economy managed by PhD economists
- **Faucets (sources):** Quest rewards, asteroid mining, NPC bounties
- **Sinks:** Housing taxes, crafting fees, repairs, market fees
- **Lessons learned:**
  - Sensitive to supply/demand: Zydrine oversupply crashed prices 50% for 6 months
  - Developers adjusted refining rates to rebalance
  - Players stockpiled mineral until price leveled
  - **Monthly inflation rates tracked** and actively managed

**New World (Deflation Crisis):**
- Quest rewards dried up as players leveled (faucet failure)
- Sinks scaled aggressively (housing taxes, crafting, repairs)
- Severe deflation → economic collapse

**Second Life:**
- Linden dollars exchangeable for real USD
- CFO John Zdanowski actively manages supply
- Goal: steady exchange rate with USD
- Provides community transparency while controlling supply

**Design Lessons:**
- **Balance equation:** Faucets (rewards) ≈ Sinks (costs) for stable prices
- Faucets must scale with player progression (don't dry up)
- Sinks should incentivize activity without punishing participation
- PhD-level economic modeling helps but takes years (EVE: 10+ years)
- Real-time inflation tracking essential
- Community transparency builds trust

### Filecoin (Storage Network)

**Token Sources:**
- Initial allocation to storage providers, Protocol Labs, Foundation, investors
- Minting rewards for storage/retrieval services (tied to network growth)
- Dual minting: up to 770M FIL only if network reaches yottabyte in 20 years

**Token Sinks:**
- **Transaction fees:** Burned permanently (removed from supply)
- **Collateral locks:** FIL locked to secure network (70% of ~520M minted/vested)
- Slashing for unreliable storage providers

**Supply/Demand Mechanism:**
- Dynamic pricing: Storage cost rises with demand, falls with supply
- As of Sept 2022: 70% of circulating FIL locked or burned
- Network growth requires utilization → reduces available supply

**Design Lessons:**
- **Performance-based minting** prevents inflation without value (dual minting model)
- **Burns as sink** permanently reduce supply (deflationary pressure)
- **Collateral locks** remove circulating supply without permanent burn
- **Dynamic pricing** adapts to market conditions automatically

### Token Economics Principles

**Inflation Management:**
- Ethereum MVI (Minimum Viable Issuance): Keep staking ratio high but not excessive
- Current ETH: ~0.7% annual inflation, 50M staked (~3% yield)
- Insufficient inflation limits user incentives → hampers growth
- Excessive inflation → value dilution, supply/demand imbalance

**Optimal Issuance:**
- **MVI goal:** Don't extract excessive inflation tax on regular users
- Users shouldn't need to stake to avoid savings erosion
- Balance between security (validator rewards) and user value preservation

**Critical Balance:**
- Faucets (earning): Staking rewards, content rewards, validation rewards, mission completion
- Sinks (spending): Posting fees, transaction fees, collateral requirements, taxes
- **Target:** Steady circulating supply with slight deflationary pressure from burns

---

## 5. Agent-Based Validation

### Current State (2026)

**A2A (Agent-to-Agent) Protocol:**
- Linux Foundation launched June 2025
- Adopters: Adobe, Microsoft, SAP, ServiceNow, S&P Global
- Google released v0.3 (July 2025)
- Enables agents to discover capabilities and interact autonomously

**Quality Assurance Trends:**
- 94% of production agents have observability
- 71.5% have full tracing capabilities
- Assessment matured into standardized practice with specialized testing suites
- Crowdtesting: Diverse backgrounds uncover biased AI decisions and dark patterns

**Trust & Evaluation:**
- Without visibility into agent reasoning, can't debug, optimize, or build trust
- Evaluation metrics for reliability, compliance, scalability now standard
- Monitoring platforms validate tech performance and user-facing quality

### Critical Challenge: AI-Generated Peer Review Integrity

**ICLR 2026 Controversy:**
- **21% of peer reviews fully AI-generated**
- Over 50% showed AI use
- Published by Pangram Labs
- Major academic integrity concerns
- Shows risk of AI agents rubber-stamping without genuine evaluation

**Design Lessons:**
- AI agents can participate in validation but need oversight
- Quality assurance requires diverse evaluation (crowdtesting)
- Observability and tracing essential for trust
- Risk: Agents may optimize for quantity over quality
- Solution: Hybrid human-AI validation with spot checks

---

## 6. Mechanism Design Principles

### Core Properties

**Incentive Compatibility (IC):**
- Participants' best strategy is to report true preferences
- Revelation principle: Any equilibrium has equivalent mechanism where truth-telling is optimal
- Foundation of honest validation systems

**Individual Rationality (IR):**
- Participants must benefit from participation (voluntary)
- No agent worse off than not participating

**Budget Balance:**
- System revenues ≈ system expenditures
- No external subsidies required long-term

### Fundamental Tradeoffs

**Impossibility Result (Two-Sided Negotiation):**
Cannot simultaneously achieve:
1. Perfect efficiency (optimal allocation)
2. Budget balance (revenues = costs)
3. Individual rationality (voluntary participation)
4. Incentive compatibility (truthful reporting)

**VCG (Vickrey-Clarke-Groves) Mechanism:**
- Only mechanism satisfying validity, individual rationality, incentive compatibility
- BUT: Not budget balanced (payments sum > 0, requires external subsidy)

**Double-Sided Auctions:**
- Efficiency trades off with IC + IR + budget balance
- Multiple sellers and buyers create complexity

### Application to Peer Review

**Game-Theoretic Framework:**
- Model feedback reporting as a "reporting game"
- Design incentives to prompt truthful feedback while pursuing utility
- Open review (public behavior) significantly increases cooperation
- Reviewers can be rewarded for reviewing, not just outcomes

**Weighted Aggregation:**
- Weighted sum, fuzzy logic, Bayesian inference
- Weighted geometric mean enforces: "widespread, persistent violations disproportionately severe"
- Recent ratings weighted higher (time decay)

**Trust Dynamics:**
- Time-driven trust updates account for recent information importance
- Decay constant determines violation forgiveness rate
- Reputation recovery through ceased violations over time

---

## 7. Design Recommendations for BetterWorld

### System Architecture

**Three-Tier Validation:**
1. **Agent peer review** (primary): AI agents validate each other's content
2. **Human spot checks** (oversight): Random sampling + flagged content review
3. **Community appeals** (governance): Disputed validations escalate

**Credit Economy:**
- **Faucets (Earning):**
  - Peer validation rewards (quality-weighted)
  - Mission execution (evidence-verified)
  - Evidence checking (human verification)
  - Curation signals (identifying quality content)
- **Sinks (Spending):**
  - Posting questions/requests
  - Escalating disputes
  - Priority visibility/matching
  - Premium features (analytics, APIs)

### Anti-Gaming Measures

**Identity & Reputation:**
- Agent registration with credential verification (existing: bcrypt keys, Ed25519 heartbeat)
- Trust tiers (existing: "new" vs "verified")
- Reputation decay over time (force continued good behavior)
- Separate activity score from quality score

**Behavioral Analysis:**
- Pairwise correlation detection (like Gitcoin)
- Timestamp, frequency, pattern analysis
- ML-based anomaly detection for validation patterns
- Graph analysis for collusion clusters

**Economic Disincentives:**
- Stake/collateral requirement for validators (slashing for false validations)
- Validation history impacts future reward rates
- Quality metrics (agreement with spot-check humans) determine validator reputation
- Low-quality validators see reduced rewards, eventual ejection

**Validation Quality Metrics:**
- Agreement rate with human spot checks
- Agreement rate with other high-reputation validators
- Speed vs accuracy tradeoff monitoring (prevent rubber-stamping)
- Weighted by validator reputation (Chainlink-style)

### Token Economics

**Issuance (Faucets):**
- **Validation rewards:** 40% of new issuance
  - Quality-weighted (not flat rate)
  - Reputation-multiplied
  - Time-decayed (recent validations weighted higher)
- **Mission completion:** 35% of new issuance
  - Evidence-verified only
  - Impact-scaled
- **Evidence checking:** 15% of new issuance
  - Human verifiers essential
  - Quality metrics tracked
- **Network effects:** 10% of new issuance
  - Curation bonuses
  - Early adopter rewards

**Sinks:**
- **Posting fees:** Primary sink (scale with demand)
- **Priority fees:** Optional for faster matching
- **Dispute escalation:** Prevents frivolous appeals
- **Burn mechanism:** % of fees permanently removed (deflationary pressure)

**Balance Mechanisms:**
- **Target ratio:** 1.2-1.5 (slightly more sinks than faucets for deflationary pressure)
- **Dynamic fee adjustment:** If circulating supply grows >5% monthly, increase posting fees
- **Reward adjustment:** If supply shrinks, increase validation rewards
- **Dashboard:** Public transparency (EVE/Second Life model)

### Implementation Phases

**Phase 2 (Current - Human-in-the-Loop):**
- Human registration (OAuth) ✓ planned
- ImpactToken system ← focus on economics
- Mission marketplace with credit spending
- Evidence verification rewards
- Basic reputation scoring

**Phase 3 (Future - Agent Peer Validation):**
- Agent-to-agent validation API
- Validation quality metrics (agreement rates)
- Pairwise correlation detection
- Slashing/reward adjustment mechanisms
- A2A protocol integration (if standardized)

**Phase 4 (Maturity - Self-Governance):**
- Community dispute resolution
- Dynamic fee/reward adjustment algorithms
- Advanced collusion detection (graph ML)
- Reputation-weighted governance

### Key Metrics to Track

**Validation Quality:**
- Human spot-check agreement rate (target: >90%)
- Inter-validator agreement rate (target: >85%)
- Average validation time (detect rubber-stamping)
- Reputation distribution (avoid concentration)

**Economic Health:**
- Circulating supply trend (target: -1% to +2% monthly)
- Faucet/sink ratio (target: 0.8-1.0)
- Credit velocity (transaction frequency)
- Gini coefficient (wealth distribution)

**Gaming Detection:**
- Pairwise correlation clusters (>3 agents with >70% overlap)
- Validation pattern anomalies (flagged by ML)
- Timestamp clustering (coordinated attacks)
- Geographic/network correlation

---

## 8. Critical Success Factors

### Must-Haves

1. **Multi-layered validation:** Never rely on single mechanism (agents + humans + algorithms)
2. **Economic sustainability:** Faucets ≈ sinks from day one, actively managed
3. **Quality over quantity:** Reward accuracy, not just participation
4. **Progressive decentralization:** Start centralized (human spot checks), gradually reduce as system matures
5. **Transparency:** Public dashboards for economic metrics (build trust)
6. **Escape valves:** Manual overrides for edge cases, governance for disputes

### Must-Avoids

1. **Proof-of-Brain failure:** Don't let profitable content dominate quality content
2. **Unsustainable inflation:** Don't reward without real value creation
3. **Winner-take-all:** Non-slashable delegation can concentrate power
4. **Gaming blindness:** Collusion detection must be proactive, not reactive
5. **Complexity overload:** Start simple, add sophistication as attack vectors emerge
6. **Trust assumptions:** "Assume breach" mentality - agents will try to game

### Unknowns & Risks

1. **Agent validation quality:** No proven large-scale system exists yet (ICLR 2026 warning sign)
2. **Collusion sophistication:** AI agents may coordinate more effectively than humans
3. **Economic dynamics:** Token economies are hard (EVE took 10+ years to stabilize)
4. **Regulatory:** Credit systems may face legal scrutiny depending on jurisdiction
5. **Adoption:** Network effects require critical mass before value emerges

---

## Sources

### Peer Review Systems
- [Reputation Gaming in Stack Overflow](https://arxiv.org/abs/2111.07101)
- [Stack Overflow Reputation System](https://ubiminds.com/en-us/stack-overflow/)
- [The underlying problems with steemit and hive](https://hive.blog/hive/@niel96/the-underlying-problems-with-steemit-and-hive)
- [Steemit Reward System Research](https://hive.blog/steemit/@ilyastarar/how-does-steemit-reward-system-work-complete-research-paper-on-steemit-economy-and-reward-system)

### Stake-Based Validation
- [Proof-of-stake rewards and penalties | ethereum.org](https://ethereum.org/developers/docs/consensus-mechanisms/pos/rewards-and-penalties/)
- [Proof-of-Stake on Ethereum and Cardano](https://www.lidonation.com/en/posts/proof-of-stake-on-ethereum-and-cardano-running-a-validator-node/)
- [Chainlink Staking v0.2 Overview](https://blog.chain.link/chainlink-staking-v0-2-overview/)
- [Chainlink's Reward System Guide](https://thechrisverse.medium.com/chainlinks-reward-system-a-comprehensive-guide-to-incentivizing-decentralized-oracles-9683b941fe23)

### Prediction Markets
- [Oracle Design for Prediction Markets](https://www.softwareseni.com/oracle-design-and-resolution-mechanisms-for-prediction-market-outcome-verification-and-settlement-systems/)
- [The Augur and Polymarket Protocols](https://encrypthos.com/guide/the-augur-and-polymarket-protocols/)
- [Deep insights into Polymarket](https://www.chaincatcher.com/en/article/2237113)

### Anti-Gaming Mechanisms
- [Sybil Attack in Blockchain](https://hacken.io/insights/sybil-attacks/)
- [Sybil in the Haystack: Blockchain Consensus Review](https://www.mdpi.com/1999-4893/16/1/34)
- [Reputation Gaming in Crowd Technical Knowledge Sharing](https://dl.acm.org/doi/10.1145/3691627)
- [How to Attack and Defend Quadratic Funding](https://www.gitcoin.co/blog/how-to-attack-and-defend-quadratic-funding)

### Token Economics
- [Virtual Game Economies: Sinks & Faucets](https://medium.com/1kxnetwork/sinks-faucets-lessons-on-designing-effective-virtual-game-economies-c8daf6b88d05)
- [5 Insights from EVE Online](https://www.linkedin.com/pulse/5-insights-future-game-economies-from-eve-online-kiefer-zang)
- [Designing Game Economies](https://medium.com/@msahinn21/designing-game-economies-inflation-resource-management-and-balance-fa1e6c894670)
- [Filecoin Tokenomics](https://blog.filecointldr.io/filecoin-tokenomics-understanding-an-advancing-economy-ef319632ffa8)
- [Minimum Viable Issuance](https://notes.ethereum.org/@anderselowsson/MinimumViableIssuance)

### Decentralized Networks
- [The Graph Network In Depth](https://thegraph.com/blog/the-graph-network-in-depth-part-2/)
- [The Graph Tokenomics](https://thegraph.com/docs/en/resources/tokenomics/)
- [Helium Network: Proof of Coverage](https://www.gemini.com/cryptopedia/helium-network-token-map-helium-hotspot-hnt-coin)
- [Understanding HIP131 Impact](https://heliumgeek.com/faq/understanding-hip131-and-its-impact-on-your-mobile-poc-rewards.html)

### AI Agent Validation
- [Crowdtesting Trends 2026: AI Agents & Human QA](https://www.testbirds.com/en/blog/crowdtesting-trends-2026-human-intuition-in-the-age-of-agents/)
- [State of AI Agents - LangChain](https://www.langchain.com/state-of-agent-engineering)
- [ICLR 2026: 21% of Peer Reviews Are AI-Generated](https://howaiworks.ai/blog/iclr-2026-ai-generated-peer-reviews-controversy)
- [AI Agent Evaluation Guide](https://www.kore.ai/blog/ai-agents-evaluation)

### Mechanism Design
- [Breaking the traditional: algorithmic mechanism design survey](https://pmc.ncbi.nlm.nih.gov/articles/PMC10199671/)
- [Mechanism Design under Approximate Incentive Compatibility](https://arxiv.org/abs/2103.03403)
- [An incentive mechanism to reinforce truthful reports](https://www.sciencedirect.com/science/article/abs/pii/S1084804511000658)
- [The peer review game: agent-based model](https://link.springer.com/article/10.1007/s11192-018-2825-4)

### Reputation & Trust
- [The Importance of Validation and Decay In Community Reputation Metrics](https://www.jonobacon.com/2017/06/05/importance-validation-decay-community-reputation-metrics/)
- [Time decay in trust systems](https://ieeexplore.ieee.org/document/8258140)
- [A reputation assessment model for trustful service](https://www.sciencedirect.com/science/article/abs/pii/S092054892200068X)

### Security
- [Double-Spending Attacks in Blockchain](https://hacken.io/discover/double-spending/)
- [Understanding Double Spending Prevention](https://www.cyfrin.io/blog/understanding-double-spending-in-blockchain)

---

**Document Status:** Research complete
**Next Steps:** Translate findings into spec for 006-openclaw-agent-support (agent peer validation + credit economy)
**Stakeholders:** PM (system design), Engineering (API architecture), AI/ML (validation models)
