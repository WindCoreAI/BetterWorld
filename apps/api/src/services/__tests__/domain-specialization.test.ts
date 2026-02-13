/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Domain Specialization Service Unit Tests (Sprint 13)
 *
 * Tests:
 *   1. updateDomainScore — correct evaluation increments correct count
 *   2. updateDomainScore — incorrect evaluation only increments total
 *   3. updateDomainScore — creates new domain entry if none exists
 *   4. updateDomainScore — F1 (accuracy) calculation
 *   5. checkSpecialistDesignation — promotes when threshold met
 *   6. checkSpecialistDesignation — does not promote below threshold
 *   7. checkSpecialistDesignation — revokes when F1 drops below revocation threshold
 *   8. checkSpecialistDesignation — grace period protects from immediate revocation
 *   9. getValidatorSpecializations — returns only specialist domains
 *  10. getValidatorSpecializations — returns empty for no specializations
 */
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock pino
vi.mock("pino", () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  updateDomainScore,
  getValidatorSpecializations,
} from "../domain-specialization.js";
import type { DomainScores } from "../domain-specialization.js";

// ── Test Setup ─────────────────────────────────────────────────────

const VALIDATOR_ID = "aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockSetWhere = vi.fn();

let mockDb: any;

beforeEach(() => {
  vi.clearAllMocks();

  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockUpdate.mockReturnValue({ set: mockSet });
  mockSet.mockReturnValue({ where: mockSetWhere });
  mockSetWhere.mockResolvedValue(undefined);

  mockDb = {
    select: mockSelect,
    update: mockUpdate,
  };
});

// ============================================================================
// updateDomainScore
// ============================================================================

