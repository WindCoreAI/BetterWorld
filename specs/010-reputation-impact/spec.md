# Feature Specification: Reputation & Impact System

**Feature Branch**: `010-reputation-impact`
**Created**: 2026-02-11
**Status**: Draft
**Input**: User description: "Sprint 9: Reputation & Impact (Weeks 17-18) — Reputation scoring engine (4-factor algorithm with decay), reputation tiers with privilege unlocks, leaderboards (reputation/impact/tokens/missions with filtering and Redis caching), public Impact Dashboard with Leaflet heatmap, per-user Impact Portfolio with Open Graph tags for social sharing, streak system with reward multipliers, hourly impact metrics aggregation, evidence fraud scoring pipeline (pHash + velocity + statistical profiling), Phase 2 Grafana dashboards, admin fraud review queue, k6 load test (5K concurrent), Phase 2 security audit (OWASP + ZAP)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Earn and Track Reputation (Priority: P1)

A human completes missions and contributes to the platform. Over time, their reputation score increases based on four factors: mission completion quality (evidence verification scores), peer review accuracy (how well their reviews align with consensus), consistency (active days streak), and community endorsements (positive peer feedback). The reputation score decays gradually if the human becomes inactive, incentivizing sustained participation.

**Why this priority**: Reputation is the core incentive mechanism for quality participation. Without reputation tracking, there's no differentiation between engaged, high-quality contributors and low-effort participants. This drives the entire gamification and trust layer.

**Independent Test**: A human completes a mission with high-quality evidence (0.95 AI confidence). Their reputation score increases by the calculated amount. They can view their reputation breakdown (mission quality: +50, peer accuracy: +30, streak: +10, endorsements: +5) in their dashboard. After 7 days of inactivity, their score decays by the configured percentage.

**Acceptance Scenarios**:

1. **Given** a human completes a mission with evidence verified at 0.95 confidence, **When** the verification is finalized, **Then** their reputation score increases based on the 4-factor algorithm (mission quality, peer accuracy, streak, endorsements).
2. **Given** a human with a 5-day active streak, **When** they complete another mission on day 6, **Then** their streak continues, their streak multiplier increases, and their reputation gains a bonus.
3. **Given** a human who has been inactive for 7 days, **When** the daily reputation decay job runs, **Then** their reputation score decreases by the configured decay percentage (e.g., 2% per week).
4. **Given** a human with a reputation score, **When** they view their dashboard, **Then** they see a breakdown of the 4 factors contributing to their score, their total reputation, and their current tier.
5. **Given** a human who has submitted peer reviews, **When** their reviews align with final consensus, **Then** their peer accuracy factor improves, increasing future reputation gains.

---

### User Story 2 - Unlock Privileges via Reputation Tiers (Priority: P1)

As humans earn reputation, they unlock tiers (e.g., Newcomer, Contributor, Advocate, Leader, Champion) with increasing privileges. Higher tiers gain access to exclusive features: ability to serve as peer reviewers (tier 2+), create community missions (tier 3+), participate in governance votes (tier 4+), and earn bonus token multipliers (tier 3+). Tier thresholds are visible and achievable, creating clear progression milestones.

**Why this priority**: Tiers convert abstract reputation scores into tangible benefits, creating aspirational goals. Without privilege unlocks, reputation is meaningless. This is tied with P1 because reputation and tiers are inseparable for the gamification loop.

**Independent Test**: A new human starts at Newcomer (tier 1) with no privileges. After earning 100 reputation points, they unlock Contributor (tier 2), gaining peer reviewer eligibility and a 1.1x token multiplier. The tier upgrade notification appears in their dashboard.

**Acceptance Scenarios**:

1. **Given** a human reaches the reputation threshold for a new tier, **When** their reputation is recalculated, **Then** they are automatically promoted to the new tier and a notification is displayed.
2. **Given** a human at tier 2 (Contributor), **When** they view the peer review queue, **Then** they have access to review evidence submissions, whereas tier 1 users do not.
3. **Given** a human at tier 3 (Advocate), **When** they complete a mission, **Then** they earn tokens with a 1.2x multiplier applied to the base reward.
4. **Given** a human viewing tier requirements, **When** they open the reputation page, **Then** they see all 5 tiers with reputation thresholds, privilege descriptions, and their progress toward the next tier.
5. **Given** a human's reputation drops below a tier threshold due to decay, **When** the reputation recalculation runs, **Then** they are demoted to the lower tier and lose associated privileges (with a grace period notification).

---

### User Story 3 - View Leaderboards and Rankings (Priority: P2)

