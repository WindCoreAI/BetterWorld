/* eslint-disable import/order */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock DB ──────────────────────────────────────────────────

const mockReturning = vi.fn();
const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
const mockInsert = vi.fn().mockReturnValue({ values: mockValues });

const mockLimit = vi.fn();
const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy, limit: mockLimit });
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere, orderBy: mockOrderBy });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

const mockUpdateReturning = vi.fn();
const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockUpdateReturning });
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockDb = {
  insert: mockInsert,
  select: mockSelect,
  update: mockUpdate,
} as never;

vi.mock("../../lib/container.js", () => ({
  getDb: () => mockDb,
  getRedis: () => null,
}));

vi.mock("../../middleware/auth.js", () => ({
  requireAdmin: () => vi.fn((_c: unknown, next: () => Promise<void>) => next()),
}));

vi.mock("../../middleware/humanAuth.js", () => ({
  humanAuth: () => vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("human", { id: "human-001", role: "user" });
    await next();
  }),
}));

vi.mock("../../lib/validation.js", () => ({
  parseUuidParam: (val: string) => val,
}));

import { AppError } from "@betterworld/shared";
import { Hono } from "hono";

import missionTemplateRoutes from "../../routes/mission-templates.routes.js";

const app = new Hono();
app.route("/", missionTemplateRoutes);
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ ok: false, error: { code: err.code, message: err.message } }, err.statusCode as 400);
  }
  return c.json({ ok: false, error: { code: "INTERNAL_ERROR", message: err.message } }, 500);
});

// ── Helpers ──────────────────────────────────────────────────

const TEMPLATE_ID = "aaaabbbb-cccc-4ddd-8eee-ffffffffffff";

