---
title: "Market Design for Volunteering: Creating a Mission Marketplace Without Commodifying People"
slug: "market-design-volunteering-mission-marketplace"
date: "2026-03-14"
author: "BetterWorld Team"
category: "platform-design"
keywords: ["marketplace design", "mission marketplace", "volunteering", "soulbound tokens", "atomic claiming", "game mechanics", "volunteer engagement", "market design"]
excerpt: "The volunteer platform market is projected to reach $2.78B by 2035. But most platforms commodify human effort the same way gig economy apps commodify labor. Here's how to design a marketplace with the same mechanics and opposite values."
---

## The Billion-Dollar Commodity Problem

The corporate volunteer platform market is projected to reach $2.78 billion by 2035, growing at a 9.3% CAGR. Open any volunteer matching platform and you'll see a familiar design: browse tasks, claim one, complete it, get a badge. The UX is nearly identical to DoorDash or TaskRabbit. Same matching algorithms. Same claiming mechanics. Same progress bars. Same implicit message: your time is a commodity to be allocated efficiently.

This is a design problem, not a technology problem. The mechanics of a marketplace -- matching, claiming, incentives, deadlines -- are powerful. They solve real coordination problems. They get people to the right tasks. They create accountability. The question is whether those mechanics serve the participants or extract from them.

Gig economy platforms and volunteer platforms use the same mechanics. Same matching. Same claiming. Same deadlines. But the design decisions *behind* those mechanics reveal opposite values. Here's where the differences live -- in the constraints, the incentives, and the relationship between the platform and the participant.

This post walks through nine design decisions that separate a mission marketplace from a gig economy app -- drawn from BetterWorld's production code across 20 sprints of development. Not theory. Not wireframes. Running infrastructure.

## Constraint 1: Max 3 Active Missions

Gig economy platforms want maximum throughput. The more orders a driver accepts, the more revenue the platform earns. There is no structural incentive to prevent overcommitment -- in fact, the opposite. Surge pricing, acceptance rate penalties, and streak bonuses all push workers toward taking more than they can sustainably handle. The result is well-documented: burnout, abandonment, and high workforce churn — studies of ride-sharing platforms have found that nearly half of drivers quit within their first year.

BetterWorld caps active missions at three per human. Not a suggestion. A database-enforced constraint:

```typescript
// Inside atomic transaction:
const activeClaimsResult = await tx.execute(
  sql`SELECT COUNT(*)::int as count
      FROM mission_claims
      WHERE human_id = ${human.id} AND status = 'active'`
);
if (activeCount >= 3)
  throw new AppError("FORBIDDEN", "Maximum 3 active missions reached");
```

**Why three?** It's a balance between engagement and sustainability. One active mission means long idle periods between completions. Five means context-switching overhead dominates. Three allows a primary mission, a secondary mission in progress, and one waiting for peer review -- without any of them competing for attention.

This constraint is philosophically opposite to gig design. A gig platform optimizes for the platform's throughput. A mission marketplace optimizes for the participant's sustained engagement. The difference shows up in the data: platforms with sustainable workload caps see significantly lower churn than those that incentivize overcommitment.

Mission buddies -- where you invite a connection to co-complete a mission -- count as 0.5 toward the cap. Cooperative work is structurally cheaper than solo work. The system literally incentivizes collaboration over individual throughput.

## Constraint 2: Atomic Claiming Without Competition

When an Uber driver sees a ride request, they're racing against every other driver in the area. The fastest tap wins. This creates a competitive dynamic where drivers feel constant pressure to accept immediately, even when they shouldn't -- while driving, while eating, while sleeping. The platform profits from this urgency. The drivers do not.

BetterWorld's mission claiming uses `SELECT FOR UPDATE SKIP LOCKED` -- a PostgreSQL concurrency pattern that eliminates competition entirely:

```typescript
const lockedMissions = await tx.execute(
  sql`SELECT id, current_claim_count, max_claims,
             status, guardrail_status
      FROM missions
      WHERE id = ${missionId}
      FOR UPDATE SKIP LOCKED`
);

if (!lockedMission)
  throw new AppError("CONFLICT", "Mission being processed — retry");
if (lockedMission.current_claim_count >= lockedMission.max_claims)
  throw new AppError("CONFLICT", "Fully claimed");

// Insert claim with 7-day deadline
const deadlineAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
```

**`FOR UPDATE`** acquires a row-level lock on the mission. No other transaction can modify it while the claim is being processed. **`SKIP LOCKED`** means that if another transaction already holds the lock, the current query skips that row instead of waiting -- returning immediately with an empty result. The caller gets a clean "mission being processed" error instead of a timeout.

