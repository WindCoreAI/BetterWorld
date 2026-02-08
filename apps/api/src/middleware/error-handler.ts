import { AppError } from "@betterworld/shared";
import type { ErrorHandler } from "hono";

import type { AppEnv } from "../app.js";
import { logger } from "./logger.js";

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

  // Unexpected error — log full details, return generic message
  logger.error({ err, requestId }, "Unhandled error");

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