Humans want to see how they rank compared to others. The platform displays leaderboards for reputation, total impact points, ImpactTokens earned, and missions completed. Each leaderboard supports filtering by domain (e.g., environmental protection, education), time period (all-time, this month, this week), and location (global, country, city). Leaderboards are cached in Redis and updated hourly to handle high traffic.

**Why this priority**: Leaderboards create social proof, competition, and aspirational targets. They're important for engagement but not blocking for core functionality, making this P2.

**Independent Test**: Open the leaderboards page. See the top 100 humans ranked by reputation with their usernames, reputation scores, and badges. Switch to the "Missions Completed" leaderboard filtered for "this month" and "environmental protection" domain. See results update in under 2 seconds with Redis cache.

**Acceptance Scenarios**:

1. **Given** a human viewing the reputation leaderboard, **When** the page loads, **Then** they see the top 100 humans ranked by reputation score, with usernames, scores, tiers, and avatar/badges.
2. **Given** a human filtering the leaderboard by domain, **When** they select "environmental_protection", **Then** only humans who have completed missions in that domain appear in the ranking.
3. **Given** a human filtering by time period, **When** they select "this month", **Then** the leaderboard displays rankings based on reputation changes within the current month.
4. **Given** a leaderboard with high traffic, **When** multiple users access it simultaneously, **Then** results are served from Redis cache with sub-2-second load times.
5. **Given** a human on the leaderboard, **When** their reputation updates, **Then** the leaderboard reflects the change within 1 hour (on the next cache refresh).

---

### User Story 4 - Public Impact Dashboard with Heatmap (Priority: P2)

The platform displays a public Impact Dashboard showing aggregated impact metrics: total missions completed, total ImpactTokens distributed, humans participating, and missions by domain. A Leaflet heatmap visualizes mission density by location, showing where impact is being generated globally. The dashboard is accessible without login, serving as both a transparency tool and a public showcase.

**Why this priority**: Public visibility builds trust and attracts new participants. The heatmap provides geographic context that text metrics cannot. Important for transparency but not blocking core user flows.

**Independent Test**: Open the public Impact Dashboard (no login required). See total metrics at the top (10,000 missions completed, 500,000 IT distributed, 2,000 participants). The heatmap displays mission density with color intensity. Zoom into a city and see individual missions clustered.

**Acceptance Scenarios**:

1. **Given** a visitor (not logged in), **When** they access the public Impact Dashboard, **Then** they see aggregated impact metrics (total missions, total IT, total humans, missions by domain) updated in real-time.
2. **Given** the Impact Dashboard heatmap, **When** a visitor views it, **Then** the heatmap displays mission density by location using color intensity (more missions = darker/hotter color).
3. **Given** a visitor zooming into the heatmap, **When** they zoom into a specific region, **Then** mission clusters expand into individual markers with mission titles and impact summaries.
4. **Given** the Impact Dashboard displaying domain breakdown, **When** loaded, **Then** a chart shows the distribution of missions across the 15 UN SDG-aligned domains.
5. **Given** high traffic to the Impact Dashboard, **When** multiple visitors access it, **Then** metrics are served from cached aggregates with sub-3-second load times.

---

### User Story 5 - Per-User Impact Portfolio (Priority: P2)

Each human has a public Impact Portfolio showcasing their contributions: total reputation, missions completed (with before/after photos), domains contributed to, total impact generated, and a timeline of activity. The portfolio is shareable via a unique URL and includes Open Graph tags for rich social media previews (title, description, thumbnail showing impact metrics). Humans can toggle portfolio visibility (public, private).

**Why this priority**: Portfolios enable humans to showcase their impact externally (LinkedIn, Twitter), driving awareness and recruitment. Important for virality but not essential for core platform functionality.

**Independent Test**: A human opens their Impact Portfolio page. They see their reputation, tier, missions completed (with thumbnails), and a timeline. They click "Share" and copy the URL. When posted to Twitter, the link preview shows their name, reputation score, and a custom Open Graph image.

**Acceptance Scenarios**:

1. **Given** a human with completed missions, **When** they view their Impact Portfolio, **Then** they see their reputation, tier, total missions, total impact, domains contributed to, and a timeline of activity with mission thumbnails.
2. **Given** a human sharing their portfolio URL, **When** the link is posted on social media, **Then** the Open Graph preview displays their name, reputation score, top domain, and a custom impact thumbnail.
3. **Given** a human with a public portfolio, **When** another user visits the profile URL, **Then** they see the human's public impact data (without sensitive information like email or location).
4. **Given** a human toggling portfolio visibility, **When** they set it to "private", **Then** only they can view the portfolio and external visitors see a "profile is private" message.
5. **Given** a human with multiple completed missions, **When** the portfolio displays their mission history, **Then** each mission shows a before/after photo thumbnail, mission title, domain, and verification status.

---

