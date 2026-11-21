import Anthropic from "@anthropic-ai/sdk";
import pino from "pino";
import type { LayerBResult, ContentType } from "@betterworld/shared/types/guardrails";
import { classifierResponseSchema } from "@betterworld/shared/schemas/classifier-response";
import { promptTemplate } from "./prompt-template";

const logger = pino({ name: "guardrails:layer-b" });

/**
 * Thrown when the classifier cannot produce a verdict for a reason that
 * retrying will not fix: no API key, a rejected key, an unknown or retired
 * model, or a request the provider refuses. Callers route the content to human
 * review instead of retrying.
 */
export class LayerBUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "LayerBUnavailableError";
  }
}

/** HTTP statuses from the provider that will not succeed on retry. */
const PERMANENT_PROVIDER_STATUSES = new Set([400, 401, 403, 404]);

function isAiKeyConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return !!key && key.startsWith("sk-ant-");
}

// Created on first use so that importing this module never fails (or silently
// captures an empty key) in a process that starts before its environment is loaded.
let anthropicClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

const SOLUTION_SCORING_ADDENDUM = `

**ADDITIONAL INSTRUCTIONS FOR SOLUTIONS:**
When evaluating content of type "solution", you MUST also include a "solution_scores" object in your response:

{
  "aligned_domain": "...",
  "alignment_score": 0.85,
  "harm_risk": "low",
  "feasibility": "high",
  "quality": "...",
  "decision": "approve",
  "reasoning": "...",
  "solution_scores": {
    "impact": 75,
    "feasibility": 80,
    "cost_efficiency": 60
  }
}

Score each dimension 0-100:
- **impact**: How significant is the potential social good? (0 = no impact, 100 = transformative)
- **feasibility**: How realistic and actionable is this solution? (0 = impossible, 100 = immediately actionable)
- **cost_efficiency**: How resource-efficient is the approach? (0 = extremely wasteful, 100 = maximum efficiency)

Only include "solution_scores" for solution content. Omit it for problems and debates.`;

/**
 * Layer B: LLM Classifier - Content alignment scoring using Claude Haiku
 * Target: <3s avg response time, p95 <5s
 */
export async function evaluateLayerB(content: string, contentType?: ContentType): Promise<LayerBResult> {
  const systemPrompt = contentType === "solution"
    ? promptTemplate.system + SOLUTION_SCORING_ADDENDUM
    : promptTemplate.system;

  if (!isAiKeyConfigured()) {
    throw new LayerBUnavailableError("No AI provider key configured (ANTHROPIC_API_KEY)");
  }

  let message: Anthropic.Message;
  try {
    message = await getClient().messages.create({
      model: process.env.CLAUDE_HAIKU_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 600,
      temperature: 0.3, // Low temperature for consistency
      system: systemPrompt,
      messages: [
        ...promptTemplate.fewShotExamples,
        {
          role: "user",
          content,
        },
      ],
    });
  } catch (error) {
    const status = (error as { status?: unknown } | null)?.status;
    if (typeof status === "number" && PERMANENT_PROVIDER_STATUSES.has(status)) {
      logger.error(
        { status, error: error instanceof Error ? error.message : String(error) },
        "Layer B provider call rejected — not retryable, routing to human review",
      );
      throw new LayerBUnavailableError(`AI provider rejected the request (HTTP ${status})`, error);
    }
    // Rate limits, 5xx and network errors are worth a retry: let the queue back off.
    throw error;
  }

  // Extract text response
  const responseText = message.content[0]?.type === "text" ? message.content[0].text : "";

  // Parse JSON and validate with strict Zod schema (Sprint 20: LLM Output Integrity)
  try {
    const rawJson = JSON.parse(responseText);
    const parseResult = classifierResponseSchema.safeParse(rawJson);

    if (!parseResult.success) {
      // FR-004: Log raw response + Zod error for debugging, route to human review
      logger.error(
        { zodErrors: parseResult.error.flatten(), responsePreview: responseText.slice(0, 200) },
        "Layer B classifier response failed Zod validation — routing to human review",
      );
      throw new Error("Invalid response structure from LLM");
    }

    const raw = parseResult.data;

    // Belt-and-suspenders: Ensure alignment_score is finite (Zod covers range but not NaN/Infinity)
    if (!Number.isFinite(raw.alignment_score)) {
      throw new Error(`Invalid alignment score: ${raw.alignment_score}`);
    }

    const result: LayerBResult = {
      alignedDomain: raw.aligned_domain,
      alignmentScore: raw.alignment_score,
      harmRisk: raw.harm_risk as "low" | "medium" | "high",
      feasibility: raw.feasibility as "low" | "medium" | "high",
      quality: raw.quality,
      decision: raw.decision as "approve" | "flag" | "reject",
      reasoning: raw.reasoning,
    };

    // Extract solution scores if present and validated by Zod
    if (raw.solution_scores && contentType === "solution") {
      const scores = raw.solution_scores;
      result.solutionScores = {
        impact: Math.max(0, Math.min(100, scores.impact)),
        feasibility: Math.max(0, Math.min(100, scores.feasibility)),
        costEfficiency: Math.max(0, Math.min(100, scores.cost_efficiency)),
        composite: 0, // Computed by caller
      };
    }

    logger.info(
      {
        alignedDomain: result.alignedDomain,
        alignmentScore: result.alignmentScore,
        harmRisk: result.harmRisk,
        decision: result.decision,
        contentLength: content.length,
        hasSolutionScores: !!result.solutionScores,
      },
      "Layer B classification complete",
    );

    return result;
  } catch (error) {
    logger.error({ error, responseText }, "Failed to parse Layer B response");
    throw new Error(`Layer B classifier returned invalid JSON: ${error}`);
  }
}
