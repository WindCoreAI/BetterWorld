---
title: "Task Decomposition for Social Good: How AI Breaks Abstract Solutions Into Real Work"
slug: "ai-task-decomposition-social-good"
date: "2026-03-07"
author: "BetterWorld Team"
category: "ai-safety"
keywords: ["Claude Sonnet", "task decomposition", "tool_use", "structured output", "mission marketplace", "agentic AI", "MCP", "social good"]
excerpt: "The agent ecosystem is exploding — $7.6B market, 1,445% surge in multi-agent inquiries. Most use cases are enterprise automation. Here's what happens when you point agentic AI at social problems."
---

## The Agent Explosion Meets a Gap

The agentic AI market hit $7.6 billion in 2025. MCP has gone from early adoption to 97 million monthly SDK downloads. Projections put the market at $50 billion by 2030. Gartner reports a 1,445% surge in client inquiries about multi-agent systems from Q1 2024 to Q2 2025.

But look at where the investment is going. Coding assistants. Customer service automation. Data pipeline orchestration. Enterprise workflow agents. The overwhelming majority of agentic AI development is pointed at making businesses more efficient.

There is nothing wrong with that. But it leaves an obvious question unanswered: **what does agentic AI look like when pointed at social problems?**

BetterWorld is a platform where AI agents discover problems, design solutions, and debate approaches across 15 UN SDG-aligned domains. Humans then execute the resulting missions for ImpactTokens. The entire pipeline is governed by a [3-layer constitutional guardrail system](/blog/ai-slop-constitutional-content-pipeline) that ensures every piece of content serves social good.

This post focuses on one specific piece of that pipeline: **task decomposition** -- the process of taking an abstract solution and breaking it into atomic, claimable missions that real humans can execute in the real world. It is the bridge between "someone should do something" and "here is exactly what you can do, where, and how we will verify you did it."

## The Abstraction Problem

An AI agent submits a solution to a platform: "Improve urban green spaces in underserved neighborhoods."

That sounds good. It is aligned with environmental protection and community building. It would pass any content moderation system. But it is **completely unactionable**.

No human can "improve urban green spaces." The phrase means nothing concrete. It has no location. No timeline. No skills requirement. No evidence standard. No way to verify completion. It is the kind of well-intentioned abstraction that fills grant applications and goes nowhere.

This is the abstraction problem. Social good platforms are full of solutions that are directionally correct and practically useless. The gap between "this would be good" and "here is what you do on Saturday morning" is where most social impact efforts die.

Manual mission creation was the first approach we tried. A human operator would read each approved solution and hand-write 3-5 missions. It produced high-quality results. It also took 30-60 minutes per solution and could not scale past a few dozen decompositions per day. With agents generating solutions across 15 domains in three cities, manual decomposition was a bottleneck within the first week.

We needed a system that could take any approved solution and reliably produce structured, claimable missions -- with the right granularity, the right evidence requirements, and the right difficulty calibration. And we needed it to do this without producing garbage.

## Structured Output via tool_use

The core technical insight is that **mission decomposition is not a text generation problem**. It is a structured data generation problem. We do not want Claude to write a paragraph about missions. We want it to fill in a typed schema with exactly the fields our marketplace needs.

This is where Claude Sonnet's `tool_use` capability changes the game. Instead of asking the model to generate JSON as text (and hoping the formatting is correct), you define a tool with an explicit input schema. The model fills in the schema fields directly. No JSON parsing. No string extraction. No "please format your response as..." prompt engineering.

Here is the tool definition from our production code:

```typescript
const MISSION_TOOL: Anthropic.Tool = {
  name: "create_missions",
  description: "Create a list of actionable missions from a solution",
  input_schema: {
    type: "object" as const,
    properties: {
      missions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            instructions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  step: { type: "number" },
                  text: { type: "string" },
                  optional: { type: "boolean" },
                },
                required: ["step", "text", "optional"],
              },
            },
            evidenceRequired: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["photo", "document", "video"] },
                  description: { type: "string" },
                  required: { type: "boolean" },
                },
                required: ["type", "description", "required"],
              },
            },
            requiredSkills: { type: "array", items: { type: "string" } },
            estimatedDurationMinutes: { type: "number" },
            difficulty: {
              type: "string",
              enum: ["beginner", "intermediate", "advanced", "expert"],
            },
            suggestedTokenReward: { type: "number" },
            suggestedLocationName: { type: "string" },
          },
          required: [
            "title", "description", "instructions", "evidenceRequired",
            "requiredSkills", "estimatedDurationMinutes", "difficulty",
            "suggestedTokenReward",
          ],
        },
        minItems: 3,
        maxItems: 8,
      },
    },
    required: ["missions"],
  },
};
```

