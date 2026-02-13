import { describe, it, expect, vi, beforeEach } from "vitest";

import { shouldSpotCheck, recordSpotCheck } from "../../services/spot-check.service.js";

// ── Mock DB ──────────────────────────────────────────────────

const mockInsertReturning = vi.fn();
const mockInsertValues = vi.fn().mockReturnValue({ returning: mockInsertReturning });
const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

const mockSelectLimit = vi.fn();
const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockSelectLimit });
const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

const mockUpdateReturning = vi.fn();
const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockUpdateReturning });
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

const mockDb = {
  insert: mockInsert,
  select: mockSelect,
  update: mockUpdate,
} as never;

// ── Tests ────────────────────────────────────────────────────

describe("Spot Check Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertReturning.mockReset();
  });

  describe("shouldSpotCheck — deterministic 5% selection", () => {
    it("returns consistent results for the same submissionId", () => {
      const id = "test-submission-001";
      const result1 = shouldSpotCheck(id);
      const result2 = shouldSpotCheck(id);
      expect(result1).toBe(result2);
    });

    it("selects approximately 5% of submissions over a large sample", () => {
      const total = 2000;
      let selected = 0;
      for (let i = 0; i < total; i++) {
        if (shouldSpotCheck(`submission-${i}`)) {
          selected++;
        }
      }
      // Expected: ~100 (5% of 2000), allow 2-10% range
      const rate = (selected / total) * 100;
      expect(rate).toBeGreaterThan(2);
      expect(rate).toBeLessThan(10);
    });

    it("produces different results for different IDs", () => {
      // Some should be true, some false over a reasonable set
      const results = Array.from({ length: 500 }, (_, i) =>
        shouldSpotCheck(`check-variation-${i}`),
      );
      const trueCount = results.filter(Boolean).length;
      // At 5%, expect ~25 out of 500
      expect(trueCount).toBeGreaterThan(0);
      expect(trueCount).toBeLessThan(500);
    });
  });

  describe("recordSpotCheck — recording and classification", () => {
    it("records agreement when peer and Layer B both approve", async () => {
      mockInsertReturning.mockResolvedValue([{ id: "sc-1" }]);

      const result = await recordSpotCheck(
        mockDb,
        "sub-1",
        "problem",
        "approved",
        0.85,
        "approved",
        0.90,
      );

      expect(result.agrees).toBe(true);
      expect(result.disagreementType).toBeNull();
    });

    it("records false_negative when peer approves but Layer B rejects", async () => {
      mockInsertReturning.mockResolvedValue([{ id: "sc-2" }]);

      const result = await recordSpotCheck(
        mockDb,
        "sub-2",
        "solution",
        "approved",
        0.75,
        "rejected",
        0.30,
      );

      expect(result.agrees).toBe(false);
      expect(result.disagreementType).toBe("false_negative");
    });

    it("records false_positive when peer rejects but Layer B approves", async () => {
      mockInsertReturning.mockResolvedValue([{ id: "sc-3" }]);

      const result = await recordSpotCheck(
        mockDb,
        "sub-3",
        "debate",
        "rejected",
        0.80,
        "approved",
        0.85,
      );

      expect(result.agrees).toBe(false);
      expect(result.disagreementType).toBe("false_positive");
    });

    it("records missed_flag when peer approves but Layer B flags", async () => {
      mockInsertReturning.mockResolvedValue([{ id: "sc-4" }]);

      const result = await recordSpotCheck(
        mockDb,
        "sub-4",
        "problem",
        "approved",
        0.60,
        "flagged",
        0.50,
      );

      expect(result.agrees).toBe(false);
      expect(result.disagreementType).toBe("missed_flag");
    });

    it("records agreement when peer rejects and Layer B flags (both negative)", async () => {
      mockInsertReturning.mockResolvedValue([{ id: "sc-5" }]);

      const result = await recordSpotCheck(
        mockDb,
        "sub-5",
        "problem",
        "rejected",
        0.90,
        "flagged",
        0.35,
      );

      // Peer rejected + Layer B flagged = both see it as problematic
      expect(result.agrees).toBe(true);
      expect(result.disagreementType).toBeNull();
    });

    it("records agreement when both reject", async () => {
      mockInsertReturning.mockResolvedValue([{ id: "sc-6" }]);

      const result = await recordSpotCheck(
        mockDb,
        "sub-6",
        "solution",
        "rejected",
        0.95,
        "rejected",
        0.20,
      );

      expect(result.agrees).toBe(true);
      expect(result.disagreementType).toBeNull();
    });

    it("passes correct values to the database insert", async () => {
      mockInsertReturning.mockResolvedValue([{ id: "sc-7" }]);

      await recordSpotCheck(
        mockDb,
        "sub-7",
        "problem",
        "approved",
        0.88,
        "rejected",
        0.25,
      );

      expect(mockInsert).toHaveBeenCalled();
      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          submissionId: "sub-7",
          submissionType: "problem",
          peerDecision: "approved",
          peerConfidence: "0.88",
          layerBDecision: "rejected",
          layerBAlignmentScore: "0.25",
          agrees: false,
          disagreementType: "false_negative",
        }),
      );
    });
  });
});
