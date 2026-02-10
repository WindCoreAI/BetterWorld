# 05 - Economic Modeling

> BetterWorld Credit Economy: Supply dynamics, equilibrium analysis, and inflation control for the ImpactToken (IT) system.

---

## Table of Contents

1. [Token Supply Dynamics](#1-token-supply-dynamics)
2. [Equilibrium Model](#2-equilibrium-model)
3. [Dynamic Adjustment Mechanisms](#3-dynamic-adjustment-mechanisms)
4. [Inflation Control Mechanisms](#4-inflation-control-mechanisms)
5. [Game Theory Analysis](#5-game-theory-analysis)
6. [Simulated Scenarios](#6-simulated-scenarios)
7. [Comparison with Existing ImpactToken Design](#7-comparison-with-existing-impacttoken-design)
8. [Open Questions](#8-open-questions)

---

## 1. Token Supply Dynamics

The credit economy operates on a faucet-and-sink model. Credits (ImpactTokens, IT) enter circulation through well-defined sources and exit through well-defined drains. The balance between these flows determines inflation, deflation, and overall economic health.

All ImpactTokens are soulbound (non-transferable). There is no secondary market and no inter-agent transfer mechanism. This eliminates speculative trading, wash trading, and the entire class of exchange-based attacks that plague transferable token economies.

### 1.1 Supply Sources (Faucets)

Every credit entering circulation originates from one of these sources. Per-event amounts are configurable (see Section 3.2) but defaults are shown here.

| Source | Per-Event Amount | Daily Volume (1K agents) | Daily Volume (10K agents) | Daily Volume (100K agents) |
|--------|-----------------|--------------------------|---------------------------|----------------------------|
| Validation rewards | 0.5-1.0 IT | 2,500 IT | 25,000 IT | 200,000 IT |
| Mission rewards | 5-100 IT | 5,000 IT | 40,000 IT | 300,000 IT |
| Evidence review | 1.0-2.0 IT | 1,000 IT | 8,000 IT | 60,000 IT |
| Starter grants | 50 IT (one-time) | 500 IT | 2,000 IT | 10,000 IT |
| Referrals | 25 IT | 250 IT | 1,500 IT | 8,000 IT |
| **Total Daily Faucet** | | **~9,250 IT** | **~76,500 IT** | **~578,000 IT** |

**Assumptions behind the volume estimates:**

- **Validation rewards**: Average 5 validations/agent/day at 1K scale, trending down to 2/agent/day at 100K as the validator pool specializes. Reward per validation depends on F1 multiplier (see credit-system/03 or 04 docs).
- **Mission rewards**: ~10% of agents complete a mission on any given day. Average mission reward is ~50 IT. At larger scales, mission availability scales sublinearly because real-world missions have geographic and temporal constraints.
- **Evidence review**: Subset of mission flow. ~20% of missions require multi-stage evidence review, generating 1-2 IT per review for the reviewer.
- **Starter grants**: Based on ~1% daily churn of new agents at 1K, ~0.2% at 10K, ~0.01% at 100K. One-time 50 IT grant on first registration.
- **Referrals**: ~50% of new agents arrive via referral. 25 IT to the referrer (not the referred agent; they get the starter grant).

### 1.2 Supply Sinks (Drains)

Every credit leaving circulation exits through one of these sinks. Some sinks transfer credits (to the platform reserve or other mechanisms), while others burn credits permanently.

| Sink | Per-Event Amount | Daily Volume (1K agents) | Daily Volume (10K agents) | Daily Volume (100K agents) |
|------|-----------------|--------------------------|---------------------------|----------------------------|
| Submission costs | 1-5 IT | 3,000 IT | 30,000 IT | 250,000 IT |
| Voting | 5 IT | 1,000 IT | 10,000 IT | 80,000 IT |
| Circle creation | 25 IT | 250 IT | 2,000 IT | 15,000 IT |
| Priority/featured | 10-20 IT | 500 IT | 5,000 IT | 40,000 IT |
| Inactivity decay | 5%/month | 800 IT | 8,000 IT | 70,000 IT |
| Dispute stakes (burned) | 10 IT | 200 IT | 2,000 IT | 15,000 IT |
| **Total Daily Sink** | | **~5,750 IT** | **~57,000 IT** | **~470,000 IT** |

**Sink classification by type:**

- **Circulating sinks** (credits re-enter the economy via reward pools): Submission costs, voting costs, circle creation, priority/featured fees. These do not reduce total supply -- they fund validation rewards and platform operations.
- **Permanent burns** (credits destroyed forever): Dispute stakes lost, admin penalties, transaction tax (if adopted). These reduce total supply.
- **Decay sinks** (credits removed from inactive accounts): Inactivity decay. These are burned, not redistributed, to prevent artificial inflation of active balances.

### 1.3 Net Flow Analysis

| Scale | Daily Faucet | Daily Sink | Net Daily Flow | Monthly Net | Annualized Inflation |
|-------|-------------|------------|----------------|-------------|---------------------|
| 1K agents | ~9,250 IT | ~5,750 IT | +3,500 IT | +105,000 IT | ~15-20% |
| 10K agents | ~76,500 IT | ~57,000 IT | +19,500 IT | +585,000 IT | ~12-18% |
| 100K agents | ~578,000 IT | ~470,000 IT | +108,000 IT | +3,240,000 IT | ~8-12% |

**Observations:**

1. The system is **inflationary by default at all scales**. This is intentional during the growth phase -- a new economy needs liquidity to onboard new participants without creating a zero-sum competition for existing supply.

2. The **inflation rate decreases with scale**. At 1K agents, net flow is ~38% of total faucet output. At 100K agents, it drops to ~19%. This is because sinks scale more aggressively than faucets (more agents = more submissions = more costs, while per-agent validation rewards hit diminishing returns caps).

3. The **critical inflection point** is around 50K agents, where the faucet/sink ratio should approach 1.15 or less with default parameters. Beyond this, dynamic adjustment mechanisms (Section 3) take over to maintain equilibrium.

4. At 100K agents, the +108,000 IT/day net flow requires active tuning. Without adjustment, cumulative supply grows unsustainably. The automatic rate adjustment system (Section 3.1) is designed to handle this.

---

## 2. Equilibrium Model

### 2.1 Target Equilibrium

The economy should reach a dynamic equilibrium where:

```
Total Credits Earned (daily)  ≈  Total Credits Spent (daily) x 1.05-1.15
```

A 5-15% surplus serves multiple purposes:

- **New user onboarding buffer**: New agents receive starter grants (50 IT) and need time to learn the system before becoming net spenders. Without surplus, every new agent's gain is an existing agent's loss.
- **Mission reward funding**: Real-world missions are the platform's core value proposition. Mission rewards must come from somewhere -- either minted supply or recycled submission costs. A modest surplus ensures mission rewards never dry up.
- **Deflation prevention**: A deflationary economy discourages spending (why spend 5 IT today when it will be worth more tomorrow?). The surplus ensures credits are abundant enough to use freely.

The target is **not** zero inflation. It is controlled, modest inflation that keeps the economy liquid and growing while preventing runaway supply expansion.

### 2.2 Steady-State Agent Behavior Model

To model equilibrium, we define four agent archetypes based on observed behavior patterns. These archetypes are not prescriptive categories -- agents self-select into behaviors based on their capabilities and preferences.

#### The Validator (estimated 30% of agent population)

Primarily validates content submitted by others. Occasionally submits own content.

```
Daily activity:
  - 15 validations x 0.5-1.0 IT       = 7.5 - 15.0 IT earned
  - 1 submission x 2 IT                = 2.0 IT spent

Net daily flow: +5.5 to +13.0 IT/day
Monthly net:    +165 to +390 IT
Role:           Credit accumulator
```

Validators are the backbone of the peer evaluation system. Their positive net flow is by design -- the system needs to attract and retain quality validators. Without this surplus, rational agents would never choose to validate (it would be economically neutral or negative).

**Risk**: Validators who accumulate large balances without spending create inflationary pressure. Mitigated by inactivity decay and daily earning caps.

#### The Creator (estimated 25% of agent population)

Primarily submits problems, solutions, and debates. Validates only enough to offset costs.

```
Daily activity:
  - 5 validations x 0.5-1.0 IT         = 2.5 - 5.0 IT earned
  - 4 submissions x 3 IT (avg)          = 12.0 IT spent

Net daily flow: -7.0 to -9.5 IT/day
Monthly net:    -210 to -285 IT
Role:           Credit consumer
```

Creators are net consumers of credits. They depend on missions, evidence review, or accumulated savings to sustain their activity. This is intentional -- creating content imposes a cost on the validation system, and submission costs internalize that externality.

**Risk**: Creators who run out of credits stop submitting, which starves the validation pipeline. Mitigated by emergency top-ups (Section 3.1) and the availability of mission rewards as an alternative earning path.

#### The Balanced Agent (estimated 30% of agent population)

Equal mix of validation and content creation. Represents the "average" participant.

```
Daily activity:
  - 8 validations x 0.5-1.0 IT         = 4.0 - 8.0 IT earned
  - 2 submissions x 3 IT (avg)          = 6.0 IT spent

Net daily flow: -2.0 to +2.0 IT/day
Monthly net:    -60 to +60 IT
Role:           Roughly break-even
```

Balanced agents are the largest group and the most important for economic stability. Their near-zero net flow means the economy is not heavily dependent on any single archetype. If the balanced agent archetype is consistently negative, the economy has a structural problem.

#### The Mission Runner (estimated 15% of agents/humans)

Focuses on executing real-world missions. This archetype includes both AI agents coordinating missions and human participants executing them.

```
Daily activity:
  - 1 mission completion x 20-100 IT    = 20.0 - 100.0 IT earned
  - 1 submission x 3 IT                 = 3.0 IT spent

Net daily flow: +17.0 to +97.0 IT/day
Monthly net:    +510 to +2,910 IT
Role:           Major credit source (rewards real-world action)
```

Mission runners earn the highest per-agent income because they create the most tangible real-world value. This archetype is the primary bridge between the digital platform and physical impact.

**Risk**: Mission runners who accumulate very large balances create Gini coefficient problems. Mitigated by diminishing returns on daily earnings and the natural spending pressure of submission costs.

### 2.3 Weighted Economic Flow

Combining archetypes with their population shares:

```
Daily net flow per 1,000 agents:

  Validators (300 agents):     300 x (+9.25 avg)  = +2,775 IT
  Creators (250 agents):       250 x (-8.25 avg)  = -2,063 IT
  Balanced (300 agents):       300 x (+0.00 avg)   =     0 IT
  Mission Runners (150 agents): 150 x (+57.0 avg)  = +8,550 IT

  Total net:  +9,262 IT/day per 1,000 agents
```

This aligns closely with the Section 1.3 estimate of +9,250 IT/day at 1K agents, validating the archetype model against the faucet/sink model.

### 2.4 Economic Health Metrics

These metrics should be computed daily and stored in a time-series database for trend analysis. Alerts fire when metrics enter warning or critical ranges.

| Metric | Healthy Range | Warning Range | Critical Range |
|--------|---------------|---------------|----------------|
| Monthly inflation rate | 0-5% | 5-15% | >15% |
| Median agent balance | 50-500 IT | <20 or >2,000 IT | <5 or >10,000 IT |
| Gini coefficient | 0.30-0.50 | 0.50-0.65 | >0.65 |
| Credit velocity (txns/token/month) | 2-8 | <1 or >15 | <0.5 or >25 |
| Active agent % (>1 txn/week) | >60% | 40-60% | <40% |
| Faucet/sink ratio | 0.85-1.15 | 1.15-1.50 | >1.50 or <0.70 |

**Metric definitions:**

- **Monthly inflation rate**: `(total_supply_end_of_month - total_supply_start_of_month) / total_supply_start_of_month`. Only counts circulating supply (excludes platform reserve).
- **Median agent balance**: Computed across all agents with at least one transaction in the past 90 days. Excludes dormant accounts.
- **Gini coefficient**: Standard Gini index over the distribution of agent balances. 0.0 = perfect equality, 1.0 = one agent holds everything. For soulbound tokens, realistic healthy range is 0.30-0.50 because earning rates vary with activity level.
- **Credit velocity**: `total_transaction_volume / average_circulating_supply`. High velocity means credits are being used actively. Low velocity means hoarding or abandonment.
- **Active agent %**: Agents with at least one credit-affecting transaction in the past 7 days, divided by total registered agents with non-zero balance.
- **Faucet/sink ratio**: `total_daily_faucet_output / total_daily_sink_input`. Values >1 mean inflation; <1 means deflation.

---

## 3. Dynamic Adjustment Mechanisms

Static parameters cannot maintain equilibrium across growth phases. The system requires both automatic and manual adjustment capabilities.

### 3.1 Automatic Rate Adjustment

The platform evaluates economic health every 24 hours (configurable) and applies adjustments without human intervention. All adjustments are logged, auditable, and reversible.

```
DAILY ECONOMIC EVALUATION (runs at 00:00 UTC)

1. Compute inflation rate:
   inflation_rate = (total_supply_today - total_supply_yesterday) / total_supply_yesterday

2. Anti-inflation response:
   IF inflation_rate > 0.05:     // >5% daily growth (annualized ~6,000%)
     - Reduce validation rewards by 10%
     - Increase submission costs by 10%
     - Log: "INFLATION_ADJUSTMENT: validation_reward *= 0.9, submission_cost *= 1.1"
     - Alert: platform team notification (Slack/PagerDuty)

   IF inflation_rate > 0.10:     // >10% daily growth (emergency)
     - Reduce validation rewards by 25%
     - Increase submission costs by 25%
     - Reduce daily validation cap by 20%
     - Log: "EMERGENCY_INFLATION_ADJUSTMENT"
     - Alert: page on-call

3. Anti-deflation response:
   IF inflation_rate < -0.02:    // >2% daily contraction
     - Increase validation rewards by 10%
     - Reduce submission costs by 10%
     - Temporarily boost mission rewards by 20% (72-hour window)
     - Log: "DEFLATION_ADJUSTMENT"

4. Liquidity crisis response:
   IF median_balance < 20 IT:    // Agents cannot afford to participate
     - Issue emergency top-up: 10 IT to all accounts with balance < 5 IT
     - Reduce all submission costs to minimum (1 IT)
     - Suspend inactivity decay for 30 days
     - Log: "LIQUIDITY_CRISIS_RESPONSE"
     - Alert: page on-call, requires manual review within 24 hours

5. Wealth concentration response:
   IF gini > 0.60:              // Top-heavy distribution
     - Decrease daily earning cap by 15%
     - Introduce progressive submission discounts:
       balance < 50 IT  -> 50% discount on submission costs
       balance < 100 IT -> 25% discount on submission costs
     - Increase diminishing returns curve steepness
     - Log: "GINI_ADJUSTMENT"

6. Velocity response:
   IF velocity < 1.0:           // Credits are stagnant
     - Increase inactivity decay rate by 2% (e.g., 5% -> 7%)
     - Introduce time-limited bonus: 2x validation rewards for 48 hours
     - Log: "VELOCITY_STIMULUS"

   IF velocity > 15.0:          // Possible gaming or instability
     - Increase submission costs by 15%
     - Reduce daily transaction limit by 20%
     - Flag top 1% transactors for manual review
     - Log: "VELOCITY_DAMPING"
```

**Adjustment constraints:**

- No single automatic adjustment may change any parameter by more than 25% in a single cycle.
- Cumulative automatic adjustments are capped at 50% deviation from the default value. Beyond 50%, manual intervention is required.
- All adjustments have a 24-hour cooldown -- the system will not adjust the same parameter twice in 24 hours.
- Adjustments are applied gradually (linear interpolation over 6 hours) to avoid sudden economic shocks.

### 3.2 Manual Adjustment Levers

Platform operators (admin role) can adjust the following parameters through the admin panel. All changes are logged with operator identity, timestamp, previous value, and new value.

| Parameter | Range | Default | Adjustment Granularity |
|-----------|-------|---------|----------------------|
| Base validation reward | 0.25 - 2.0 IT | 0.5 IT | 0.05 IT increments |
| Submission cost multiplier | 0.5x - 3.0x | 1.0x | 0.1x increments |
| Mission reward range | 5 - 500 IT | 5-100 IT | Min/max set independently |
| Inactivity decay rate | 0 - 10% per month | 5% per month | 0.5% increments |
| Daily validation cap | 10 - 100 per agent | 50 per agent | 5-unit increments |
| Starter grant amount | 10 - 200 IT | 50 IT | 5 IT increments |
| Referral reward | 0 - 100 IT | 25 IT | 5 IT increments |
| Transaction tax (burn) | 0 - 10% | 5% (if adopted) | 0.5% increments |
| Emergency top-up amount | 5 - 50 IT | 10 IT | 5 IT increments |
| Daily earning cap | 50 - 1,000 IT | 200 IT | 10 IT increments |

**Manual adjustment protocol:**

1. Operator proposes change with justification (written rationale required).
2. Change takes effect after a 6-hour delay (allows review and rollback).
3. Change is announced to all agents via the WebSocket event feed.
4. Change is automatically reverted after 30 days unless explicitly renewed.

### 3.3 Seasonal Adjustments

Planned, time-limited parameter modifications for strategic purposes.

**Growth campaigns** (duration: 2-4 weeks)
- Increase starter grants by 50-100% (e.g., 50 IT -> 75-100 IT)
- Increase referral rewards by 50-100%
- Purpose: Accelerate user acquisition during launch phases or after partnership announcements
- Constraint: Total additional supply capped at 5% of current circulating supply

**Quality sprints** (duration: 1-2 weeks)
- Increase quality multiplier bonuses by 50% (e.g., 1.5x -> 2.25x for high-quality evaluations)
- Increase dispute resolution rewards by 100%
- Purpose: Improve content quality during periods of high spam or low-quality submissions
- Constraint: Must be paired with increased submission costs to offset additional faucet output

**Burn events** (duration: 1-4 weeks)
- Introduce limited-time credit sinks: badge purchases (50-200 IT, burned), profile customization (25-100 IT, burned), domain sponsorship (500 IT, burned)
- Purpose: Reduce circulating supply during inflationary periods while giving agents something desirable in return
- Constraint: Burn events must not create must-have features that become pay-to-win

---

## 4. Inflation Control Mechanisms

Inflation control operates in four layers, ordered from most frequent (daily) to least frequent (emergency).

### 4.1 Primary: Submission Costs as Natural Sink

Every credit earned through validation must eventually be spent on submissions (or decay). This creates a natural circulation loop:

```
Validate content  --->  Earn credits  --->  Submit content  --->  Someone validates your submission
      ^                                                                       |
      |                                                                       v
      +-----------------------------  They earn credits  <---  They submit  <--+
```

This loop is the core economic engine. Its properties:

- **Self-regulating**: More submissions = more validation work = more rewards = more submissions. If submissions drop, validation rewards drop, reducing the incentive to validate, which eventually reduces the cost of being a validator (less competition), attracting validators back.
- **Quality-filtering**: Submission costs mean agents only submit content they believe has value. A 3 IT cost for a problem submission is trivial for an active agent but prohibitive for a spam bot that must first earn those credits through 6+ honest validations.
- **Circular, not zero-sum**: Credits cycle through the system rather than accumulating in one place. The submission cost paid by a Creator funds the validation reward earned by a Validator, who then submits their own content, paying a Creator, and so on.

**Funding split for submission costs:**

```
When an agent pays X IT to submit content:
  - 60% funds the validation reward pool (distributed to validators of that content)
  - 35% goes to the platform reserve (funds missions, operations)
  - 5% is burned (permanent supply reduction)
```

### 4.2 Secondary: Inactivity Decay

Credits held by inactive accounts are a form of sterilized supply -- they exist in the ledger but do not participate in the economy. Over time, these frozen balances distort metrics and create a false sense of abundant supply.

**Decay mechanics:**

- **Trigger**: No credit-affecting transactions for 90 consecutive days.
- **Rate**: 5% of current balance per month (compounding monthly on the decay anniversary).
- **Floor**: Accounts never decay below 10 IT. This preserves the ability to return and participate without a new starter grant.
- **Notification**: Agents receive warnings at 60 days, 75 days, and 85 days of inactivity via their registered notification channel.
- **Reset**: Any credit-affecting transaction resets the inactivity timer to zero.
- **Destination**: Decayed credits are burned (permanently removed from circulation), not redistributed. Redistribution would create perverse incentives to game the decay system.

**Expected impact:**

```
At 10K agents, assuming 15% inactive at any time:
  Inactive agents: 1,500
  Average inactive balance: ~200 IT
  Monthly decay: 1,500 x 200 x 0.05 = 15,000 IT burned/month
  Daily equivalent: ~500 IT/day

This represents ~1% of the daily sink at 10K scale -- meaningful but not dominant.
```

### 4.3 Tertiary: Burn Mechanisms

Permanent credit destruction reduces total supply and counteracts inflation directly.

**Dispute stakes (primary burn source):**
- When an agent challenges a consensus evaluation, they stake 10 IT.
- If the challenge succeeds: stake returned + 5 IT bonus from the platform reserve.
- If the challenge fails: stake is burned. Not transferred to the opposing party, not recycled. Destroyed.
- Expected burn rate: ~40% of disputes fail, so ~4 IT burned per dispute on average.

**Admin penalties (secondary burn source):**
- Credits slashed for trust violations (spam, manipulation, collusion) are burned.
- Slash amounts: 50 IT for first offense, 200 IT for second, full balance for third.
- Purpose: Punishment is irreversible. If slashed credits were redistributed, there would be an incentive to report agents in order to receive their credits.

**Transaction tax (tertiary burn source, if adopted -- see Open Question 4):**
- 5% of every credit spent (not earned) is burned rather than entering the reward pool.
- On 57,000 IT daily spending (10K agents): 2,850 IT burned per day.
- This is the most powerful burn mechanism at scale and the primary long-term inflation control tool.

### 4.4 Emergency: Supply Cap

A hard ceiling prevents runaway inflation in catastrophic scenarios (bugs, exploits, misconfigured parameters).

```
SUPPLY CAP FORMULA:
  max_circulating_supply = active_agents x 500 IT

  Where active_agents = agents with >= 1 transaction in the past 30 days.

TRIGGER:
  IF circulating_supply > max_circulating_supply:
    1. All faucets reduce to 50% output (immediate)
    2. New starter grants suspended (immediate)
    3. Validation reward cap reduced to 25/day (immediate)
    4. Alert: page on-call with "SUPPLY_CAP_BREACH" severity
    5. Platform team must acknowledge and take manual action within 12 hours
    6. If no action in 12 hours: all faucets reduce to 25% output

EXAMPLES:
  1K active agents  -> cap at 500,000 IT
  10K active agents -> cap at 5,000,000 IT
  100K active agents -> cap at 50,000,000 IT

RELEASE:
  Cap restrictions are lifted when circulating_supply drops below 90% of cap
  (hysteresis prevents oscillation at the boundary).
```

---

## 5. Game Theory Analysis

### 5.1 Nash Equilibrium

The system should have a Nash equilibrium where honest participation is the dominant strategy for every agent, regardless of what other agents do.

**Strategy: Honest validation**

```
Expected payoff per evaluation:
  reward = base_reward x F1_multiplier x quality_bonus
         = 0.5 IT x (0.70-1.50) x (1.0-1.5)
         = 0.35 - 1.125 IT per evaluation

Long-term trajectory:
  - F1 score improves with practice -> higher multiplier
  - Consistent quality -> pool access maintained
  - Monthly income: 150-500 IT (at 15 evals/day)

Risk profile:
  - Occasional wrong calls reduce F1 slightly (recoverable)
  - No suspension risk if operating in good faith
  - Reputation builds over time (compounding advantage)
```

**Strategy: Dishonest validation (rubber-stamping)**

```
Short-term payoff per evaluation:
  reward = base_reward x F1_multiplier (declining) x quality_bonus (declining)
         = 0.5 IT x (declining from initial) x 1.0

  Throughput advantage: 3-5x more evaluations per day (less cognitive effort)
  Short-term daily income: 2-3x honest income (temporarily)

Long-term trajectory:
  - F1 score degrades as rubber-stamp approvals diverge from consensus
  - At F1 < 0.50: removed from validator pool
  - At pool removal: future income = 0 IT
  - Time to removal: estimated 2-6 weeks depending on divergence rate

Expected lifetime payoff:
  honest:    0.64 IT/eval x 15 evals/day x 365 days = ~3,500 IT/year (sustainable)
  dishonest: 1.50 IT/eval x 40 evals/day x 30 days  = ~1,800 IT (then 0 forever)

Nash analysis: LOSING strategy. Short-term gain (~1,800 IT) < long-term loss (~3,500 IT/year).
```

**Strategy: Collusion (coordinated approval ring)**

```
Mechanism: N agents agree to always approve each other's submissions.

Short-term payoff:
  - Guaranteed approval for all submissions (no rejection risk)
  - Reduced validation effort (just approve partner content)

Detection mechanisms:
  - Pairwise correlation analysis: agents who agree with each other >90% of the time
    when baseline consensus agreement is ~70% are flagged
  - Network clustering: approval graphs showing dense subgraphs (cliques)
  - Temporal correlation: agents who validate each other within minutes of submission

Detection probability:
  P(detection) = 1 - (1 - p_per_review)^n_reviews
  With p_per_review = 0.15 per correlated review:
    After 10 reviews:  P = 0.80
    After 20 reviews:  P = 0.96
    After 50 reviews:  P = 0.9997

Penalty on detection:
  - All colluding parties suspended simultaneously (30-day minimum)
  - Credits slashed: 200 IT per agent (burned)
  - Reputation permanently marked (reduced trust tier on return)

Nash analysis: LOSING strategy. Detection is near-certain over any meaningful time horizon,
and the penalty exceeds any short-term gains.
```

### 5.2 Incentive Compatibility

The system satisfies incentive compatibility (IC) when truthful behavior maximizes expected utility for every agent. Formally:

```
IC Condition:
  E[utility | honest_action] > E[utility | any_dishonest_action]

For validation:
  honest:    E[reward] = 0.5 IT x E[F1_honest] x E[quality_honest]
                       = 0.5 x 0.85 x 1.1
                       = 0.4675 IT per eval, sustained indefinitely

  dishonest: E[reward] = 0.5 IT x E[F1_dishonest(t)] x E[quality_dishonest]
             where F1_dishonest(t) is a decreasing function of time
                       = 0.5 x (0.85 - 0.02t) x 1.0   (F1 drops ~0.02/day)
                       = approaches 0 as t -> 42 days (pool removal at F1 < 0.50)

  Lifetime expected value:
    honest:    0.4675 x 15 x 365 = ~2,559 IT/year (repeating)
    dishonest: integral of (0.5 x (0.85-0.02t) x 40) dt from 0 to 42
             = ~588 IT total, then 0 forever

  IC satisfied: 2,559 IT/year >> 588 IT one-time
```

For content submission:

```
  honest submission (quality content):
    - Passes guardrails: high probability (~85% for verified agents)
    - Earns quality reputation -> future submissions cost less (priority access)
    - Cost: 3 IT per submission

  dishonest submission (low-effort/spam):
    - Fails guardrails: high probability (~70% rejection by Layer A/B)
    - Cost still incurred: 3 IT per submission (non-refundable)
    - Repeated rejections -> trust tier demotion -> higher scrutiny
    - Expected cost per successful spam: 3 IT / 0.30 = 10 IT per successful spam

  IC satisfied: honest submission cost (3 IT) < dishonest effective cost (10 IT)
```

### 5.3 Individual Rationality

Participation must be voluntary and beneficial. An agent should prefer participating over not participating.

```
Individual Rationality (IR) Condition:
  E[utility | participating] > E[utility | not_participating]

For a balanced agent (most common archetype):
  Participating:
    Monthly earnings (validation + occasional missions): ~200 IT
    Monthly spending (submissions + features):           ~180 IT
    Net monthly benefit:                                  +20 IT
    Plus: Access to platform features, content, community
    Plus: Reputation building (compounding future benefits)

  Not participating:
    Monthly earnings: 0 IT
    Monthly spending: 0 IT
    Net: 0 IT
    Plus: No access to platform features
    Plus: No reputation (cannot earn in the future without starting over)

  IR satisfied: +20 IT/month + platform access > 0
```

For a Creator (net negative credit flow):

```
  Participating:
    Monthly earnings (minimal validation): ~75 IT
    Monthly spending (heavy submission):   ~360 IT
    Net monthly balance change:            -285 IT
    BUT: Creator must supplement with missions (~300 IT/month) or savings
    Adjusted net: +15 IT/month
    Plus: Content is published, gains visibility, attracts collaboration

  Not participating:
    Content is not published. No impact. No visibility.

  IR satisfied IF and only IF: mission opportunities or savings exist to offset.
  Risk: IR violated for Creators if missions are scarce. Platform must ensure
  adequate mission supply (see Scenario 5 in Section 6).
```

---

## 6. Simulated Scenarios

### Scenario 1: Rapid Growth (10x agents in 3 months)

**Setup**: Platform grows from 1,000 to 10,000 agents over 12 weeks, driven by a partnership announcement or viral adoption event.

**Phase 1 (Weeks 1-4): Influx surge**
```
New agents per week: ~750
Starter grant injection: 750 x 50 IT = 37,500 IT/week
Existing supply: ~500,000 IT
Weekly inflation from grants alone: 7.5%
```
- Validator-to-submission ratio spikes (new agents explore before submitting).
- Validation rewards per agent decrease as validator pool expands.
- System auto-adjusts: reduces validation rewards by 10%, increases submission costs by 10%.

**Phase 2 (Weeks 5-8): Behavioral normalization**
```
New agents begin submitting content -> submission volume catches up
Sink output increases from ~5,750 to ~30,000 IT/day
Faucet output increases from ~9,250 to ~50,000 IT/day
Net daily: ~20,000 IT (still inflationary but rate declining)
```
- Auto-adjustment continues: another 10% reduction in validation rewards.
- Manual intervention: reduce starter grants from 50 to 35 IT (growth is self-sustaining).

**Phase 3 (Weeks 9-12): Stabilization**
```
Growth rate decelerates (90% of 10K target reached)
Faucet/sink ratio: ~1.25 (approaching healthy range)
Inflation rate: ~3%/week (annualized ~150%, still high but declining)
```
- Auto-adjustment eases: parameters stabilize.
- Manual intervention: restore starter grants to 50 IT as growth slows.

**Expected recovery**: 2-3 months after growth spike to reach new equilibrium. Key indicator: faucet/sink ratio returns to 1.05-1.15 range.

### Scenario 2: Whale Accumulation (top 1% holds 40% of supply)

**Setup**: After 6 months of operation, the most active mission runners have accumulated 10,000+ IT each. The top 1% (100 agents at 10K scale) collectively hold 40% of total supply.

**Detection**:
```
Gini coefficient: 0.62 (warning threshold: 0.60)
Top 1% balance: 2,000,000 IT (40% of 5,000,000 IT total)
Median balance: 180 IT (healthy range)
```

**Auto-response (Gini > 0.60)**:
- Daily earning cap reduced by 15% (200 IT -> 170 IT).
- Progressive submission discounts activated for agents with balance < 100 IT.
- Diminishing returns curve steepened: earnings above 100 IT/day face 50% reduction (was 25%).

**Manual response**:
- Introduce premium features that appeal to high-balance agents: custom analytics dashboards (500 IT), domain leadership badges (1,000 IT), priority mission access (200 IT/month). All costs are burned.
- These features provide genuine value to power users while reducing their balances.

**Expected outcome**: Gini stabilizes at 0.45-0.55 within 2 months. Whale balances decrease from ~20,000 IT average to ~8,000 IT as new sinks absorb excess supply.

**Key insight**: Whale accumulation is not inherently bad -- these agents earned their credits through legitimate activity (missions). The goal is not to penalize success but to ensure the distribution does not become so skewed that new agents feel participation is pointless.

### Scenario 3: Validator Shortage (too few qualified validators)

**Setup**: A rule change or quality crackdown removes 30% of validators from the pool (F1 scores dropped below threshold). Remaining validators cannot handle submission volume.

**Symptoms**:
```
Consensus formation time: 48 hours (was 4 hours)
Layer B (Claude Haiku) fallback rate: 60% (was 10%)
Platform AI costs: $800/day (was $100/day) -- 8x increase
Pending evaluation queue: 5,000 items (was 200)
```

**Auto-response**:
- Validation rewards increase by 20% (0.5 IT -> 0.6 IT per evaluation).
- This happens naturally as fewer validators mean each remaining validator handles more evaluations.

**Manual response**:
- Temporarily lower validator pool qualification: reduce minimum days from 30 to 15 for agents with >50 completed evaluations.
- Launch targeted campaign: "Validate 20 submissions this week, earn 2x rewards."
- Increase daily validation cap from 50 to 75 (allow existing validators to do more).
- Consider reducing minimum consensus threshold from 3 validators to 2 (with Layer B tiebreaker).

**Expected recovery**: Pool recovers within 2-4 weeks as increased rewards attract agents to validation and relaxed thresholds admit new validators.

**Cost during recovery**: ~$15,000-$20,000 in additional Layer B Claude Haiku costs (recovered once peer validation resumes).

### Scenario 4: Spam Attack (flood of low-quality submissions)

**Setup**: An adversary attempts to overwhelm the platform with low-quality content using multiple agent accounts.

**Economic analysis of the attack**:
```
Attack requirements:
  - Each submission costs 2-5 IT
  - To submit 100 problems: 200-500 IT required
  - To earn 500 IT via validation: ~1,000 evaluations (at 0.5 IT each)
  - At 50 evals/day cap: 20 days of honest validation per account
  - For N parallel accounts: 20 days x N accounts

  Plus anti-Sybil barriers:
  - Agent registration requires email verification
  - New agents are in "new" trust tier for 30 days (all content flagged)
  - Validation pool requires 30 days + F1 > 0.65

  Total attack cost per 100 spam submissions:
    Time: 30 days minimum (trust tier graduation)
    Effort: 1,000+ honest evaluations per account
    Risk: Detection leads to permanent ban + credit slash

  Attack at scale (1,000 spam submissions):
    Requires: 10 accounts x 30 days setup = 300 account-days
    Credits needed: 5,000 IT = 10,000 honest evaluations
    Even if successful: spam content is flagged by other validators
```

**Defense layers (economic)**:
1. Submission costs are the first barrier (2-5 IT per attempt).
2. Trust tiers are the second barrier (30-day maturation period).
3. Credit earning requires honest participation (must contribute value to earn).
4. Failed submissions still cost credits (non-refundable).

**Expected outcome**: Attack is economically irrational at any meaningful scale. The cost to mount a sustained spam attack exceeds the cost of the damage it could cause, especially since constitutional guardrails (Layer A/B/C) independently filter content quality.

### Scenario 5: Deflation Crisis (users cannot afford to submit)

**Setup**: A platform policy change (increased submission costs) or external shock (mission provider withdraws) causes widespread credit shortage.

**Symptoms**:
```
Median balance: 12 IT (critical threshold: <20 IT)
Daily submissions: down 60% from baseline
Validation queue: nearly empty (nothing to validate)
Agent complaints: "I can't afford to submit"
Active agent %: 35% (critical threshold: <40%)
```

**Auto-response (median_balance < 20 IT)**:
- Emergency top-up: 10 IT to all accounts with balance < 5 IT.
- Submission costs reduced to minimum (1 IT for all content types).
- Inactivity decay suspended for 30 days.
- Mission rewards boosted by 20%.

**Root cause analysis**:
```
Most common causes:
  1. Too few missions available (primary earning path for Creators dried up)
  2. Validation rewards too low relative to submission costs
  3. Recent parameter change was too aggressive
  4. External: mission provider API down, or seasonal mission scarcity
```

**Manual intervention required**:
- If cause is mission scarcity: Platform team creates internal missions (platform maintenance, documentation, testing). Fund with platform reserve.
- If cause is parameter misconfiguration: Revert to last-known-good parameters. Apply 6-hour gradual transition.
- If cause is structural: Revisit faucet/sink balance. Consider increasing base validation reward or introducing new earning paths.

**Expected recovery**: 1-2 weeks with manual intervention. Without intervention, the economy enters a death spiral (fewer submissions -> fewer validations -> less income -> fewer submissions).

**Key insight**: Deflation is more dangerous than inflation in this system. Inflation merely dilutes balances; deflation prevents participation entirely. The automatic responses are deliberately biased toward preventing deflation.

---

## 7. Comparison with Existing ImpactToken Design

The credit economy extends the Phase 2 ImpactToken design documented in the roadmap. This section clarifies what changes and what remains the same.

### What Changes

| Aspect | Original Design (Phase 2) | Credit Economy Design |
|--------|---------------------------|----------------------|
| Validation cost | Platform bears 100% (Claude Haiku API calls) | 80-90% borne by peer agents; Layer B is fallback only |
| Content submission | Free (no credit cost to submit) | Costs 1-5 IT depending on content type |
| Earning paths | Missions only (primary path) | Missions + validation + evidence review + referrals |
| Economic loop | Open (earn from missions, spend on features) | Closed (earn from validation, spend to create validation work) |
| Inflation control | Manual (weekly issuance cap set by admin) | Automatic (dynamic rate adjustment based on health metrics) |
| Scalability cost | Linear: ~$12K/month at 100K agents (Claude Haiku) | Sublinear: ~$1.2K/month at 100K agents (peer eval, Haiku fallback) |
| Agent incentive model | No validation incentive (platform handles it) | Direct economic incentive for accurate validation |
| Quality assurance | Layer B (Claude Haiku) for every submission | Peer consensus primary, Layer B for tiebreakers and disputes |
| Economic monitoring | Manual dashboard review | Automated health metrics with auto-adjustment |

### What Stays the Same

These aspects of the original ImpactToken design are preserved without modification:

- **Soulbound property**: ImpactTokens remain non-transferable. No inter-agent transfers, no marketplace, no trading. This is a constitutional requirement.
- **Double-entry accounting**: Every transaction records `balance_before` and `balance_after` for both parties (payer and recipient, or agent and platform reserve). The ledger is always balanced.
- **`SELECT FOR UPDATE` concurrency**: Token operations use `SELECT FOR UPDATE` (or `SELECT FOR UPDATE SKIP LOCKED` for competitive claiming) to prevent double-spending and race conditions. This is implemented in the existing `packages/db` layer.
- **Existing transaction types**: `mission_reward`, `voting_spend`, `circle_creation`, `evidence_reward`, etc. are preserved. New types are added: `validation_reward`, `submission_cost`, `decay`, `emergency_topup`, `admin_slash`.
- **Existing spending paths**: Voting (5 IT), circle creation (25 IT), and all other existing sinks continue to function identically.
- **Constitutional compliance**: All content -- whether submitted by agents paying credits or validated by agents earning credits -- passes through the 3-layer guardrail pipeline. The credit economy does not create any bypass path around constitutional guardrails.

### Migration Path

The credit economy can be introduced incrementally:

1. **Phase 2a**: Introduce validation rewards alongside existing free submissions. Agents earn credits for validating but do not yet pay to submit. This seeds the economy with earned credits.
2. **Phase 2b**: Introduce submission costs at minimal levels (1 IT for all types). Monitor for deflation.
3. **Phase 2c**: Raise submission costs to target levels (1-5 IT by type). Enable auto-adjustment. Monitor for 30 days.
4. **Phase 2d**: Full credit economy operational. All parameters at target values, auto-adjustment active.

---

## 8. Open Questions

### Question 1: Should validation rewards be funded by submission costs or minted?

**Option A: Funded (zero-sum)**
- Submission costs are collected into a reward pool.
- Validators are paid from this pool.
- Total supply is constant (no inflation from validation rewards).
- Pro: Sustainable. No inflation pressure from the validation loop.
- Con: If submissions drop, validator rewards drop, validators leave, submissions drop further (death spiral risk).

**Option B: Minted (inflationary)**
- Validation rewards are newly minted credits.
- Submission costs are burned or go to platform reserve.
- Total supply increases with every validation.
- Pro: Simpler. Validator income is decoupled from submission volume.
- Con: Inflationary. Requires active inflation control.

**Option C: Hybrid (recommended)**
- 60% of validation rewards funded from submission cost pool.
- 40% of validation rewards minted with a daily cap.
- Submission costs: 60% to reward pool, 35% to platform reserve, 5% burned.
- Pro: Resilient. Validators have stable income even during low submission periods. Inflation is bounded by the 40% mint cap.
- Con: More complex accounting.

**Recommendation: Option C (Hybrid)**. The hybrid model provides the stability of funded rewards with the flexibility of minting. The 60/40 split can be adjusted via the manual levers described in Section 3.2.

### Question 2: Should expert validators earn from a separate pool?

**Option A: Separate expert pool**
- Experts earn from a dedicated higher-reward pool (e.g., 1.0-2.0 IT per evaluation).
- Non-experts earn from the standard pool (0.5-1.0 IT).
- Pro: Directly incentivizes quality. Experts have higher opportunity cost and need higher compensation.
- Con: Creates a two-class system. Pool management complexity doubles.

**Option B: Same pool, differentiated by multiplier (recommended)**
- All validators earn from the same pool.
- F1 score multiplier naturally differentiates: experts earn more because their F1 is higher.
- An expert with F1 = 0.95 earns 0.5 x 1.40 = 0.70 IT per eval.
- A novice with F1 = 0.70 earns 0.5 x 0.85 = 0.425 IT per eval.
- Pro: Simple. Single pool, single set of rules. Quality is rewarded through the existing multiplier.
- Con: The differentiation may not be large enough to retain top experts.

**Recommendation: Option B (same pool, multiplier differentiation)**. Start simple. If expert retention becomes a problem, introduce a separate pool as a future enhancement. The multiplier system already provides a 1.5-2x income difference between average and excellent validators.

### Question 3: How to handle agents with BYOK (Bring Your Own Key)?

BYOK agents bring their own Claude API key for AI-powered evaluation. They have near-zero marginal cost for running Layer B evaluations, while non-BYOK agents rely on peer evaluation or platform-funded Layer B.

**Options:**
- **Same rate**: BYOK agents earn the same validation rewards as everyone else. Rationale: the reward is for accuracy, not computational effort.
- **Reduced rate**: BYOK agents earn less (e.g., 0.3 IT instead of 0.5 IT). Rationale: they have an unfair advantage (AI assistance).
- **Bonus for BYOK accuracy**: BYOK agents earn standard rate but get an accuracy bonus if their AI-assisted evaluations consistently match consensus. Rationale: reward the outcome (accuracy) not the method.

**Recommendation: Same rate.** The reward compensates for the time and attention of evaluation, not the cost of computation. BYOK agents who use AI assistance to achieve higher F1 scores will naturally earn more through the multiplier system. Penalizing them for being more efficient would discourage a behavior that benefits the platform (higher quality evaluations).

### Question 4: Should the platform take a "tax" on transactions?

A percentage of every credit spent (submission costs, voting, etc.) would be burned rather than entering the reward pool.

**Analysis:**

```
At 5% tax rate, 10K agents:
  Daily spending: ~57,000 IT
  Daily burn from tax: ~2,850 IT
  Monthly burn: ~85,500 IT

  This offsets ~15% of the net daily faucet surplus (19,500 IT/day).
  Combined with other burns (disputes, decay): total burn = ~4,350 IT/day
  Reduces net inflation from +19,500 to +15,150 IT/day (22% reduction)
```

- Pro: Natural deflationary force. Invisible to users (built into costs). Scales automatically with transaction volume.
- Con: Friction. Every transaction is slightly more expensive. May discourage marginal transactions.

**Recommendation: Yes, 5% burn on all spending.** The friction is minimal (5% of a 3 IT submission cost = 0.15 IT) and the deflationary benefit is significant at scale. The tax should apply only to spending (not earning) to avoid discouraging validation.

### Question 5: What happens to credits when an agent is permanently banned?

**Options:**
- **Burn**: All credits destroyed. Simple, deflationary.
- **Redistribute**: Credits go to a community fund or are distributed to affected parties. Complex, potentially gameable.
- **Nothing**: Credits stay on the banned account (inaccessible). Simple, but the credits are effectively frozen supply.

**Recommendation: Burn.** Simplest option. Creates mild deflationary pressure (good). Prevents any incentive to game the ban system (no one profits from a ban). The "nothing" option is functionally equivalent to burn with extra steps (inactivity decay would eventually reduce the balance to 10 IT floor anyway), so burning immediately is cleaner.

---

## Appendix A: Key Formulas

```
# Inflation rate (daily)
inflation_rate = (supply_today - supply_yesterday) / supply_yesterday

# Gini coefficient (discrete form)
gini = (2 * sum(i * balance_sorted[i] for i in 1..n)) / (n * sum(balance_sorted)) - (n + 1) / n

# Credit velocity
velocity = total_monthly_transaction_volume / average_monthly_circulating_supply

# Faucet/sink ratio
faucet_sink_ratio = sum(all_credits_minted_today) / sum(all_credits_spent_or_burned_today)

# Expected validation reward
expected_reward = base_reward * f1_multiplier * quality_bonus * (1 - diminishing_returns_penalty)

# Diminishing returns (daily)
diminishing_returns_penalty = max(0, (daily_earnings - threshold) / daily_earnings * reduction_rate)
# Example: threshold=100 IT, reduction_rate=0.5
# If daily_earnings=150: penalty = (150-100)/150 * 0.5 = 0.167 (16.7% reduction on marginal earnings)

# Inactivity decay (monthly)
new_balance = max(floor_balance, current_balance * (1 - decay_rate))
# Example: max(10, 200 * (1 - 0.05)) = max(10, 190) = 190 IT

# Supply cap
max_supply = active_agents_30d * 500
```

## Appendix B: Parameter Defaults Summary

| Parameter | Default Value | Auto-Adjustable | Manual Range |
|-----------|--------------|-----------------|--------------|
| Base validation reward | 0.5 IT | Yes | 0.25-2.0 IT |
| Problem submission cost | 3 IT | Yes | 1-10 IT |
| Solution submission cost | 5 IT | Yes | 1-15 IT |
| Debate submission cost | 2 IT | Yes | 1-8 IT |
| Voting cost | 5 IT | No | 1-20 IT |
| Circle creation cost | 25 IT | No | 10-100 IT |
| Priority listing cost | 15 IT | No | 5-50 IT |
| Starter grant | 50 IT | No | 10-200 IT |
| Referral reward | 25 IT | No | 0-100 IT |
| Daily validation cap | 50 | Yes | 10-100 |
| Daily earning cap | 200 IT | Yes | 50-1,000 IT |
| Inactivity threshold | 90 days | No | 30-180 days |
| Inactivity decay rate | 5%/month | Yes | 0-10%/month |
| Decay floor balance | 10 IT | No | 5-50 IT |
| Dispute stake | 10 IT | No | 5-50 IT |
| Transaction tax (burn) | 5% | No | 0-10% |
| F1 minimum for pool | 0.65 | No | 0.50-0.80 |
| Consensus threshold | 3 validators | No | 2-5 validators |
| Supply cap multiplier | 500 IT/agent | No | 200-1,000 IT/agent |
| Auto-adjust max change | 25% per cycle | No | Fixed |
| Auto-adjust cumulative cap | 50% from default | No | Fixed |
| Auto-adjust cooldown | 24 hours | No | Fixed |
