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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  async get(): Promise<ApiResponse<HumanProfile>> {
    return humanFetch("/profile");
  },

  async update(data: Partial<ProfileInput>): Promise<ApiResponse<HumanProfile>> {
    return humanFetch("/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
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

// ── Sprint 16: Social Fabric API ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export const followsApi = {
  async follow(humanId: string): Promise<ApiResponse<Any>> {
    return humanFetch(`/follows/${humanId}`, { method: "POST" });
  },
  async unfollow(humanId: string): Promise<ApiResponse<Any>> {
    return humanFetch(`/follows/${humanId}`, { method: "DELETE" });
  },
  async getFollowing(cursor?: string, limit = 20): Promise<ApiResponse<Any>> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return humanFetch(`/follows/following?${params}`);
  },
  async getFollowers(cursor?: string, limit = 20): Promise<ApiResponse<Any>> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return humanFetch(`/follows/followers?${params}`);
  },
  async getStatus(humanId: string): Promise<ApiResponse<Any>> {
    return humanFetch(`/follows/status/${humanId}`);
  },
  async getCounts(humanId: string): Promise<ApiResponse<Any>> {
    return humanFetch(`/follows/counts/${humanId}`);
  },
};

export const connectionsApi = {
  async sendRequest(humanId: string): Promise<ApiResponse<Any>> {
    return humanFetch(`/connections/${humanId}`, { method: "POST" });
  },
  async accept(connectionId: string): Promise<ApiResponse<Any>> {
    return humanFetch(`/connections/${connectionId}/accept`, { method: "POST" });
  },
  async decline(connectionId: string): Promise<ApiResponse<Any>> {
    return humanFetch(`/connections/${connectionId}/decline`, { method: "POST" });
  },
  async remove(connectionId: string): Promise<ApiResponse<Any>> {
    return humanFetch(`/connections/${connectionId}`, { method: "DELETE" });
  },
  async list(cursor?: string, limit = 20, domain?: string): Promise<ApiResponse<Any>> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    if (domain) params.set("domain", domain);
    return humanFetch(`/connections?${params}`);
  },
  async listPending(cursor?: string, limit = 20): Promise<ApiResponse<Any>> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return humanFetch(`/connections/pending?${params}`);
  },
  async getSuggestions(): Promise<ApiResponse<Any>> {
    return humanFetch("/connections/suggestions");
  },
  async getStatus(humanId: string): Promise<ApiResponse<Any>> {
    return humanFetch(`/connections/status/${humanId}`);
  },
};

export const discussionsApi = {
  async createThread(data: { scopeType: string; scopeValue: string; title: string; content: string }): Promise<ApiResponse<Any>> {
    return humanFetch("/discussions/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },
  async listThreads(scopeType: string, scopeValue: string, cursor?: string, limit = 20, sort = "activity"): Promise<ApiResponse<Any>> {
    const params = new URLSearchParams({ scopeType, scopeValue, limit: String(limit), sort });
    if (cursor) params.set("cursor", cursor);
    return humanFetch(`/discussions/threads?${params}`);
  },
  async getThread(threadId: string): Promise<ApiResponse<Any>> {
    return humanFetch(`/discussions/threads/${threadId}`);
  },
  async createReply(threadId: string, content: string): Promise<ApiResponse<Any>> {
    return humanFetch(`/discussions/threads/${threadId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  },
  async listReplies(threadId: string, cursor?: string, limit = 50): Promise<ApiResponse<Any>> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return humanFetch(`/discussions/threads/${threadId}/replies?${params}`);
  },
};

export const notificationsApi = {
  async list(cursor?: string, limit = 20, unreadOnly = false, type?: string): Promise<ApiResponse<Any>> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    if (unreadOnly) params.set("unreadOnly", "true");
    if (type) params.set("type", type);
    return humanFetch(`/notifications?${params}`);
  },
  async getUnreadCount(): Promise<ApiResponse<Any>> {
    return humanFetch("/notifications/unread-count");
  },
  async markRead(notificationId: string): Promise<ApiResponse<Any>> {
    return humanFetch(`/notifications/${notificationId}/read`, { method: "PATCH" });
  },
  async markAllRead(): Promise<ApiResponse<Any>> {
    return humanFetch("/notifications/read-all", { method: "POST" });
  },
};

export const networkApi = {
  async getSummary(): Promise<ApiResponse<Any>> {
    return humanFetch("/network/me");
  },
  async getInteractionHistory(partnerId: string): Promise<ApiResponse<Any>> {
    return humanFetch(`/network/me/interactions?partnerId=${partnerId}`);
  },
};

export const careApi = {
  async sendCheer(data: { targetHumanId: string; notificationId?: string; includeGift?: boolean }): Promise<ApiResponse<Any>> {
    return humanFetch("/care/cheer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },
  async sendCelebrate(data: { targetHumanId: string; milestoneType: string; notificationId?: string; includeGift?: boolean }): Promise<ApiResponse<Any>> {
    return humanFetch("/care/celebrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },
};

export const impactApi = {
  async getChain(problemId: string): Promise<ApiResponse<Any>> {
    return humanFetch(`/impact/chain/${problemId}`);
  },
  async getMyRipple(): Promise<ApiResponse<Any>> {
    return humanFetch("/impact/my-ripple");
  },
};

// Sprint 18: Mentorship API
export const mentorshipsApi = {
  async getSuggestions(): Promise<ApiResponse<Any>> {
    return humanFetch("/mentorships/suggestions");
  },
  async create(mentorHumanId: string): Promise<ApiResponse<Any>> {
    return humanFetch("/mentorships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mentorHumanId }),
    });
  },
  async accept(id: string): Promise<ApiResponse<Any>> {
    return humanFetch(`/mentorships/${id}/accept`, { method: "POST" });
  },
  async decline(id: string): Promise<ApiResponse<Any>> {
    return humanFetch(`/mentorships/${id}/decline`, { method: "POST" });
  },
  async end(id: string): Promise<ApiResponse<Any>> {
    return humanFetch(`/mentorships/${id}/end`, { method: "POST" });
  },
  async rate(id: string, rating: number): Promise<ApiResponse<Any>> {
    return humanFetch(`/mentorships/${id}/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating }),
    });
  },
  async list(params?: { status?: string; role?: string; cursor?: string; limit?: number }): Promise<ApiResponse<Any>> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.role) searchParams.set("role", params.role);
    if (params?.cursor) searchParams.set("cursor", params.cursor);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const qs = searchParams.toString();
    return humanFetch(`/mentorships/me${qs ? `?${qs}` : ""}`);
  },
  async getDetail(id: string): Promise<ApiResponse<Any>> {
    return humanFetch(`/mentorships/${id}`);
  },
};