### User Story 6 - Streak System with Reward Multipliers (Priority: P2)

Humans who complete missions on consecutive days earn "streaks" that apply reward multipliers to future missions. A 7-day streak grants a 1.1x multiplier, a 30-day streak grants 1.25x, and longer streaks grant higher multipliers (up to 2.0x at 365 days). Missing a day breaks the streak but offers a "streak freeze" (usable once per 30 days) to preserve streaks during unavoidable absences. Streaks are displayed prominently in the dashboard.

**Why this priority**: Streaks drive daily engagement and habit formation. They're powerful for retention but not required for initial launch, making this P2.

**Independent Test**: A human completes missions on 7 consecutive days. On day 8, they see a "7-day streak unlocked" notification and a 1.1x token multiplier applied to their next mission reward. They miss day 9 but use a streak freeze to preserve the streak.

**Acceptance Scenarios**:

1. **Given** a human completes missions on 7 consecutive days, **When** the streak calculation runs, **Then** they unlock a 7-day streak badge and future mission rewards are multiplied by 1.1x.
2. **Given** a human with a 30-day streak, **When** they complete a mission, **Then** they earn tokens with a 1.25x multiplier applied.
3. **Given** a human who misses a day, **When** the daily streak check runs, **Then** their streak is broken unless they use a streak freeze.
4. **Given** a human using a streak freeze, **When** they activate it, **Then** their streak is preserved for that day and the freeze enters a 30-day cooldown.
5. **Given** a human viewing their dashboard, **When** they have an active streak, **Then** they see their current streak count, the next milestone, and the active multiplier.

---

### User Story 7 - Evidence Fraud Scoring Pipeline (Priority: P1)

The platform monitors evidence submissions for fraud patterns using three methods: perceptual hashing (pHash) to detect duplicate or stock photos, velocity checks to flag abnormal submission rates, and statistical profiling to identify outliers (e.g., always submitting at exact GPS coordinates, unusually high approval rates). Fraud scores accumulate per human. High fraud scores trigger automatic admin review. The pipeline runs asynchronously after evidence submission.

**Why this priority**: Fraud detection protects token economy integrity. Without it, the system is vulnerable to exploitation at scale. This is P1 because fraud undermines trust in the entire verification system.

**Independent Test**: A human submits the same photo for 5 different missions. The pHash detector identifies duplicates, increments the fraud score, and auto-rejects subsequent duplicates. After the score exceeds the threshold, the account is flagged for admin review.

**Acceptance Scenarios**:

1. **Given** a human submits evidence, **When** the pHash is calculated, **Then** the system compares it against existing evidence hashes to detect duplicates (within a 90% similarity threshold).
2. **Given** a duplicate photo is detected, **When** the fraud scoring runs, **Then** the submission is auto-rejected and the human's fraud score is incremented.
3. **Given** a human submits 15 evidence submissions in 10 minutes, **When** the velocity check runs, **Then** the submission rate is flagged as abnormal and the fraud score is incremented.
4. **Given** a human with GPS submissions always at exact coordinates (no variance), **When** the statistical profiler runs, **Then** the pattern is flagged as suspicious and the fraud score is incremented.
5. **Given** a human whose fraud score exceeds 50, **When** the fraud scoring runs, **Then** their account is automatically flagged for admin review and further submissions are held pending review.

---

### User Story 8 - Admin Fraud Review Queue (Priority: P2)

Admins have access to a fraud review queue displaying all humans flagged by the fraud detection pipeline. For each flagged account, admins see the fraud score breakdown (pHash duplicates, velocity violations, statistical anomalies), the evidence submissions triggering flags, and historical review decisions. Admins can clear the flag, suspend the account, or reset the fraud score with reasoning logged in an audit trail.

**Why this priority**: Human review is the final enforcement layer for fraud. Important for maintaining trust but P2 because the automated fraud scoring (P1) handles the majority of cases.

**Independent Test**: An admin opens the fraud review queue. They see 3 flagged accounts with fraud scores and reasons. They review one account, see the duplicate photo evidence, and suspend the account with reasoning. The action is logged.

**Acceptance Scenarios**:

1. **Given** an admin viewing the fraud review queue, **When** the page loads, **Then** they see all flagged accounts with fraud scores, primary violation type (pHash, velocity, statistical), and submission count.
2. **Given** an admin reviewing a flagged account, **When** they select it, **Then** they see the fraud score breakdown, evidence submissions with thumbnails, timestamps, GPS data, and verification outcomes.
3. **Given** an admin taking action, **When** they suspend an account, **Then** the human's submissions are frozen, they are notified of the suspension, and the action is logged in the audit trail with admin reasoning.
4. **Given** an admin clearing a false positive flag, **When** they reset the fraud score, **Then** the human's account returns to normal status and the flag is removed.
5. **Given** an admin reviewing fraud patterns, **When** they view the analytics, **Then** they see aggregate fraud metrics (total flags, suspensions, false positives) and trend charts.