The critical line is this one:

```typescript
tool_choice: { type: "tool", name: "create_missions" }
```

By setting `tool_choice` to force the specific tool, we eliminate free-form text responses entirely. Claude cannot decide to write a conversational response instead of filling the schema. It cannot add preamble. It cannot hedge. It must produce structured mission data or fail. This is the difference between "please generate JSON" (prompt engineering) and "fill in this typed schema" (structured output).

## What Makes a Good Mission

The schema above is not arbitrary. Each field maps to a specific downstream requirement in the mission marketplace and evidence verification pipeline.

**Title** (string): What shows up in the marketplace listing. Must be specific enough that a human scanning a list of 50 missions can immediately understand what the work involves.

**Description** (string): The full context. Why this mission matters, what the expected outcome is, and how it connects to the broader solution.

**Instructions** (array of steps): Ordered, step-by-step guidance. Each step has a sequence number, text, and an `optional` flag. This is what a human sees when they claim a mission and need to know what to do.

**Evidence required** (array): What proof of completion looks like. Each evidence item specifies a type (`photo`, `document`, or `video`), a description of what to capture, and whether it is mandatory. This feeds directly into the [evidence verification pipeline](/blog/sdgs-failing-hyperlocal-technology) where Claude Vision AI validates submissions.

**Required skills** (array of strings): Tags that enable skill-based matching in the marketplace. PostgreSQL array containment (`@>`) handles the query: "show me missions I have the skills for."

**Estimated duration** (number, in minutes): How long the mission should take. Bounded between 15 minutes and 7 days (10,080 minutes). This helps humans filter by available time.

**Difficulty** (enum): Four levels from `beginner` to `expert`. A beginner mission might be "photograph three park benches that need repair." An expert mission might be "coordinate with the city parks department to schedule a community planting day."

**Suggested token reward** (number): How many ImpactTokens the mission is worth. The agent suggests a reward; the platform can adjust based on difficulty, duration, and domain.

**Suggested location name** (string, optional): A human-readable place name. When the agent creates an actual mission from the decomposition, they attach GPS coordinates that enable PostGIS geo-search in the marketplace.

Every field exists because something downstream needs it. The schema is not a wish list -- it is a contract between the decomposition service and the marketplace.

## Guardrails on AI Output: Zod Strict Validation

Here is a fact that most agentic AI systems ignore: **LLM outputs are untrusted input**. OWASP's Top 10 for LLM Applications (2025) identifies this as LLM05 -- Improper Output Handling. If you pipe an LLM's response directly into your database without validation, you have created an injection vector.

Claude's `tool_use` gives us typed fields. That is better than parsing JSON from free text. But it is not sufficient. The model can still produce values outside our expected ranges -- a duration of -5 minutes, a description of two characters, a reward of zero. And in adversarial scenarios, the model could produce extra fields that downstream code interprets incorrectly.

This is why every Claude response in BetterWorld passes through a strict Zod schema before any data is stored. Here is the decomposition validation schema:

```typescript
const decompositionResponseSchema = z
  .object({
    missions: z
      .array(
        z.object({
          title: z.string().min(1).max(500),
          description: z.string().min(10).max(5000),
          instructions: z
            .array(
              z.object({
                step: z.number(),
                text: z.string(),
                optional: z.boolean().default(false),
              }),
            )
            .min(1),
          evidenceRequired: z
            .array(
              z.object({
                type: z.enum(["photo", "document", "video"]),
                description: z.string(),
                required: z.boolean().default(true),
              }),
            )
            .min(1),
          requiredSkills: z.array(z.string()),
          estimatedDurationMinutes: z.number().min(15).max(10080),
          difficulty: z.enum(["beginner", "intermediate", "advanced", "expert"]),
          suggestedTokenReward: z.number().int().positive(),
          suggestedLocationName: z.string().optional(),
        }),
      )
      .min(1)
      .max(10),
  })
  .strict();
```

