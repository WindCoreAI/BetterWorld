#!/usr/bin/env node
/**
 * Core-loop acceptance check.
 *
 * Drives a RUNNING BetterWorld instance through one complete loop using only
 * its public HTTP API — no mocks, no direct database writes:
 *
 *   human registers → creates agent → agent reports problem → guardrails →
 *   agent proposes solution → agent creates mission → another human claims it →
 *   submits photo evidence → verification → reward → impact recorded
 *
 * Wherever the instance has no AI configured (or the AI is unsure), the script
 * plays the operator and resolves the item through the admin review queues,
 * exactly as a solo operator would in the web admin panel.
 *
 * Usage:
 *   node scripts/loop-check.mjs
 *
 * Environment:
 *   API_URL        Base URL of the API               (default http://localhost:4000)
 *   API_LOG        Path to the API's log output. Needed when no email provider is
 *                  configured: verification codes are read from the log.
 *   ADMIN_EMAIL    Email of the operator account. Must be listed in the API's
 *                  ADMIN_EMAILS setting             (default operator@loop.test)
 *   ADMIN_PASSWORD Password for that account         (default Loop_Operator_Pw9)
 *   STEP_TIMEOUT_S Seconds to wait for async steps   (default 60)
 *
 * Exit code 0 means every step of the loop completed.
 */

import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");
const API = `${API_URL}/api/v1`;
const API_LOG = process.env.API_LOG ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "operator@loop.test";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Loop_Operator_Pw9";
const STEP_TIMEOUT_MS = Number(process.env.STEP_TIMEOUT_S ?? 60) * 1000;

const run = Math.random().toString(36).slice(2, 8);
const results = [];
let stepNo = 0;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, { token, body, form, expect } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form; // fetch sets the multipart boundary itself
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (expect && !expect.includes(res.status)) {
    const detail = json?.error ? `${json.error.code}: ${json.error.message}` : `HTTP ${res.status}`;
    throw new Error(`${method} ${path} → ${res.status} (${detail})`);
  }
  return { status: res.status, json, data: json?.data };
}

async function step(name, fn) {
  stepNo += 1;
  const label = `${String(stepNo).padStart(2, " ")}. ${name}`;
  const started = Date.now();
  try {
    const note = await fn();
    const ms = Date.now() - started;
    results.push({ label, ok: true, note, ms });
    console.log(`  ok   ${label}${note ? `  — ${note}` : ""}  (${ms} ms)`);
  } catch (err) {
    const ms = Date.now() - started;
    results.push({ label, ok: false, note: err.message, ms });
    console.log(`  FAIL ${label}  — ${err.message}  (${ms} ms)`);
    throw err;
  }
}

async function waitFor(what, probe, timeoutMs = STEP_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await probe();
    if (last?.done) return last.value;
    await sleep(750);
  }
  throw new Error(`timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${what}${last?.seen !== undefined ? ` (last seen: ${last.seen})` : ""}`);
}

/** Read the most recent verification code for an address from the API log. */
function readCodeFromLog(email) {
  if (!API_LOG) return null;
  let text;
  try {
    text = readFileSync(API_LOG, "utf8");
  } catch {
    return null;
  }
  let code = null;
  for (const line of text.split("\n")) {
    if (!line.includes(email)) continue;
    const m = line.match(/"code":"(\d{6})"/) ?? line.match(/code[^0-9]{1,12}(\d{6})/);
    if (m) code = m[1];
  }
  return code;
}

async function registerAndVerify(email, displayName, password = `Loop_${run}_Pw9`) {
  const reg = await call("POST", "/human-auth/register", {
    body: { email, password, displayName },
    expect: [201, 400],
  });
  if (reg.status === 400 && reg.json?.error?.code !== "EMAIL_EXISTS") {
    throw new Error(`registration rejected: ${JSON.stringify(reg.json?.error)}`);
  }
  if (reg.status === 400) {
    // Account from an earlier run: just log in.
    const login = await call("POST", "/human-auth/login", { body: { email, password }, expect: [200] });
    return { token: login.data.accessToken, id: login.data.user.id, password };
  }
  const code = await waitFor(
    `a verification code for ${email} in ${API_LOG || "(API_LOG not set)"}`,
    async () => {
      const c = readCodeFromLog(email);
      return { done: !!c, value: c };
    },
    15_000,
  );
  const ver = await call("POST", "/human-auth/verify-email", { body: { email, code }, expect: [200] });
  return { token: ver.data.accessToken, id: ver.data.user.id, password };
}

