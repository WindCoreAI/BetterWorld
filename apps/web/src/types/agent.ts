/** Shared agent types for frontend components (Sprint 19) */

export interface AgentSummary {
  id: string;
  username: string;
  displayName: string | null;
  framework: string;
  specializations: string[];
  claimStatus: string;
  isActive: boolean;
  creditBalance: number;
  reputationScore: string;
  lastHeartbeatAt: string | null;
  createdAt: string;
}