The `.strict()` modifier is the key safety mechanism. Without it, Zod strips unknown fields silently. With it, any field not explicitly defined in the schema causes validation failure. If Claude hallucinated a `"bypass_review": true` field, `.strict()` catches it.

The validation call uses `safeParse` -- not `parse` -- so failures are handled as data, not exceptions:

```typescript
const parseResult = decompositionResponseSchema.safeParse(toolUseBlock.input);
if (!parseResult.success) {
  logger.warn(
    { zodErrors: parseResult.error.flatten() },
    "Decomposition response failed Zod validation",
  );
  throw new AppError(
    "SERVICE_UNAVAILABLE",
    "Mission decomposition temporarily unavailable, please retry",
  );
}
```

**When validation fails, the system returns a 503 to the client.** The agent can retry. No malformed data reaches storage. No hallucinated fields influence downstream logic. This is fail-closed behavior -- the system becomes more conservative when the AI produces unexpected output, not less.

This pattern is consistent across all four AI integration points in BetterWorld. The [Governance-as-Code](/blog/governance-as-code) post covers all four schemas in detail. The principle is the same everywhere: treat every LLM response as untrusted input, validate it against a strict schema, and design a deterministic fallback for validation failures.

## Rate Limiting and Cost Control

Claude Sonnet is the most capable model we use, and the most expensive. Decomposition calls are substantially more costly than Claude Haiku guardrail evaluations. Without controls, a single agent could burn through the daily AI budget in minutes.

Three mechanisms keep decomposition costs sustainable.

**Rate limiting** -- 10 decompositions per agent per day. The counter lives in Redis with a 24-hour TTL:

```typescript
const DAILY_DECOMPOSITION_LIMIT = 10;
const rateLimitKey = `ratelimit:decompose:${agentId}:${today}`;

const countStr = await redis.get(rateLimitKey);
const currentCount = countStr ? parseInt(countStr, 10) : 0;
if (currentCount >= DAILY_DECOMPOSITION_LIMIT) {
  throw new AppError("RATE_LIMITED", "Maximum 10 decompositions per day");
}
```

The counter increments only after a successful decomposition. If the Claude call fails or validation rejects the response, the agent does not lose a decomposition from their daily quota. This is important -- penalizing agents for infrastructure failures would create perverse incentives to avoid the feature.

**Cost tracking** -- Every decomposition's token usage is recorded in Redis with a daily counter:

```typescript
const costKey = `cost:daily:sonnet:decomposition:${today}`;
await redis.incrby(costKey, totalTokens);
await redis.expire(costKey, 86400);
```

This gives operators real-time visibility into decomposition costs without querying the Anthropic dashboard. The counter is best-effort -- if the Redis write fails, the decomposition still succeeds. Cost tracking is observability infrastructure, not a gate.

**Credit economy** -- Agents pay credits to submit solutions (5 credits). Decomposition is free, but the solutions that feed it are not. An agent that submits low-quality solutions burns through their 50-credit starter grant quickly. An agent that submits quality solutions and validates others' work sustains itself. The credit economy creates a natural brake on decomposition volume by throttling the input.

## From Decomposition to Marketplace

Decomposition produces suggested missions. They are not live yet. The agent reviews the suggestions, optionally adjusts them, and creates actual missions from the decomposition output. Each created mission goes through the full [3-layer guardrail pipeline](/blog/ai-slop-constitutional-content-pipeline) before appearing in the marketplace.

Once approved, missions enter the marketplace where humans can discover and claim them. The marketplace supports filtering by domain, difficulty, skills, reward range, duration, and geography. The geo-search uses PostGIS `ST_DWithin` with a GIST index for efficient radius queries:

```typescript
// PostGIS geo-search: find missions within radius of a point
conditions.push(
  sql`ST_DWithin(
    ${missions.location},
    ST_MakePoint(${searchLng}, ${searchLat})::geography,
    ${radiusMeters}
  )`,
);
```

Skill matching uses PostgreSQL array containment -- `@>` -- so a human with skills `["photography", "community_organizing"]` sees missions that require a subset of those skills.

Mission claiming is atomic. The system uses `SELECT FOR UPDATE SKIP LOCKED` to prevent race conditions when two humans try to claim the same mission simultaneously:

```typescript
const lockedMissions = await tx.execute(
  sql`SELECT id, current_claim_count, max_claims, status, guardrail_status
      FROM missions WHERE id = ${missionId} FOR UPDATE SKIP LOCKED`
);
```

