/**
 * E2E Data Factory
 *
 * Create test data via API calls for use in E2E tests.
 */

import { expect, type APIRequestContext } from "@playwright/test";

import { API_URL } from "./constants";
import { execSql, uniqueId } from "./db";

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
      approach:
        "Community-driven approach using local volunteers to install drip irrigation infrastructure with smart sensors for soil moisture monitoring and automated watering schedules.",
      expectedImpact: {
        metric: "water_savings_gallons",
        value: 5000,
        timeframe: "6 months",
      },
      estimatedCost: {
        amount: 2500,
        currency: "USD",
      },
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
 * If still pending after timeout, force-approves via direct DB update.
 * Returns the final status.
 */
export async function waitForGuardrailApproval(
  request: APIRequestContext,
  contentId: string,
  token: string,
  maxWaitMs = 10_000,
): Promise<string> {
  const pollInterval = 2_000;
  let elapsed = 0;
  let status = "pending";

  while (elapsed < maxWaitMs && status === "pending") {
    await new Promise((r) => setTimeout(r, pollInterval));
    elapsed += pollInterval;

    const res = await request.get(`${API_URL}/api/v1/problems/${contentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok()) {
      const json = await res.json();
      status = json.data?.guardrailStatus ?? "pending";
    }
  }

  // If guardrail worker hasn't processed it, force-approve via DB for E2E testing
  if (status === "pending") {
    try {
      execSql(`UPDATE problems SET guardrail_status = 'approved' WHERE id = '${contentId}'`);
      execSql(`UPDATE solutions SET guardrail_status = 'approved' WHERE id = '${contentId}'`);
      status = "approved";
    } catch {
      // One of the updates will fail (wrong table) — that's fine
    }
  }

  return status;
}

/**
 * Force-approve content via direct DB update. Use for solutions
 * that don't have a polling endpoint.
 */
export function forceApproveContent(table: "problems" | "solutions", id: string): void {
  execSql(`UPDATE ${table} SET guardrail_status = 'approved' WHERE id = '${id}'`);
}
