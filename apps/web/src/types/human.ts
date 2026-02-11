/** Human onboarding types (Sprint 6) */

export interface HumanUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  emailVerified: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  ok: true;
  data: AuthTokens & { user?: HumanUser };
  requestId: string;
}

export interface HumanProfile {
  humanId: string;
  skills: string[];
  city: string;
  country: string;
  location: { lat: number; lng: number } | null;
  serviceRadius: number;
  languages: string[];
  availability: Record<string, unknown> | null;
  bio: string | null;
  walletAddress: string | null;
  certifications: string[];
  profileCompletenessScore: number;
  completeness: ProfileCompleteness;
  orientationCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileCompleteness {
  score: number;
  breakdown: Record<string, { complete: boolean; points: number }>;
  suggestions: string[];
}

export interface ProfileInput {
  skills: string[];
  city: string;
  country: string;
  serviceRadius?: number;
  languages: string[];
  availability?: {
    weekdays?: string[];
    weekends?: string[];
    timezone?: string;
  };
  bio?: string;
  walletAddress?: string;
  certifications?: string[];
}

export interface TokenBalance {
  balance: number;
  totalEarned: number;
  totalSpent: number;
}

export interface TokenTransaction {
  id: string;
  humanId: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  transactionType: string;
  referenceId: string | null;
  referenceType: string | null;
  description: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface DashboardData {
  user: HumanUser;
  tokens: TokenBalance;
  reputation: {
    score: number;
    rank: number | null;
    percentile: number | null;
  };
  profile: {
    completenessScore: number;
    suggestions: string[];
    orientationCompleted: boolean;
  };
  missions: {
    active: number;
    completed: number;
    streakDays: number;
  };
  recentActivity: Array<{
    id: string;
    type: string;
    description: string;
    amount: number | null;
    timestamp: string;
  }>;
  evidenceStatus?: {
    pending: number;
    verified: number;
    rejected: number;
  };
  peerReviews?: {
    completed: number;
    pendingCount: number;
  };
}

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
  requestId: string;
}