---

### User Story 9 - Hourly Impact Metrics Aggregation (Priority: P3)

The platform runs an hourly aggregation job that calculates and caches key metrics: total missions completed (by domain, by location, by time period), total ImpactTokens distributed, average reputation by tier, and active user counts. These aggregates power the leaderboards, Impact Dashboard, and analytics without requiring expensive real-time queries on the production database.

**Why this priority**: Aggregation enables the platform to scale to thousands of users without query performance degradation. Important for long-term scalability but not required for initial launch with lower user counts.

**Independent Test**: Trigger the hourly aggregation job manually. Verify that Redis contains updated metrics (missions_total_this_month, impact_tokens_total_all_time, active_users_today). The Impact Dashboard and leaderboards reflect the new data.

**Acceptance Scenarios**:

1. **Given** the hourly aggregation job runs, **When** it completes, **Then** all key metrics (missions by domain/location/time, tokens distributed, reputation averages) are calculated and stored in Redis.
2. **Given** cached metrics in Redis, **When** the Impact Dashboard loads, **Then** it fetches metrics from cache instead of running expensive queries on the primary database.
3. **Given** a metric query, **When** the cache is stale (>1 hour old), **Then** the system triggers an on-demand recalculation and updates the cache.
4. **Given** the aggregation job processing 100,000+ mission records, **When** it runs, **Then** it completes within 5 minutes without blocking production queries.
5. **Given** an error during aggregation, **When** the job fails, **Then** it logs the error, sends an alert to admins, and retries after 15 minutes.

---

### User Story 10 - Phase 2 Grafana Dashboards (Priority: P3)

Operators have access to Grafana dashboards displaying Phase 2 metrics: reputation score distribution, tier population (how many users in each tier), mission completion rate by domain, fraud score distribution, evidence verification latency (AI vs peer), token distribution velocity, and leaderboard query performance. Dashboards help operators monitor system health and identify anomalies.

**Why this priority**: Observability is essential for operating at scale, but dashboards can be added after core features are validated. P3 because they're operational tooling, not user-facing.

**Independent Test**: Open Grafana. See the "Phase 2 Reputation & Impact" dashboard with 10 panels: reputation distribution histogram, tier population pie chart, mission completion time series, fraud flags over time, verification latency (p50/p95), and more.

**Acceptance Scenarios**:

1. **Given** a Grafana dashboard for Phase 2, **When** an operator opens it, **Then** they see real-time metrics for reputation, tiers, missions, fraud, and verification.
2. **Given** the reputation distribution panel, **When** loaded, **Then** it displays a histogram of human reputation scores grouped by tier.
3. **Given** the mission completion time series, **When** loaded, **Then** it shows missions completed per hour over the last 7 days, segmented by domain.
4. **Given** the fraud detection panel, **When** loaded, **Then** it displays fraud flags per day, suspension rate, and false positive rate.
5. **Given** an alert configured in Grafana, **When** fraud flags exceed 50 per day, **Then** an alert is sent to the admin Slack channel.

---

### User Story 11 - k6 Load Test (5K Concurrent Users) (Priority: P3)

The platform is load-tested using k6 to simulate 5,000 concurrent users performing typical Phase 2 operations: viewing leaderboards, loading Impact Dashboards, submitting evidence, and completing missions. The test identifies bottlenecks (e.g., unindexed queries, cache misses) and validates that the platform maintains sub-3-second response times under load.

**Why this priority**: Load testing validates scalability but is not required until the platform approaches scale. P3 because it's a validation step after feature implementation.

**Independent Test**: Run the k6 script with 5,000 virtual users. The test completes successfully with p95 latency under 3 seconds for all endpoints. No database connection pool exhaustion or Redis cache failures occur.

**Acceptance Scenarios**:

1. **Given** a k6 load test script, **When** it runs with 5,000 concurrent users, **Then** leaderboard endpoints return results in under 2 seconds at p95.
2. **Given** the k6 test simulating evidence submissions, **When** 1,000 submissions occur simultaneously, **Then** the queue handles all submissions without errors and verifications complete within 60 seconds.
3. **Given** the k6 test querying the Impact Dashboard, **When** 2,000 concurrent users access it, **Then** the Redis cache serves metrics without fallback to the database.
4. **Given** the k6 test identifying a bottleneck, **When** an unindexed query is detected, **Then** the issue is logged, an index is added, and the test is re-run to verify improvement.
5. **Given** the k6 test completing, **When** results are analyzed, **Then** a report is generated showing throughput, latency percentiles, error rate, and resource utilization.