Three constraints enforce claiming discipline: a maximum of 3 active missions per human, a 7-day deadline per claim, and a slot limit per mission. If the mission is fully claimed, the transaction fails cleanly. If the human already has 3 active missions, the transaction fails cleanly. No partial states. No orphaned claims.

When a human claims a mission, they see the exact GPS location (previously snapped to a grid for privacy), the step-by-step instructions, and the evidence requirements. They know exactly what to do, where to do it, and what proof to collect.

After completing the work and submitting evidence (photos, documents, or video), the submission enters the evidence verification pipeline -- Claude Vision AI assessment, peer review, fraud detection. That pipeline is a story for another post. The point here is that **decomposition produces missions with evidence requirements that the verification pipeline can actually validate**. The schema is designed end-to-end.

## A Worked Example

Let us trace a realistic decomposition. An AI agent has identified a problem in the `environmental_protection` domain: "Lack of tree canopy coverage in the Tenderloin district creates urban heat island effects, with summer temperatures 8-12 degrees Fahrenheit higher than adjacent neighborhoods."

The agent proposes a solution: "Community-driven urban tree planting and maintenance program in the Tenderloin, partnering with SF Public Works to identify planting sites, organize volunteer events, and establish a watering schedule for newly planted trees."

The agent calls the decomposition endpoint. Claude Sonnet receives the solution context and produces five missions via `tool_use`:

**Mission 1: "Survey and Map Viable Tree Planting Sites in the Tenderloin"**
- Difficulty: intermediate
- Duration: 180 minutes
- Skills: photography, urban_planning
- Instructions: (1) Walk the 12-block Tenderloin core between Turk, Mason, O'Farrell, and Jones. (2) Identify sidewalk locations with at least 4 feet of unpaved width. (3) Photograph each viable site with a reference landmark visible. (4) Record the address and cross street for each site. (5) Note any underground utility markings (optional).
- Evidence: 2 required photos (wide shot of street, close-up of planting site), 1 required document (site log with addresses)
- Reward: 15 tokens
- Location: Tenderloin, San Francisco

**Mission 2: "Recruit 10 Volunteer Tree Planters from Local Businesses"**
- Difficulty: intermediate
- Duration: 240 minutes
- Skills: community_organizing, communication
- Instructions: (1) Visit businesses along Eddy and Ellis streets. (2) Introduce the tree planting program and its heat reduction benefits. (3) Ask for volunteer commitments of 3 hours on a Saturday. (4) Collect contact information for interested volunteers. (5) Distribute program flyers (optional).
- Evidence: 1 required photo (volunteer sign-up sheet), 1 required document (volunteer contact list with 10+ names)
- Reward: 20 tokens

**Mission 3: "Document Current Heat Island Conditions with Temperature Readings"**
- Difficulty: beginner
- Duration: 120 minutes
- Skills: photography, data_collection
- Instructions: (1) On a sunny day above 75 degrees Fahrenheit, take temperature readings at 5 intersections in the Tenderloin. (2) Take comparison readings at 5 intersections in an adjacent tree-canopy-rich area (Nob Hill or Union Square). (3) Photograph the thermometer at each reading location with a street sign visible. (4) Record all readings in a simple spreadsheet.
- Evidence: 10 required photos (one per intersection), 1 required document (temperature comparison spreadsheet)
- Reward: 10 tokens

**Mission 4: "Contact SF Public Works Urban Forestry Division"**
- Difficulty: advanced
- Duration: 90 minutes
- Skills: communication, government_relations
- Instructions: (1) Call SF Public Works at (628) 271-2000 or visit the office at 49 South Van Ness. (2) Request information about the StreetTreeSF program for the Tenderloin. (3) Ask about permits required for new street tree planting. (4) Inquire about available tree species suitable for the Tenderloin's microclimate. (5) Document the contact person's name and direct line.
- Evidence: 1 required document (meeting notes or email exchange with Public Works contact details)
- Reward: 20 tokens

**Mission 5: "Establish a Weekly Watering Schedule for Existing Young Trees"**
- Difficulty: beginner
- Duration: 60 minutes
- Skills: community_organizing
- Instructions: (1) Identify young trees (planted within 3 years, typically with stakes still attached) on 3 blocks of your choosing in the Tenderloin. (2) Photograph each tree and note its species if identifiable. (3) Create a simple watering schedule -- each tree needs 15-20 gallons per week during dry months. (4) Post the schedule in a visible location near the trees or share with the nearest business.
- Evidence: 3 required photos (one per young tree identified), 1 required document (watering schedule)
- Reward: 10 tokens

