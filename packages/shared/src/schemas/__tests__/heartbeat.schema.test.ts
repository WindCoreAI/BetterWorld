import { describe, it, expect } from "vitest";

import { heartbeatCheckinSchema } from "../heartbeat";

describe("Heartbeat Schema", () => {
  describe("heartbeatCheckinSchema", () => {
    const validTimestamp = new Date().toISOString();

    it("accepts valid minimal checkin with only timestamp", () => {
      const result = heartbeatCheckinSchema.safeParse({
        timestamp: validTimestamp,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timestamp).toBe(validTimestamp);
      }
    });

    it("accepts checkin with all fields", () => {
      const result = heartbeatCheckinSchema.safeParse({
        instructionsVersion: "2024-01-01T12:00:00Z",
        activitySummary: {
          problemsReviewed: 5,
          problemsReported: 2,
          evidenceAdded: 3,
          solutionsProposed: 1,
          debatesContributed: 4,
          messagesReceived: 10,
          messagesResponded: 8,
        },
        timestamp: validTimestamp,
        clientVersion: "1.0.0",
      });

      expect(result.success).toBe(true);
    });

    it("accepts checkin with partial activity summary", () => {
      const result = heartbeatCheckinSchema.safeParse({
        timestamp: validTimestamp,
        activitySummary: {
          problemsReviewed: 3,
          solutionsProposed: 1,
        },
      });

      expect(result.success).toBe(true);
    });

    it("accepts checkin with empty activity summary object", () => {
      const result = heartbeatCheckinSchema.safeParse({
        timestamp: validTimestamp,
        activitySummary: {},
      });

      expect(result.success).toBe(true);
    });

    it("rejects missing timestamp", () => {
      const result = heartbeatCheckinSchema.safeParse({
        clientVersion: "1.0.0",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path[0] === "timestamp")).toBe(true);
      }
    });

    it("rejects invalid timestamp format", () => {
      const result = heartbeatCheckinSchema.safeParse({
        timestamp: "not-a-valid-timestamp",
      });

      expect(result.success).toBe(false);
    });

    it("rejects non-ISO 8601 timestamp", () => {
      const result = heartbeatCheckinSchema.safeParse({
        timestamp: "2024-01-01 12:00:00", // Missing T and Z
      });

      expect(result.success).toBe(false);
    });

    it("accepts valid ISO 8601 timestamp variations", () => {
      const timestamps = [
        "2024-01-01T00:00:00Z",
        "2024-01-01T12:34:56.789Z",
        "2024-12-31T23:59:59.999Z",
        "2024-01-01T00:00:00.000Z",
      ];

      timestamps.forEach((timestamp) => {
        const result = heartbeatCheckinSchema.safeParse({ timestamp });
        expect(result.success).toBe(true);
      });
    });

    it("accepts valid instructionsVersion as ISO datetime", () => {
      const result = heartbeatCheckinSchema.safeParse({
        instructionsVersion: "2024-01-15T10:30:00Z",
        timestamp: validTimestamp,
      });

      expect(result.success).toBe(true);
    });

    it("rejects invalid instructionsVersion format", () => {
      const result = heartbeatCheckinSchema.safeParse({
        instructionsVersion: "invalid-date",
        timestamp: validTimestamp,
      });

      expect(result.success).toBe(false);
    });

    describe("activitySummary field validation", () => {
      it("accepts zero values for all activity fields", () => {
        const result = heartbeatCheckinSchema.safeParse({
          timestamp: validTimestamp,
          activitySummary: {
            problemsReviewed: 0,
            problemsReported: 0,
            evidenceAdded: 0,
            solutionsProposed: 0,
            debatesContributed: 0,
            messagesReceived: 0,
            messagesResponded: 0,
          },
        });

        expect(result.success).toBe(true);
      });

      it("accepts large positive integers", () => {
        const result = heartbeatCheckinSchema.safeParse({
          timestamp: validTimestamp,
          activitySummary: {
            problemsReviewed: 9999,
            messagesReceived: 100000,
          },
        });

        expect(result.success).toBe(true);
      });

      it("rejects negative problemsReviewed", () => {
        const result = heartbeatCheckinSchema.safeParse({
          timestamp: validTimestamp,
          activitySummary: {
            problemsReviewed: -1,
          },
        });

        expect(result.success).toBe(false);
      });

      it("rejects negative problemsReported", () => {
        const result = heartbeatCheckinSchema.safeParse({
          timestamp: validTimestamp,
          activitySummary: {
            problemsReported: -5,
          },
        });

        expect(result.success).toBe(false);
      });

      it("rejects negative evidenceAdded", () => {
        const result = heartbeatCheckinSchema.safeParse({
          timestamp: validTimestamp,
          activitySummary: {
            evidenceAdded: -2,
          },
        });

        expect(result.success).toBe(false);
      });

      it("rejects negative solutionsProposed", () => {
        const result = heartbeatCheckinSchema.safeParse({
          timestamp: validTimestamp,
          activitySummary: {
            solutionsProposed: -10,
          },
        });

        expect(result.success).toBe(false);
      });

      it("rejects negative debatesContributed", () => {
        const result = heartbeatCheckinSchema.safeParse({
          timestamp: validTimestamp,
          activitySummary: {
            debatesContributed: -3,
          },
        });

        expect(result.success).toBe(false);
      });

      it("rejects negative messagesReceived", () => {
        const result = heartbeatCheckinSchema.safeParse({
          timestamp: validTimestamp,
          activitySummary: {
            messagesReceived: -8,
          },
        });

        expect(result.success).toBe(false);
      });

      it("rejects negative messagesResponded", () => {
        const result = heartbeatCheckinSchema.safeParse({
          timestamp: validTimestamp,
          activitySummary: {
            messagesResponded: -4,
          },
        });

        expect(result.success).toBe(false);
      });

      it("rejects non-integer values", () => {
        const result = heartbeatCheckinSchema.safeParse({
          timestamp: validTimestamp,
          activitySummary: {
            problemsReviewed: 3.5,
          },
        });

        expect(result.success).toBe(false);
      });

      it("rejects string values for activity fields", () => {
        const result = heartbeatCheckinSchema.safeParse({
          timestamp: validTimestamp,
          activitySummary: {
            problemsReviewed: "5",
          },
        });

        expect(result.success).toBe(false);
      });
    });

    describe("clientVersion validation", () => {
      it("accepts valid semver version", () => {
        const result = heartbeatCheckinSchema.safeParse({
          timestamp: validTimestamp,
          clientVersion: "1.2.3",
        });

        expect(result.success).toBe(true);
      });

      it("accepts version with pre-release tag", () => {
        const result = heartbeatCheckinSchema.safeParse({
          timestamp: validTimestamp,
          clientVersion: "2.0.0-beta.1",
        });

        expect(result.success).toBe(true);
      });

      it("accepts custom version strings", () => {
        const result = heartbeatCheckinSchema.safeParse({
          timestamp: validTimestamp,
          clientVersion: "dev-build-123",
        });

        expect(result.success).toBe(true);
      });

      it("accepts empty clientVersion", () => {
        const result = heartbeatCheckinSchema.safeParse({
          timestamp: validTimestamp,
          clientVersion: "",
        });

        expect(result.success).toBe(true);
      });

      it("works without clientVersion (optional)", () => {
        const result = heartbeatCheckinSchema.safeParse({
          timestamp: validTimestamp,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.clientVersion).toBeUndefined();
        }
      });
    });

    it("accepts complex realistic checkin", () => {
      const result = heartbeatCheckinSchema.safeParse({
        instructionsVersion: "2024-01-20T08:00:00Z",
        activitySummary: {
          problemsReviewed: 12,
          problemsReported: 3,
          evidenceAdded: 5,
          solutionsProposed: 2,
          debatesContributed: 8,
          messagesReceived: 25,
          messagesResponded: 20,
        },
        timestamp: "2024-01-20T14:30:00.123Z",
        clientVersion: "1.5.2",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.activitySummary?.problemsReviewed).toBe(12);
        expect(result.data.clientVersion).toBe("1.5.2");
      }
    });
  });
});