describe("updateDomainScore", () => {
  it("should increment correct count for correct evaluation", async () => {
    const existingScores: DomainScores = {
      environmental_protection: {
        evaluations: 10,
        correct: 8,
        f1: 0.8,
        specialist: false,
        designatedAt: null,
      },
    };

    mockLimit.mockResolvedValueOnce([
      { id: VALIDATOR_ID, domainScores: existingScores },
    ]);

    const result = await updateDomainScore(
      mockDb as unknown as PostgresJsDatabase,
      VALIDATOR_ID,
      "environmental_protection",
      true,
    );

    expect(result.domainScore.evaluations).toBe(11);
    expect(result.domainScore.correct).toBe(9);
    expect(result.domainScore.f1).toBeCloseTo(9 / 11);
  });

  it("should only increment total for incorrect evaluation", async () => {
    const existingScores: DomainScores = {
      healthcare_improvement: {
        evaluations: 10,
        correct: 8,
        f1: 0.8,
        specialist: false,
        designatedAt: null,
      },
    };

    mockLimit.mockResolvedValueOnce([
      { id: VALIDATOR_ID, domainScores: existingScores },
    ]);

    const result = await updateDomainScore(
      mockDb as unknown as PostgresJsDatabase,
      VALIDATOR_ID,
      "healthcare_improvement",
      false,
    );

    expect(result.domainScore.evaluations).toBe(11);
    expect(result.domainScore.correct).toBe(8);
    expect(result.domainScore.f1).toBeCloseTo(8 / 11);
  });

  it("should create new domain entry when none exists", async () => {
    mockLimit.mockResolvedValueOnce([
      { id: VALIDATOR_ID, domainScores: {} },
    ]);

    const result = await updateDomainScore(
      mockDb as unknown as PostgresJsDatabase,
      VALIDATOR_ID,
      "education_access",
      true,
    );

    expect(result.domainScore.evaluations).toBe(1);
    expect(result.domainScore.correct).toBe(1);
    expect(result.domainScore.f1).toBe(1.0);
    expect(result.domainScore.specialist).toBe(false);
  });

  it("should calculate F1 (accuracy) correctly", async () => {
    mockLimit.mockResolvedValueOnce([
      {
        id: VALIDATOR_ID,
        domainScores: {
          food_security: {
            evaluations: 99,
            correct: 90,
            f1: 90 / 99,
            specialist: false,
            designatedAt: null,
          },
        },
      },
    ]);

    const result = await updateDomainScore(
      mockDb as unknown as PostgresJsDatabase,
      VALIDATOR_ID,
      "food_security",
      true,
    );

    // 91/100 = 0.91
    expect(result.domainScore.f1).toBeCloseTo(0.91);
  });

  it("should throw when validator not found", async () => {
    mockLimit.mockResolvedValueOnce([]);

    await expect(
      updateDomainScore(
        mockDb as unknown as PostgresJsDatabase,
        VALIDATOR_ID,
        "education_access",
        true,
      ),
    ).rejects.toThrow("Validator");
  });

  // Specialist promotion
  it("should promote to specialist when threshold met", async () => {
    // 49 evaluations, 46 correct. After this correct eval: 50/50 = well, 47/50 = 0.94 >= 0.90
    mockLimit.mockResolvedValueOnce([
      {
        id: VALIDATOR_ID,
        domainScores: {
          clean_water_sanitation: {
            evaluations: 49,
            correct: 44,
            f1: 44 / 49,
            specialist: false,
            designatedAt: null,
          },
        },
      },
    ]);

    const result = await updateDomainScore(
      mockDb as unknown as PostgresJsDatabase,
      VALIDATOR_ID,
      "clean_water_sanitation",
      true,
    );

    // 45/50 = 0.90 — exactly at threshold
    expect(result.domainScore.evaluations).toBe(50);
    expect(result.domainScore.correct).toBe(45);
    expect(result.domainScore.f1).toBeCloseTo(0.90);
    expect(result.specialistStatus.promoted).toBe(true);
    expect(result.specialistStatus.specialist).toBe(true);
    expect(result.domainScore.designatedAt).not.toBeNull();
  });

  it("should not promote when below threshold", async () => {
    mockLimit.mockResolvedValueOnce([
      {
        id: VALIDATOR_ID,
        domainScores: {
          disaster_response: {
            evaluations: 49,
            correct: 40,
            f1: 40 / 49,
            specialist: false,
            designatedAt: null,
          },
        },
      },
    ]);

    const result = await updateDomainScore(
      mockDb as unknown as PostgresJsDatabase,
      VALIDATOR_ID,
      "disaster_response",
      true,
    );

    // 41/50 = 0.82 < 0.90
    expect(result.domainScore.f1).toBeCloseTo(0.82);
    expect(result.specialistStatus.promoted).toBe(false);
    expect(result.specialistStatus.specialist).toBe(false);
  });

  // Specialist revocation
  it("should revoke specialist when F1 drops below revocation threshold after grace", async () => {
    // Current specialist with 60 total evals (50 min + 10 grace).
    // After incorrect eval: 51/61 ≈ 0.836 < 0.85 → revoke
    // evalsSinceDesignation = 61 - 50 = 11 > 10 (SPECIALIST_GRACE_EVALUATIONS) → revoke
    mockLimit.mockResolvedValueOnce([
      {
        id: VALIDATOR_ID,
        domainScores: {
          community_building: {
            evaluations: 60,
            correct: 51,
            f1: 51 / 60,
            specialist: true,
            designatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      },
    ]);

    const result = await updateDomainScore(
      mockDb as unknown as PostgresJsDatabase,
      VALIDATOR_ID,
      "community_building",
      false,
    );

    // 51/61 ≈ 0.836 < 0.85; evalsSinceDesignation = 61 - 50 = 11 > 10
    expect(result.domainScore.f1).toBeCloseTo(51 / 61);
    expect(result.specialistStatus.revoked).toBe(true);
    expect(result.specialistStatus.specialist).toBe(false);
    expect(result.domainScore.designatedAt).toBeNull();
  });

  it("should respect grace period (no revocation during grace)", async () => {
    // Specialist with 55 total evals. After incorrect: 46/56 ≈ 0.821 < 0.85
    // But evalsSinceDesignation = 56 - 50 = 6 <= 10 → grace period, no revoke
    mockLimit.mockResolvedValueOnce([
      {
        id: VALIDATOR_ID,
        domainScores: {
          digital_inclusion: {
            evaluations: 55,
            correct: 46,
            f1: 46 / 55,
            specialist: true,
            designatedAt: "2026-01-15T00:00:00.000Z",
          },
        },
      },
    ]);

    const result = await updateDomainScore(
      mockDb as unknown as PostgresJsDatabase,
      VALIDATOR_ID,
      "digital_inclusion",
      false,
    );

    // 46/56 ≈ 0.821 < 0.85, but evalsSinceDesignation = 56 - 50 = 6 <= 10
    expect(result.domainScore.f1).toBeCloseTo(46 / 56);
    expect(result.specialistStatus.revoked).toBe(false);
    expect(result.specialistStatus.specialist).toBe(true);
  });

  it("should handle null domainScores gracefully", async () => {
    mockLimit.mockResolvedValueOnce([
      { id: VALIDATOR_ID, domainScores: null },
    ]);

    const result = await updateDomainScore(
      mockDb as unknown as PostgresJsDatabase,
      VALIDATOR_ID,
      "poverty_reduction",
      true,
    );

    expect(result.domainScore.evaluations).toBe(1);
    expect(result.domainScore.correct).toBe(1);
    expect(result.domainScore.f1).toBe(1.0);
  });
});

// ============================================================================
// getValidatorSpecializations
// ============================================================================

describe("getValidatorSpecializations", () => {
  it("should return only specialist domains", async () => {
    const scores: DomainScores = {
      environmental_protection: {
        evaluations: 60,
        correct: 55,
        f1: 55 / 60,
        specialist: true,
        designatedAt: "2026-01-01T00:00:00.000Z",
      },
      healthcare_improvement: {
        evaluations: 30,
        correct: 25,
        f1: 25 / 30,
        specialist: false,
        designatedAt: null,
      },
      education_access: {
        evaluations: 55,
        correct: 50,
        f1: 50 / 55,
        specialist: true,
        designatedAt: "2026-02-01T00:00:00.000Z",
      },
    };

    mockLimit.mockResolvedValueOnce([{ domainScores: scores }]);

    const specializations = await getValidatorSpecializations(
      mockDb as unknown as PostgresJsDatabase,
      VALIDATOR_ID,
    );

    expect(specializations).toHaveLength(2);
    expect(specializations.map((s) => s.domain)).toContain("environmental_protection");
    expect(specializations.map((s) => s.domain)).toContain("education_access");
    expect(specializations.map((s) => s.domain)).not.toContain("healthcare_improvement");
  });

  it("should return empty array when no specializations", async () => {
    mockLimit.mockResolvedValueOnce([
      {
        domainScores: {
          food_security: {
            evaluations: 10,
            correct: 8,
            f1: 0.8,
            specialist: false,
            designatedAt: null,
          },
        },
      },
    ]);

    const specializations = await getValidatorSpecializations(
      mockDb as unknown as PostgresJsDatabase,
      VALIDATOR_ID,
    );

    expect(specializations).toEqual([]);
  });

  it("should throw when validator not found", async () => {
    mockLimit.mockResolvedValueOnce([]);

    await expect(
      getValidatorSpecializations(
        mockDb as unknown as PostgresJsDatabase,
        VALIDATOR_ID,
      ),
    ).rejects.toThrow("Validator");
  });

  it("should handle empty domainScores", async () => {
    mockLimit.mockResolvedValueOnce([{ domainScores: {} }]);

    const specializations = await getValidatorSpecializations(
      mockDb as unknown as PostgresJsDatabase,
      VALIDATOR_ID,
    );

    expect(specializations).toEqual([]);
  });
});
