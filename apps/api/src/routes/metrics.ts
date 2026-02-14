/**
 * Prometheus /metrics endpoint (Sprint 9: Observability, Sprint 15: Worker Queue Metrics)
 *
 * Exports platform metrics in Prometheus text exposition format.
 * Reads from Redis-cached aggregated metrics (computed by metrics-aggregation worker).
 * Process-level metrics (memory, event loop) collected locally.
 * Worker queue metrics (waiting, active, failed) per queue (FR-025).
 */

import { QUEUE_NAMES } from "@betterworld/shared";
import { Queue } from "bullmq";
import { Hono } from "hono";

import type { AppEnv } from "../app.js";
import { getRedis } from "../lib/container.js";

const metricsRoutes = new Hono<AppEnv>();

/**
 * GET /metrics — Prometheus-compatible text format
 *
 * Returns gauges for:
 *  - betterworld_missions_completed_total
 *  - betterworld_impact_tokens_distributed_total
 *  - betterworld_active_humans_total
 *  - betterworld_problems_reported_total
 *  - betterworld_solutions_proposed_total
 *  - betterworld_missions_this_week
 *  - betterworld_missions_this_month
 *  - betterworld_new_humans_this_month
 *  - process_resident_memory_bytes
 *  - process_heap_used_bytes
 *  - nodejs_uptime_seconds
 */
metricsRoutes.get("/", async () => {
  const lines: string[] = [];

  // Process-level metrics (always available)
  const mem = process.memoryUsage();
  const uptime = process.uptime();

  lines.push("# HELP process_resident_memory_bytes Resident memory size in bytes.");
  lines.push("# TYPE process_resident_memory_bytes gauge");
  lines.push(`process_resident_memory_bytes ${mem.rss}`);

  lines.push("# HELP process_heap_used_bytes Heap used size in bytes.");
  lines.push("# TYPE process_heap_used_bytes gauge");
  lines.push(`process_heap_used_bytes ${mem.heapUsed}`);

  lines.push("# HELP nodejs_uptime_seconds Process uptime in seconds.");
  lines.push("# TYPE nodejs_uptime_seconds gauge");
  lines.push(`nodejs_uptime_seconds ${Math.floor(uptime)}`);

  // Platform metrics from Redis (computed by metrics-aggregation worker)
  const redis = getRedis();
  if (redis) {
    try {
      const data = await redis.get("metrics:aggregate:dashboard");
      if (data) {
        const dashboard = JSON.parse(data) as {
          totals: {
            missionsCompleted: number;
            impactTokensDistributed: number;
            activeHumans: number;
            problemsReported: number;
            solutionsProposed: number;
          };
          recentActivity: {
            missionsThisWeek: number;
            missionsThisMonth: number;
            newHumansThisMonth: number;
          };
        };

        lines.push("# HELP betterworld_missions_completed_total Total verified missions.");
        lines.push("# TYPE betterworld_missions_completed_total gauge");
        lines.push(`betterworld_missions_completed_total ${dashboard.totals.missionsCompleted}`);

        lines.push("# HELP betterworld_impact_tokens_distributed_total Total ImpactTokens distributed.");
        lines.push("# TYPE betterworld_impact_tokens_distributed_total gauge");
        lines.push(`betterworld_impact_tokens_distributed_total ${dashboard.totals.impactTokensDistributed}`);

        lines.push("# HELP betterworld_active_humans_total Total active humans.");
        lines.push("# TYPE betterworld_active_humans_total gauge");
        lines.push(`betterworld_active_humans_total ${dashboard.totals.activeHumans}`);

        lines.push("# HELP betterworld_problems_reported_total Total problems reported.");
        lines.push("# TYPE betterworld_problems_reported_total gauge");
        lines.push(`betterworld_problems_reported_total ${dashboard.totals.problemsReported}`);

        lines.push("# HELP betterworld_solutions_proposed_total Total solutions proposed.");
        lines.push("# TYPE betterworld_solutions_proposed_total gauge");
        lines.push(`betterworld_solutions_proposed_total ${dashboard.totals.solutionsProposed}`);

        lines.push("# HELP betterworld_missions_this_week Missions completed this week.");
        lines.push("# TYPE betterworld_missions_this_week gauge");
        lines.push(`betterworld_missions_this_week ${dashboard.recentActivity.missionsThisWeek}`);

        lines.push("# HELP betterworld_missions_this_month Missions completed this month.");
        lines.push("# TYPE betterworld_missions_this_month gauge");
        lines.push(`betterworld_missions_this_month ${dashboard.recentActivity.missionsThisMonth}`);

        lines.push("# HELP betterworld_new_humans_this_month New humans registered this month.");
        lines.push("# TYPE betterworld_new_humans_this_month gauge");
        lines.push(`betterworld_new_humans_this_month ${dashboard.recentActivity.newHumansThisMonth}`);
      }
    } catch {
      // Redis unavailable — process metrics still exported
    }
  }

  // FR-025: Worker queue metrics
  if (redis) {
    try {
      lines.push("# HELP betterworld_worker_queue_waiting Jobs waiting in queue.");
      lines.push("# TYPE betterworld_worker_queue_waiting gauge");
      lines.push("# HELP betterworld_worker_queue_active Jobs actively processing.");
      lines.push("# TYPE betterworld_worker_queue_active gauge");
      lines.push("# HELP betterworld_worker_queue_failed Jobs that have failed.");
      lines.push("# TYPE betterworld_worker_queue_failed gauge");

      for (const [, queueName] of Object.entries(QUEUE_NAMES)) {
        const queue = new Queue(queueName, { connection: redis.duplicate() });
        try {
          const counts = await queue.getJobCounts("waiting", "active", "failed");
          lines.push(`betterworld_worker_queue_waiting{queue="${queueName}"} ${counts.waiting ?? 0}`);
          lines.push(`betterworld_worker_queue_active{queue="${queueName}"} ${counts.active ?? 0}`);
          lines.push(`betterworld_worker_queue_failed{queue="${queueName}"} ${counts.failed ?? 0}`);
        } finally {
          await queue.close();
        }
      }
    } catch {
      // Worker queue metrics unavailable — other metrics still exported
    }
  }

  lines.push(""); // Trailing newline required by Prometheus

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    },
  });
});

export default metricsRoutes;
