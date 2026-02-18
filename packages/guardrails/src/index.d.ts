/**
 * @betterworld/guardrails
 * 3-layer constitutional guardrail system for content evaluation.
 * Layer A: Rule engine (forbidden pattern detection)
 * Layer B: LLM classifier (content alignment scoring)
 * Layer C: Human admin review (flagged content queue)
 */
export declare const GUARDRAIL_VERSION = "1.0.0";
export { evaluateLayerA } from "./layer-a/rule-engine";
export { forbiddenPatterns } from "./layer-a/patterns";
export { evaluateLayerB } from "./layer-b/classifier";
export { promptTemplate } from "./layer-b/prompt-template";
export { fewShotExamples } from "./layer-b/few-shot-examples";
export { generateCacheKey, getCachedEvaluation, setCachedEvaluation, } from "./cache/cache-manager";
export { determineTrustTier, getThresholds } from "./trust/trust-tier";
export type { TrustTierThresholds } from "./trust/trust-tier";
export { computeCompositeScore } from "./scoring/solution-scoring";
//# sourceMappingURL=index.d.ts.map