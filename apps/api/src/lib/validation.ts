import { AppError } from "@betterworld/shared";
import { z } from "zod";

const uuidSchema = z.string().uuid();

/**
 * Validate that a route parameter is a valid UUID.
 * Throws AppError("VALIDATION_ERROR") if not.
 */
export function parseUuidParam(value: string, paramName = "id"): string {
  const result = uuidSchema.safeParse(value);
  if (!result.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Invalid ${paramName}: must be a valid UUID`,
    );
  }
  return result.data;
}
