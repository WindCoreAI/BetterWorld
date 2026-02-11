/**
 * OAuth Routes - Google & GitHub (Sprint 6)
 *
 * Security: CSRF state validation, PKCE code_verifier, response validation,
 * email conflict handling, exchange-code pattern (no tokens in URLs).
 */

import { loadConfig } from "@betterworld/shared";
import { Hono, type Context } from "hono";

import type { AppEnv } from "../../app.js";
import { generateTokenPair } from "../../lib/auth-helpers.js";
import { logger } from "../../middleware/logger.js";

// OAuth provider response types
interface OAuthTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  id?: string;
  email?: string;
  name?: string;
  picture?: string;
}

interface GitHubUserInfo {
  id?: number;
  login?: string;
  name?: string;
  email?: string;
  avatar_url?: string;
}

const app = new Hono<AppEnv>();
const getConfig = () => loadConfig();
const isProduction = () => process.env.NODE_ENV === "production";
const cookieFlags = () => `HttpOnly; SameSite=Lax; Path=/${isProduction() ? "; Secure" : ""}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OAuthContext = Context<AppEnv, any>;

/** Validate OAuth callback params: code, CSRF state. Returns code or null. */
function validateCallbackState(c: OAuthContext): { code: string; storedState: string } | null {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  if (!code) return null;
  const storedState = parseCookie(c.req.header("Cookie") || "", "oauth_state");
  if (!stateParam || !storedState || stateParam !== storedState) return null;
  return { code, storedState };
}

/** Exchange tokens and validate response. Returns tokens or null. */
function validateTokenResponse(tokens: OAuthTokenResponse): boolean {
  return !tokens.error && !!tokens.access_token;
}

/** Complete OAuth callback: find/create user and redirect with exchange code */
async function completeOAuthCallback(c: OAuthContext, params: OAuthUserParams, webUrl: string) {
  const user = await findOrCreateOAuthUser(params);
  if (!user) {
    return c.json({ ok: false, error: { code: "OAUTH_ERROR" as const, message: "Failed to create user" }, requestId: c.get("requestId") }, 500);
  }
  const exchangeCode = await storeExchangeCode(user);
  return c.redirect(`${webUrl}/auth/callback?code=${exchangeCode}`);
}

function oauthError(c: OAuthContext, message: string, status: 400 | 500 | 502) {
  return c.json({ ok: false, error: { code: "OAUTH_ERROR" as const, message }, requestId: c.get("requestId") }, status);
}

// ─── Google OAuth ─────────────────────────────────────────────

app.get("/google", async (c) => {
  const config = getConfig();
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    return c.json({ ok: false, error: { code: "OAUTH_NOT_CONFIGURED" as const, message: "Google OAuth is not configured" }, requestId: c.get("requestId") }, 503);
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateRandomString(32);

  c.header("Set-Cookie", `oauth_state=${state}; ${cookieFlags()}; Max-Age=600`);
  c.header("Set-Cookie", `pkce_verifier=${codeVerifier}; ${cookieFlags()}; Max-Age=600`, { append: true });

  const redirectUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID,
    redirect_uri: `${config.API_URL}/api/v1/human-auth/oauth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  })}`;

  return c.redirect(redirectUrl);
});

app.get("/google/callback", async (c) => {
  const config = getConfig();
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    return c.json({ ok: false, error: { code: "OAUTH_NOT_CONFIGURED" as const, message: "Google OAuth is not configured" }, requestId: c.get("requestId") }, 503);
  }

  const validated = validateCallbackState(c);
  if (!validated) return oauthError(c, "Invalid callback parameters", 400);

  const codeVerifier = parseCookie(c.req.header("Cookie") || "", "pkce_verifier");
  if (!codeVerifier) return oauthError(c, "Missing PKCE verifier", 400);

  // Clear OAuth cookies
  c.header("Set-Cookie", `oauth_state=; ${cookieFlags()}; Max-Age=0`);
  c.header("Set-Cookie", `pkce_verifier=; ${cookieFlags()}; Max-Age=0`, { append: true });

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: validated.code,
        client_id: config.GOOGLE_CLIENT_ID,
        client_secret: config.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${config.API_URL}/api/v1/human-auth/oauth/google/callback`,
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      }),
    });

    const tokens = (await tokenResponse.json()) as OAuthTokenResponse;
    if (!validateTokenResponse(tokens)) {
      logger.warn({ error: tokens.error, description: tokens.error_description }, "Google token exchange failed");
      return oauthError(c, "Token exchange failed", 400);
    }

    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userInfoResponse.ok) {
      logger.warn({ status: userInfoResponse.status }, "Google user info fetch failed");
      return oauthError(c, "Failed to fetch user info", 502);
    }

    const userInfo = (await userInfoResponse.json()) as GoogleUserInfo;
    if (!userInfo.email || !userInfo.id) return oauthError(c, "Invalid user info from provider", 502);

    return await completeOAuthCallback(c, {
      provider: "google",
      providerId: userInfo.id,
      email: userInfo.email,
      displayName: userInfo.name || userInfo.email,
      avatarUrl: userInfo.picture || null,
      providerTokens: { ...tokens } as Record<string, unknown>,
    }, config.WEB_URL);
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : "Unknown" }, "Google OAuth callback failed");
    return oauthError(c, "OAuth authentication failed", 500);
  }
});

