import { FORBIDDEN_PATTERNS, FORBIDDEN_PATTERN_REGEX, type ForbiddenPatternName } from "@betterworld/shared/constants/forbidden-patterns";

export interface ForbiddenPattern {
  name: ForbiddenPatternName;
  regex: RegExp;
}

// Pre-compile regex patterns at module initialization (10-50x faster than dynamic compilation)
export const forbiddenPatterns: ForbiddenPattern[] = FORBIDDEN_PATTERNS.map((name) => ({
  name,
  regex: new RegExp(FORBIDDEN_PATTERN_REGEX[name], "i"), // Case-insensitive
}));
