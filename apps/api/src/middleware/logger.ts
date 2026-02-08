import { createMiddleware } from "hono/factory";
import pino from "pino";

import type { AppEnv } from "../app.js";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

export function loggerMiddleware() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;

    logger.info({
      requestId: c.get("requestId"),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration,
    });
  });
}