---

### User Story 12 - Phase 2 Security Audit (OWASP + ZAP) (Priority: P3)

The platform undergoes a security audit covering OWASP Top 10 vulnerabilities and automated scanning with OWASP ZAP. The audit includes testing for SQL injection, XSS, CSRF, authentication bypasses, authorization flaws, and data leaks. All findings are triaged by severity (P0, P1, P2) and remediated before launch.

**Why this priority**: Security is critical but the audit happens after features are implemented. P3 because it's a validation/hardening step, not a user-facing feature.

**Independent Test**: Run OWASP ZAP against the staging environment. The scan completes with zero P0/P1 vulnerabilities. All API endpoints require authentication and authorization checks pass. No sensitive data leaks in responses or logs.

**Acceptance Scenarios**:

1. **Given** an OWASP ZAP scan, **When** it completes, **Then** zero P0 (critical) vulnerabilities are reported.
2. **Given** a manual OWASP Top 10 review, **When** testing for SQL injection, **Then** all API endpoints use parameterized queries and no injection is possible.
3. **Given** testing for XSS vulnerabilities, **When** malicious input is submitted, **Then** all output is sanitized and no script execution occurs.
4. **Given** testing for authentication bypass, **When** unauthenticated requests are sent to protected endpoints, **Then** all requests are rejected with 401 Unauthorized.
5. **Given** a security audit finding, **When** a P1 vulnerability is discovered, **Then** it is triaged, assigned to a developer, remediated, and re-tested within 48 hours.

---

### Edge Cases

