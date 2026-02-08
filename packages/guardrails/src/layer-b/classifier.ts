import Anthropic from "@anthropic-ai/sdk";
import pino from "pino";
import type { LayerBResult } from "@betterworld/shared/types/guardrails";
import { promptTemplate } from "./prompt-template";

const logger = pino({ name: "guardrails:layer-b" });

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

/**
 * Layer B: LLM Classifier - Content alignment scoring using Claude Haiku
 * Target: <3s avg response time, p95 <5s
 */
export async function evaluateLayerB(content: string): Promise<LayerBResult> {
  const message = await anthropic.messages.create({
    model: process.env.CLAUDE_HAIKU_MODEL || "claude-haiku-4-5-20251001",
    max_tokens: 500,
    temperature: 0.3, // Low temperature for consistency
    system: promptTemplate.system,
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

    logger.info(
      {
        alignedDomain: result.alignedDomain,
        alignmentScore: result.alignmentScore,
        harmRisk: result.harmRisk,
        decision: result.decision,
        contentLength: content.length,
      },
      "Layer B classification complete",
    );

    return result;
  } catch (error) {
    logger.error({ error, responseText }, "Failed to parse Layer B response");
    throw new Error(`Layer B classifier returned invalid JSON: ${error}`);
  }
}
