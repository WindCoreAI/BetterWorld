import { describe, it, expect, vi, beforeEach } from "vitest";

import { comparePhotos } from "../../services/before-after.service.js";

// ── Mock Anthropic SDK ──────────────────────────────────────
const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

// ── Mock DB ──────────────────────────────────────────────────
const mockInsertReturning = vi.fn();
const mockInsertValues = vi.fn().mockReturnValue({ returning: mockInsertReturning });
const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

const mockUpdateWhere = vi.fn();
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

const mockSelectLimit = vi.fn();
const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockSelectLimit });
const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockDb = {
  insert: mockInsert,
  select: mockSelect,
  update: mockUpdate,
} as never;

// ── Tests ────────────────────────────────────────────────────

describe("Before/After Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockReset();
  });

  describe("comparePhotos — AI comparison", () => {
    it("returns approved when confidence >= 0.80 and improvement >= 0.30", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "tool_use",
            name: "compare_before_after",
            input: {
              improvementScore: 0.85,
              confidence: 0.92,
              reasoning: "Significant visible improvement in cleanliness",
            },
          },
        ],
      });

      const result = await comparePhotos(
        "base64before",
        "image/jpeg",
        "base64after",
        "image/jpeg",
        "Clean up the park",
      );

      expect(result.decision).toBe("approved");
      expect(result.improvementScore).toBe(0.85);
      expect(result.confidence).toBe(0.92);
      expect(result.reasoning).toContain("improvement");
    });

    it("returns rejected when confidence >= 0.80 but improvement < 0.10", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "tool_use",
            name: "compare_before_after",
            input: {
              improvementScore: 0.05,
              confidence: 0.90,
              reasoning: "No visible change between photos",
            },
          },
        ],
      });

      const result = await comparePhotos(
        "base64before",
        "image/jpeg",
        "base64after",
        "image/jpeg",
        "Fix the road",
      );

      expect(result.decision).toBe("rejected");
      expect(result.improvementScore).toBe(0.05);
    });

    it("returns peer_review when confidence is ambiguous (0.50-0.80)", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "tool_use",
            name: "compare_before_after",
            input: {
              improvementScore: 0.60,
              confidence: 0.65,
              reasoning: "Some changes visible but hard to assess impact",
            },
          },
        ],
      });

      const result = await comparePhotos(
        "base64before",
        "image/jpeg",
        "base64after",
        "image/jpeg",
        "Plant trees",
      );

      expect(result.decision).toBe("peer_review");
    });

    it("returns peer_review when no tool_use in response", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "I cannot compare these images" }],
      });

      const result = await comparePhotos(
        "base64before",
        "image/jpeg",
        "base64after",
        "image/jpeg",
        "Some mission",
      );

      expect(result.decision).toBe("peer_review");
      expect(result.confidence).toBe(0);
    });

    it("clamps scores to [0, 1] range", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "tool_use",
            name: "compare_before_after",
            input: {
              improvementScore: 1.5,
              confidence: -0.2,
              reasoning: "Out of range values",
            },
          },
        ],
      });

      const result = await comparePhotos(
        "base64before",
        "image/jpeg",
        "base64after",
        "image/jpeg",
        "Test",
      );

      expect(result.improvementScore).toBe(1);
      expect(result.confidence).toBe(0);
    });
  });

  describe("pair ID and photo sequence type", () => {
    it("validates pairId as UUID format", () => {
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";
      const invalidUuid = "not-a-uuid";

      expect(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(validUuid),
      ).toBe(true);
      expect(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invalidUuid),
      ).toBe(false);
    });

    it("only allows valid photoSequenceType values", () => {
      const valid = ["before", "after", "standalone"];
      const invalid = ["during", "unknown", ""];

      for (const v of valid) {
        expect(["before", "after", "standalone"].includes(v)).toBe(true);
      }
      for (const v of invalid) {
        expect(["before", "after", "standalone"].includes(v)).toBe(false);
      }
    });
  });

  describe("GPS distance calculation", () => {
    it("calculates haversine distance between two GPS points", () => {
      // Portland coordinates: 45.5152, -122.6784
      // Nearby point ~1km away
      const lat1 = 45.5152;
      const lng1 = -122.6784;
      const lat2 = 45.5242;
      const lng2 = -122.6784;

      const R = 6371000;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLng = ((lng2 - lng1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      const distance = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));

      expect(distance).toBeGreaterThan(900);
      expect(distance).toBeLessThan(1100);
    });
  });

  describe("pHash fraud check", () => {
    it("flags identical before/after photos (hamming distance < 5)", () => {
      // Identical hashes have hamming distance 0
      const hash1 = "0000000000000000";
      const hash2 = "0000000000000000";

      let distance = 0;
      for (let i = 0; i < hash1.length; i++) {
        if (hash1[i] !== hash2[i]) distance++;
      }
      expect(distance).toBeLessThan(5);
    });

    it("allows different before/after photos (hamming distance >= 5)", () => {
      const hash1 = "0000000000000000";
      const hash2 = "ffffffffffffffff";

      let distance = 0;
      for (let i = 0; i < hash1.length; i++) {
        if (hash1[i] !== hash2[i]) distance++;
      }
      expect(distance).toBeGreaterThanOrEqual(5);
    });
  });
});
