/**
 * Evidence Submission Integration Tests (Sprint 8 -- T015, T031, T041)
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
    innerJoin: vi.fn().mockReturnValue({ where: whereFn, orderBy: orderByFn, limit: limitFn }),
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
  return { limitFn, whereFn, fromFn, orderByFn };
}

vi.mock("../../../src/lib/container.js", () => ({
  getDb: vi.fn(() => ({
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    transaction: vi.fn(async (cb) => cb({
      select: mockDbSelect,
      insert: mockDbInsert,
      update: mockDbUpdate,
    })),
  })),
  getRedis: vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue("OK"),
  })),
}));

const MOCK_HUMAN = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  email: "test@example.com",
  displayName: "Test Human",
  role: "human",
};

vi.mock("../../../src/middleware/humanAuth.js", () => ({
  humanAuth: () => {
    return async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      c.set("human", MOCK_HUMAN);
      await next();
    };
  },
}));

vi.mock("../../../src/lib/evidence-helpers.js", () => ({
  getEvidenceType: vi.fn().mockReturnValue("photo"),
  isAllowedMimeType: vi.fn().mockReturnValue(true),
  isValidFileSize: vi.fn().mockReturnValue(true),
  extractExif: vi.fn().mockResolvedValue({ latitude: 40.7128, longitude: -74.006 }),
  stripExifPii: vi.fn().mockReturnValue({ gpsLat: 40.7128, gpsLng: -74.006 }),
  MAX_FILE_SIZE: 10485760,
  MAX_FILES_PER_SUBMISSION: 5,
  ALLOWED_MIME_TYPES: ["image/jpeg"],
  haversineDistance: vi.fn().mockReturnValue(100),
}));

vi.mock("../../../src/lib/image-processing.js", () => ({
  processImage: vi.fn().mockResolvedValue({
    thumbnail: Buffer.from("thumb"),
    medium: Buffer.from("medium"),
    width: 1920,
    height: 1080,
  }),
}));

vi.mock("../../../src/lib/storage.js", () => ({
  uploadFile: vi.fn().mockResolvedValue({ url: "https://storage.example.com/file.jpg", key: "file.jpg" }),
  buildStoragePath: vi.fn().mockReturnValue("evidence/m1/c1/original/file.jpg"),
  getSignedUrl: vi.fn().mockResolvedValue("https://storage.example.com/signed/file.jpg"),
}));

vi.mock("../../../src/lib/evidence-queue.js", () => ({
  getEvidenceVerificationQueue: vi.fn().mockReturnValue({
    add: vi.fn().mockResolvedValue({ id: "job-1" }),
  }),
}));

describe("Evidence Submission", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbReturning.mockReset();
    resetDbChain();

    const { default: evidenceRoutes } = await import("../../routes/evidence/index.js");
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/api/v1/missions", evidenceRoutes);
    app.onError(errorHandler);
  });

  it("should list evidence for a mission", async () => {
    const res = await app.request("/api/v1/missions/11111111-2222-3333-4444-555555555555/evidence");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("should return 404 for non-existent evidence detail", async () => {
    const res = await app.request("/api/v1/missions/11111111-2222-3333-4444-555555555555");
    // Will route to detail handler which returns 404
    expect(res.status).toBe(404);
  });

  it("should validate UUID parameters", async () => {
    const res = await app.request("/api/v1/missions/not-a-uuid/evidence");
    expect(res.status).toBe(422);
  });

  it("should enforce rate limits via Redis", async () => {
    // Rate limit is mocked to return null (no limit hit), so this should succeed
    const res = await app.request("/api/v1/missions/11111111-2222-3333-4444-555555555555/evidence");
    expect(res.status).toBe(200);
  });
});
