/**
 * Evidence Verification Route Tests (Sprint 8)
 *
 * Tests for:
 *   GET /api/v1/evidence/:evidenceId/status - Verification status
 *   POST /api/v1/evidence/:evidenceId/appeal - Appeal rejected evidence
 *   GET /api/v1/evidence/:evidenceId - Get evidence detail
 *
 * Covers: happy paths, auth, validation, IDOR, edge cases (appeal already-appealed, etc.)
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../../app.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { requestId } from "../../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────────

const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbReturning = vi.fn();

// Redis mock with configurable behavior
const mockRedisGet = vi.fn();
const mockRedisIncr = vi.fn();
const mockRedisExpire = vi.fn();

function resetDbChain() {
  const limitFn = vi.fn().mockResolvedValue([]);
  const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
  const whereFn = vi.fn().mockReturnValue({
    limit: limitFn,
    orderBy: orderByFn,
    returning: mockDbReturning,
  });
  const fromFn = vi.fn().mockReturnValue({
    where: whereFn,
    limit: limitFn,
    orderBy: orderByFn,
  });
  mockDbSelect.mockReturnValue({ from: fromFn });
  mockDbInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({ returning: mockDbReturning }),
  });
  mockDbUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
}

vi.mock("../../../src/lib/container.js", () => ({
  getDb: vi.fn(() => ({
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
  })),
  getRedis: vi.fn(() => ({
    get: mockRedisGet,
    incr: mockRedisIncr,
    expire: mockRedisExpire,
  })),
}));

vi.mock("../../../src/lib/storage.js", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://storage.example.com/signed/file.jpg"),
}));

// ── Auth mock (configurable) ──────────────────────────────────────

const MOCK_HUMAN = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  email: "test@example.com",
  displayName: "Test Human",
  role: "human",
};

let currentMockHuman = { ...MOCK_HUMAN };

vi.mock("../../../src/middleware/humanAuth.js", () => ({
  humanAuth: () => {
    return async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      c.set("human", currentMockHuman);
      await next();
    };
  },
}));

// Suppress log noise
vi.mock("../../../src/middleware/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Response types ──────────────────────────────────────────────────

interface SuccessBody<T = unknown> {
  ok: true;
  data: T;
  requestId: string;
}

interface ErrorBody {
  ok: false;
  error: { code: string; message: string; details?: unknown };
  requestId: string;
}

// ── Test constants ──────────────────────────────────────────────────

const VALID_EVIDENCE_ID = "11111111-2222-3333-4444-555555555555";
const OTHER_HUMAN_ID = "99999999-8888-7777-6666-555555555555";

/** Helper: create a select chain for a single-row lookup (select -> from -> where -> limit) */
function singleRowSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

// ── Test suites ─────────────────────────────────────────────────────

