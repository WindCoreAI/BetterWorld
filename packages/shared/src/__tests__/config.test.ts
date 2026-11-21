import { describe, expect, it } from "vitest";

import { adminEmails, envSchema, isAdminEmail, isAiConfigured } from "../config.js";

const BASE = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "a-secret-that-is-at-least-32-characters-long",
};

describe("environment schema", () => {
  it("starts without an AI provider key (operator-moderated mode)", () => {
    const result = envSchema.safeParse(BASE);
    expect(result.success).toBe(true);
    expect(result.success && result.data.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("treats `ANTHROPIC_API_KEY=` in a .env file as not set", () => {
    const result = envSchema.safeParse({ ...BASE, ANTHROPIC_API_KEY: "" });
    expect(result.success).toBe(true);
    expect(result.success && result.data.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("still rejects a key in the wrong format, so a typo is caught at startup", () => {
    expect(envSchema.safeParse({ ...BASE, ANTHROPIC_API_KEY: "sk-wrong-provider" }).success).toBe(false);
  });

  it("accepts a well-formed key", () => {
    const result = envSchema.safeParse({ ...BASE, ANTHROPIC_API_KEY: "sk-ant-abc123" });
    expect(result.success && result.data.ANTHROPIC_API_KEY).toBe("sk-ant-abc123");
  });

  it("parses ADMIN_EMAILS into a lower-cased list and defaults to none", () => {
    const none = envSchema.safeParse(BASE);
    expect(none.success && none.data.ADMIN_EMAILS).toEqual([]);

    const some = envSchema.safeParse({ ...BASE, ADMIN_EMAILS: " Ops@Example.org, second@example.org ,," });
    expect(some.success && some.data.ADMIN_EMAILS).toEqual(["ops@example.org", "second@example.org"]);
  });

  it("still requires the infrastructure settings", () => {
    expect(envSchema.safeParse({ ...BASE, DATABASE_URL: undefined }).success).toBe(false);
    expect(envSchema.safeParse({ ...BASE, JWT_SECRET: "too-short" }).success).toBe(false);
  });
});

describe("isAiConfigured", () => {
  it("is false when the key is missing, blank, or malformed", () => {
    expect(isAiConfigured({})).toBe(false);
    expect(isAiConfigured({ ANTHROPIC_API_KEY: "" })).toBe(false);
    expect(isAiConfigured({ ANTHROPIC_API_KEY: "   " })).toBe(false);
    expect(isAiConfigured({ ANTHROPIC_API_KEY: "not-a-key" })).toBe(false);
  });

  it("is true for a well-formed key", () => {
    expect(isAiConfigured({ ANTHROPIC_API_KEY: "sk-ant-abc123" })).toBe(true);
  });
});

describe("operator emails", () => {
  const env = { ADMIN_EMAILS: "Ops@Example.org, second@example.org" };

  it("lists the configured operators", () => {
    expect(adminEmails(env)).toEqual(["ops@example.org", "second@example.org"]);
    expect(adminEmails({})).toEqual([]);
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    expect(isAdminEmail("ops@example.org", env)).toBe(true);
    expect(isAdminEmail(" OPS@EXAMPLE.ORG ", env)).toBe(true);
  });

  it("does not match other addresses, partial addresses, or nothing", () => {
    expect(isAdminEmail("someone@example.org", env)).toBe(false);
    expect(isAdminEmail("ops@example.org.evil.test", env)).toBe(false);
    expect(isAdminEmail("ops", env)).toBe(false);
    expect(isAdminEmail("", env)).toBe(false);
    expect(isAdminEmail(null, env)).toBe(false);
    expect(isAdminEmail(undefined, env)).toBe(false);
  });

  it("grants nobody admin when ADMIN_EMAILS is unset", () => {
    expect(isAdminEmail("ops@example.org", {})).toBe(false);
    expect(isAdminEmail("", {})).toBe(false);
  });
});
