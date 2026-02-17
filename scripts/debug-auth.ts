#!/usr/bin/env npx tsx
/**
 * Auth Debug Script — Tests the full register → verify → login flow
 *
 * Usage:
 *   npx tsx scripts/debug-auth.ts
 *
 * Prerequisites:
 *   - API server running on localhost:4000 (pnpm dev)
 *   - Docker services up (postgres, redis)
 *
 * The script:
 *   1. Checks API server & DB connectivity
 *   2. Registers a test user
 *   3. Retrieves the verification code from DB (bypasses email)
 *   4. Verifies the email
 *   5. Logs in with the same credentials
 *   6. Tests the access token on a protected endpoint
 *   7. Cleans up the test user from DB
 *
 * Each step logs success/failure with full response details.
 */

import crypto from "crypto";

const API_BASE = process.env.API_URL ?? "http://localhost:4000/api/v1";
const DB_URL =
  process.env.DATABASE_URL ??
  "postgresql://betterworld:betterworld_dev@localhost:5432/betterworld";

const TEST_EMAIL = `debug-auth-${Date.now()}@test.local`;
const TEST_PASSWORD = "DebugTest1";
const TEST_DISPLAY_NAME = "Auth Debug User";

// Colors for terminal output
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function ok(msg: string) {
  console.log(`${GREEN}✓${RESET} ${msg}`);
}
function fail(msg: string) {
  console.log(`${RED}✗${RESET} ${msg}`);
}
function info(msg: string) {
  console.log(`${CYAN}ℹ${RESET} ${msg}`);
}
function warn(msg: string) {
  console.log(`${YELLOW}⚠${RESET} ${msg}`);
}
function detail(label: string, value: unknown) {
  console.log(`  ${DIM}${label}:${RESET}`, typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

async function fetchJson(url: string, opts: RequestInit = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> ?? {}),
  };
  const res = await fetch(url, { ...opts, headers });
  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = { _raw: await res.text() };
  }
  return { status: res.status, body };
}

// ─── Direct DB access via postgres.js (same driver as the project) ───
import postgres from "postgres";

let sql: ReturnType<typeof postgres> | null = null;
function getSql() {
  if (!sql) {
    sql = postgres(DB_URL, { max: 1 });
  }
  return sql;
}

// ─── Step runners ────────────────────────────────────────────────────

