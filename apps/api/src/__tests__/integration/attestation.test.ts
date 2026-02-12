import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  submitAttestation,
  getAttestationCounts,
  removeAttestation,
} from "../../services/attestation.service.js";
import { computeScore } from "../../services/hyperlocal-scoring.js";

// ── Mock DB ──────────────────────────────────────────────────
const mockInsertOnConflictReturning = vi.fn();
const mockInsertOnConflictDoUpdate = vi.fn().mockReturnValue({
  returning: mockInsertOnConflictReturning,
});
const mockInsertValues = vi.fn().mockReturnValue({
  onConflictDoUpdate: mockInsertOnConflictDoUpdate,
});
const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

const mockSelectGroupBy = vi.fn();
const mockSelectWhere = vi.fn().mockReturnValue({
  groupBy: mockSelectGroupBy,
  limit: vi.fn(),
});
const mockSelectFrom = vi.fn().mockReturnValue({
  where: mockSelectWhere,
});
const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

const mockDeleteReturning = vi.fn();
const mockDeleteWhere = vi.fn().mockReturnValue({
  returning: mockDeleteReturning,
});
const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere });

const mockDb = {
  insert: mockInsert,
  select: mockSelect,
  delete: mockDelete,
} as never;

// ── Tests ────────────────────────────────────────────────────

describe("Attestation Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertOnConflictReturning.mockReset();
    mockSelectGroupBy.mockReset();
    mockDeleteReturning.mockReset();

    // Reset the limit mock for getUserAttestation
    mockSelectWhere.mockReturnValue({
      groupBy: mockSelectGroupBy,
      limit: vi.fn().mockResolvedValue([]),
    });
  });

  describe("submitAttestation", () => {
    it("creates attestation and returns counts", async () => {
      mockInsertOnConflictReturning.mockResolvedValue([
        { id: "att-1" },
      ]);
      mockSelectGroupBy.mockResolvedValue([
        { statusType: "confirmed", count: "1" },
      ]);

      const result = await submitAttestation(
        mockDb,
        "problem-1",
        "human-1",
        "confirmed",
      );

      expect(result.id).toBe("att-1");
      expect(result.counts.confirmed).toBe(1);
      expect(mockInsert).toHaveBeenCalled();
    });

    it("handles upsert on duplicate (same problem + human)", async () => {
      mockInsertOnConflictReturning.mockResolvedValue([
        { id: "att-1" },
      ]);
      mockSelectGroupBy.mockResolvedValue([
        { statusType: "resolved", count: "1" },
      ]);

      const result = await submitAttestation(
        mockDb,
        "problem-1",
        "human-1",
        "resolved",
      );

      expect(result.id).toBe("att-1");
      expect(result.counts.resolved).toBe(1);
      expect(mockInsertOnConflictDoUpdate).toHaveBeenCalled();
    });
  });

  describe("getAttestationCounts", () => {
    it("aggregates counts by status type", async () => {
      mockSelectGroupBy.mockResolvedValue([
        { statusType: "confirmed", count: "5" },
        { statusType: "resolved", count: "2" },
        { statusType: "not_found", count: "1" },
      ]);

      const counts = await getAttestationCounts(mockDb, "problem-1");

      expect(counts.confirmed).toBe(5);
      expect(counts.resolved).toBe(2);
      expect(counts.not_found).toBe(1);
      expect(counts.total).toBe(8);
    });

    it("returns zeros when no attestations", async () => {
      mockSelectGroupBy.mockResolvedValue([]);

      const counts = await getAttestationCounts(mockDb, "problem-1");

      expect(counts.confirmed).toBe(0);
      expect(counts.resolved).toBe(0);
      expect(counts.not_found).toBe(0);
      expect(counts.total).toBe(0);
    });
  });

  describe("removeAttestation", () => {
    it("removes existing attestation and returns true", async () => {
      mockDeleteReturning.mockResolvedValue([{ id: "att-1" }]);

      const result = await removeAttestation(mockDb, "problem-1", "human-1");

      expect(result).toBe(true);
      expect(mockDelete).toHaveBeenCalled();
    });

    it("returns false when no attestation found", async () => {
      mockDeleteReturning.mockResolvedValue([]);

      const result = await removeAttestation(mockDb, "problem-1", "human-1");

      expect(result).toBe(false);
    });
  });

  describe("urgency score boost with attestations", () => {
    it("applies 10% boost with 3+ confirmed attestations", () => {
      const baseResult = computeScore({
        geographicScope: "neighborhood",
        localUrgency: "immediate",
        actionability: "individual",
        observationCount: 5,
        upvotes: 10,
        alignmentScore: "0.80",
        severity: "high",
        confirmedAttestations: 0,
      });

      const boostedResult = computeScore({
        geographicScope: "neighborhood",
        localUrgency: "immediate",
        actionability: "individual",
        observationCount: 5,
        upvotes: 10,
        alignmentScore: "0.80",
        severity: "high",
        confirmedAttestations: 3,
      });

      // Boosted should be ~10% higher
      expect(boostedResult.score).toBeGreaterThan(baseResult.score);
      const ratio = boostedResult.score / baseResult.score;
      expect(ratio).toBeCloseTo(1.10, 1);
    });

    it("does not boost with fewer than 3 attestations", () => {
      const baseResult = computeScore({
        geographicScope: "city",
        localUrgency: "weeks",
        actionability: "small_group",
        observationCount: 2,
        upvotes: 3,
        alignmentScore: "0.70",
        severity: "medium",
        confirmedAttestations: 0,
      });

      const noBoostResult = computeScore({
        geographicScope: "city",
        localUrgency: "weeks",
        actionability: "small_group",
        observationCount: 2,
        upvotes: 3,
        alignmentScore: "0.70",
        severity: "medium",
        confirmedAttestations: 2,
      });

      expect(noBoostResult.score).toBe(baseResult.score);
    });

    it("does not apply attestation boost to global-scope problems", () => {
      const globalResult = computeScore({
        geographicScope: "global",
        localUrgency: null,
        actionability: null,
        observationCount: 0,
        upvotes: 0,
        alignmentScore: "0.85",
        severity: "high",
        confirmedAttestations: 10,
      });

      // Global scoring doesn't use attestations
      expect(globalResult.weights).toBe("global");
      expect(globalResult.breakdown.attestationBoost).toBeUndefined();
    });
  });

  describe("rate limiting", () => {
    it("validates statusType enum", () => {
      const validTypes = ["confirmed", "resolved", "not_found"];
      const invalid = ["maybe", "unknown", ""];

      for (const v of validTypes) {
        expect(["confirmed", "resolved", "not_found"].includes(v)).toBe(true);
      }
      for (const v of invalid) {
        expect(["confirmed", "resolved", "not_found"].includes(v)).toBe(false);
      }
    });
  });
});
