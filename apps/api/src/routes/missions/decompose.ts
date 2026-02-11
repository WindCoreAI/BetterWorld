/**
 * Mission Decomposition Routes (Sprint 7: Mission Marketplace)
 *
 * POST /api/v1/internal/solutions/:solutionId/decompose
 * Uses Claude Sonnet to decompose an approved solution into 3-8 actionable missions.
 */

import crypto from "crypto";

import Anthropic from "@anthropic-ai/sdk";
import { problems, solutions } from "@betterworld/db";
import { AppError } from "@betterworld/shared";
import type { DecomposedMission } from "@betterworld/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type Redis from "ioredis";

import { getDb, getRedis } from "../../lib/container.js";
import { parseUuidParam } from "../../lib/validation.js";
import { requireAgent } from "../../middleware/auth.js";
import type { AuthEnv } from "../../middleware/auth.js";
import { logger } from "../../middleware/logger.js";

const DAILY_DECOMPOSITION_LIMIT = 10;
const SONNET_MODEL = process.env.CLAUDE_SONNET_MODEL ?? "claude-sonnet-4-5-20250929";
const MAX_TOKENS = 4096;
const SECONDS_PER_DAY = 86400;

const SYSTEM_PROMPT = `You are a mission decomposition assistant for BetterWorld, a social good platform.
Given a solution description, create 3-8 concrete, actionable missions that humans can complete in the real world.
Each mission should be:
- Specific and achievable by one person
- Tied to a physical location or community
- Completable with verifiable evidence (photos, documents, or videos)
- Aligned with UN Sustainable Development Goals
- Inclusive of step-by-step instructions`;

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
            "title",
            "description",
            "instructions",
            "evidenceRequired",
            "requiredSkills",
            "estimatedDurationMinutes",
            "difficulty",
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

/** Check the per-agent daily decomposition rate limit (read-only, no increment). */
async function checkRateLimit(
  redis: Redis | null,
  agentId: string,
  today: string,
): Promise<{ rateLimitKey: string; currentCount: number }> {
  const rateLimitKey = `ratelimit:decompose:${agentId}:${today}`;
  let currentCount = 0;

  if (redis) {
    const countStr = await redis.get(rateLimitKey);
    currentCount = countStr ? parseInt(countStr, 10) : 0;
    if (currentCount >= DAILY_DECOMPOSITION_LIMIT) {
      throw new AppError("RATE_LIMITED", "Maximum 10 decompositions per day");
    }
  }

  return { rateLimitKey, currentCount };
}

/** Increment the rate limit counter after a successful decomposition. */
async function incrementRateLimit(redis: Redis | null, rateLimitKey: string): Promise<void> {
  if (!redis) return;
  try {
    const count = await redis.incr(rateLimitKey);
    if (count === 1) {
      await redis.expire(rateLimitKey, SECONDS_PER_DAY);
    }
  } catch {
    // Non-fatal: rate limit counter increment failed
  }
}

/** Call Claude Sonnet to decompose a solution into missions. */
async function callSonnetDecomposition(
  solutionTitle: string,
  solutionDescription: string,
  solutionApproach: string,
  problemDomain: string,
  requiredSkills: string[],
): Promise<Anthropic.Message> {
  const anthropic = new Anthropic();

  return anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [MISSION_TOOL],
    tool_choice: { type: "tool", name: "create_missions" },
    messages: [
      {
        role: "user",
        content: `Decompose this solution into 3-8 actionable missions:

Title: ${solutionTitle}
Description: ${solutionDescription}
Approach: ${solutionApproach}
Domain: ${problemDomain}
Required Skills: ${requiredSkills.join(", ")}`,
      },
    ],
  });
}

/** Extract missions from the tool_use block in the Anthropic response. */
function extractMissions(response: Anthropic.Message): DecomposedMission[] {
  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );

  if (!toolUseBlock) {
    throw new AppError("SERVICE_UNAVAILABLE", "Claude Sonnet failed to generate missions");
  }

  const { missions } = toolUseBlock.input as { missions: DecomposedMission[] };
  return missions;
}

