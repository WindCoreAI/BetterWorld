import { AppError } from "@betterworld/shared";
import type { ErrorHandler } from "hono";

import type { AppEnv } from "../app.js";
import { logger } from "./logger.js";
import { captureException } from "../lib/sentry.js";

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  const requestId = c.get("requestId") ?? "unknown";

  if (err instanceof AppError) {
    return c.json(
      {
        ok: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
        requestId,
      },
      err.statusCode as 400,
    );
  }

  // Unexpected error — log full details, report to Sentry, return generic message
  logger.error({ err, requestId }, "Unhandled error");

  // FR-024: Report unexpected errors to Sentry with context
  captureException(err instanceof Error ? err : new Error(String(err)), {
    requestId,
    route: c.req.path,
    method: c.req.method,
    userType: (c.get as (key: string) => unknown)("agent") ? "agent" : (c.get as (key: string) => unknown)("human") ? "human" : "public",
  });

  return c.json(
    {
      ok: false,
      error: {
        code: "INTERNAL_ERROR" as const,
        message:
          process.env.NODE_ENV === "development"
            ? err.message
            : "An internal error occurred",
      },
      requestId,
    },
    500,
  );
};
