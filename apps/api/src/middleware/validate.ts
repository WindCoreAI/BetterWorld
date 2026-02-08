import { AppError } from "@betterworld/shared";
import type { Context, MiddlewareHandler } from "hono";
import type { z } from "zod";

interface ValidationSchemas {
  body?: z.ZodSchema;
  query?: z.ZodSchema;
  params?: z.ZodSchema;
}

export function validate(schemas: ValidationSchemas): MiddlewareHandler {
  return async (c: Context, next) => {
    if (schemas.params) {
      const result = schemas.params.safeParse(c.req.param());
      if (!result.success) {
        throw new AppError("VALIDATION_ERROR", "Invalid path parameters", {
          fields: result.error.flatten().fieldErrors,
        });
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(c.req.query());
      if (!result.success) {
        throw new AppError("VALIDATION_ERROR", "Invalid query parameters", {
          fields: result.error.flatten().fieldErrors,
        });
      }
    }

    if (schemas.body) {
      const body = await c.req.json().catch(() => null);
      if (body === null) {
        throw new AppError("VALIDATION_ERROR", "Invalid or missing JSON body");
      }
      const result = schemas.body.safeParse(body);
      if (!result.success) {
        throw new AppError("VALIDATION_ERROR", "Invalid request body", {
          fields: result.error.flatten().fieldErrors,
        });
      }
    }

    await next();
  };
}