This has profound UX implications. Two volunteers claiming the same mission at the same millisecond don't race. One gets the lock, processes the claim atomically (check capacity, insert claim, increment count, set deadline), and commits. The other gets an immediate, clear response: "Mission being processed -- retry." No ambiguity. No wasted time. No urgency-driven decision-making.

The 7-day deadline is equally deliberate. Gig platforms measure task completion in minutes because time is money -- the platform's money. A 7-day window says: **this is your mission, take the time you need to do it well.** The deadline exists for accountability, not extraction.

## Constraint 3: Soulbound Rewards

Every gig economy platform pays in money. Money is fungible -- it can be traded, speculated on, accumulated by those who already have it, and used to purchase influence. This is appropriate for labor markets. It is catastrophic for volunteer communities.

BetterWorld's ImpactTokens are **soulbound** -- non-transferable by design. You cannot send tokens to another user. You cannot sell them. You cannot trade them on any exchange. They are permanently bound to the account that earned them.

The credit economy uses double-entry accounting with 25+ transaction types:

- `earn_mission` -- completing a verified mission
- `earn_validation` -- participating in peer review
- `spend_problem` -- submitting a problem (costs 2 credits)
- `spend_solution` -- proposing a solution (costs 5 credits)
- `spend_debate` -- participating in a debate (costs 1 credit)
- `earn_streak` -- maintaining activity consistency
- `spend_cheer` -- sending encouragement to a fellow volunteer (1 token gift)

Every transaction records `balance_before` and `balance_after`, creating a complete audit trail. Every write uses `SELECT FOR UPDATE` to prevent double-spending. The system has the rigor of financial accounting with none of the financialization.

**Why does this matter?** Because the moment tokens become tradeable, the incentive structure inverts. People start gaming for tokens instead of completing missions for impact. Reputation becomes purchasable. Wealthy users can buy influence. The marketplace becomes indistinguishable from any other platform where money buys status.

Soulbound tokens encode a principle: **reputation should be earned, never bought.** Your tier (Newcomer through Champion), your specialist badges, your streak -- all of these reflect actual work you've done, verified by peers who don't know you. No shortcut exists. No market for reputation exists. The only way to accumulate ImpactTokens is to make the world measurably better.

For a deeper dive into the credit economy design, see [Soulbound Tokens Without the Blockchain](/blog/soulbound-tokens-without-blockchain).

## The Matching Problem: Skills, Geography, and Domain

Gig platforms match on one dimension: proximity. The nearest available driver gets the ride. This is efficient but reductive -- it treats workers as interchangeable units of labor.

Mission matching operates across three dimensions simultaneously.

**Skill matching** uses PostgreSQL array containment to find missions that match a volunteer's capabilities:

```typescript
if (skills) {
  const skillsArr = skills.split(",")
    .map(s => s.trim())
    .filter(Boolean);
  conditions.push(
    sql`${missions.requiredSkills} @> ARRAY[${sql.join(
      skillsArr.map(s => sql`${s}`),
      sql`, `
    )}]::text[]`
  );
}
```

The `@>` operator checks array containment: does the mission's `requiredSkills` array contain all of the specified skills? This is a GIN-indexed operation that scales to millions of missions without degradation. A volunteer searching for missions matching "photography" and "community outreach" gets results filtered at the database level -- not through application-level loops.

**Geographic matching** uses PostGIS spatial queries:

```typescript
const radiusMeters = searchRadius * 1000;
conditions.push(
  sql`ST_DWithin(
    ${missions.location},
    ST_MakePoint(${searchLng}, ${searchLat})::geography,
    ${radiusMeters}
  )`
);
```

`ST_DWithin` computes geodesic distance on a WGS84 spheroid -- meaning it accounts for the curvature of the Earth, not just Cartesian distance. The radius adapts to population density: **10km in urban areas, 25km in suburban, 50km in rural**. A volunteer in Manhattan shouldn't see missions in Brooklyn if there are twenty available within walking distance. A volunteer in rural Montana should see everything within a reasonable drive.

**Domain matching** filters across BetterWorld's 15 UN SDG-aligned domains -- healthcare improvement, environmental protection, education access, community building, and eleven more. Each mission inherits its domain from the problem it addresses, creating end-to-end traceability from global goal to neighborhood task.

These three dimensions intersect. A nurse in San Francisco searching for healthcare missions within 5km who has "first aid" and "community outreach" skills gets a highly specific, personally relevant set of results -- not a firehose of every available task.

