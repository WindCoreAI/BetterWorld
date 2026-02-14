/** Typed API client for human endpoints (Sprint 6) */

import {
  API_BASE,
  clearHumanTokens,
  getHumanAuthHeaders,
  getHumanRefreshToken,
  setHumanTokens,
} from "./api";
import type {
  ApiResponse,
  AuthTokens,
  DashboardData,
  HumanProfile,
  HumanUser,
  ProfileInput,
  TokenBalance,
  TokenTransaction,
} from "../types/human";

async function humanFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...options,
    headers: {
      ...getHumanAuthHeaders(),
      ...(options.headers ?? {}),
    },
  });

  const json = await res.json();

  // Auto-refresh on 401 if we have a refresh token
  if (res.status === 401 && getHumanRefreshToken()) {
    const refreshed = await humanAuthApi.refresh();
    if (refreshed) {
      // FR-013: Only retry idempotent requests (GET/HEAD) after token refresh.
      // POST/PUT/PATCH/DELETE are NOT retried to prevent duplicate operations.
      const method = (options.method ?? "GET").toUpperCase();
      if (method === "GET" || method === "HEAD") {
        const retryRes = await fetch(`${API_BASE}/api/v1${path}`, {
          ...options,
          headers: {
            ...getHumanAuthHeaders(),
            ...(options.headers ?? {}),
          },
        });
        return retryRes.json();
      }
      // Non-idempotent request: return error indicating user must retry manually
      return {
        ok: false,
        error: {
          code: "TOKEN_REFRESHED",
          message: "Your session was refreshed. Please try your action again.",
        },
      } as ApiResponse<T>;
    }
    // Refresh failed — clear tokens
    clearHumanTokens();
  }

  return json;
}

// ── Auth API ──

export const humanAuthApi = {
  async register(
    email: string,
    password: string,
    displayName: string,
  ): Promise<ApiResponse<{ userId: string; message: string }>> {
    const res = await fetch(`${API_BASE}/api/v1/human-auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName }),
    });
    return res.json();
  },

  async verifyEmail(
    email: string,
    code: string,
  ): Promise<ApiResponse<AuthTokens & { user: HumanUser }>> {
    const res = await fetch(`${API_BASE}/api/v1/human-auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    return res.json();
  },

  async resendCode(email: string): Promise<ApiResponse<{ message: string }>> {
    const res = await fetch(`${API_BASE}/api/v1/human-auth/resend-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return res.json();
  },

  async login(
    email: string,
    password: string,
  ): Promise<ApiResponse<AuthTokens & { user: HumanUser }>> {
    const res = await fetch(`${API_BASE}/api/v1/human-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return res.json();
  },

  async exchangeOAuthCode(
    code: string,
  ): Promise<ApiResponse<AuthTokens>> {
    const res = await fetch(`${API_BASE}/api/v1/human-auth/oauth/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    return res.json();
  },

  async refresh(): Promise<boolean> {
    const refreshToken = getHumanRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_BASE}/api/v1/human-auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      const json: ApiResponse<AuthTokens> = await res.json();
      if (json.ok && json.data) {
        setHumanTokens(json.data.accessToken, json.data.refreshToken);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  async logout(): Promise<void> {
    try {
      await humanFetch("/human-auth/logout", { method: "POST" });
    } catch {
      // Best-effort logout
    }
    clearHumanTokens();
  },
};

// ── Profile API ──

export const profileApi = {
  async create(data: ProfileInput): Promise<ApiResponse<HumanProfile>> {
    return humanFetch("/profile", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async get(): Promise<ApiResponse<HumanProfile>> {
    return humanFetch("/profile");
  },

  async update(data: Partial<ProfileInput>): Promise<ApiResponse<HumanProfile>> {
    return humanFetch("/profile", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
};

// ── Tokens API ──

export const tokensApi = {
  async claimOrientationReward(): Promise<
    ApiResponse<{ transaction: TokenTransaction; newBalance: number }>
  > {
    return humanFetch("/tokens/orientation-reward", { method: "POST" });
  },

  async getBalance(): Promise<ApiResponse<TokenBalance>> {
    return humanFetch("/tokens/balance");
  },

  async getTransactions(
    cursor?: string,
    limit = 20,
  ): Promise<ApiResponse<{ transactions: TokenTransaction[]; nextCursor: string | null }>> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return humanFetch(`/tokens/transactions?${params}`);
  },
};

// ── Dashboard API ──

export const dashboardApi = {
  async get(): Promise<ApiResponse<DashboardData>> {
    return humanFetch("/dashboard");
  },
};
