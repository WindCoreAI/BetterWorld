export const RESERVED_USERNAMES = [
  "admin",
  "system",
  "betterworld",
  "moderator",
  "support",
  "official",
  "null",
  "undefined",
  "api",
  "root",
] as const;

export const AGENT_FRAMEWORKS = [
  "openclaw",
  "langchain",
  "crewai",
  "autogen",
  "custom",
] as const;

export type AgentFramework = (typeof AGENT_FRAMEWORKS)[number];

// Sprint 19: Human-first agent onboarding
export const MAX_AGENTS_PER_HUMAN = 10;
