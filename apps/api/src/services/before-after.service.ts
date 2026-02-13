/**
 * Before/After Comparison Service (Sprint 12 — T054)
 *
 * Sends before + after images to Claude Vision API (Sonnet) with comparison prompt.
 * Returns improvement score, confidence, reasoning, and decision.
 */
import Anthropic from "@anthropic-ai/sdk";
import pino from "pino";

const logger = pino({ name: "before-after-service" });

const SONNET_MODEL = process.env.CLAUDE_SONNET_MODEL ?? "claude-sonnet-4-5-20250929";

export interface ComparisonResult {
  improvementScore: number;
  confidence: number;
  reasoning: string;
  decision: "approved" | "rejected" | "peer_review";
}

const COMPARE_TOOL: Anthropic.Tool = {
  name: "compare_before_after",
  description: "Compare before and after photos for a social good mission to assess improvement",
  input_schema: {
    type: "object" as const,
    properties: {
      improvementScore: {
        type: "number",
        description: "Score 0-1 indicating how much improvement is visible (0 = no change, 1 = dramatic improvement)",
      },
      confidence: {
        type: "number",
        description: "Confidence in the assessment (0-1)",
      },
      reasoning: {
        type: "string",
        description: "Detailed explanation of what changed between before and after",
      },
    },
    required: ["improvementScore", "confidence", "reasoning"],
  },
};

/**
 * Compare before/after photos using Claude Vision.
 */
export async function comparePhotos(
  beforeImageBase64: string,
  beforeMediaType: string,
  afterImageBase64: string,
  afterMediaType: string,
  missionContext: string,
): Promise<ComparisonResult> {
  const anthropic = new Anthropic();

  const response = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: 1024,
    system: "You are an evidence comparison assistant for social good missions. Compare before and after photos to assess whether meaningful improvement has occurred. Be thorough but fair. Consider environmental, infrastructure, social, and cleanup improvements.",
    tools: [COMPARE_TOOL],
    tool_choice: { type: "tool", name: "compare_before_after" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: beforeMediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: beforeImageBase64,
            },
          },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: afterMediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: afterImageBase64,
            },
          },
          {
            type: "text",
            text: `Mission context: ${missionContext}\n\nThe first image is BEFORE and the second image is AFTER. Please compare them using the compare_before_after tool.`,
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    logger.warn("No tool_use in comparison response, defaulting to peer_review");
    return {
      improvementScore: 0,
      confidence: 0,
      reasoning: "AI comparison response could not be parsed",
      decision: "peer_review",
    };
  }

  const output = toolUse.input as {
    improvementScore: number;
    confidence: number;
    reasoning: string;
  };

  const confidence = Math.max(0, Math.min(1, output.confidence));
  const improvementScore = Math.max(0, Math.min(1, output.improvementScore));

  // Route based on confidence: >=0.80 approve, <0.50 reject, else peer_review
  let decision: ComparisonResult["decision"];
  if (confidence >= 0.80 && improvementScore >= 0.30) {
    decision = "approved";
  } else if (confidence >= 0.80 && improvementScore < 0.10) {
    decision = "rejected";
  } else {
    decision = "peer_review";
  }

  logger.info(
    { improvementScore, confidence, decision },
    "Before/after comparison completed",
  );

  return {
    improvementScore,
    confidence,
    reasoning: output.reasoning,
    decision,
  };
}