// ─── GitHub OAuth ─────────────────────────────────────────────

app.get("/github", async (c) => {
  const config = getConfig();
  if (!config.GITHUB_CLIENT_ID || !config.GITHUB_CLIENT_SECRET) {
    return c.json({ ok: false, error: { code: "OAUTH_NOT_CONFIGURED" as const, message: "GitHub OAuth is not configured" }, requestId: c.get("requestId") }, 503);
  }

  const state = generateRandomString(32);
  c.header("Set-Cookie", `oauth_state=${state}; ${cookieFlags()}; Max-Age=600`);

  const redirectUrl = `https://github.com/login/oauth/authorize?${new URLSearchParams({
    client_id: config.GITHUB_CLIENT_ID,
    redirect_uri: `${config.API_URL}/api/v1/human-auth/oauth/github/callback`,
    scope: "read:user user:email",
    state,
  })}`;

  return c.redirect(redirectUrl);
});

app.get("/github/callback", async (c) => {
  const config = getConfig();
  if (!config.GITHUB_CLIENT_ID || !config.GITHUB_CLIENT_SECRET) {
    return c.json({ ok: false, error: { code: "OAUTH_NOT_CONFIGURED" as const, message: "GitHub OAuth is not configured" }, requestId: c.get("requestId") }, 503);
  }

  const validated = validateCallbackState(c);
  if (!validated) return oauthError(c, "Invalid callback parameters", 400);

  // Clear OAuth cookies
  c.header("Set-Cookie", `oauth_state=; ${cookieFlags()}; Max-Age=0`);

  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        code: validated.code,
        client_id: config.GITHUB_CLIENT_ID,
        client_secret: config.GITHUB_CLIENT_SECRET,
        redirect_uri: `${config.API_URL}/api/v1/human-auth/oauth/github/callback`,
      }),
    });

    const tokens = (await tokenResponse.json()) as OAuthTokenResponse;
    if (!validateTokenResponse(tokens)) {
      logger.warn({ error: tokens.error, description: tokens.error_description }, "GitHub token exchange failed");
      return oauthError(c, "Token exchange failed", 400);
    }

    const userInfoResponse = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${tokens.access_token}`, "User-Agent": "BetterWorld-API" },
    });
    if (!userInfoResponse.ok) {
      logger.warn({ status: userInfoResponse.status }, "GitHub user info fetch failed");
      return oauthError(c, "Failed to fetch user info", 502);
    }

    const userInfo = (await userInfoResponse.json()) as GitHubUserInfo;
    const primaryEmail = await resolveGitHubEmail(userInfo, tokens.access_token!);
    if (!primaryEmail || !userInfo.id) return oauthError(c, "Could not determine email from provider", 502);

    return await completeOAuthCallback(c, {
      provider: "github",
      providerId: userInfo.id.toString(),
      email: primaryEmail,
      displayName: userInfo.name || userInfo.login || primaryEmail,
      avatarUrl: userInfo.avatar_url || null,
      providerTokens: { ...tokens } as Record<string, unknown>,
    }, config.WEB_URL);
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : "Unknown" }, "GitHub OAuth callback failed");
    return oauthError(c, "OAuth authentication failed", 500);
  }
});

/** Resolve primary email from GitHub API (profile email may be null) */
async function resolveGitHubEmail(userInfo: GitHubUserInfo, accessToken: string): Promise<string | undefined> {
  const emailsResponse = await fetch("https://api.github.com/user/emails", {
    headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "BetterWorld-API" },
  });
  let primaryEmail = userInfo.email;
  if (emailsResponse.ok) {
    const emails = await emailsResponse.json();
    if (Array.isArray(emails)) {
      primaryEmail = emails.find((e: { primary?: boolean; email?: string }) => e.primary)?.email || primaryEmail;
    }
  }
  return primaryEmail || undefined;
}

// ─── Exchange Code → Tokens ─────────────────────────────────

app.post("/exchange", async (c) => {
  const body = await c.req.json().catch(() => null);
  const exchangeCode = body?.code;

  if (!exchangeCode || typeof exchangeCode !== "string") {
    return c.json({ ok: false, error: { code: "INVALID_CODE" as const, message: "Missing exchange code" }, requestId: c.get("requestId") }, 400);
  }

  try {
    const { getRedis } = await import("../../lib/container.js");
    const redis = getRedis();
    if (!redis) {
      return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE" as const, message: "Service unavailable" }, requestId: c.get("requestId") }, 503);
    }

    const key = `oauth:exchange:${exchangeCode}`;
    const data = await redis.get(key);
    if (!data) {
      return c.json({ ok: false, error: { code: "INVALID_CODE" as const, message: "Invalid or expired exchange code" }, requestId: c.get("requestId") }, 400);
    }

    // Delete immediately (single-use)
    await redis.del(key);

    const { userId, email } = JSON.parse(data);
    const { accessToken, refreshToken, expiresIn } = await generateTokenPair(userId, email);

    // Store session for token revocation support
    const { getDb } = await import("../../lib/container.js");
    const db = getDb();
    if (db) {
      const { sessions } = await import("@betterworld/db");
      await db.insert(sessions).values({
        userId,
        sessionToken: accessToken,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        refreshToken,
        refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
    }

    return c.json({
      ok: true,
      data: {
        accessToken,
        refreshToken,
        expiresIn,
      },
      requestId: c.get("requestId"),
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : "Unknown" }, "OAuth exchange failed");
    return c.json({ ok: false, error: { code: "INTERNAL_ERROR" as const, message: "Exchange failed" }, requestId: c.get("requestId") }, 500);
  }
});

// ─── Shared Helpers ─────────────────────────────────────────

interface OAuthUserParams {
  provider: string;
  providerId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  providerTokens: Record<string, unknown>;
}

/**
 * Find existing user by OAuth provider ID or email, or create a new one.
 * Handles the email conflict / account linking scenario.
 */
async function findOrCreateOAuthUser(params: OAuthUserParams) {
  const { getDb } = await import("../../lib/container.js");
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const { eq, and } = await import("drizzle-orm");
  const { humans, accounts } = await import("@betterworld/db");

  return await db.transaction(async (tx) => {
    // 1. Check if user already linked via this OAuth provider
    const [existingOAuth] = await tx
      .select({ id: humans.id, email: humans.email })
      .from(humans)
      .where(and(eq(humans.oauthProvider, params.provider), eq(humans.oauthProviderId, params.providerId)))
      .limit(1);

    if (existingOAuth) {
      return existingOAuth;
    }

    // 2. Check if a user with this email already exists (account linking)
    const [existingByEmail] = await tx
      .select({ id: humans.id, email: humans.email, avatarUrl: humans.avatarUrl, emailVerifiedAt: humans.emailVerifiedAt })
      .from(humans)
      .where(eq(humans.email, params.email))
      .limit(1);

    if (existingByEmail) {
      // Link the OAuth provider to the existing account
      await tx
        .update(humans)
        .set({
          oauthProvider: params.provider,
          oauthProviderId: params.providerId,
          avatarUrl: existingByEmail.avatarUrl || params.avatarUrl,
          emailVerified: true,
          emailVerifiedAt: existingByEmail.emailVerifiedAt || new Date(),
        })
        .where(eq(humans.id, existingByEmail.id));

      await tx.insert(accounts).values({
        userId: existingByEmail.id,
        provider: params.provider,
        providerAccountId: params.providerId,
        accessToken: params.providerTokens.access_token as string,
        refreshToken: (params.providerTokens.refresh_token as string) || null,
        tokenType: (params.providerTokens.token_type as string) || null,
        scope: (params.providerTokens.scope as string) || null,
      });

      return existingByEmail;
    }

    // 3. Create new user
    const [newUser] = await tx
      .insert(humans)
      .values({
        email: params.email,
        displayName: params.displayName,
        oauthProvider: params.provider,
        oauthProviderId: params.providerId,
        avatarUrl: params.avatarUrl,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        role: "human",
      })
      .returning();

    if (!newUser) throw new Error("Failed to create user");

    await tx.insert(accounts).values({
      userId: newUser.id,
      provider: params.provider,
      providerAccountId: params.providerId,
      accessToken: (params.providerTokens.access_token as string) || "",
      refreshToken: (params.providerTokens.refresh_token as string) || null,
      tokenType: (params.providerTokens.token_type as string) || null,
      scope: (params.providerTokens.scope as string) || null,
    });

    return newUser;
  });
}

/**
 * Store a short-lived exchange code in Redis (60s TTL, single-use).
 * Frontend exchanges this code for actual JWT tokens via POST /oauth/exchange.
 */
async function storeExchangeCode(user: { id: string; email: string }): Promise<string> {
  const { getRedis } = await import("../../lib/container.js");
  const redis = getRedis();
  if (!redis) throw new Error("Redis not available");

  const exchangeCode = generateRandomString(64);
  await redis.setex(
    `oauth:exchange:${exchangeCode}`,
    60, // 60 seconds TTL
    JSON.stringify({ userId: user.id, email: user.email }),
  );
  return exchangeCode;
}

/** Parse a specific cookie value from a Cookie header string */
function parseCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function generateCodeVerifier(): string {
  return generateRandomString(128);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(hash);
}

function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const charsLen = chars.length; // 66
  const maxValid = 256 - (256 % charsLen); // Reject values >= this to avoid bias
  let result = "";
  while (result.length < length) {
    const randomValues = new Uint8Array(length - result.length);
    crypto.getRandomValues(randomValues);
    for (let i = 0; i < randomValues.length && result.length < length; i++) {
      if (randomValues[i]! < maxValid) {
        result += chars[randomValues[i]! % charsLen];
      }
    }
  }
  return result;
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export default app;