async function checkApiHealth(): Promise<boolean> {
  info("Checking API server connectivity...");
  try {
    const res = await fetch(`${API_BASE.replace("/api/v1", "")}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      ok(`API server reachable (status ${res.status})`);
      return true;
    }
    // Some servers don't have /health — try root
    const res2 = await fetch(API_BASE.replace("/api/v1", ""), { signal: AbortSignal.timeout(3000) });
    ok(`API server reachable (status ${res2.status})`);
    return true;
  } catch (e) {
    fail(`API server not reachable at ${API_BASE}`);
    detail("error", e instanceof Error ? e.message : String(e));
    detail("fix", "Run `pnpm dev` to start the API server");
    return false;
  }
}

async function checkDatabase(): Promise<boolean> {
  info("Checking database connectivity...");
  try {
    const db = getSql();
    const [row] = await db`SELECT NOW() as time, current_database() as db`;
    ok(`Database connected: ${row.db} at ${row.time}`);
    return true;
  } catch (e) {
    fail("Database not reachable");
    detail("error", e instanceof Error ? e.message : String(e));
    detail("fix", "Run `docker compose up -d` to start PostgreSQL");
    return false;
  }
}

async function stepRegister(): Promise<boolean> {
  info(`Registering user: ${TEST_EMAIL}`);
  const { status, body } = await fetchJson(`${API_BASE}/human-auth/register`, {
    method: "POST",
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      displayName: TEST_DISPLAY_NAME,
    }),
  });

  if (status === 201 && (body as { ok?: boolean }).ok) {
    ok(`Registration succeeded (status ${status})`);
    detail("userId", (body as { data?: { userId?: string } }).data?.userId);
    return true;
  } else {
    fail(`Registration failed (status ${status})`);
    detail("response", body);
    return false;
  }
}

async function getVerificationCodeFromDb(): Promise<string | null> {
  info("Retrieving verification code from database...");
  try {
    const db = getSql();

    const rows = await db`
      SELECT token, expires_at, verified
      FROM verification_tokens
      WHERE identifier = ${TEST_EMAIL}
      ORDER BY expires_at DESC
      LIMIT 1
    `;

    if (rows.length === 0) {
      fail("No verification token found in database");
      return null;
    }

    const row = rows[0];
    detail("tokenHash", row.token?.substring(0, 16) + "...");
    detail("expiresAt", row.expires_at);
    detail("verified", row.verified);

    if (row.verified) {
      warn("Token already marked as verified");
    }

    // Since the code is hashed (SHA256), we can't retrieve the plaintext.
    // But in dev mode, the code is logged to the API server console.
    // We'll brute-force the 6-digit code by hashing candidates.
    info("Brute-forcing 6-digit code against stored hash (this is fast)...");
    const storedHash = row.token;
    for (let i = 100000; i <= 999999; i++) {
      const candidate = i.toString();
      const hash = crypto.createHash("sha256").update(candidate).digest("hex");
      if (hash === storedHash) {
        ok(`Found verification code: ${candidate}`);
        return candidate;
      }
    }

    fail("Could not find matching code (hash mismatch)");
    return null;
  } catch (e) {
    fail("Failed to query verification tokens");
    detail("error", e instanceof Error ? e.message : String(e));
    return null;
  }
}

async function stepVerifyEmail(code: string): Promise<boolean> {
  info(`Verifying email with code: ${code}`);
  const { status, body } = await fetchJson(`${API_BASE}/human-auth/verify-email`, {
    method: "POST",
    body: JSON.stringify({ email: TEST_EMAIL, code }),
  });

  if (status === 200 && (body as { ok?: boolean }).ok) {
    ok(`Email verification succeeded (status ${status})`);
    const data = (body as { data?: { accessToken?: string; user?: unknown } }).data;
    detail("accessToken", data?.accessToken ? `${String(data.accessToken).substring(0, 30)}...` : "none");
    detail("user", data?.user);
    return true;
  } else {
    fail(`Email verification failed (status ${status})`);
    detail("response", body);
    return false;
  }
}

async function stepLogin(): Promise<{ accessToken: string; refreshToken: string } | null> {
  info(`Logging in as: ${TEST_EMAIL}`);
  const { status, body } = await fetchJson(`${API_BASE}/human-auth/login`, {
    method: "POST",
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });

  if (status === 200 && (body as { ok?: boolean }).ok) {
    ok(`Login succeeded (status ${status})`);
    const data = body.data as { accessToken?: string; refreshToken?: string; user?: unknown } | undefined;
    detail("accessToken", data?.accessToken ? `${data.accessToken.substring(0, 30)}...` : "none");
    detail("refreshToken", data?.refreshToken ? `${data.refreshToken.substring(0, 30)}...` : "none");
    detail("user", data?.user);
    return {
      accessToken: data?.accessToken ?? "",
      refreshToken: data?.refreshToken ?? "",
    };
  } else {
    fail(`Login failed (status ${status})`);
    detail("response", body);
    return null;
  }
}

async function stepTestProtectedEndpoint(accessToken: string): Promise<boolean> {
  info("Testing access token on protected endpoint (GET /profile)...");
  const { status, body } = await fetchJson(`${API_BASE}/profile`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (status === 200 || status === 404) {
    // 404 means auth worked but profile doesn't exist yet — that's fine
    ok(`Protected endpoint responded (status ${status}) — auth token valid`);
    return true;
  } else if (status === 401) {
    fail("Access token rejected (401 Unauthorized)");
    detail("response", body);
    return false;
  } else {
    warn(`Unexpected status ${status} from protected endpoint`);
    detail("response", body);
    return false;
  }
}

async function cleanup(): Promise<void> {
  info("Cleaning up test user from database...");
  try {
    const db = getSql();
    await db`DELETE FROM sessions WHERE user_id IN (SELECT id FROM humans WHERE email = ${TEST_EMAIL})`;
    await db`DELETE FROM verification_tokens WHERE identifier = ${TEST_EMAIL}`;
    await db`DELETE FROM humans WHERE email = ${TEST_EMAIL}`;
    ok("Test user cleaned up");
  } catch (e) {
    warn("Cleanup failed (non-fatal)");
    detail("error", e instanceof Error ? e.message : String(e));
  }
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${CYAN}═══════════════════════════════════════════════════${RESET}`);
  console.log(`${CYAN}  BetterWorld Auth Debug Script${RESET}`);
  console.log(`${CYAN}═══════════════════════════════════════════════════${RESET}\n`);

  detail("API Base", API_BASE);
  detail("Test Email", TEST_EMAIL);
  console.log();

  const results: { step: string; passed: boolean }[] = [];

  // Step 0: Connectivity checks
  const apiOk = await checkApiHealth();
  results.push({ step: "API Health", passed: apiOk });
  console.log();

  const dbOk = await checkDatabase();
  results.push({ step: "Database", passed: dbOk });
  console.log();

  if (!apiOk || !dbOk) {
    fail("Cannot proceed — fix connectivity issues above first");
    printSummary(results);
    process.exit(1);
  }

  try {
    // Step 1: Register
    const registerOk = await stepRegister();
    results.push({ step: "Register", passed: registerOk });
    console.log();
    if (!registerOk) {
      printSummary(results);
      await cleanup();
      process.exit(1);
    }

    // Step 2: Get verification code from DB
    const code = await getVerificationCodeFromDb();
    results.push({ step: "Get Verification Code", passed: !!code });
    console.log();
    if (!code) {
      printSummary(results);
      await cleanup();
      process.exit(1);
    }

    // Step 3: Verify email
    const verifyOk = await stepVerifyEmail(code);
    results.push({ step: "Verify Email", passed: verifyOk });
    console.log();

    // Step 4: Login
    const loginResult = await stepLogin();
    results.push({ step: "Login", passed: !!loginResult });
    console.log();

    // Step 5: Test protected endpoint
    if (loginResult) {
      const protectedOk = await stepTestProtectedEndpoint(loginResult.accessToken);
      results.push({ step: "Protected Endpoint", passed: protectedOk });
      console.log();
    }
  } finally {
    // Always clean up
    await cleanup();
    console.log();
  }

  printSummary(results);

  // Close postgres connection
  if (sql) await sql.end();

  const allPassed = results.every((r) => r.passed);
  process.exit(allPassed ? 0 : 1);
}

function printSummary(results: { step: string; passed: boolean }[]) {
  console.log(`${CYAN}═══════════════════════════════════════════════════${RESET}`);
  console.log(`${CYAN}  Summary${RESET}`);
  console.log(`${CYAN}═══════════════════════════════════════════════════${RESET}`);
  for (const r of results) {
    console.log(`  ${r.passed ? GREEN + "✓" : RED + "✗"} ${RESET}${r.step}`);
  }
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log();
  if (passed === total) {
    ok(`All ${total} steps passed! Auth flow is working correctly.`);
  } else {
    fail(`${passed}/${total} steps passed. See errors above for details.`);
  }
  console.log();
}

main().catch((e) => {
  fail("Unexpected error");
  console.error(e);
  process.exit(1);
});
