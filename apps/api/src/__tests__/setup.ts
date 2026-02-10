/**
 * Vitest global setup file.
 * Sets required environment variables for testing.
 *
 * For unit tests: Uses dummy values (DB is mocked)
 * For integration tests: Preserves .env values (needs real DB)
 */
import "dotenv/config";

// Set required environment variables for config validation
// Only set if not already defined (preserves .env values for integration tests)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
}
if (!process.env.REDIS_URL) {
  process.env.REDIS_URL = "redis://localhost:6379";
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "test-jwt-secret-minimum-32-characters-long-for-validation";
}
if (!process.env.ANTHROPIC_API_KEY) {
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-for-testing-purposes-only";
}
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "test";
}
