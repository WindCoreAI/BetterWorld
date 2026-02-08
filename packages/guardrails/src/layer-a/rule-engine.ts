import pino from "pino";
import type { LayerAResult } from "@betterworld/shared/types/guardrails";
import { forbiddenPatterns } from "./patterns";

const logger = pino({ name: "guardrails:layer-a" });

/**
 * Layer A: Rule Engine - Fast forbidden pattern detection (<10ms target)
 * Uses pre-compiled regex patterns to detect constitutional boundary violations
 */
export async function evaluateLayerA(content: string): Promise<LayerAResult> {
  const startTime = performance.now();
  const detected: string[] = [];

  // Check each forbidden pattern
  for (const pattern of forbiddenPatterns) {
    if (pattern.regex.test(content)) {
      detected.push(pattern.name);
    }
  }

  const executionTimeMs = Math.round(performance.now() - startTime);
  const passed = detected.length === 0;

  logger.info(
    { passed, forbiddenPatterns: detected, executionTimeMs, contentLength: content.length },
    passed ? "Layer A passed" : "Layer A rejected: forbidden patterns detected",
  );

  return { passed, forbiddenPatterns: detected, executionTimeMs };
}
