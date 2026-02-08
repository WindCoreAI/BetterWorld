import { AppError, RATE_LIMIT_DEFAULTS, AGENT_RATE_LIMIT_TIERS } from "@betterworld/shared";
import type { RateLimitRole, ClaimStatus } from "@betterworld/shared";
import { createMiddleware } from "hono/factory";

import type { AuthEnv } from "./auth.js";

/**
 * Redis sliding window rate limiter.
 * Uses a sorted set per key with timestamps as scores.
 * For agents, applies tiered limits based on claim status.
 */
export function rateLimit(overrides?: Partial<Record<RateLimitRole, { limit: number; window: number }>>) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const { getRedis } = await import("../lib/container.js");
    const redis = getRedis();

    if (!redis) {
      // If Redis is unavailable, allow the request (degraded mode)
      await next();
      return;
    }

    const role = (c.get("authRole") ?? "public") as RateLimitRole;
    const defaults = RATE_LIMIT_DEFAULTS[role];
    let config = overrides?.[role]
      ? { ...defaults, ...overrides[role] }
      : { ...defaults };

    // For agents, apply tiered rate limiting
    if (role === "agent") {
      const agent = c.get("agent");
      if (agent) {
        // Priority: rateLimitOverride > claim tier > role default
        if (agent.rateLimitOverride != null) {
          config = { ...config, limit: agent.rateLimitOverride };
        } else {
          const claimStatus = agent.claimStatus as ClaimStatus;
          const tierLimit = AGENT_RATE_LIMIT_TIERS[claimStatus];
          if (tierLimit !== undefined) {
            config = { ...config, limit: tierLimit };
          }
        }
      }
    }

    // Determine the identifier
    let identifier: string;
    const agent = c.get("agent");
    const user = c.get("user");
    if (agent) {
      identifier = `agent:${agent.id}`;
    } else if (user) {
      identifier = `user:${user.sub}`;
    } else {
      // For public: use IP
      const forwarded = c.req.header("X-Forwarded-For");
      identifier = `ip:${forwarded?.split(",")[0]?.trim() ?? "unknown"}`;
    }

    const key = `ratelimit:${identifier}`;
    const now = Date.now();
    const windowMs = config.window * 1000;
    const windowStart = now - windowMs;

    // Atomic sliding window check using Redis pipeline
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zcard(key);
    pipeline.zadd(key, now, `${now}:${Math.random()}`);
    pipeline.expire(key, config.window + 1);

    const results = await pipeline.exec();
    const currentCount = (results?.[1]?.[1] as number) ?? 0;

    const remaining = Math.max(0, config.limit - currentCount - 1);
    const resetTime = Math.ceil((now + windowMs) / 1000);

    // Set rate limit headers on every response
    c.header("X-RateLimit-Limit", String(config.limit));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(resetTime));

    if (currentCount >= config.limit) {
      const retryAfter = Math.ceil(windowMs / 1000);
      c.header("Retry-After", String(retryAfter));
      throw new AppError("RATE_LIMITED", "Too many requests. Please try again later.", {
        retryAfter,
        limit: config.limit,
        window: config.window,
      });
    }

    await next();
  });
}