/** Track Sonnet token usage cost in Redis (best-effort). */
async function trackCost(
  redis: Redis | null,
  today: string,
  totalTokens: number,
): Promise<void> {
  if (!redis) return;
  try {
    const costKey = `cost:daily:sonnet:decomposition:${today}`;
    await redis.incrby(costKey, totalTokens);
    await redis.expire(costKey, SECONDS_PER_DAY);
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : "Unknown" },
      "Failed to track decomposition cost in Redis",
    );
  }
}

const decomposeRoutes = new Hono<AuthEnv>();

// POST /:solutionId/decompose — Decompose solution into missions via Claude Sonnet
decomposeRoutes.post("/:solutionId/decompose", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const solutionId = parseUuidParam(c.req.param("solutionId"), "solutionId");
  const agent = c.get("agent")!;

  // Fetch solution and verify ownership + approval status
  const [solution] = await db
    .select({
      id: solutions.id,
      title: solutions.title,
      description: solutions.description,
      approach: solutions.approach,
      proposedByAgentId: solutions.proposedByAgentId,
      guardrailStatus: solutions.guardrailStatus,
      problemId: solutions.problemId,
      requiredSkills: solutions.requiredSkills,
    })
    .from(solutions)
    .where(eq(solutions.id, solutionId))
    .limit(1);

  if (!solution) {
    throw new AppError("NOT_FOUND", "Solution not found");
  }
  if (solution.proposedByAgentId !== agent.id) {
    throw new AppError("FORBIDDEN", "You can only decompose your own solutions");
  }
  if (solution.guardrailStatus !== "approved") {
    throw new AppError("FORBIDDEN", "Only approved solutions can be decomposed into missions");
  }

  // Fetch the parent problem for domain context
  const [problem] = await db
    .select({ id: problems.id, domain: problems.domain, title: problems.title })
    .from(problems)
    .where(eq(problems.id, solution.problemId))
    .limit(1);

  if (!problem) {
    throw new AppError("NOT_FOUND", "Parent problem not found");
  }

  // Rate limit: 10 decompositions per day per agent
  const redis = getRedis();
  const today = new Date().toISOString().split("T")[0]!;
  const { rateLimitKey, currentCount } = await checkRateLimit(redis, agent.id, today);

  // Call Claude Sonnet
  let anthropicResponse: Anthropic.Message;
  try {
    anthropicResponse = await callSonnetDecomposition(
      solution.title,
      solution.description,
      solution.approach,
      problem.domain,
      solution.requiredSkills,
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error(
      { error: err instanceof Error ? err.message : "Unknown", solutionId, agentId: agent.id },
      "Claude Sonnet decomposition API call failed",
    );
    throw new AppError("SERVICE_UNAVAILABLE", "Mission decomposition service temporarily unavailable");
  }

  // Extract missions from tool_use response
  let suggestedMissions: DecomposedMission[];
  try {
    suggestedMissions = extractMissions(anthropicResponse);
  } catch (err) {
    logger.error(
      { solutionId, agentId: agent.id },
      "Claude Sonnet did not return a tool_use block",
    );
    throw err;
  }

  // Increment rate limit only after successful decomposition
  await incrementRateLimit(redis, rateLimitKey);

  // Track cost
  const tokensUsed = {
    input: anthropicResponse.usage.input_tokens,
    output: anthropicResponse.usage.output_tokens,
  };
  await trackCost(redis, today, tokensUsed.input + tokensUsed.output);

  const decompositionId = crypto.randomUUID();
  const dailyDecompositionsRemaining = Math.max(0, DAILY_DECOMPOSITION_LIMIT - currentCount);

  logger.info(
    { solutionId, agentId: agent.id, decompositionId, missionCount: suggestedMissions.length, tokensUsed },
    "Solution decomposed into missions",
  );

  return c.json({
    ok: true,
    data: {
      solutionId,
      suggestedMissions,
      decompositionId,
      tokensUsed,
      dailyDecompositionsRemaining,
    },
    requestId: c.get("requestId"),
  });
});

export default decomposeRoutes;
