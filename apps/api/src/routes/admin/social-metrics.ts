/**
 * Social Metrics Admin Routes (Sprint 16: Social Fabric Foundation)
 *
 * Exposes daily Redis counters for follow/connection/discussion/care-moment events
 * via GET /admin/social-metrics for post-launch measurement (SC-001 through SC-012).
 */
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getRedis } from "../../lib/container.js";

const socialMetricsRoutes = new Hono<AppEnv>();

/**
 * Increment a social metric counter.
 * Uses Redis daily bucket keys: social:{metric}:{YYYY-MM-DD}
 */
export async function trackSocialMetric(metric: string): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;

    const today = new Date().toISOString().split("T")[0];
    const key = `social:${metric}:${today}`;
    await redis.incr(key);
    await redis.expire(key, 90 * 24 * 60 * 60); // 90-day retention
  } catch {
    // Non-fatal
  }
}

// GET /admin/social-metrics — Get social metric counters
socialMetricsRoutes.get("/", async (c) => {
  const redis = getRedis();
  if (!redis) {
    return c.json({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "Redis not available" },
    }, 503);
  }

  const today = new Date().toISOString().split("T")[0];
  const metrics = [
    "follow_created",
    "follow_removed",
    "connection_request",
    "connection_accepted",
    "connection_declined",
    "thread_created",
    "reply_created",
    "cheer_sent",
    "celebrate_sent",
    "gift_sent",
    "streak_warning",
    "milestone_detected",
    "comeback_detected",
  ];

  const counters: Record<string, number> = {};

  for (const metric of metrics) {
    const key = `social:${metric}:${today}`;
    const value = await redis.get(key);
    counters[metric] = parseInt(value ?? "0", 10);
  }

  return c.json({
    ok: true,
    data: {
      date: today,
      counters,
    },
    requestId: c.get("requestId"),
  });
});

export default socialMetricsRoutes;
