/**
 * Playwright Global Setup
 *
 * Runs once before all E2E tests to prepare the test environment.
 * Clears ALL rate-limit keys in Redis so that registration/login
 * endpoints are not throttled across multiple test suites.
 */

import { execSync } from "child_process";

const REDIS_CONTAINER = process.env.REDIS_CONTAINER ?? "betterworld-redis";

function flushRedisPattern(pattern: string): void {
  try {
    execSync(
      `docker exec ${REDIS_CONTAINER} redis-cli --no-auth-warning --scan --pattern "${pattern}" | while read key; do docker exec ${REDIS_CONTAINER} redis-cli DEL "$key"; done`,
      { encoding: "utf-8", timeout: 5_000 },
    );
  } catch {
    // Redis may not be available (CI) or no keys exist — that's fine
  }
}

export default async function globalSetup(): Promise<void> {
  // Flush auth-specific rate limit keys (3 per 5min per IP)
  flushRedisPattern("auth:rl:*");
  // Flush global rate limit keys (30 per 60s per IP)
  flushRedisPattern("ratelimit:*");
}
