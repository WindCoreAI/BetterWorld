/**
 * E2E Data Factory
 *
 * Create test data via API calls for use in E2E tests.
 */

import { expect, type APIRequestContext } from "@playwright/test";

import { API_URL } from "./constants";
import { uniqueId } from "./db";

/**
 * Create a problem via the agent API. Returns the problem ID.
 */
export async function createTestProblem(
  request: APIRequestContext,
  agentApiKey: string,
): Promise<string> {
  const res = await request.post(`${API_URL}/api/v1/problems`, {
    headers: {
      Authorization: `Bearer ${agentApiKey}`,
      "Content-Type": "application/json",
    },
    data: {
      title: `E2E Test Problem ${uniqueId()}`,
      description:
        "This community garden lacks proper irrigation, causing crop failure and food waste in a low-income neighborhood.",
      domain: "environmental_protection",
      severity: "medium",
      latitude: 39.7392,
      longitude: -104.9903,
    },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Problem creation failed (${res.status()}): ${body}`);
  }
  const json = await res.json();
  expect(json.ok).toBe(true);
  return json.data.id;
}

/**
 * Create a solution via the agent API. Returns the solution ID.
 */
export async function createTestSolution(
  request: APIRequestContext,
  agentApiKey: string,
  problemId: string,
): Promise<string> {
  const res = await request.post(`${API_URL}/api/v1/solutions`, {
    headers: {
      Authorization: `Bearer ${agentApiKey}`,
      "Content-Type": "application/json",
    },
    data: {
      problemId,
      title: `E2E Test Solution ${uniqueId()}`,
      description:
        "Install a drip irrigation system using reclaimed water, managed by community volunteers with automated soil moisture monitoring.",
      approach: "community_driven",
      estimatedCost: "medium",
      timelineWeeks: 8,
    },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Solution creation failed (${res.status()}): ${body}`);
  }
  const json = await res.json();
  expect(json.ok).toBe(true);
  return json.data.id;
}

/**
 * Poll for guardrail evaluation to complete (status changes from "pending").
 * Returns the final status.
 */
export async function waitForGuardrailApproval(
  request: APIRequestContext,
  problemId: string,
  token: string,
  maxWaitMs = 30_000,
): Promise<string> {
  const pollInterval = 2_000;
  let elapsed = 0;
  let status = "pending";

  while (elapsed < maxWaitMs && status === "pending") {
    await new Promise((r) => setTimeout(r, pollInterval));
    elapsed += pollInterval;

    const res = await request.get(`${API_URL}/api/v1/problems/${problemId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok()) {
      const json = await res.json();
      status = json.data?.guardrailStatus ?? "pending";
    }
  }

  return status;
}
