import { AppError } from "@betterworld/shared";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import type { AppEnv } from "../app.js";
import { errorHandler } from "../middleware/error-handler.js";
import { requestId } from "../middleware/request-id.js";

interface OkBody {
  ok: boolean;
  requestId: string;
}

interface ErrorBody {
  ok: boolean;
  error: { code: string; message: string; details?: Record<string, unknown> };
  requestId: string;
}

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.use("*", requestId());

  app.get("/ok", (c) => c.json({ ok: true, requestId: c.get("requestId") }));

  app.get("/app-error", () => {
    throw new AppError("NOT_FOUND", "Resource not found");
  });

  app.get("/validation-error", () => {
    throw new AppError("VALIDATION_ERROR", "Invalid input", {
      fields: { name: ["Required"] },
    });
  });

  app.get("/unexpected-error", () => {
    throw new Error("Something broke");
  });

  app.onError(errorHandler);
  return app;
}

describe("requestId middleware", () => {
  const app = createTestApp();

  it("generates a request ID when none provided", async () => {
    const res = await app.request("/ok");
    expect(res.status).toBe(200);
    const id = res.headers.get("X-Request-ID");
    expect(id).toBeTruthy();
    expect(id!.length).toBeGreaterThan(0);

    const body = (await res.json()) as OkBody;
    expect(body.requestId).toBe(id);
  });

  it("preserves a provided request ID", async () => {
    const customId = "test-request-123";
    const res = await app.request("/ok", {
      headers: { "X-Request-ID": customId },
    });
    expect(res.headers.get("X-Request-ID")).toBe(customId);

    const body = (await res.json()) as OkBody;
    expect(body.requestId).toBe(customId);
  });
});

describe("errorHandler middleware", () => {
  const app = createTestApp();

  it("handles AppError with correct status and envelope", async () => {
    const res = await app.request("/app-error");
    expect(res.status).toBe(404);

    const body = (await res.json()) as ErrorBody;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("Resource not found");
    expect(body.requestId).toBeTruthy();
  });

  it("includes details in validation errors", async () => {
    const res = await app.request("/validation-error");
    expect(res.status).toBe(422);

    const body = (await res.json()) as ErrorBody;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toEqual({ fields: { name: ["Required"] } });
  });

  it("handles unexpected errors without leaking details", async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const res = await app.request("/unexpected-error");
    expect(res.status).toBe(500);

    const body = (await res.json()) as ErrorBody;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("An internal error occurred");

    process.env.NODE_ENV = prevEnv;
  });
});