describe("Evidence Verify Routes", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbReturning.mockReset();
    resetDbChain();

    // Reset to default human
    currentMockHuman = { ...MOCK_HUMAN };

    // Default Redis behavior
    mockRedisGet.mockResolvedValue(null);
    mockRedisIncr.mockResolvedValue(1);
    mockRedisExpire.mockResolvedValue("OK");

    const { default: verifyRoutes } = await import("../../routes/evidence/verify.js");
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/api/v1/evidence", verifyRoutes);
    app.onError(errorHandler);
  });

  // ── GET /:evidenceId/status — Verification status ─────────────────

  describe("GET /:evidenceId/status — Verification status", () => {
    it("should return verification status for the evidence owner", async () => {
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            submittedByHumanId: MOCK_HUMAN.id,
            verificationStage: "peer_review",
            aiVerificationScore: "0.85",
            aiVerificationReasoning: "Evidence matches mission requirements",
            peerReviewCount: 2,
            peerReviewsNeeded: 3,
            peerVerdict: null,
            finalVerdict: null,
            finalConfidence: null,
            rewardTransactionId: null,
          },
        ]),
      );

      const res = await app.request(`/api/v1/evidence/${VALID_EVIDENCE_ID}/status`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as SuccessBody<{
        verificationStage: string;
        aiVerificationScore: number | null;
        aiVerificationReasoning: string | null;
        peerReviewCount: number;
        peerReviewsNeeded: number;
        peerVerdict: string | null;
        finalVerdict: string | null;
        finalConfidence: number | null;
        rewardAmount: number | null;
      }>;

      expect(body.ok).toBe(true);
      expect(body.data.verificationStage).toBe("peer_review");
      expect(body.data.aiVerificationScore).toBe(0.85);
      expect(body.data.aiVerificationReasoning).toBe("Evidence matches mission requirements");
      expect(body.data.peerReviewCount).toBe(2);
      expect(body.data.peerReviewsNeeded).toBe(3);
      expect(body.data.peerVerdict).toBeNull();
      expect(body.data.finalVerdict).toBeNull();
      expect(body.data.finalConfidence).toBeNull();
      expect(body.data.rewardAmount).toBeNull();
    });

    it("should return null for aiVerificationScore when not set", async () => {
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            submittedByHumanId: MOCK_HUMAN.id,
            verificationStage: "pending",
            aiVerificationScore: null,
            aiVerificationReasoning: null,
            peerReviewCount: 0,
            peerReviewsNeeded: 3,
            peerVerdict: null,
            finalVerdict: null,
            finalConfidence: null,
            rewardTransactionId: null,
          },
        ]),
      );

      const res = await app.request(`/api/v1/evidence/${VALID_EVIDENCE_ID}/status`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as SuccessBody<{
        aiVerificationScore: number | null;
        finalConfidence: number | null;
      }>;
      expect(body.data.aiVerificationScore).toBeNull();
      expect(body.data.finalConfidence).toBeNull();
    });

    it("should return 404 for non-existent evidence", async () => {
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([]));

      const res = await app.request(`/api/v1/evidence/${VALID_EVIDENCE_ID}/status`);
      expect(res.status).toBe(404);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toContain("Evidence not found");
    });

    it("should return 403 when requesting status for another human's evidence", async () => {
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            submittedByHumanId: OTHER_HUMAN_ID,
            verificationStage: "verified",
            aiVerificationScore: "0.90",
            aiVerificationReasoning: "Good",
            peerReviewCount: 3,
            peerReviewsNeeded: 3,
            peerVerdict: "approved",
            finalVerdict: "verified",
            finalConfidence: "0.88",
            rewardTransactionId: "tx-1",
          },
        ]),
      );

      const res = await app.request(`/api/v1/evidence/${VALID_EVIDENCE_ID}/status`);
      expect(res.status).toBe(403);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("Access denied");
    });

    it("should return 422 for invalid evidence UUID", async () => {
      const res = await app.request("/api/v1/evidence/not-a-uuid/status");
      expect(res.status).toBe(422);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ── POST /:evidenceId/appeal — Appeal rejected evidence ───────────

  describe("POST /:evidenceId/appeal — Appeal rejected evidence", () => {
    it("should successfully appeal rejected evidence", async () => {
      // Evidence lookup: rejected, owned by current human
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            id: VALID_EVIDENCE_ID,
            submittedByHumanId: MOCK_HUMAN.id,
            finalVerdict: "rejected",
            verificationStage: "rejected",
          },
        ]),
      );

      const res = await app.request(`/api/v1/evidence/${VALID_EVIDENCE_ID}/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "The evidence is valid because it clearly shows the trees I planted in the park with GPS coordinates matching the required location.",
        }),
      });

      expect(res.status).toBe(201);

      const body = (await res.json()) as SuccessBody<{
        evidenceId: string;
        newStage: string;
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.evidenceId).toBe(VALID_EVIDENCE_ID);
      expect(body.data.newStage).toBe("appealed");
    });

    it("should return 404 for non-existent evidence appeal", async () => {
      // Evidence lookup returns empty
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([]));

      const res = await app.request(`/api/v1/evidence/${VALID_EVIDENCE_ID}/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "This is a valid appeal reason that is at least twenty characters long for the validation.",
        }),
      });

      expect(res.status).toBe(404);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("should return 403 when appealing another human's evidence", async () => {
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            id: VALID_EVIDENCE_ID,
            submittedByHumanId: OTHER_HUMAN_ID,
            finalVerdict: "rejected",
            verificationStage: "rejected",
          },
        ]),
      );

      const res = await app.request(`/api/v1/evidence/${VALID_EVIDENCE_ID}/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "This is a valid appeal reason that is at least twenty characters long for the validation.",
        }),
      });

      expect(res.status).toBe(403);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("Only the evidence owner can appeal");
    });

    it("should return 403 when appealing non-rejected evidence", async () => {
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            id: VALID_EVIDENCE_ID,
            submittedByHumanId: MOCK_HUMAN.id,
            finalVerdict: "verified",
            verificationStage: "verified",
          },
        ]),
      );

      const res = await app.request(`/api/v1/evidence/${VALID_EVIDENCE_ID}/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "I want to appeal this even though it was verified successfully already.",
        }),
      });

      expect(res.status).toBe(403);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("Only rejected evidence can be appealed");
    });

    it("should return 409 when evidence has already been appealed", async () => {
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            id: VALID_EVIDENCE_ID,
            submittedByHumanId: MOCK_HUMAN.id,
            finalVerdict: "rejected",
            verificationStage: "appealed",
          },
        ]),
      );

      const res = await app.request(`/api/v1/evidence/${VALID_EVIDENCE_ID}/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "I want to appeal again but it was already appealed once before.",
        }),
      });

      expect(res.status).toBe(409);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("CONFLICT");
      expect(body.error.message).toContain("already been appealed");
    });

    it("should return 409 when evidence is in admin_review stage", async () => {
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            id: VALID_EVIDENCE_ID,
            submittedByHumanId: MOCK_HUMAN.id,
            finalVerdict: "rejected",
            verificationStage: "admin_review",
          },
        ]),
      );

      const res = await app.request(`/api/v1/evidence/${VALID_EVIDENCE_ID}/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "I want to appeal but the evidence is already under admin review.",
        }),
      });

      expect(res.status).toBe(409);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("CONFLICT");
      expect(body.error.message).toContain("already been appealed");
    });

    it("should return 422 for reason too short (< 20 chars)", async () => {
      const res = await app.request(`/api/v1/evidence/${VALID_EVIDENCE_ID}/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "Too short",
        }),
      });

      expect(res.status).toBe(422);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 422 for missing reason field", async () => {
      const res = await app.request(`/api/v1/evidence/${VALID_EVIDENCE_ID}/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(422);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 422 for invalid evidence UUID in appeal", async () => {
      const res = await app.request("/api/v1/evidence/not-valid-uuid/appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "This is a valid appeal reason that is long enough for validation.",
        }),
      });

      expect(res.status).toBe(422);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should enforce appeal rate limit (3/day)", async () => {
      // Redis returns count >= 3 (rate limit exceeded)
      mockRedisGet.mockResolvedValue("3");

      const res = await app.request(`/api/v1/evidence/${VALID_EVIDENCE_ID}/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "This is a valid appeal reason that is long enough for validation.",
        }),
      });

      expect(res.status).toBe(429);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("RATE_LIMITED");
      expect(body.error.message).toContain("3/day");
    });

    it("should increment appeal rate limit counter after success", async () => {
      // Evidence lookup: rejected, owned by current human
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            id: VALID_EVIDENCE_ID,
            submittedByHumanId: MOCK_HUMAN.id,
            finalVerdict: "rejected",
            verificationStage: "rejected",
          },
        ]),
      );

      const res = await app.request(`/api/v1/evidence/${VALID_EVIDENCE_ID}/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "The evidence is valid because it clearly shows the work I completed for this mission.",
        }),
      });

      expect(res.status).toBe(201);
      expect(mockRedisIncr).toHaveBeenCalled();
      expect(mockRedisExpire).toHaveBeenCalled();
    });
  });

  // ── GET /:evidenceId — Get evidence detail ────────────────────────

  describe("GET /:evidenceId — Get evidence detail", () => {
    const mockEvidenceRow = {
      id: VALID_EVIDENCE_ID,
      missionId: "22222222-3333-4444-5555-666666666666",
      claimId: "33333333-4444-5555-6666-777777777777",
      submittedByHumanId: MOCK_HUMAN.id,
      evidenceType: "photo",
      contentUrl: "evidence/m1/c1/original/file.jpg",
      thumbnailUrl: "evidence/m1/c1/thumbnail/thumb.webp",
      mediumUrl: null,
      latitude: "40.7128",
      longitude: "-74.0060",
      capturedAt: new Date("2026-01-15T10:30:00Z"),
      exifData: { gpsLat: 40.7128 },
      fileSize: 1024000,
      mimeType: "image/jpeg",
      notes: "Planted trees in the park",
      verificationStage: "verified",
      aiVerificationScore: "0.88",
      aiVerificationReasoning: "Good evidence",
      peerReviewCount: 3,
      peerReviewsNeeded: 3,
      peerVerdict: "approved",
      peerAverageConfidence: "0.82",
      finalVerdict: "verified",
      finalConfidence: "0.85",
      rewardTransactionId: "tx-reward-1",
      isHoneypotSubmission: false,
      createdAt: new Date("2026-01-15T10:30:00Z"),
      updatedAt: new Date("2026-01-15T12:00:00Z"),
    };

    it("should return evidence detail for the owner", async () => {
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([mockEvidenceRow]),
      );

      const res = await app.request(`/api/v1/evidence/${VALID_EVIDENCE_ID}`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as SuccessBody<{
        id: string;
        contentUrl: string;
        thumbnailUrl: string;
        latitude: number | null;
        longitude: number | null;
        aiVerificationScore: number | null;
        peerAverageConfidence: number | null;
        finalConfidence: number | null;
      }>;

      expect(body.ok).toBe(true);
      expect(body.data.id).toBe(VALID_EVIDENCE_ID);
      // Signed URLs
      expect(body.data.contentUrl).toBe("https://storage.example.com/signed/file.jpg");
      expect(body.data.thumbnailUrl).toBe("https://storage.example.com/signed/file.jpg");
      // Numeric conversions
      expect(body.data.latitude).toBe(40.7128);
      expect(body.data.longitude).toBe(-74.006);
      expect(body.data.aiVerificationScore).toBe(0.88);
      expect(body.data.peerAverageConfidence).toBe(0.82);
      expect(body.data.finalConfidence).toBe(0.85);
    });

    it("should allow admin to access any evidence detail", async () => {
      currentMockHuman = {
        id: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
        email: "admin@example.com",
        displayName: "Admin User",
        role: "admin",
      };

      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([mockEvidenceRow]),
      );

      const res = await app.request(`/api/v1/evidence/${VALID_EVIDENCE_ID}`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as SuccessBody<{ id: string }>;
      expect(body.ok).toBe(true);
      expect(body.data.id).toBe(VALID_EVIDENCE_ID);
    });

    it("should return 403 for non-owner non-admin accessing evidence detail", async () => {
      const otherHumanEvidence = {
        ...mockEvidenceRow,
        submittedByHumanId: OTHER_HUMAN_ID,
      };

      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([otherHumanEvidence]),
      );

      const res = await app.request(`/api/v1/evidence/${VALID_EVIDENCE_ID}`);
      expect(res.status).toBe(403);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("Access denied");
    });

    it("should return 404 for non-existent evidence detail", async () => {
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([]));

      const res = await app.request(`/api/v1/evidence/${VALID_EVIDENCE_ID}`);
      expect(res.status).toBe(404);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("should return 422 for invalid UUID in detail request", async () => {
      const res = await app.request("/api/v1/evidence/not-a-uuid");
      expect(res.status).toBe(422);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should handle null URLs in evidence detail", async () => {
      const evidenceWithNullUrls = {
        ...mockEvidenceRow,
        contentUrl: null,
        thumbnailUrl: null,
        latitude: null,
        longitude: null,
        aiVerificationScore: null,
        peerAverageConfidence: null,
        finalConfidence: null,
      };

      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([evidenceWithNullUrls]),
      );

      const res = await app.request(`/api/v1/evidence/${VALID_EVIDENCE_ID}`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as SuccessBody<{
        contentUrl: string | null;
        thumbnailUrl: string | null;
        latitude: number | null;
        longitude: number | null;
        aiVerificationScore: number | null;
        peerAverageConfidence: number | null;
        finalConfidence: number | null;
      }>;

      expect(body.data.contentUrl).toBeNull();
      expect(body.data.thumbnailUrl).toBeNull();
      expect(body.data.latitude).toBeNull();
      expect(body.data.longitude).toBeNull();
      expect(body.data.aiVerificationScore).toBeNull();
      expect(body.data.peerAverageConfidence).toBeNull();
      expect(body.data.finalConfidence).toBeNull();
    });
  });
});
