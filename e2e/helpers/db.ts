/**
 * E2E Database Helpers
 *
 * Extracted from golden-path.test.ts for reuse across all suites.
 */

import { execSync } from "child_process";

import { PG_CONTAINER } from "./constants";

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