- What happens when a human's reputation goes negative due to fraud penalties? (System enforces a floor of 0, cannot go negative)
- What happens when two humans reach a tier threshold at the exact same time? (Both are promoted atomically with unique timestamps for leaderboard tiebreakers)
- How does the system handle reputation decay for humans who have been inactive for 6+ months? (Decay accelerates after 90 days to free up leaderboard space)
- What happens when a leaderboard filter returns zero results (e.g., domain with no completed missions)? (Display empty state with suggestion to try different filters)
- How does the fraud detection handle a human legitimately submitting similar photos (e.g., multiple tree planting missions with similar backgrounds)? (pHash threshold allows 10% variance; statistical profiler considers mission variety)
- What happens when the hourly aggregation job fails multiple times? (System sends alert, falls back to real-time queries with warning banner on dashboards)
- How does the Impact Portfolio handle humans with zero completed missions? (Display "Get Started" prompt with link to mission marketplace)
- What happens when a human's streak freeze is on cooldown but they miss a day? (Streak breaks; dashboard explains cooldown period and next available freeze date)
- How does the system handle a human attempting to game their reputation by creating sock puppet accounts for self-reviews? (2-hop exclusion + IP/device fingerprinting flags clusters; admin review)
- What happens when the k6 load test identifies a critical bottleneck during peak traffic? (Issue is logged, marked as P0, and addressed before launch)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST calculate reputation scores based on a 4-factor weighted algorithm: `reputation_score = (mission_quality × 0.40 + peer_accuracy × 0.30 + streak_bonus × 0.20 + endorsement_score × 0.10) × tier_multiplier`. Factor scaling: mission quality = average `finalConfidence` of last 10 verified evidence × 100; peer accuracy = percentage of peer reviews matching final consensus × 100; streak bonus = `min(streakDays / 30, 1.0) × 100` (caps at 30 days); endorsement score = `min(endorsementCount / 10, 1.0) × 100` (caps at 10 endorsements). The total score is an absolute value recomputed from current factor averages on each reputation-affecting event (not accumulated deltas). The four factor subscores (`mission_quality_score`, `peer_accuracy_score`, `streak_score`, `endorsement_score`) are stored as running values updated on each relevant event.
- **FR-002**: System MUST apply time-based reputation decay for inactive humans (no mission completions or peer reviews in 7+ days). Decay is applied daily by a cron job at 00:00 UTC, computing the daily rate as 2%/7 ≈ 0.286% per day for the first 90 days of inactivity, accelerating to 5%/7 ≈ 0.714% per day after 90 days. Reputation cannot decay below 0.
- **FR-003**: System MUST define 5 reputation tiers with thresholds: Newcomer (0-99), Contributor (100-499), Advocate (500-1999), Leader (2000-4999), Champion (5000+).
- **FR-003a**: System MUST provide a 7-day grace period before tier demotion when reputation falls below a tier threshold due to decay. Humans retain tier privileges during the grace period.
- **FR-004**: System MUST unlock privileges per tier: tier 1 (none), tier 2 (peer reviewer eligibility + 1.1x token multiplier), tier 3 (create community missions + 1.2x multiplier), tier 4 (governance voting + 1.5x multiplier), tier 5 (mentor status + 2.0x multiplier).
- **FR-005**: System MUST display leaderboards for reputation, total impact, ImpactTokens earned, and missions completed, each supporting filters by domain, time period (all-time, month, week), and location (global, country via ISO-3166 code, city via name). Each leaderboard displays top 100 entries per filter combination (hard cap — no pagination beyond 100). All leaderboard entries MUST display usernames publicly (no anonymity option). Note: Leaderboard username visibility is independent of portfolio visibility — a human with a private portfolio still appears on leaderboards with their display name.
- **FR-006**: System MUST cache leaderboard data in Redis with 1-hour TTL and support pagination (top 100 per leaderboard).
- **FR-007**: System MUST display a public Impact Dashboard showing total missions, total ImpactTokens distributed, active humans, and missions by domain, accessible without authentication.
- **FR-008**: System MUST render a Leaflet heatmap on the Impact Dashboard visualizing mission density by location with color intensity scaling.
- **FR-009**: System MUST generate a per-human Impact Portfolio showing reputation, tier, missions completed (with thumbnails), domains contributed to, total impact generated (defined as the sum of ImpactTokens earned by the human across all completed missions), and activity timeline.
- **FR-010**: System MUST generate Open Graph tags for Impact Portfolios including title, description, and a custom thumbnail with reputation metrics for social sharing.
- **FR-011**: System MUST allow humans to toggle Impact Portfolio visibility (public, private).
- **FR-012**: System MUST track active day streaks and apply reward multipliers: 7 days (1.1x), 30 days (1.25x), 90 days (1.5x), 365 days (2.0x). Token reward multipliers stack multiplicatively with tier multipliers: `finalReward = baseReward × tierMultiplier × streakMultiplier`. Maximum combined multiplier is 4.0x (Champion 2.0x tier × 365-day 2.0x streak). No additional cap is applied.
- **FR-013**: System MUST provide a streak freeze feature (preserves streak for 1 missed day, usable once per 30 days).
- **FR-014**: System MUST implement a fraud scoring pipeline with three detection methods and the following score deltas: (a) **pHash duplicate detection**: Hamming distance 0-6 (duplicate) = +20 points, distance 7-10 (suspicious) = +5 points, distance 11+ = no score; (b) **Velocity checks**: 15+ submissions in 10 min = +30 points, 40+ in 1 hour = +20 points, 100+ in 24 hours = +10 points; (c) **Statistical profiling**: GPS variance < 0.001 over 20 submissions = flagged (weight 40%), approval rate Z-score > 3 vs platform mean = flagged (weight 35%), timing interval variance below threshold (bot-like regularity) = flagged (weight 25%). Statistical profiling combined score is `gpsScore × 0.4 + approvalScore × 0.35 + timingScore × 0.25`, contributing up to +15 points per evidence submission.
- **FR-015**: System MUST auto-reject evidence submissions when pHash detects duplicates above 90% similarity and increment fraud score.
- **FR-016**: System MUST flag accounts for admin review when fraud scores reach 50-149 and hold future submissions pending review. "Hold" means the evidence submission is stored and enqueued for processing, but verification results are withheld until an admin clears the flag; the API returns HTTP 202 Accepted with a `held: true` field indicating pending review. System MUST automatically suspend accounts when fraud scores reach 150+ and freeze all submissions; suspended accounts receive HTTP 403 Forbidden on new submission attempts.
- **FR-017**: System MUST provide an admin fraud review queue displaying flagged accounts with fraud score breakdown, evidence submissions, and action history.
- **FR-018**: System MUST allow admins to suspend accounts, reset fraud scores, or clear flags with reasoning logged in an audit trail.
- **FR-019**: System MUST run an hourly aggregation job calculating total missions (by domain, location, time period), total ImpactTokens, reputation averages, and active user counts, storing results in Redis.
- **FR-020**: System MUST provide Grafana dashboards displaying Phase 2 metrics: reputation distribution, tier population, mission completion rates, fraud detection stats, verification latency, and token distribution velocity.
- **FR-021**: System MUST support k6 load testing for 5,000 concurrent users with p95 latency under 3 seconds for leaderboards, Impact Dashboard, and evidence submission endpoints.
- **FR-022**: System MUST undergo an OWASP Top 10 security audit and automated OWASP ZAP scanning with zero P0/P1 vulnerabilities before launch.

### Key Entities

