import { describe, it, expect } from "vitest";

import { paginationQuerySchema } from "../pagination";

describe("Pagination Schema", () => {
  describe("paginationQuerySchema", () => {
    it("accepts valid cursor and limit", () => {
      const result = paginationQuerySchema.safeParse({
        cursor: "agent_123_2024-01-01T00:00:00Z",
        limit: 20,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cursor).toBe("agent_123_2024-01-01T00:00:00Z");
        expect(result.data.limit).toBe(20);
      }
    });

    it("uses default limit of 20 when not provided", () => {
      const result = paginationQuerySchema.safeParse({
        cursor: "agent_456",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
      }
    });

    it("accepts no parameters (cursor optional, limit has default)", () => {
      const result = paginationQuerySchema.safeParse({});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cursor).toBeUndefined();
        expect(result.data.limit).toBe(20);
      }
    });

    it("coerces string limit to number", () => {
      const result = paginationQuerySchema.safeParse({
        limit: "50",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
        expect(typeof result.data.limit).toBe("number");
      }
    });

    it("accepts minimum limit of 1", () => {
      const result = paginationQuerySchema.safeParse({
        limit: 1,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(1);
      }
    });

    it("accepts maximum limit of 100", () => {
      const result = paginationQuerySchema.safeParse({
        limit: 100,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(100);
      }
    });

    it("rejects limit less than 1", () => {
      const result = paginationQuerySchema.safeParse({
        limit: 0,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path[0]).toBe("limit");
      }
    });

    it("rejects negative limit", () => {
      const result = paginationQuerySchema.safeParse({
        limit: -10,
      });

      expect(result.success).toBe(false);
    });

    it("rejects limit greater than 100", () => {
      const result = paginationQuerySchema.safeParse({
        limit: 101,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path[0]).toBe("limit");
      }
    });

    it("rejects non-integer limit", () => {
      const result = paginationQuerySchema.safeParse({
        limit: 25.5,
      });

      expect(result.success).toBe(false);
    });

    it("accepts various cursor formats", () => {
      const cursors = [
        "simple_cursor",
        "agent_123",
        "2024-01-01T00:00:00Z",
        "cursor_with_underscores_and_numbers_123",
        "base64encodedcursor==",
      ];

      cursors.forEach((cursor) => {
        const result = paginationQuerySchema.safeParse({ cursor });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.cursor).toBe(cursor);
        }
      });
    });

    it("accepts empty string cursor", () => {
      const result = paginationQuerySchema.safeParse({
        cursor: "",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cursor).toBe("");
      }
    });

    it("coerces string limit '20' to number 20", () => {
      const result = paginationQuerySchema.safeParse({
        cursor: "test",
        limit: "20",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
      }
    });

    it("rejects invalid string for limit", () => {
      const result = paginationQuerySchema.safeParse({
        limit: "not-a-number",
      });

      expect(result.success).toBe(false);
    });
  });
});