const sampleTemplate = {
  id: TEMPLATE_ID,
  name: "Park Cleanup Template",
  description: "Template for park cleanup missions in urban areas",
  domain: "environmental_protection",
  difficultyLevel: "easy",
  requiredPhotos: [{ label: "Before photo", required: true }],
  gpsRadiusMeters: 500,
  completionCriteria: [{ criterion: "Remove visible trash", required: true }],
  stepInstructions: [{ step: 1, instruction: "Take a before photo", photoRequired: true }],
  estimatedDurationMinutes: 30,
  isActive: true,
  createdByAdminId: "admin-001",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function jsonReq(path: string, body: unknown, method = "POST") {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function jsonBody(res: Response): Promise<any> {
  return res.json();
}

// ── Tests ────────────────────────────────────────────────────

describe("Mission Template Routes (T074-T079)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReturning.mockReset();
    mockLimit.mockReset();
    mockUpdateReturning.mockReset();
    // Default: select returns empty
    mockLimit.mockResolvedValue([]);
  });

  describe("POST /admin/mission-templates", () => {
    it("creates a template with valid input", async () => {
      mockReturning.mockResolvedValueOnce([sampleTemplate]);

      const res = await jsonReq("/admin/mission-templates", {
        name: "Park Cleanup Template",
        description: "Template for park cleanup missions in urban areas",
        domain: "environmental_protection",
        difficultyLevel: "easy",
        requiredPhotos: [{ label: "Before photo", required: true }],
        gpsRadiusMeters: 500,
        completionCriteria: [{ criterion: "Remove visible trash", required: true }],
        stepInstructions: [{ step: 1, instruction: "Take a before photo", photoRequired: true }],
      });

      expect(res.status).toBe(201);
      const json = await jsonBody(res);
      expect(json.ok).toBe(true);
      expect(json.data.name).toBe("Park Cleanup Template");
    });

    it("rejects invalid input (missing name)", async () => {
      const res = await jsonReq("/admin/mission-templates", {
        description: "Test",
        domain: "environmental_protection",
        difficultyLevel: "easy",
        requiredPhotos: [],
        gpsRadiusMeters: 100,
        completionCriteria: [],
        stepInstructions: [],
      });

      expect(res.status).toBe(422);
    });
  });

  describe("GET /admin/mission-templates", () => {
    it("lists templates with pagination metadata", async () => {
      mockLimit.mockResolvedValueOnce([sampleTemplate]);

      const res = await app.request("/admin/mission-templates?limit=20");

      expect(res.status).toBe(200);
      const json = await jsonBody(res);
      expect(json.ok).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.meta.hasMore).toBe(false);
      expect(json.meta.count).toBe(1);
    });

    it("returns hasMore when more items exist", async () => {
      // Return limit+1 items (21 for default limit of 20) to trigger hasMore
      const items = Array.from({ length: 21 }, (_, i) => ({
        ...sampleTemplate,
        id: `template-${i}`,
      }));
      mockLimit.mockResolvedValueOnce(items);

      const res = await app.request("/admin/mission-templates?limit=20");
      const json = await jsonBody(res);

      expect(json.meta.hasMore).toBe(true);
      expect(json.data).toHaveLength(20);
      expect(json.meta.nextCursor).toBeDefined();
    });
  });

  describe("GET /admin/mission-templates/:id", () => {
    it("returns template detail", async () => {
      mockLimit.mockResolvedValueOnce([sampleTemplate]);

      const res = await app.request(`/admin/mission-templates/${TEMPLATE_ID}`);

      expect(res.status).toBe(200);
      const json = await jsonBody(res);
      expect(json.ok).toBe(true);
      expect(json.data.id).toBe(TEMPLATE_ID);
    });

    it("returns 404 for nonexistent template", async () => {
      mockLimit.mockResolvedValueOnce([]);

      const res = await app.request("/admin/mission-templates/nonexistent");

      expect(res.status).toBe(404);
    });
  });

  describe("PUT /admin/mission-templates/:id", () => {
    it("updates template fields", async () => {
      mockUpdateReturning.mockResolvedValueOnce([{
        ...sampleTemplate,
        name: "Updated Template",
      }]);

      const res = await jsonReq(
        `/admin/mission-templates/${TEMPLATE_ID}`,
        { name: "Updated Template" },
        "PUT",
      );

      expect(res.status).toBe(200);
      const json = await jsonBody(res);
      expect(json.ok).toBe(true);
      expect(json.data.name).toBe("Updated Template");
    });

    it("returns 404 when updating nonexistent template", async () => {
      mockUpdateReturning.mockResolvedValueOnce([]);

      const res = await jsonReq(
        "/admin/mission-templates/nonexistent",
        { name: "Updated" },
        "PUT",
      );

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /admin/mission-templates/:id", () => {
    it("soft deletes template (sets isActive=false)", async () => {
      mockUpdateReturning.mockResolvedValueOnce([{ id: TEMPLATE_ID }]);

      const res = await app.request(
        `/admin/mission-templates/${TEMPLATE_ID}`,
        { method: "DELETE" },
      );

      expect(res.status).toBe(200);
      const json = await jsonBody(res);
      expect(json.ok).toBe(true);
      expect(json.data.deactivated).toBe(true);
    });

    it("returns 404 when deleting nonexistent template", async () => {
      mockUpdateReturning.mockResolvedValueOnce([]);

      const res = await app.request(
        "/admin/mission-templates/nonexistent",
        { method: "DELETE" },
      );

      expect(res.status).toBe(404);
    });
  });

  describe("POST /missions/from-template", () => {
    it("creates a mission from active template", async () => {
      // First select: fetch template (active)
      mockLimit.mockResolvedValueOnce([sampleTemplate]);
      // Insert: mission creation
      mockReturning.mockResolvedValueOnce([{
        id: "mission-001",
        title: "Clean Central Park",
        domain: "environmental_protection",
      }]);

      const res = await jsonReq("/missions/from-template", {
        templateId: TEMPLATE_ID,
        title: "Clean Central Park",
        description: "Help clean up Central Park this weekend",
        requiredLatitude: 40.785091,
        requiredLongitude: -73.968285,
      });

      expect(res.status).toBe(201);
      const json = await jsonBody(res);
      expect(json.ok).toBe(true);
      expect(json.data.templateId).toBe(TEMPLATE_ID);
    });

    it("rejects when template is inactive", async () => {
      mockLimit.mockResolvedValueOnce([]);

      const res = await jsonReq("/missions/from-template", {
        templateId: TEMPLATE_ID,
        title: "Clean Central Park",
        description: "Help clean up Central Park this weekend",
        requiredLatitude: 40.785091,
        requiredLongitude: -73.968285,
      });

      expect(res.status).toBe(404);
    });

    it("validates required fields", async () => {
      const res = await jsonReq("/missions/from-template", {
        templateId: "not-a-uuid",
      });

      expect(res.status).toBe(422);
    });
  });
});