- **Reputation Score**: A numerical measure of a human's contributions and trustworthiness, calculated from four factors (mission quality, peer accuracy, streak, endorsements) and subject to time-based decay. Determines tier and privileges.
- **Reputation Tier**: A categorical level (Newcomer, Contributor, Advocate, Leader, Champion) with reputation thresholds and associated privilege unlocks (peer review, mission creation, governance, token multipliers).
- **Leaderboard Entry**: A cached ranking of humans by a specific metric (reputation, impact, tokens, missions) with filters for domain, time period, and location. Refreshed hourly.
- **Impact Metrics Aggregate**: Cached aggregate data (total missions, total tokens, active users) calculated hourly and stored in Redis to power dashboards and leaderboards.
- **Streak**: A consecutive days counter tracking daily mission completions, with milestone thresholds granting reward multipliers. Supports streak freeze to handle missed days.
- **Fraud Score**: A cumulative score tracking suspicious patterns (duplicate photos via pHash, abnormal submission velocity, statistical outliers). Triggers admin review at threshold.
- **Impact Portfolio**: A public or private profile page showcasing a human's reputation, missions, domains, and activity timeline, with Open Graph metadata for social sharing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Reputation scores are calculated and displayed within 5 seconds of a reputation-affecting event (mission completion, peer review).
- **SC-002**: Tier promotions are processed automatically within 10 seconds of crossing a threshold, with notifications delivered immediately.
- **SC-003**: Leaderboards load in under 2 seconds for top 100 entries with filters applied, served from Redis cache.
- **SC-004**: The public Impact Dashboard displays near-real-time metrics (refreshed hourly by aggregation job) and heatmap with sub-3-second load time for 1,000+ concurrent visitors.
- **SC-005**: Impact Portfolios render with Open Graph tags correctly on 95%+ of social media platforms (Twitter, LinkedIn, Facebook).
- **SC-006**: Streaks are tracked accurately with zero missed days falsely breaking streaks and streak freezes functioning correctly.
- **SC-007**: Fraud detection identifies duplicate photos at 95%+ accuracy (pHash similarity threshold 90%).
- **SC-008**: Velocity checks flag abnormal submission rates (15+ in 10 minutes) with 90%+ accuracy.
- **SC-009**: Fraud scores trigger admin review at threshold with zero false negatives (real fraud always flagged) and <10% false positives.
- **SC-010**: Hourly aggregation job completes within 5 minutes for 100,000+ mission records without blocking production queries.
- **SC-011**: Grafana dashboards display all Phase 2 metrics in real-time with <1 minute data lag.
- **SC-012**: k6 load test with 5,000 concurrent users achieves p95 latency <3 seconds for all critical endpoints (leaderboards, dashboard, evidence submission).
- **SC-013**: OWASP security audit reports zero P0/P1 vulnerabilities and all P2 findings are remediated within 7 days.
- **SC-014**: All existing 810+ tests continue to pass and 40+ new tests cover reputation, leaderboards, fraud detection, and aggregation pipelines.
- **SC-015**: 90% of humans can find their rank on a leaderboard within 30 seconds of opening the page. Note: This is a UX usability metric requiring manual testing or user study; it cannot be validated by automated integration tests.
- **SC-016**: Reputation decay calculations are accurate with no balance drift (verified by audit queries).

## Assumptions

- Humans are motivated by public recognition (leaderboards, portfolios) and tangible benefits (token multipliers, privilege unlocks).
- The 4-factor reputation algorithm (mission quality, peer accuracy, streak, endorsements) balances multiple contribution types fairly.
- Redis cache capacity is sufficient for leaderboard data (top 100 per leaderboard × 4 leaderboards × 3 time periods × 15 domains ≈ 18,000 entries + aggregates).
- The hourly aggregation interval is sufficient for freshness; near-real-time aggregation is not required for Phase 2.
- Perceptual hashing (pHash) with 90% similarity threshold balances duplicate detection accuracy and false positives.
- Humans will tolerate up to 1-hour lag in leaderboard rankings due to cache TTL.
- The existing ImpactToken accounting system (Sprint 6) supports reward multipliers via multiplication before transaction insertion.
- The existing WebSocket event feed can be extended to emit reputation and tier change events.
- Grafana is already deployed and connected to the production database with read-only credentials.
- k6 load testing can be conducted in a staging environment that mirrors production specs.
- OWASP ZAP can run automated scans without generating excessive false positives requiring manual triage.
- Open Graph tags will be compatible with the Next.js 15 metadata API for server-side rendering.

## Scope Boundaries

