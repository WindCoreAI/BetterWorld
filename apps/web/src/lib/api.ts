export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Token for admin requests.
 *
 * An operator signs in like everyone else — what makes them an admin is their
 * account (see ADMIN_EMAILS on the API), so their normal access token is the
 * admin token. A separately stored service token, if one was pasted on the
 * legacy login page, takes precedence.
 */
export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("bw_admin_token") ?? localStorage.getItem("bw_human_access_token");
}

export function getAgentToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("bw_agent_token");
}

export function getAuthHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export function setAgentToken(token: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("bw_agent_token", token);
    window.dispatchEvent(new Event("bw-auth-change"));
  }
}

export function setAdminToken(token: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("bw_admin_token", token);
    window.dispatchEvent(new Event("bw-auth-change"));
  }
}

export function clearTokens(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("bw_agent_token");
    localStorage.removeItem("bw_admin_token");
    window.dispatchEvent(new Event("bw-auth-change"));
  }
}

export interface AgentProfile {
  id: string;
  username: string;
  displayName: string | null;
  framework: string;
  modelProvider: string | null;
  modelName: string | null;
  soulSummary: string | null;
  specializations: string[];
  reputationScore: string;
  totalProblemsReported: number;
  totalSolutionsProposed: number;
  lastHeartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  email: string | null;
  claimStatus: string;
  apiKeyPrefix: string | null;
}

export async function validateAgentToken(token: string): Promise<AgentProfile | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/agents/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

export async function validateAdminToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/admin/flagged?limit=1`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return res.ok;
  } catch {
    return false;
  }
}

// ── Human Auth Token Helpers ──

const HUMAN_ACCESS_KEY = "bw_human_access_token";
const HUMAN_REFRESH_KEY = "bw_human_refresh_token";

export function getHumanToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(HUMAN_ACCESS_KEY);
}

export function getHumanRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(HUMAN_REFRESH_KEY);
}

export function setHumanTokens(accessToken: string, refreshToken: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(HUMAN_ACCESS_KEY, accessToken);
    localStorage.setItem(HUMAN_REFRESH_KEY, refreshToken);
    window.dispatchEvent(new Event("bw-human-auth-change"));
  }
}

export function clearHumanTokens(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(HUMAN_ACCESS_KEY);
    localStorage.removeItem(HUMAN_REFRESH_KEY);
    window.dispatchEvent(new Event("bw-human-auth-change"));
  }
}

export function getHumanAuthHeaders(): Record<string, string> {
  const token = getHumanToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

/**
 * Authorization header only — for requests whose body is not JSON.
 * A multipart upload must let the browser set Content-Type itself (it carries
 * the boundary); sending "application/json" makes the server unable to parse it.
 */
export function getHumanBearerHeaders(): Record<string, string> {
  const token = getHumanToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
