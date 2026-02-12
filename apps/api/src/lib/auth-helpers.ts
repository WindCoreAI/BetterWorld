/**
 * Shared auth helpers (Sprint 6)
 */

import crypto from "crypto";

import { loadConfig } from "@betterworld/shared";
import * as jose from "jose";

const getConfig = () => loadConfig();

/**
 * Generate an access + refresh token pair for a user.
 * Centralizes JWT generation logic used across login, verifyEmail, refresh, and OAuth exchange.
 */
export async function generateTokenPair(userId: string, email?: string) {
  const config = getConfig();
  const secret = new TextEncoder().encode(config.JWT_SECRET);

  const accessPayload: Record<string, unknown> = { userId };
  if (email) accessPayload.email = email;

  const accessToken = await new jose.SignJWT(accessPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(config.ACCESS_TOKEN_EXPIRY)
    .sign(secret);

  const refreshToken = await new jose.SignJWT({ userId, type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(config.REFRESH_TOKEN_EXPIRY)
    .sign(secret);

  return { accessToken, refreshToken, expiresIn: 900 };
}

/**
 * SHA-256 hash a token for safe storage.
 * Prevents token leakage on database breach while allowing lookup.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