## Privacy in Location: Show Approximate, Reveal on Commitment

Gig platforms show exact pickup locations before the driver commits. This is necessary for the business model -- drivers need to know where they're going -- but it creates a surveillance infrastructure where the platform always knows exactly where its workers and customers are.

BetterWorld implements a **two-phase location model**: approximate before commitment, precise after.

When browsing the mission marketplace, volunteers see grid-snapped locations. The mission appears on the map in roughly the right area, but the exact GPS coordinates are obscured. This is sufficient for deciding whether a mission is in your neighborhood without revealing the exact address of the problem reporter or the precise location of the issue.

After claiming a mission -- the atomic `SELECT FOR UPDATE SKIP LOCKED` transaction described above -- the volunteer sees the exact coordinates. Location precision is earned through commitment, not given away during browsing.

This design serves multiple purposes. It protects the privacy of people who report problems (no one should be identifiable from a map pin showing "needles found in playground"). It prevents drive-by observation without commitment. And it creates a meaningful transition: when you claim a mission, the map literally sharpens, reinforcing that you've taken ownership.

The privacy pipeline goes further: EXIF metadata is stripped from all uploaded photos, face detection (SSD MobileNet v1) blurs identifiable faces, and contour-based detection obscures license plates. Evidence of impact is preserved. Personal identity is not.

## Templates: Standardizing Quality Without Removing Agency

Gig platforms standardize every aspect of task execution. A DoorDash driver follows the same pickup-deliver-confirm flow for every order. This standardization enables scale but removes all agency from the worker. You're not solving a problem -- you're executing a script.

BetterWorld's mission templates standardize quality requirements while preserving how volunteers approach the work:

```typescript
const createTemplateSchema = z.object({
  name: z.string(),
  domain: z.string(),
  difficultyLevel: z.enum(["easy", "medium", "hard", "expert"]),
  gpsRadiusMeters: z.number().int().positive().max(50000),
  requiredPhotos: z.array(
    z.object({ label: z.string(), description: z.string(), required: z.boolean() })
  ),
  completionCriteria: z.array(
    z.object({ criterion: z.string(), required: z.boolean() })
  ),
  stepInstructions: z.array(
    z.object({ step: z.number(), instruction: z.string(), photoRequired: z.boolean() })
  ),
});
```

A template defines **what success looks like**, not how to get there. "Clean up litter in a public park" specifies: take a before photo, collect at least one bag of trash, take an after photo within the GPS radius, upload both photos. It does not specify which park, which route through the park, what equipment to use, or how long to spend.

**GPS radius enforcement** via Haversine distance ensures evidence was submitted from within the mission area -- you can't photograph a clean park across town and claim credit. But within that radius, the volunteer has complete autonomy.

Templates are admin-created and Zod-validated at every boundary. AI agents can create missions from templates, inheriting the quality constraints while generating location-specific instances. This is how BetterWorld scales: the template defines the standard, AI generates the instances, humans execute with agency.

## The Expiration Safety Net: Deadlines with Grace Periods

Gig platforms punish missed deadlines harshly. Cancel too many Uber rides and your acceptance rate drops, reducing future earnings. Miss a DoorDash delivery window and you get flagged. The penalties are calibrated to make workers prioritize the platform's needs over their own.

BetterWorld's expiration system is designed around grace, not punishment:

```typescript
// BullMQ daily cron at 2 AM UTC
// Batch processing (100 at a time) with N+1 elimination
// Grace period: if any active claim still has time, skip
const hasGracePeriodClaims = activeClaims.some(
  claim => new Date(claim.deadlineAt) > now
);
if (hasGracePeriodClaims) {
  result.skippedCount++;
  continue;
}
// Otherwise: expire mission, release claims, decrement count
```

The grace period logic is the key design decision. A mission only expires when **all** active claims have passed their deadlines. If even one volunteer still has time remaining, the mission stays open. This means a slow volunteer isn't penalized because a faster one already finished -- the system waits for everyone.

Expired missions aren't deleted. They return to the marketplace for someone else to claim. The volunteer who missed the deadline loses the claim but faces no further penalty -- no reduced acceptance rate, no lower priority in future matching, no scarlet letter. Life happens. The system accommodates that.

The worker runs at 2 AM UTC to minimize user-facing impact. It processes in batches of 100 to prevent database lock contention. Each mission's expiration is wrapped in a per-item error boundary -- if one mission fails to process, the others still complete. Idempotency guards prevent double-processing if the worker runs twice.

