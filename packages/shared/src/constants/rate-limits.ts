export const RATE_LIMIT_DEFAULTS = {
  public: { limit: 30, window: 60, burst: 10 },
  agent: { limit: 60, window: 60, burst: 20 },
  human: { limit: 120, window: 60, burst: 40 },
  admin: { limit: 300, window: 60, burst: 100 },
} as const;

export type RateLimitRole = keyof typeof RATE_LIMIT_DEFAULTS;
