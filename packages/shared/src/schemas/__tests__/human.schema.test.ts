import { describe, expect, it } from "vitest";

import {
  LoginSchema,
  ProfileCreateSchema,
  RefreshTokenSchema,
  RegisterSchema,
  ResendCodeSchema,
  SpendTokensSchema,
  VerifyEmailSchema,
} from "../human.js";

describe("Human Schemas", () => {
  describe("RegisterSchema", () => {
    const valid = { email: "test@example.com", password: "Password1", displayName: "Test User" };

    it("accepts valid registration data", () => {
      expect(RegisterSchema.safeParse(valid).success).toBe(true);
    });

    it("rejects invalid email", () => {
      expect(RegisterSchema.safeParse({ ...valid, email: "not-email" }).success).toBe(false);
    });

    it("rejects password without uppercase", () => {
      expect(RegisterSchema.safeParse({ ...valid, password: "password1" }).success).toBe(false);
    });

    it("rejects password without lowercase", () => {
      expect(RegisterSchema.safeParse({ ...valid, password: "PASSWORD1" }).success).toBe(false);
    });

    it("rejects password without digit", () => {
      expect(RegisterSchema.safeParse({ ...valid, password: "Password" }).success).toBe(false);
    });

    it("rejects password shorter than 8 characters", () => {
      expect(RegisterSchema.safeParse({ ...valid, password: "Pass1" }).success).toBe(false);
    });

    it("rejects displayName shorter than 2 characters", () => {
      expect(RegisterSchema.safeParse({ ...valid, displayName: "A" }).success).toBe(false);
    });

    it("rejects displayName longer than 200 characters", () => {
      expect(RegisterSchema.safeParse({ ...valid, displayName: "A".repeat(201) }).success).toBe(false);
    });
  });

  describe("VerifyEmailSchema", () => {
    it("accepts valid 6-digit code", () => {
      expect(VerifyEmailSchema.safeParse({ email: "a@b.com", code: "123456" }).success).toBe(true);
    });

    it("rejects non-numeric code", () => {
      expect(VerifyEmailSchema.safeParse({ email: "a@b.com", code: "abcdef" }).success).toBe(false);
    });

    it("rejects code shorter than 6 digits", () => {
      expect(VerifyEmailSchema.safeParse({ email: "a@b.com", code: "12345" }).success).toBe(false);
    });

    it("rejects code longer than 6 digits", () => {
      expect(VerifyEmailSchema.safeParse({ email: "a@b.com", code: "1234567" }).success).toBe(false);
    });
  });

  describe("LoginSchema", () => {
    it("accepts valid login data", () => {
      expect(LoginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
    });

    it("rejects empty password", () => {
      expect(LoginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
    });
  });

  describe("ResendCodeSchema", () => {
    it("accepts valid email", () => {
      expect(ResendCodeSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
    });

    it("rejects invalid email", () => {
      expect(ResendCodeSchema.safeParse({ email: "not-email" }).success).toBe(false);
    });
  });

  describe("RefreshTokenSchema", () => {
    it("accepts non-empty refresh token", () => {
      expect(RefreshTokenSchema.safeParse({ refreshToken: "abc" }).success).toBe(true);
    });

    it("rejects empty refresh token", () => {
      expect(RefreshTokenSchema.safeParse({ refreshToken: "" }).success).toBe(false);
    });
  });

  describe("SpendTokensSchema", () => {
    const valid = { amount: 10, type: "spend_vote" as const };

    it("accepts valid spend payload", () => {
      expect(SpendTokensSchema.safeParse(valid).success).toBe(true);
    });

    it("accepts all valid spend types", () => {
      for (const type of ["spend_vote", "spend_circle", "spend_analytics", "spend_custom"]) {
        expect(SpendTokensSchema.safeParse({ ...valid, type }).success).toBe(true);
      }
    });

    it("rejects invalid spend type", () => {
      expect(SpendTokensSchema.safeParse({ ...valid, type: "invalid" }).success).toBe(false);
    });

    it("rejects zero amount", () => {
      expect(SpendTokensSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
    });

    it("rejects negative amount", () => {
      expect(SpendTokensSchema.safeParse({ ...valid, amount: -5 }).success).toBe(false);
    });

    it("rejects non-integer amount", () => {
      expect(SpendTokensSchema.safeParse({ ...valid, amount: 5.5 }).success).toBe(false);
    });

    it("accepts optional idempotencyKey", () => {
      expect(SpendTokensSchema.safeParse({ ...valid, idempotencyKey: "key-123" }).success).toBe(true);
    });

    it("accepts optional referenceId as UUID", () => {
      expect(
        SpendTokensSchema.safeParse({
          ...valid,
          referenceId: "550e8400-e29b-41d4-a716-446655440000",
        }).success,
      ).toBe(true);
    });

    it("rejects non-UUID referenceId", () => {
      expect(
        SpendTokensSchema.safeParse({ ...valid, referenceId: "not-a-uuid" }).success,
      ).toBe(false);
    });
  });

  describe("ProfileCreateSchema", () => {
    const valid = {
      skills: ["typescript"],
      city: "Jakarta",
      country: "Indonesia",
      languages: ["en"],
    };

    it("accepts valid profile with required fields", () => {
      expect(ProfileCreateSchema.safeParse(valid).success).toBe(true);
    });

    it("rejects empty skills array", () => {
      expect(ProfileCreateSchema.safeParse({ ...valid, skills: [] }).success).toBe(false);
    });

    it("rejects more than 50 skills", () => {
      const tooMany = Array.from({ length: 51 }, (_, i) => `skill${i}`);
      expect(ProfileCreateSchema.safeParse({ ...valid, skills: tooMany }).success).toBe(false);
    });

    it("rejects language code that is not 2 characters", () => {
      expect(ProfileCreateSchema.safeParse({ ...valid, languages: ["eng"] }).success).toBe(false);
    });

    it("defaults serviceRadius to 10", () => {
      const result = ProfileCreateSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.serviceRadius).toBe(10);
      }
    });

    it("rejects serviceRadius below 5", () => {
      expect(ProfileCreateSchema.safeParse({ ...valid, serviceRadius: 3 }).success).toBe(false);
    });

    it("rejects serviceRadius above 50", () => {
      expect(ProfileCreateSchema.safeParse({ ...valid, serviceRadius: 100 }).success).toBe(false);
    });

    it("rejects bio longer than 500 characters", () => {
      expect(ProfileCreateSchema.safeParse({ ...valid, bio: "x".repeat(501) }).success).toBe(false);
    });

    it("accepts valid availability object", () => {
      expect(
        ProfileCreateSchema.safeParse({
          ...valid,
          availability: { weekdays: ["9-17"], timezone: "Asia/Jakarta" },
        }).success,
      ).toBe(true);
    });
  });
});
