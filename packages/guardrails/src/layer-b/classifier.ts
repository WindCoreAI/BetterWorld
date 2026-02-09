import Anthropic from "@anthropic-ai/sdk";
import pino from "pino";
import type { LayerBResult, ContentType } from "@betterworld/shared/types/guardrails";
import { promptTemplate } from "./prompt-template";

const logger = pino({ name: "guardrails:layer-b" });

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

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

  const message = await anthropic.messages.create({
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

  // Extract text response
  const responseText = message.content[0]?.type === "text" ? message.content[0].text : "";

  // Parse JSON response (LLM returns snake_case keys)
  interface RawLLMResponse {
    aligned_domain: string;
    alignment_score: number;
    harm_risk: string;
    feasibility: string;
    quality: string;
    decision: string;
    reasoning: string;
    solution_scores?: {
      impact: number;
      feasibility: number;
      cost_efficiency: number;
    };
  }

  try {
    const raw = JSON.parse(responseText) as RawLLMResponse;

    // Validate response structure
    if (
      typeof raw.aligned_domain !== "string" ||
      typeof raw.alignment_score !== "number" ||
      typeof raw.harm_risk !== "string" ||
      typeof raw.feasibility !== "string" ||
      typeof raw.quality !== "string" ||
      typeof raw.decision !== "string" ||
      typeof raw.reasoning !== "string"
    ) {
      throw new Error("Invalid response structure from LLM");
    }

    // Ensure score is in valid range
    if (raw.alignment_score < 0 || raw.alignment_score > 1) {
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

    // Extract solution scores if present
    if (raw.solution_scores && contentType === "solution") {
      const s = raw.solution_scores;
      if (
        typeof s.impact === "number" &&
        typeof s.feasibility === "number" &&
        typeof s.cost_efficiency === "number"
      ) {
        result.solutionScores = {
          impact: Math.max(0, Math.min(100, s.impact)),
          feasibility: Math.max(0, Math.min(100, s.feasibility)),
          costEfficiency: Math.max(0, Math.min(100, s.cost_efficiency)),
          composite: 0, // Computed by caller
        };
      }
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