/** A real, decodable PNG (solid colour with a diagonal stripe), built without dependencies. */
function makePng(size = 96) {
  const crcTable = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 3);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const stripe = Math.abs(x - y) < 6;
      const o = row + 1 + x * 3;
      raw[o] = stripe ? 250 : 34;
      raw[o + 1] = stripe ? 250 : 139 + (y % 40);
      raw[o + 2] = stripe ? 250 : 84;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Wait until a guardrail verdict lands on a piece of agent content. If the
 * verdict is "flagged" (no AI configured, the AI was unsure, or a keyword rule
 * asked for a second look), approve it through the admin queue as the operator.
 */
async function settleContent({ kind, getStatus, contentId, adminToken }) {
  const first = await waitFor(`${kind} to leave "pending"`, async () => {
    const s = await getStatus();
    return { done: s !== "pending", value: s, seen: s };
  });
  if (first === "approved") return "approved automatically";
  if (first === "rejected") throw new Error(`${kind} was rejected by guardrails`);

  // flagged → operator review
  const item = await waitFor(`${kind} to appear in the admin review queue`, async () => {
    const list = await call("GET", "/admin/flagged?status=pending_review&limit=100", { token: adminToken, expect: [200] });
    const found = (list.data ?? []).find((f) => f.contentId === contentId);
    return { done: !!found, value: found };
  }, 15_000);
  await call("POST", `/admin/flagged/${item.id}/claim`, { token: adminToken, expect: [200] });
  await call("POST", `/admin/flagged/${item.id}/review`, {
    token: adminToken,
    body: { decision: "approve", notes: "Loop check: reviewed and approved by the operator." },
    expect: [200],
  });
  const after = await getStatus();
  if (after !== "approved") throw new Error(`${kind} is "${after}" after operator approval`);
  return "flagged → approved by operator";
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\nBetterWorld core-loop check  →  ${API_URL}   (run ${run})\n`);

  const ctx = {};

  await step("API is up", async () => {
    await call("GET", "/health", { expect: [200] });
  });

  await step("Operator account can sign up and verify", async () => {
    // Fixed password so the check can be re-run against the same instance.
    ctx.admin = await registerAndVerify(ADMIN_EMAIL, "Loop Operator", ADMIN_PASSWORD);
  });

  await step("Operator has admin access to the review queue", async () => {
    await call("GET", "/admin/flagged?limit=1", { token: ctx.admin.token, expect: [200] });
  });

  await step("A second person can sign up and verify", async () => {
    ctx.human = await registerAndVerify(`neighbor_${run}@loop.test`, "Loop Neighbor");
  });

  await step("Human creates an agent and receives an API key", async () => {
    const res = await call("POST", "/my-agents", {
      token: ctx.admin.token,
      body: { username: `loop_scout_${run}`, framework: "custom", specializations: ["environmental_protection", "community_building"] },
      expect: [201],
    });
    ctx.agent = { id: res.data.agentId, key: res.data.apiKey };
    return `claimStatus=${res.data.claimStatus}`;
  });

  await step("Agent reports a problem", async () => {
    const res = await call("POST", "/problems", {
      token: ctx.agent.key,
      body: {
        title: `Storm drains blocked by leaf litter on Maple Street (${run})`,
        description:
          "## Summary\nSeveral storm drains along Maple Street are covered by fallen leaves and litter, so water pools at the kerb after rain.\n\n" +
          "## Evidence\nResidents reported standing water at three intersections after the last two rainfalls; the municipal service portal lists open drain-clearing requests for this street.\n\n" +
          "## Affected Population\nRoughly 400 households and people walking to the nearby primary school.\n\n" +
          "## Current State\nThe city clears drains on a quarterly schedule, which does not keep up in autumn.\n\n" +
          "## Why This Matters Now\nBlocked drains cause local flooding and slippery crossings; clearing them is safe, quick and harms no one.",
        domain: "environmental_protection",
        severity: "medium",
        geographicScope: "local",
        locationName: "Maple Street",
        latitude: 47.6205,
        longitude: -122.3493,
      },
      expect: [201],
    });
    ctx.problemId = res.data.id;
  });

  await step("Problem passes guardrails and becomes public", async () => {
    const note = await settleContent({
      kind: "problem",
      contentId: ctx.problemId,
      adminToken: ctx.admin.token,
      getStatus: async () => (await call("GET", `/problems/${ctx.problemId}`, { token: ctx.agent.key, expect: [200] })).data.guardrailStatus,
    });
    const pub = await call("GET", `/problems/${ctx.problemId}`, { expect: [200] });
    if (pub.data.guardrailStatus !== "approved") throw new Error("problem is not visible without credentials");
    return note;
  });

  await step("Agent proposes a solution", async () => {
    const res = await call("POST", "/solutions", {
      token: ctx.agent.key,
      body: {
        problemId: ctx.problemId,
        title: `Neighbour drain-clearing rounds for Maple Street (${run})`,
        description:
          "## Approach\nResidents adopt the storm drain nearest their home and clear leaves from the grate before forecast rain.\n\n" +
          "## Implementation Steps\n1. Map the drains on the street.\n2. Publish one short mission per drain.\n3. Volunteers clear the grate by hand and photograph the result.\n\n" +
          "## Why This Approach\nAdopt-a-drain programmes run by many cities show that a few minutes of volunteer time per drain prevents most kerbside flooding.",
        approach:
          "Each drain becomes a short, safe mission: bring gloves and a bag, lift leaves and litter off the grate (never remove the grate or reach inside), bag the debris, and take a clear photo of the cleared drain.",
        expectedImpact: { metric: "storm_drains_cleared", value: 12, timeframe: "4 weeks" },
        requiredSkills: ["outdoor work"],
        timelineEstimate: "4 weeks",
      },
      expect: [201],
    });
    ctx.solutionId = res.data.id;
  });

  await step("Solution passes guardrails", async () =>
    settleContent({
      kind: "solution",
      contentId: ctx.solutionId,
      adminToken: ctx.admin.token,
      getStatus: async () => (await call("GET", `/solutions/${ctx.solutionId}`, { token: ctx.agent.key, expect: [200] })).data.guardrailStatus,
    }),
  );

  await step("Agent turns the solution into a mission", async () => {
    const res = await call("POST", "/missions", {
      token: ctx.agent.key,
      body: {
        solutionId: ctx.solutionId,
        title: `Clear the storm drain at Maple Street & 3rd (${run})`,
        description: "Clear leaves and litter from the storm drain grate at the corner of Maple Street and 3rd Avenue so rainwater can drain.",
        instructions: [
          { step: 1, text: "Bring gloves and a rubbish bag. Stay on the pavement side of the kerb." },
          { step: 2, text: "Lift leaves and litter off the grate by hand. Do not remove the grate or reach inside." },
          { step: 3, text: "Bag the debris and take a clear photo of the cleared drain." },
        ],
        evidenceRequired: [{ type: "photo", description: "A photo of the cleared drain grate", required: true }],
        requiredLocationName: "Maple Street & 3rd Avenue",
        requiredLatitude: 47.6205,
        requiredLongitude: -122.3493,
        estimatedDurationMinutes: 15,
        difficulty: "beginner",
        missionType: "cleanup",
        tokenReward: 10,
        maxClaims: 1,
        expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
        domain: "environmental_protection",
      },
      expect: [201],
    });
    ctx.missionId = res.data.id;
  });

  await step("Mission passes guardrails and appears in the marketplace", async () => {
    const note = await settleContent({
      kind: "mission",
      contentId: ctx.missionId,
      adminToken: ctx.admin.token,
      getStatus: async () => (await call("GET", `/missions/${ctx.missionId}`, { token: ctx.agent.key, expect: [200] })).data.guardrailStatus,
    });
    const list = await call("GET", "/missions?limit=100", { expect: [200] });
    if (!(list.data.missions ?? []).some((m) => m.id === ctx.missionId)) throw new Error("approved mission is missing from the public marketplace");
    return note;
  });

  await step("The second person claims the mission", async () => {
    const res = await call("POST", `/missions/${ctx.missionId}/claim`, { token: ctx.human.token, expect: [201] });
    ctx.claimId = res.data.claimId;
    const detail = await call("GET", `/missions/${ctx.missionId}`, { token: ctx.human.token, expect: [200] });
    if (!detail.data.myClaim) throw new Error("mission detail does not show the claim to the person who made it");
    // …and their own dashboard has to show it, with a way back to it.
    const mine = (await call("GET", "/dashboard", { token: ctx.human.token, expect: [200] })).data.missions ?? {};
    if (mine.active !== 1) throw new Error(`dashboard reports ${mine.active} missions in progress, expected 1`);
    if (!(mine.inProgress ?? []).some((m) => m.missionId === ctx.missionId && m.status === "active")) {
      throw new Error("dashboard does not list the claimed mission as in progress");
    }
  });

  await step("They submit photo evidence", async () => {
    const before = await call("GET", "/tokens/balance", { token: ctx.human.token, expect: [200] });
    ctx.balanceBefore = Number(before.data.balance ?? before.data.tokenBalance ?? 0);
    const form = new FormData();
    form.append("files", new Blob([makePng()], { type: "image/png" }), "cleared-drain.png");
    form.append("latitude", "47.6205");
    form.append("longitude", "-122.3493");
    form.append("notes", "Cleared about half a bag of leaves from the grate.");
    const res = await call("POST", `/missions/${ctx.missionId}/evidence`, { token: ctx.human.token, form, expect: [201] });
    ctx.evidenceId = res.data.evidenceId;
  });

  await step("A second submission on the same claim is refused", async () => {
    const form = new FormData();
    form.append("files", new Blob([makePng()], { type: "image/png" }), "again.png");
    const res = await call("POST", `/missions/${ctx.missionId}/evidence`, { token: ctx.human.token, form });
    if (res.status === 201) throw new Error("a second evidence submission was accepted for the same claim (double reward risk)");
    return `refused with ${res.status}`;
  });

  await step("Evidence is verified", async () => {
    const stage = await waitFor("evidence to reach a decision or a review queue", async () => {
      const s = (await call("GET", `/evidence/${ctx.evidenceId}`, { token: ctx.human.token, expect: [200] })).data;
      const v = s.verificationStage ?? s.status;
      return { done: ["verified", "rejected", "admin_review", "peer_review"].includes(v), value: v, seen: v };
    });
    if (stage === "verified") return "verified automatically";
    if (stage === "rejected") throw new Error("evidence was rejected");
    if (stage === "peer_review") throw new Error("evidence is waiting for peer reviewers that this instance does not have");
    // admin_review → operator decides
    const queue = await call("GET", "/admin/disputes?status=pending&limit=100", { token: ctx.admin.token, expect: [200] });
    if (!(queue.data.disputes ?? []).some((d) => d.evidenceId === ctx.evidenceId)) throw new Error("evidence is not in the operator's review queue");
    await call("POST", `/admin/disputes/${ctx.evidenceId}/resolve`, {
      token: ctx.admin.token,
      body: { decision: "approve", reasoning: "Loop check: photo shows the cleared drain." },
      expect: [200],
    });
    return "sent to operator review → approved";
  });

  await step("The loop closes: claim done, reward paid, slot freed", async () => {
    const mine = await call("GET", "/missions/mine?limit=50", { token: ctx.human.token, expect: [200] });
    const claim = (mine.data.claims ?? []).find((c) => c.id === ctx.claimId);
    if (!claim) throw new Error("claim not found in the person's mission list");
    if (claim.status !== "verified") throw new Error(`claim status is "${claim.status}", expected "verified"`);
    const bal = await call("GET", "/tokens/balance", { token: ctx.human.token, expect: [200] });
    const after = Number(bal.data.balance ?? bal.data.tokenBalance ?? 0);
    if (!(after > ctx.balanceBefore)) throw new Error(`token balance did not increase (${ctx.balanceBefore} → ${after})`);
    const mission = await call("GET", `/missions/${ctx.missionId}`, { expect: [200] });
    if (mission.data.status !== "verified") throw new Error(`mission status is "${mission.data.status}", expected "verified"`);
    return `balance ${ctx.balanceBefore} → ${after}`;
  });

  await step("Their dashboard tells the same story", async () => {
    const d = (await call("GET", "/dashboard", { token: ctx.human.token, expect: [200] })).data;
    const { balance, totalEarned, totalSpent } = d.tokens ?? {};
    if (totalEarned - totalSpent !== balance) {
      throw new Error(`earned ${totalEarned} - spent ${totalSpent} does not equal the balance ${balance}`);
    }
    if (!(totalEarned > 0)) throw new Error(`dashboard reports ${totalEarned} tokens earned after a paid mission`);
    const m = d.missions ?? {};
    if (m.completed !== 1) throw new Error(`dashboard reports ${m.completed} completed missions, expected 1`);
    if (m.active !== 0) throw new Error(`dashboard still reports ${m.active} missions in progress`);
    if (!(m.streakDays >= 1)) throw new Error(`dashboard reports a ${m.streakDays}-day streak after a verified mission`);
    return `earned ${totalEarned}, completed ${m.completed}, streak ${m.streakDays}d`;
  });

  await step("The verified action shows up in public impact numbers", async () => {
    const dash = await call("GET", "/impact/dashboard", { expect: [200] });
    const totals = dash.data?.totals ?? dash.data ?? {};
    const completed = Number(totals.missionsCompleted ?? totals.totalMissionsCompleted ?? 0);
    if (!(completed >= 1)) throw new Error(`impact dashboard reports ${completed} completed missions`);
    return `missionsCompleted=${completed}`;
  });
}

main()
  .then(() => {
    console.log(`\nLoop complete: ${results.length}/${results.length} steps passed.\n`);
    process.exit(0);
  })
  .catch(() => {
    const passed = results.filter((r) => r.ok).length;
    console.log(`\nLoop stalled at step ${results.length}. ${passed} step(s) passed before it.\n`);
    process.exit(1);
  });
