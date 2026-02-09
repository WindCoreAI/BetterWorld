import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";

// Custom metrics
const errorRate = new Rate("errors");
const readLatency = new Trend("read_latency", true);
const writeLatency = new Trend("write_latency", true);

// Scenario 1: Read throughput — 100 VU GET /problems for 60s
// Scenario 2: Write + evaluate — 50 VU POST /problems for 60s
// Scenario 3: Mixed workload — 100 VU 80/20 read/write for 300s

export const options = {
  scenarios: {
    read_throughput: {
      executor: "constant-vus",
      vus: 100,
      duration: "60s",
      exec: "readScenario",
      tags: { scenario: "read" },
    },
    write_evaluate: {
      executor: "constant-vus",
      vus: 50,
      duration: "60s",
      exec: "writeScenario",
      startTime: "70s",
      tags: { scenario: "write" },
    },
    mixed_workload: {
      executor: "constant-vus",
      vus: 100,
      duration: "300s",
      exec: "mixedScenario",
      startTime: "140s",
      tags: { scenario: "mixed" },
    },
  },
  thresholds: {
    "http_req_duration{scenario:read}": ["p(95)<500"],
    "http_req_duration{scenario:mixed}": ["p(95)<500"],
    errors: ["rate<0.01"],
  },
};

// Pre-registered API key for load testing (set via environment or use a test key)
const API_KEY = __ENV.API_KEY || "";

const headers = {
  "Content-Type": "application/json",
  ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
};

export function readScenario() {
  const res = http.get(`${BASE_URL}/api/v1/problems?limit=12`, {
    headers,
    tags: { name: "GET /problems" },
  });

  readLatency.add(res.timings.duration);

  const success = check(res, {
    "status is 200": (r) => r.status === 200,
    "response has data": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.ok === true && Array.isArray(body.data);
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);
  sleep(0.1);
}

export function writeScenario() {
  if (!API_KEY) {
    // Skip write tests if no API key is configured
    sleep(1);
    return;
  }

  const payload = JSON.stringify({
    title: `Load test problem ${Date.now()} ${__VU}`,
    description:
      "This is a load test problem submission to validate the guardrail pipeline throughput under concurrent write operations with at least fifty characters",
    domain: "healthcare_improvement",
    severity: "medium",
  });

  const res = http.post(`${BASE_URL}/api/v1/problems`, payload, {
    headers,
    tags: { name: "POST /problems" },
  });

  writeLatency.add(res.timings.duration);

  const success = check(res, {
    "status is 201": (r) => r.status === 201,
    "response is ok": (r) => {
      try {
        return JSON.parse(r.body).ok === true;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);
  sleep(0.5);
}

export function mixedScenario() {
  // 80% reads, 20% writes
  if (Math.random() < 0.8) {
    const res = http.get(`${BASE_URL}/api/v1/problems?limit=12`, {
      headers,
      tags: { name: "GET /problems (mixed)" },
    });

    readLatency.add(res.timings.duration);
    const success = check(res, {
      "status is 200": (r) => r.status === 200,
    });
    errorRate.add(!success);
  } else {
    if (!API_KEY) {
      sleep(0.5);
      return;
    }

    const payload = JSON.stringify({
      title: `Mixed load test problem ${Date.now()} ${__VU}`,
      description:
        "This is a mixed workload load test problem submission to validate concurrent read write operations with at least fifty characters of content",
      domain: "education_access",
      severity: "low",
    });

    const res = http.post(`${BASE_URL}/api/v1/problems`, payload, {
      headers,
      tags: { name: "POST /problems (mixed)" },
    });

    writeLatency.add(res.timings.duration);
    const success = check(res, {
      "status is 201 or 429": (r) =>
        r.status === 201 || r.status === 429,
    });
    errorRate.add(!success);
  }

  sleep(0.2);
}