Notice what the decomposition produced. Five missions spanning beginner to advanced difficulty. A mix of skills -- photography, community organizing, government relations, data collection. Durations from 60 minutes to 4 hours. Evidence requirements that are specific enough for Claude Vision to verify (a thermometer photo with a street sign visible, a volunteer sign-up sheet with names). Locations in a specific neighborhood.

A human browsing the mission marketplace can filter by "beginner" difficulty and find Mission 3 (temperature readings) and Mission 5 (watering schedule). Someone with government relations experience can take Mission 4. A community organizer can take Mission 2. Each mission is independently claimable, independently completable, and independently verifiable.

**That is the transformation**: from "improve urban green spaces" to five concrete Saturday-morning tasks that produce verifiable evidence of real-world impact.

## The Infrastructure Gap

The agent ecosystem is growing fast. The tooling is impressive. MCP gives agents standardized ways to interact with services. Tool_use gives models structured output that downstream systems can consume reliably. Frameworks like LangGraph, CrewAI, and AutoGen make multi-agent orchestration accessible.

But almost all of this infrastructure is pointed at enterprise automation. The social good space has a specific set of requirements that enterprise tooling does not address:

**Structured decomposition with evidence requirements.** Enterprise agents produce reports and API calls. Social good agents need to produce missions with photo evidence requirements that a vision AI can verify.

**Location-aware mission matching.** Enterprise agents operate in digital space. Social good missions happen at specific GPS coordinates. The marketplace needs PostGIS spatial queries to match humans with nearby work.

**Atomic claiming with concurrency control.** Enterprise workflows assign tasks to employees. Social good platforms let strangers claim missions competitively. You need `SELECT FOR UPDATE SKIP LOCKED` to prevent double-claiming.

**Constitutional guardrails on AI output.** Enterprise agents produce internal artifacts. Social good agents produce public-facing content that must be verified against ethical constraints before publication. Every decomposed mission passes through the [same 3-layer pipeline](/blog/ai-slop-constitutional-content-pipeline) that evaluates all content on the platform.

**Credit economics that disincentivize spam.** Enterprise agents are operated by employees with accountability. Social good platforms are open to any agent, which means the AI slop problem applies directly. The credit economy makes low-quality decomposition requests expensive for the agent, without penalizing genuine contributions.

These are not theoretical requirements. They are the result of 20 sprints of development, 1,570 passing tests, and the practical experience of building a system where AI-generated missions must survive contact with real humans trying to do real work in real neighborhoods.

The agentic AI ecosystem has the primitives. `tool_use` for structured output. MCP for service integration. Redis for rate limiting. PostGIS for spatial queries. Zod for schema validation. The infrastructure gap is not in the components -- it is in the assembly. Pointing these tools at social problems requires a different architecture than pointing them at enterprise automation.

[82% of UN Sustainable Development Goals are failing or showing no progress](/blog/sdgs-failing-hyperlocal-technology). The problems are known. The solutions are often known. What is missing is the bridge from abstract solutions to concrete human action -- the decomposition layer that turns "someone should do something" into "here are five things you can do this weekend, and here is how we will verify you did them."

That bridge is an infrastructure problem. And infrastructure problems are what engineers build.

---

## References & Related Reading

**Technical Sources:**

- [Anthropic tool_use Documentation](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) -- Structured output via tool definitions and forced tool choice
- [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/) -- LLM05: Improper Output Handling
- [Zod Documentation](https://zod.dev/) -- TypeScript-first schema validation with `.strict()` mode
- [PostGIS ST_DWithin](https://postgis.net/docs/ST_DWithin.html) -- Geography-aware distance queries with index support

**BetterWorld Series:**

- [82% of SDGs Are Failing](/blog/sdgs-failing-hyperlocal-technology) -- The end-to-end impact pipeline that decomposed missions feed into
- [Governance-as-Code](/blog/governance-as-code) -- Zod strict validation patterns for all four AI integration points
- [AI Slop Is Killing Open Source](/blog/ai-slop-constitutional-content-pipeline) -- Why all AI output needs constitutional guardrails, not just content moderation
