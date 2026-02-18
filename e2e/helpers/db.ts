/**
 * E2E Database Helpers
 *
 * Extracted from golden-path.test.ts for reuse across all suites.
 */

import { execSync } from "child_process";

import { PG_CONTAINER } from "./constants";

const REDIS_CONTAINER = process.env.REDIS_CONTAINER ?? "betterworld-redis";

/**
 * Flush rate-limit keys in Redis to prevent 429s during E2E tests.
 * Uses Lua EVAL for atomic key deletion (more reliable than SCAN piped to DEL).
 * Clears ALL rate limit buckets: global sliding-window, auth-specific, login.
 */
export function flushRateLimits(): void {
  const luaScript = `
    local patterns = {'ratelimit:*', 'auth:rl:*', 'rate:login:*'}
    local total = 0
    for _, p in ipairs(patterns) do
      local keys = redis.call('keys', p)
      for _, k in ipairs(keys) do
        redis.call('del', k)
        total = total + 1
      end
    end
    return total
  `;
  try {
    execSync(
      `docker exec ${REDIS_CONTAINER} redis-cli --no-auth-warning EVAL "${luaScript.replace(/\n/g, " ")}" 0`,
      { encoding: "utf-8", timeout: 5_000, stdio: "pipe" },
    );
  } catch {
    // Redis not available — ignore
  }
}

/** Generate a short unique ID for test data isolation. */
export function uniqueId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Run a SQL command against the test database via the Docker PostgreSQL container.
 * Falls back to direct psql if available (CI environments).
 */
export function execSql(sql: string): string {
  const escaped = sql.replace(/'/g, "'\\''");
  try {
    return execSync(
      `docker exec ${PG_CONTAINER} psql -U betterworld -d betterworld -t -A -c '${escaped}'`,
      { encoding: "utf-8", timeout: 10_000 },
    ).trim();
  } catch {
    const dbUrl =
      process.env.DATABASE_URL ??
      "postgresql://betterworld:betterworld_dev@localhost:5432/betterworld";
    return execSync(`psql "${dbUrl}" -t -A -c '${escaped}'`, {
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();
  }
}
