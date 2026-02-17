/**
 * E2E Auth Helpers
 *
 * Register humans, login, create agents, and authenticate browser sessions.
 */

import { expect, type APIRequestContext, type Page } from "@playwright/test";

import {
  API_URL,
  WEB_URL,
  HUMAN_ACCESS_KEY,
  HUMAN_REFRESH_KEY,
} from "./constants";
import { execSql, uniqueId } from "./db";

export interface TestHuman {
  email: string;
  password: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
}

export interface TestAgent {
  agentId: string;
  apiKey: string;
  username: string;
}

/**
 * Register a new human, verify email via DB bypass, and login to get tokens.
 */
export async function registerAndLoginHuman(
  request: APIRequestContext,
  prefix = "e2e",
): Promise<TestHuman> {
  const uid = uniqueId();
  const email = `${prefix}_human_${uid}@example.com`;
  const password = `E2eTest_${uid}!`;
  const displayName = `E2E Human ${uid}`;

  // Register
  const regRes = await request.post(
    `${API_URL}/api/v1/human-auth/register`,
    { data: { email, password, displayName } },
  );
  if (!regRes.ok()) {
    const body = await regRes.text();
    throw new Error(`Human registration failed (${regRes.status()}): ${body}`);
  }

  // Verify email directly in DB
  execSql(`UPDATE humans SET email_verified = true WHERE email = '${email}'`);

  // Login
  const loginRes = await request.post(`${API_URL}/api/v1/human-auth/login`, {
    data: { email, password },
  });
  if (!loginRes.ok()) {
    const body = await loginRes.text();
    throw new Error(`Human login failed (${loginRes.status()}): ${body}`);
  }
  const loginJson = await loginRes.json();
  expect(loginJson.ok).toBe(true);

  return {
    email,
    password,
    displayName,
    accessToken: loginJson.data.accessToken,
    refreshToken: loginJson.data.refreshToken,
  };
}

/**
 * Login an existing human with email/password.
 */
export async function loginHuman(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request.post(`${API_URL}/api/v1/human-auth/login`, {
    data: { email, password },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Human login failed (${res.status()}): ${body}`);
  }
  const json = await res.json();
  return {
    accessToken: json.data.accessToken,
    refreshToken: json.data.refreshToken,
  };
}

/**
 * Create an agent under a human account. Returns agentId + one-time API key.
 */
export async function createTestAgent(
  request: APIRequestContext,
  humanToken: string,
  prefix = "e2e",
): Promise<TestAgent> {
  const uid = uniqueId();
  const username = `${prefix}_agent_${uid}`;

  const res = await request.post(`${API_URL}/api/v1/my-agents`, {
    headers: { Authorization: `Bearer ${humanToken}` },
    data: {
      username,
      framework: "custom",
      specializations: ["education_access"],
    },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Agent creation failed (${res.status()}): ${body}`);
  }
  const json = await res.json();
  expect(json.ok).toBe(true);

  return {
    agentId: json.data.agentId,
    apiKey: json.data.apiKey,
    username,
  };
}

/**
 * Set human auth tokens in browser localStorage so authenticated pages work
 * without going through the full UI login flow.
 *
 * Must be called BEFORE navigating to authenticated pages.
 * Navigates to the WEB_URL first to establish the correct origin for localStorage.
 */
export async function authenticateInBrowser(
  page: Page,
  tokens: { accessToken: string; refreshToken: string },
): Promise<void> {
  // Navigate to the app origin first so localStorage is on the correct domain
  await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });

  await page.evaluate(
    ({ accessKey, refreshKey, accessToken, refreshToken }) => {
      localStorage.setItem(accessKey, accessToken);
      localStorage.setItem(refreshKey, refreshToken);
      window.dispatchEvent(new Event("bw-human-auth-change"));
    },
    {
      accessKey: HUMAN_ACCESS_KEY,
      refreshKey: HUMAN_REFRESH_KEY,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    },
  );
}
