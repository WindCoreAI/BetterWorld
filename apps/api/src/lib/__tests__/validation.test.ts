import { describe, it, expect } from "vitest";

import { parseUuidParam } from "../validation";

describe("parseUuidParam", () => {
  const validUuid = "550e8400-e29b-41d4-a716-446655440000";

  describe("valid UUIDs", () => {
    it("should return the UUID for a valid v4 UUID", () => {
      expect(parseUuidParam(validUuid)).toBe(validUuid);
    });

    it("should accept lowercase UUIDs", () => {
      expect(parseUuidParam("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(
        "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      );
    });

    it("should accept all-zero UUID (nil UUID)", () => {
      expect(parseUuidParam("00000000-0000-0000-0000-000000000000")).toBe(
        "00000000-0000-0000-0000-000000000000",
      );
    });
  });

  describe("invalid UUIDs", () => {
    it("should throw AppError for empty string", () => {
      expect(() => parseUuidParam("")).toThrow();
    });

    it("should throw AppError for random string", () => {
      expect(() => parseUuidParam("not-a-uuid")).toThrow();
    });

    it("should throw AppError for numeric ID", () => {
      expect(() => parseUuidParam("12345")).toThrow();
    });

    it("should throw AppError for UUID without hyphens", () => {
      expect(() => parseUuidParam("550e8400e29b41d4a716446655440000")).toThrow();
    });

    it("should throw AppError for UUID with extra characters", () => {
      expect(() => parseUuidParam(validUuid + "x")).toThrow();
    });

    it("should throw AppError for partial UUID", () => {
      expect(() => parseUuidParam("550e8400-e29b-41d4")).toThrow();
    });

    it("should throw AppError for SQL injection attempt", () => {
      expect(() => parseUuidParam("'; DROP TABLE agents; --")).toThrow();
    });
  });

  describe("error details", () => {
    it("should throw with code VALIDATION_ERROR", () => {
      try {
        parseUuidParam("bad");
        expect.fail("Should have thrown");
      } catch (error: unknown) {
        const appError = error as { code: string };
        expect(appError.code).toBe("VALIDATION_ERROR");
      }
    });

    it("should include default param name 'id' in message", () => {
      try {
        parseUuidParam("bad");
        expect.fail("Should have thrown");
      } catch (error: unknown) {
        const appError = error as { message: string };
        expect(appError.message).toContain("Invalid id");
      }
    });

    it("should include custom param name in message", () => {
      try {
        parseUuidParam("bad", "evaluationId");
        expect.fail("Should have thrown");
      } catch (error: unknown) {
        const appError = error as { message: string };
        expect(appError.message).toContain("Invalid evaluationId");
      }
    });
  });
});
