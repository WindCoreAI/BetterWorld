import * as jose from "jose";
import { describe, expect, it } from "vitest";

import { generateTokenPair } from "../auth-helpers.js";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "test-jwt-secret-minimum-32-characters-long-for-validation";

describe("generateTokenPair", () => {
  it("returns accessToken, refreshToken, and expiresIn", async () => {
    const result = await generateTokenPair("user-123");

    expect(result).toHaveProperty("accessToken");
    expect(result).toHaveProperty("refreshToken");
    expect(result.expiresIn).toBe(900);
    expect(typeof result.accessToken).toBe("string");
    expect(typeof result.refreshToken).toBe("string");
  });

  it("access token contains userId in payload", async () => {
    const { accessToken } = await generateTokenPair("user-123");

    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jose.jwtVerify(accessToken, secret);

    expect(payload.userId).toBe("user-123");
  });

  it("access token includes email when provided", async () => {
    const { accessToken } = await generateTokenPair("user-123", "test@example.com");

    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jose.jwtVerify(accessToken, secret);

    expect(payload.userId).toBe("user-123");
    expect(payload.email).toBe("test@example.com");
  });

  it("access token omits email when not provided", async () => {
    const { accessToken } = await generateTokenPair("user-123");

    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jose.jwtVerify(accessToken, secret);

    expect(payload.email).toBeUndefined();
  });

  it("refresh token contains userId and type='refresh'", async () => {
    const { refreshToken } = await generateTokenPair("user-123");

    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jose.jwtVerify(refreshToken, secret);

    expect(payload.userId).toBe("user-123");
    expect(payload.type).toBe("refresh");
  });

  it("access and refresh tokens are different", async () => {
    const { accessToken, refreshToken } = await generateTokenPair("user-123");

    expect(accessToken).not.toBe(refreshToken);
  });

  it("tokens are signed with HS256", async () => {
    const { accessToken } = await generateTokenPair("user-123");

    const decoded = jose.decodeProtectedHeader(accessToken);
    expect(decoded.alg).toBe("HS256");
  });

  it("generates different tokens for different users", async () => {
    const result1 = await generateTokenPair("user-123");
    const result2 = await generateTokenPair("user-456");

    expect(result1.accessToken).not.toBe(result2.accessToken);
    expect(result1.refreshToken).not.toBe(result2.refreshToken);
  });
});
