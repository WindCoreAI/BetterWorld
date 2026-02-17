# Quickstart: Cooperative Depth & Governance

**Branch**: `018-cooperative-depth-governance` | **Date**: 2026-02-16

## Prerequisites

- Sprint 16 (Social Fabric Foundation) deployed — follows, connections, discussions, notifications, care moments
- Sprint 17 (Community Identity & Visible Growth) deployed — domain pages, city chapters, milestones, growth dashboard, review feedback
- PostgreSQL 16 + PostGIS running (dev Docker or Supabase)
- Redis 7 running (dev Docker or Upstash)
- Node.js 22+, pnpm installed

## Getting Started

### 1. Database Migration

```bash
cd packages/db
pnpm drizzle-kit generate  # Generate migration 0017
pnpm drizzle-kit migrate   # Apply migration
```

Migration `0017_cooperative_depth_governance.sql` creates:
- 12 new enums (mentorship_status, buddy_status, help_offer_status, moderator_action_type, circle_role, circle_post_type, case_study_status, challenge_type, challenge_status, pathway_level, cooperative_achievement_type, feed_event_type)
- 18 new tables (mentorships, mission_help_offers, circles, circle_members, circle_posts, circle_missions, cooperative_achievements, cooperative_achievement_earners, moderator_actions, learning_pathways, case_studies, group_challenges, challenge_participants, power_distribution_snapshots, agent_fingerprints, feed_events, mission_endorsements, ambassador_assignments)
- 10 new transaction_type enum values
- 6 new content_type enum values
- 1 new mission_status enum value (pending_endorsement)
- Column additions to humans, solutions, endorsements, mission_claims, missions

### 2. New API Route Groups

Register new route groups in `apps/api/src/index.ts`:

```typescript
// New route groups for Sprint 18
import mentorships from "./routes/mentorships/index.js";
import missionBuddies from "./routes/mission-buddies/index.js";
import moderator from "./routes/moderator/index.js";
import learningPathways from "./routes/learning-pathways/index.js";
import caseStudies from "./routes/case-studies/index.js";
import humanSolutions from "./routes/human-solutions/index.js";
import humanMissions from "./routes/human-missions/index.js";
import discover from "./routes/discover/index.js";
import feed from "./routes/feed/index.js";
import governance from "./routes/governance/index.js";

app.route("/api/v1/mentorships", mentorships);
app.route("/api/v1", missionBuddies);  // Nested under /missions/:id/claims
app.route("/api/v1/moderator", moderator);
app.route("/api/v1/learning-pathways", learningPathways);
app.route("/api/v1/case-studies", caseStudies);
app.route("/api/v1", humanSolutions);  // Nested under /problems/:id/solutions
app.route("/api/v1/missions", humanMissions);
app.route("/api/v1/discover", discover);
app.route("/api/v1/feed", feed);
app.route("/api/v1/governance", governance);
```

### 3. New Workers

Register in `apps/api/src/workers/all-workers.ts`:

```typescript
const { createAchievementDetectionWorker } = await import("./achievement-detection.js");
const { createCaseStudyCurationWorker } = await import("./case-study-curation.js");
const { createPowerAuditWorker } = await import("./power-audit.js");
const { createAgentFingerprintWorker } = await import("./agent-fingerprint.js");
const { createModeratorEligibilityWorker } = await import("./moderator-eligibility.js");
const { createFeedEventProcessorWorker } = await import("./feed-event-processor.js");
const { createMentorshipExpiryWorker } = await import("./mentorship-expiry-worker.js");

// Add to workers array:
{ name: "achievement-detection", create: createAchievementDetectionWorker },
{ name: "case-study-curation", create: createCaseStudyCurationWorker },
{ name: "power-audit", create: createPowerAuditWorker },
{ name: "agent-fingerprint", create: createAgentFingerprintWorker },
{ name: "moderator-eligibility", create: createModeratorEligibilityWorker },
{ name: "feed-event-processor", create: createFeedEventProcessorWorker },
{ name: "mentorship-expiry", create: createMentorshipExpiryWorker },
```

Worker schedules:
| Worker | Cron | Purpose |
|--------|------|---------|
| achievement-detection | `0 3 * * 0` (Sun 3 AM) | Weekly cooperative achievement scan |
| case-study-curation | `0 2 * * 6` (Sat 2 AM) | Weekly case study identification |
| power-audit | `0 5 * * 1` (Mon 5 AM) | Weekly governance metrics |
| agent-fingerprint | `0 6 * * 1` (Mon 6 AM) | Weekly agent behavioral profiles |
| moderator-eligibility | `0 5 * * *` (Daily 5 AM) | Daily moderator qualification check |
| feed-event-processor | `*/15 * * * *` (Every 15 min) | Feed event scoring + pruning |
| mentorship-expiry | `0 * * * *` (Hourly) | Check expired mentorships, trigger ratings |