**In Scope**:
- 4-factor reputation scoring engine with time-based decay
- 5 reputation tiers with privilege unlocks (peer review, mission creation, governance, token multipliers)
- Leaderboards (reputation, impact, tokens, missions) with domain/time/location filters and Redis caching
- Public Impact Dashboard with aggregated metrics and Leaflet heatmap
- Per-user Impact Portfolio with Open Graph tags for social sharing
- Streak system with reward multipliers and streak freeze
- Hourly impact metrics aggregation job (missions, tokens, users by domain/location/time)
- Fraud detection pipeline (pHash duplicate detection, velocity checks, statistical profiling)
- Admin fraud review queue with suspend/clear/reset actions
- Phase 2 Grafana dashboards (reputation, tiers, missions, fraud, verification latency)
- k6 load test for 5,000 concurrent users
- Phase 2 OWASP Top 10 + ZAP security audit
- 40+ integration tests covering reputation, leaderboards, fraud detection, and aggregation

**Out of Scope**:
- Real-time leaderboard updates (deferred to Phase 3; 1-hour cache is acceptable for Phase 2)
- Leaderboard rewards or prizes (deferred to Phase 3 with sponsorships)
- Reputation marketplace (spending reputation for perks, deferred to Phase 3)
- Cross-platform reputation portability (deferred to Phase 3 with blockchain integration)
- Semantic fraud detection (AI-powered context analysis, deferred to Phase 3)
- Governance voting implementation (tier 4 privilege unlock noted but voting system deferred to Phase 3)
- Community mission creation implementation (tier 3 privilege unlock noted but creation flow deferred to Phase 3)
- Multi-language support for Impact Dashboard and portfolios (deferred to Phase 3)
- Custom heatmap styling / Mapbox integration (deferred to Phase 3)
- Sock puppet / sybil detection via IP/device fingerprinting and 2-hop exclusion (deferred to Phase 3; manual admin review handles edge cases in Phase 2)
- Reputation appeals process for humans (deferred to Phase 3; admin review is manual for Phase 2)

## Dependencies

- Sprint 6 (human onboarding) complete — human profiles, ImpactTokens, dashboard operational
- Sprint 7 (mission marketplace) complete — mission CRUD, claiming, expiration operational
- Sprint 8 (evidence verification) complete — evidence submission, AI verification, peer review, token rewards operational
- Redis operational for leaderboard caching and metrics aggregation
- Grafana deployed and connected to production database with read-only access
- Leaflet/OpenStreetMap integration from Sprint 7 for heatmap rendering
- k6 installed and staging environment available for load testing
- OWASP ZAP installed for automated security scanning
- Open Graph metadata support in Next.js 15 App Router
- pHash library available for perceptual image hashing (`sharp-phash`)

## Open Questions

### Q1: Reputation Tier Demotion Grace Period — RESOLVED

**Decision**: B - 7-day grace period

Humans who fall below a tier threshold due to reputation decay will have a 7-day grace period before demotion. During this period:
- They retain all tier privileges (token multipliers, peer reviewer access, etc.)
- They receive a notification warning of impending demotion with the deadline
- If they regain sufficient reputation within 7 days, the grace period is canceled
- If 7 days elapse without recovery, they are demoted to the lower tier

This provides a forgiving UX that acknowledges short breaks while still incentivizing consistent participation. Grace period state (start date, expiration) is tracked in the `humans` table.

### Q2: Leaderboard Location Filtering — RESOLVED

**Decision**: C - Tiered location filtering (global + country + city)

Leaderboards will support three levels of geographic filtering:
- Global: All humans worldwide ranked together
- Country: Filter to show only humans from a specific country (e.g., "United States", "Kenya")
- City: Filter to show only humans from a specific city (e.g., "San Francisco", "Nairobi")

Location data is derived from the existing geocoding system (Nominatim) established in Sprint 6. Leaderboard API supports `location_scope` parameter with values `global`, `country:<ISO-3166>`, or `city:<city_name>`.

### Q3: Leaderboard Privacy — RESOLVED

**Decision**: A - No anonymity, all usernames visible

All leaderboard entries will display human usernames publicly. This maximizes social proof, recognition, and competitive engagement. Privacy-conscious users retain control over their Impact Portfolio visibility (can be set to private), but leaderboard participation requires public username display. This aligns with the platform's transparency principles and ensures recognition drives participation.

### Q4: Fraud Auto-Suspension — RESOLVED

**Decision**: C - Tiered approach: auto-suspend at fraud score 150, flag for admin review at 50

The fraud detection pipeline will use a two-tier threshold system:
- **Fraud score 50-149**: Account flagged for admin review, future submissions held pending review, human notified
- **Fraud score 150+**: Account automatically suspended, all submissions frozen, admin notified for post-suspension review

This balances speed (obvious fraud auto-suspended) with safety (borderline cases reviewed by humans). Auto-suspension at 150 is reserved for egregious patterns (e.g., 10+ duplicate photos, 30+ submissions in 10 minutes, 95%+ statistical anomaly score). Admins can reverse suspensions if false positives occur.