## Hardship Protection: The Safety Net Below the Safety Net

Here is perhaps the starkest difference between gig design and mission marketplace design. In the BetterWorld credit economy, submitting problems and solutions costs tokens. This creates skin-in-the-game that discourages spam. But what happens when someone runs low?

```typescript
if (balance < HARDSHIP_THRESHOLD) {  // HARDSHIP_THRESHOLD = 10
  return { costDeducted: 0, hardshipApplied: true };
}
```

**Below 10 tokens, all submission costs are waived.** The volunteer can still submit problems, propose solutions, and participate fully. The economic incentive structure bends to prevent exclusion.

No gig platform has an equivalent. If a driver runs out of gas money, the platform doesn't care. If a freelancer can't afford to bid on projects, the marketplace ignores them. The economic design of gig platforms is indifferent to participant hardship by construction.

Hardship protection is a one-line check with a four-word variable name. It costs nothing to implement. It prevents a class of harm that most marketplace designers never consider: **the moment when your own incentive system excludes the people most motivated to participate.**

## The Comparison: Nine Design Decisions

Every marketplace makes these decisions. Most make them implicitly, optimizing for throughput and revenue. Here's how the same nine decisions look when optimized for sustained human engagement:

| Design Decision | Gig Economy | Mission Marketplace |
|---|---|---|
| **Active task limit** | Unlimited (more = more revenue) | Max 3 (prevents burnout) |
| **Claiming mechanism** | Fastest tap wins (race condition) | Atomic lock (no competition) |
| **Reward type** | Fungible money (tradeable) | Soulbound tokens (non-transferable) |
| **Matching dimensions** | Proximity only | Skills + geography + domain |
| **Location privacy** | Exact address shown pre-commit | Grid-snapped until claimed |
| **Task standardization** | Full script (no agency) | Quality template (full agency) |
| **Deadline enforcement** | Penalties reduce future earnings | Grace period, no penalty |
| **Low-balance behavior** | Excluded from platform | Hardship protection (costs waived) |
| **Cooperative work** | Structurally discouraged | Buddy system (counts as 0.5 claim) |

The mechanics are identical. Matching. Claiming. Deadlines. Incentives. Templates. The values encoded in those mechanics are opposite.

## Markets Can Serve Instead of Extract

Market design is a field with [Nobel laureates](https://www.nobelprize.org/prizes/economic-sciences/2012/summary/) (Roth and Shapley, 2012) and deep theoretical foundations. The core insight of market design is that **markets are not natural phenomena -- they are engineered systems**, and the design of those systems determines who benefits.

Alvin Roth's work on kidney exchange is the canonical example. Kidneys can't be bought or sold -- the market is "repugnant" in the technical sense. But kidneys need to be matched to recipients. Roth designed a matching algorithm that saved thousands of lives without commodifying human organs. Same mechanics as any marketplace. Opposite values from any commercial exchange.

Volunteer coordination has the same structure. Human time and effort shouldn't be commodified. But humans with skills need to find missions that match. Missions with deadlines need accountability. Quality needs verification. These are marketplace problems. The design question is whether solving them requires treating humans as inventory.

BetterWorld's mission marketplace proves it doesn't. Atomic claiming without competition. Soulbound tokens without speculation. Deadlines with grace periods. Hardship protection for the vulnerable. Privacy that sharpens on commitment. Templates that standardize quality without scripting behavior. Cooperative work that's structurally cheaper than solo work.

Same atoms as DoorDash. Different bonds. The marketplace serves the participants instead of extracting from them.

That's not a feature list. It's a design philosophy encoded in PostgreSQL constraints, Zod schemas, and BullMQ workers. And it works.

---

## References & Related Reading

**Research:**

- Business Research Insights, Corporate Volunteering Platform Market Report -- projected $2.78B by 2035, 9.3% CAGR
- Alvin E. Roth, [Nobel Prize in Economic Sciences 2012](https://www.nobelprize.org/prizes/economic-sciences/2012/summary/) -- market design and stable allocations

**BetterWorld Series:**

- [Soulbound Tokens Without the Blockchain](/blog/soulbound-tokens-without-blockchain) -- the credit economy behind mission rewards
- [82% of SDGs Are Failing](/blog/sdgs-failing-hyperlocal-technology) -- the impact pipeline missions feed
- [Task Decomposition for Social Good](/blog/ai-task-decomposition-social-good) -- how AI creates the missions this marketplace distributes
- [What Shipwreck Survivors Teach Us](/blog/shipwreck-survivors-platform-design) -- the social science behind cooperative design
