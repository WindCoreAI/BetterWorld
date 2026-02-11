/**
 * BetterWorld Phase 2 Load Test
 *
 * Tests the five main Phase 2 API workloads under realistic concurrency:
 *   1. Leaderboard browsing      - 2000 VUs
 *   2. Impact Dashboard           - 1000 VUs
 *   3. Evidence submission         -  500 VUs (authenticated)
 *   4. Reputation queries          -  500 VUs
 *   5. Portfolio views             - 1000 VUs
 *
 * Total: 5000 VUs
 *
 * Usage:
 *   k6 run k6/phase2-load-test.js
 *   k6 run -e BASE_URL=https://api.betterworld.com k6/phase2-load-test.js
 *   k6 run -e AUTH_TOKEN=<real-token> k6/phase2-load-test.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

import {
  randomHumanId,
  randomMissionId,
  randomLeaderboardType,
  randomDomain,
  randomPeriod,
  generateAuthToken,
  generateEvidencePayload,
} from "./helpers/data-generators.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";

// For authenticated endpoints, use a real token via env var or fall back to placeholder
const AUTH_TOKEN = __ENV.AUTH_TOKEN || generateAuthToken();

// ---------------------------------------------------------------------------
// Custom Metrics
// ---------------------------------------------------------------------------

const errorRate = new Rate("errors");
const leaderboardLatency = new Trend("leaderboard_latency", true);
const impactDashboardLatency = new Trend("impact_dashboard_latency", true);
const evidenceSubmitLatency = new Trend("evidence_submit_latency", true);
const reputationLatency = new Trend("reputation_latency", true);
const portfolioLatency = new Trend("portfolio_latency", true);

// ---------------------------------------------------------------------------
// Shared ramp-up/sustain/ramp-down stage pattern
// 2 min ramp up, 10 min sustain, 1 min ramp down
// ---------------------------------------------------------------------------

function rampStages(targetVUs) {
  return [
    { duration: "2m", target: targetVUs },  // ramp up
    { duration: "10m", target: targetVUs }, // sustain
    { duration: "1m", target: 0 },          // ramp down
  ];
}

// ---------------------------------------------------------------------------
// k6 Options
// ---------------------------------------------------------------------------

export const options = {
  scenarios: {
    // Scenario 1: Leaderboard browsing (2000 VUs)
    leaderboard_browse: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: rampStages(2000),
      exec: "leaderboardScenario",
      tags: { scenario: "leaderboard" },
    },

    // Scenario 2: Impact Dashboard (1000 VUs)
    impact_dashboard: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: rampStages(1000),
      exec: "impactDashboardScenario",
      tags: { scenario: "impact" },
    },

    // Scenario 3: Evidence submission (500 VUs, authenticated)
    evidence_submission: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: rampStages(500),
      exec: "evidenceSubmissionScenario",
      tags: { scenario: "evidence" },
    },

    // Scenario 4: Reputation queries (500 VUs)
    reputation_queries: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: rampStages(500),
      exec: "reputationScenario",
      tags: { scenario: "reputation" },
    },

    // Scenario 5: Portfolio views (1000 VUs)
    portfolio_views: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: rampStages(1000),
      exec: "portfolioScenario",
      tags: { scenario: "portfolio" },
    },
  },

  thresholds: {
    // Global thresholds
    "http_req_duration": ["p(95)<3000"],   // p95 < 3s across all requests
    "errors": ["rate<0.01"],               // error rate < 1%

    // Per-scenario p95 thresholds
    "http_req_duration{scenario:leaderboard}": ["p(95)<3000"],
    "http_req_duration{scenario:impact}": ["p(95)<3000"],
    "http_req_duration{scenario:evidence}": ["p(95)<3000"],
    "http_req_duration{scenario:reputation}": ["p(95)<3000"],
    "http_req_duration{scenario:portfolio}": ["p(95)<3000"],

    // Custom metric thresholds
    "leaderboard_latency": ["p(95)<3000"],
    "impact_dashboard_latency": ["p(95)<3000"],
    "evidence_submit_latency": ["p(95)<3000"],
    "reputation_latency": ["p(95)<3000"],
    "portfolio_latency": ["p(95)<3000"],
  },
};

// ---------------------------------------------------------------------------
// Common Headers
// ---------------------------------------------------------------------------

const jsonHeaders = {
  "Content-Type": "application/json",
  "Accept": "application/json",
};

const authHeaders = {
  ...jsonHeaders,
  "Authorization": AUTH_TOKEN,
};

// ---------------------------------------------------------------------------
// Scenario 1: Leaderboard Browsing (2000 VUs)
// GET /api/v1/leaderboards/:type
// ---------------------------------------------------------------------------

export function leaderboardScenario() {
  const type = randomLeaderboardType();
  const period = randomPeriod();
  const domain = randomDomain();
  const limit = Math.floor(Math.random() * 100) + 1; // 1-100

  const url = `${BASE_URL}/api/v1/leaderboards/${type}?period=${period}&domain=${domain}&limit=${limit}`;

  const res = http.get(url, {
    headers: jsonHeaders,
    tags: { name: "GET /leaderboards/:type" },
  });

  leaderboardLatency.add(res.timings.duration);

  const success = check(res, {
    "leaderboard: status is 200": (r) => r.status === 200,
    "leaderboard: response has data": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.ok === true;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);
  sleep(0.5 + Math.random() * 1); // 0.5-1.5s think time
}

// ---------------------------------------------------------------------------
// Scenario 2: Impact Dashboard (1000 VUs)
// GET /api/v1/impact/dashboard  +  GET /api/v1/impact/heatmap
// ---------------------------------------------------------------------------

export function impactDashboardScenario() {
  // Request 1: Dashboard overview
  const dashRes = http.get(`${BASE_URL}/api/v1/impact/dashboard`, {
    headers: jsonHeaders,
    tags: { name: "GET /impact/dashboard" },
  });

  impactDashboardLatency.add(dashRes.timings.duration);

  const dashSuccess = check(dashRes, {
    "impact dashboard: status is 200": (r) => r.status === 200,
    "impact dashboard: response ok": (r) => {
      try {
        return JSON.parse(r.body).ok === true;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!dashSuccess);

  sleep(0.3); // Brief pause between related requests

  // Request 2: Heatmap data
  const domain = randomDomain();
  const period = randomPeriod();
  const heatmapUrl = `${BASE_URL}/api/v1/impact/heatmap?domain=${domain}&period=${period}`;

  const heatRes = http.get(heatmapUrl, {
    headers: jsonHeaders,
    tags: { name: "GET /impact/heatmap" },
  });

  impactDashboardLatency.add(heatRes.timings.duration);

  const heatSuccess = check(heatRes, {
    "impact heatmap: status is 200": (r) => r.status === 200,
    "impact heatmap: response ok": (r) => {
      try {
        return JSON.parse(r.body).ok === true;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!heatSuccess);
  sleep(1 + Math.random() * 2); // 1-3s think time (dashboard browsing)
}

// ---------------------------------------------------------------------------
// Scenario 3: Evidence Submission (500 VUs, authenticated)
// POST /api/v1/missions/:missionId/evidence
// ---------------------------------------------------------------------------

export function evidenceSubmissionScenario() {
  const missionId = randomMissionId();
  const payload = JSON.stringify(generateEvidencePayload());
  const url = `${BASE_URL}/api/v1/missions/${missionId}/evidence`;

  const res = http.post(url, payload, {
    headers: authHeaders,
    tags: { name: "POST /missions/:missionId/evidence" },
  });

  evidenceSubmitLatency.add(res.timings.duration);

  const success = check(res, {
    "evidence: status is 201 or 202": (r) => r.status === 201 || r.status === 202,
    "evidence: response ok": (r) => {
      try {
        return JSON.parse(r.body).ok === true;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);
  sleep(2 + Math.random() * 3); // 2-5s think time (form submission)
}

// ---------------------------------------------------------------------------
// Scenario 4: Reputation Queries (500 VUs)
// GET /api/v1/reputation/:humanId
// ---------------------------------------------------------------------------

export function reputationScenario() {
  const humanId = randomHumanId();
  const url = `${BASE_URL}/api/v1/reputation/${humanId}`;

  const res = http.get(url, {
    headers: jsonHeaders,
    tags: { name: "GET /reputation/:humanId" },
  });

  reputationLatency.add(res.timings.duration);

  const success = check(res, {
    "reputation: status is 200 or 404": (r) => r.status === 200 || r.status === 404,
    "reputation: response structure valid": (r) => {
      try {
        const body = JSON.parse(r.body);
        // 200 with data or 404 with error are both acceptable
        return body.ok !== undefined;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);
  sleep(0.5 + Math.random() * 1); // 0.5-1.5s think time
}

// ---------------------------------------------------------------------------
// Scenario 5: Portfolio Views (1000 VUs)
// GET /api/v1/portfolios/:humanId
// ---------------------------------------------------------------------------

export function portfolioScenario() {
  const humanId = randomHumanId();
  const url = `${BASE_URL}/api/v1/portfolios/${humanId}`;

  const res = http.get(url, {
    headers: jsonHeaders,
    tags: { name: "GET /portfolios/:humanId" },
  });

  portfolioLatency.add(res.timings.duration);

  const success = check(res, {
    "portfolio: status is 200 or 404": (r) => r.status === 200 || r.status === 404,
    "portfolio: response structure valid": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.ok !== undefined;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);
  sleep(1 + Math.random() * 2); // 1-3s think time (browsing profiles)
}