### 4. New Frontend Pages

```
apps/web/app/
├── mentorship/page.tsx         # Mentorship dashboard
├── learning/page.tsx           # Learning pathways overview
├── learning/[domain]/page.tsx  # Domain pathway detail
├── case-studies/page.tsx       # Case study library
├── case-studies/[id]/page.tsx  # Case study detail
├── discover/page.tsx           # People discovery
├── governance/page.tsx         # Community governance (public)
└── network-health/page.tsx     # Network health dashboard
```

Add nav links in `apps/web/src/components/Navigation.tsx`:
```typescript
{ href: "/learning", label: "Learning" },
{ href: "/discover", label: "Discover" },
```

### 5. Key Implementation Patterns

**Token Flows** — All use double-entry accounting:
```typescript
// Inside db.transaction():
// 1. Lock sender (SELECT FOR UPDATE)
// 2. Lock receiver (SELECT FOR UPDATE)
// 3. Debit sender balance
// 4. Credit receiver balance
// 5. Insert debit tokenTransaction (balance_before/after)
// 6. Insert credit tokenTransaction (balance_before/after)
// 7. Idempotency key for replay protection
```

**Guardrail Integration** — All user-generated content:
```typescript
// 1. Layer A: evaluateLayerA(content) — sync regex
// 2. Store with guardrailStatus: "pending"
// 3. Queue Layer B: guardrailQueue.add("evaluate", { contentType, content })
// 4. Callback updates guardrailStatus on completion
// 5. Public queries filter WHERE guardrailStatus = 'approved'
```

**Tier-Based Mission Limits**:
```typescript
// In mission claiming route:
const tier = await getTierForHuman(tx, human.id);
const limits = { newcomer: 2, contributor: 3, advocate: 4, leader: 5, champion: 6 };
let maxActive = limits[tier] ?? 3;

// Safeguard: check completion rate
const completionRate = await getCompletionRate(tx, human.id);
if (completionRate < 0.80) maxActive = Math.max(maxActive - 1, 1);

// Buddy claims count as 0.5
const activeCount = await getWeightedActiveCount(tx, human.id);
if (activeCount >= maxActive) throw new AppError("FORBIDDEN", `Maximum ${maxActive} active missions`);
```

### 6. Testing

Run existing tests to verify no regressions:
```bash
pnpm test --filter=api      # API tests
pnpm test --filter=web      # Frontend tests
pnpm test --filter=guardrails  # Guardrail tests
```

New test files to create:
- `apps/api/src/tests/mentorships.test.ts`
- `apps/api/src/tests/mission-buddies.test.ts`
- `apps/api/src/tests/moderator.test.ts`
- `apps/api/src/tests/learning-pathways.test.ts`
- `apps/api/src/tests/case-studies.test.ts`
- `apps/api/src/tests/circles.test.ts`
- `apps/api/src/tests/challenges.test.ts`
- `apps/api/src/tests/human-agency.test.ts`
- `apps/api/src/tests/enhancements.test.ts`
- `apps/web/src/tests/mentorship.test.tsx`
- `apps/web/src/tests/pathways.test.tsx`
- `apps/web/src/tests/moderator.test.tsx`

### 7. Configuration

**Feature Flags** (Redis-backed):
- `MENTORSHIP_ENABLED` — gate mentorship features
- `MISSION_BUDDIES_ENABLED` — gate buddy claims
- `MODERATOR_ROLE_ENABLED` — gate moderator access
- `LEARNING_PATHWAYS_ENABLED` — gate learning features
- `HUMAN_AGENCY_ENABLED` — gate human-proposed solutions/missions
- `PERSONALIZED_FEED_ENABLED` — gate personalized feed (fallback to global)

**Environment Variables**:
- No new env vars required — reuses existing ANTHROPIC_API_KEY for case study summaries
- AI budget tracking via existing Redis counters

## Architecture Decisions

1. **Buddy claims as 0.5 weight**: Stored as `is_buddy` boolean on mission_claims, weighted in count query
2. **Moderator domain scoping**: Server-side filter on Layer C queue, not client-side
3. **Case study AI summaries**: Claude Sonnet 4.5 via existing @anthropic-ai/sdk, structured output
4. **Feed event pruning**: 30-day retention, processed every 15 minutes
5. **Achievement detection**: Weekly batch scan, not real-time (simpler, sufficient for UX)
6. **Power audit**: Weekly Gini computation, public page with historical trend
7. **Ambassador rotation**: Round-robin among eligible advocates+ in same domain/city
