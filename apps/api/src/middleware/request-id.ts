import { randomUUID } from "node:crypto";

import { createMiddleware } from "hono/factory";

import type { AppEnv } from "../app.js";

export function requestId() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const id = c.req.header("X-Request-ID") ?? randomUUID();
    c.set("requestId", id);
    c.header("X-Request-ID", id);
    await next();
  });
}
