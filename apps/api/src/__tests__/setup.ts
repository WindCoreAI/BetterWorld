/**
 * Vitest global setup file.
 * Sets required environment variables for testing.
 */

// Set required environment variables for config validation
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.JWT_SECRET = "test-jwt-secret-minimum-32-characters-long-for-validation";
process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-for-testing-purposes-only";
process.env.NODE_ENV = "test";
