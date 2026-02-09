export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("bw_admin_token");
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
