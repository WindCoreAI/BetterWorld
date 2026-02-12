/**
 * BetterWorld Phase 2 Local Baseline Test (R20)
 *
 * Lightweight version of phase2-load-test.js for establishing a local baseline.
 * Reduced VUs and duration for running against localhost.
 *
 * Usage:
 *   k6 run k6/phase2-baseline.js
 *   k6 run -e BASE_URL=https://api.betterworld.com k6/phase2-baseline.js
 *   k6 run --out json=k6/results/baseline-$(date +%Y%m%d).json k6/phase2-baseline.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

import {
  randomHumanId,
  randomLeaderboardType,
  randomDomain,
  randomPeriod,
} from "./helpers/data-generators.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";

// ---------------------------------------------------------------------------
// Custom Metrics
// ---------------------------------------------------------------------------

const errorRate = new Rate("errors");
const healthLatency = new Trend("health_latency", true);
const leaderboardLatency = new Trend("leaderboard_latency", true);
const impactLatency = new Trend("impact_latency", true);
const reputationLatency = new Trend("reputation_latency", true);
const portfolioLatency = new Trend("portfolio_latency", true);
const tiersLatency = new Trend("tiers_latency", true);
const problemsLatency = new Trend("problems_latency", true);

// ---------------------------------------------------------------------------
// Stages: 30s ramp up, 2min sustain, 15s ramp down — ~2.75 min total
// ---------------------------------------------------------------------------

function baselineStages(targetVUs) {
  return [
    { duration: "30s", target: targetVUs },
    { duration: "2m", target: targetVUs },
    { duration: "15s", target: 0 },
  ];
}

// ---------------------------------------------------------------------------
// k6 Options — lightweight for local baseline
// ---------------------------------------------------------------------------

export const options = {
  scenarios: {
    // Scenario 1: Health check (smoke)
    health_check: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: baselineStages(5),
      exec: "healthScenario",
      tags: { scenario: "health" },
    },

    // Scenario 2: Read-heavy public endpoints
    read_public: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: baselineStages(20),
      exec: "readPublicScenario",
      tags: { scenario: "read_public" },
    },

    // Scenario 3: Leaderboards
    leaderboards: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: baselineStages(10),
      exec: "leaderboardScenario",
      tags: { scenario: "leaderboard" },
    },

    // Scenario 4: Impact dashboard + heatmap
    impact: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: baselineStages(10),
      exec: "impactScenario",
      tags: { scenario: "impact" },
    },

    // Scenario 5: Reputation + portfolio views
    profiles: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: baselineStages(10),
      exec: "profileScenario",
      tags: { scenario: "profiles" },
    },
  },

  thresholds: {
    "http_req_duration": ["p(95)<500"],     // p95 < 500ms for local
    "errors": ["rate<0.05"],                // error rate < 5% (404s expected for random IDs)
    "health_latency": ["p(95)<100"],        // Health should be fast
    "leaderboard_latency": ["p(95)<500"],
    "impact_latency": ["p(95)<500"],
    "reputation_latency": ["p(95)<500"],
    "portfolio_latency": ["p(95)<500"],
    "problems_latency": ["p(95)<500"],
    "tiers_latency": ["p(95)<500"],
  },
};

// ---------------------------------------------------------------------------
// Common Headers
// ---------------------------------------------------------------------------

const jsonHeaders = {
  "Content-Type": "application/json",
  "Accept": "application/json",
};

// ---------------------------------------------------------------------------
// Scenario 1: Health Check
// ---------------------------------------------------------------------------

export function healthScenario() {
  const res = http.get(`${BASE_URL}/health`, {
    headers: jsonHeaders,
    tags: { name: "GET /health" },
  });

  healthLatency.add(res.timings.duration);

  const success = check(res, {
    "health: status 200": (r) => r.status === 200,
  });
  errorRate.add(!success);
  sleep(1);
}

// ---------------------------------------------------------------------------
// Scenario 2: Read Public — problems, solutions, tiers
// ---------------------------------------------------------------------------

export function readPublicScenario() {
  // Problems list
  const probRes = http.get(`${BASE_URL}/api/v1/problems?limit=10`, {
    headers: jsonHeaders,
    tags: { name: "GET /problems" },
  });
  problemsLatency.add(probRes.timings.duration);
  const probOk = check(probRes, {
    "problems: status 200": (r) => r.status === 200,
  });
  errorRate.add(!probOk);

  sleep(0.3);

  // Reputation tiers (public, no auth)
  const tierRes = http.get(`${BASE_URL}/api/v1/reputation/tiers`, {
    headers: jsonHeaders,
    tags: { name: "GET /reputation/tiers" },
  });
  tiersLatency.add(tierRes.timings.duration);
  const tierOk = check(tierRes, {
    "tiers: status 200": (r) => r.status === 200,
  });
  errorRate.add(!tierOk);

  sleep(0.5 + Math.random() * 1);
}

// ---------------------------------------------------------------------------
// Scenario 3: Leaderboard Browsing
// ---------------------------------------------------------------------------

export function leaderboardScenario() {
  const type = randomLeaderboardType();
  const period = randomPeriod();
  const domain = randomDomain();

  const res = http.get(
    `${BASE_URL}/api/v1/leaderboards/${type}?period=${period}&domain=${domain}&limit=25`,
    { headers: jsonHeaders, tags: { name: "GET /leaderboards/:type" } },
  );

  leaderboardLatency.add(res.timings.duration);
  const success = check(res, {
    "leaderboard: status 200": (r) => r.status === 200,
  });
  errorRate.add(!success);
  sleep(0.5 + Math.random() * 1);
}

// ---------------------------------------------------------------------------
// Scenario 4: Impact Dashboard + Heatmap
// ---------------------------------------------------------------------------

export function impactScenario() {
  const dashRes = http.get(`${BASE_URL}/api/v1/impact/dashboard`, {
    headers: jsonHeaders,
    tags: { name: "GET /impact/dashboard" },
  });
  impactLatency.add(dashRes.timings.duration);
  const dashOk = check(dashRes, {
    "impact dashboard: status 200": (r) => r.status === 200,
  });
  errorRate.add(!dashOk);

  sleep(0.3);

  const domain = randomDomain();
  const heatRes = http.get(
    `${BASE_URL}/api/v1/impact/heatmap?domain=${domain}&period=month`,
    { headers: jsonHeaders, tags: { name: "GET /impact/heatmap" } },
  );
  impactLatency.add(heatRes.timings.duration);
  const heatOk = check(heatRes, {
    "heatmap: status 200": (r) => r.status === 200,
  });
  errorRate.add(!heatOk);

  sleep(1 + Math.random() * 2);
}

// ---------------------------------------------------------------------------
// Scenario 5: Reputation + Portfolio Views
// ---------------------------------------------------------------------------

export function profileScenario() {
  const humanId = randomHumanId();

  // Public reputation
  const repRes = http.get(`${BASE_URL}/api/v1/reputation/${humanId}`, {
    headers: jsonHeaders,
    tags: { name: "GET /reputation/:humanId" },
  });
  reputationLatency.add(repRes.timings.duration);
  const repOk = check(repRes, {
    "reputation: status 200 or 404": (r) => r.status === 200 || r.status === 404,
  });
  errorRate.add(!repOk);

  sleep(0.5);

  // Public portfolio
  const portRes = http.get(`${BASE_URL}/api/v1/portfolios/${humanId}`, {
    headers: jsonHeaders,
    tags: { name: "GET /portfolios/:humanId" },
  });
  portfolioLatency.add(portRes.timings.duration);
  const portOk = check(portRes, {
    "portfolio: status 200 or 404": (r) => r.status === 200 || r.status === 404,
  });
  errorRate.add(!portOk);

  sleep(1 + Math.random() * 2);
}
