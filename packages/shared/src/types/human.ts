/**
 * Human Onboarding TypeScript Types (Sprint 6)
 */

// ============================================================
// Human & Profile Types
// ============================================================

export interface Human {
  id: string; // UUID
  email: string;
  passwordHash: string | null;
  displayName: string;
  role: "human" | "admin";
  reputationScore: string; // Decimal
  tokenBalance: string; // Decimal

  // Sprint 6: OAuth fields
  oauthProvider: "google" | "github" | null;
  oauthProviderId: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface HumanProfile {
  humanId: string; // UUID, FK to humans.id

  // Core matching fields (50% of profile completeness)
  skills: string[];
  city: string | null;
  country: string | null;
  location: { lat: number; lng: number } | null; // PostGIS POINT
  serviceRadius: number; // km
  languages: string[]; // ISO 639-1 codes

  // Availability (20% of profile completeness)
  availability: {
    weekdays?: string[];
    weekends?: string[];
    timezone?: string;
  } | null;

  // Identity (15% of profile completeness)
  bio: string | null;
  avatarUrl: string | null;

  // Optional (15% of profile completeness)
  walletAddress: string | null;
  certifications: string[] | null;

  // Metadata
  metadata: Record<string, unknown>; // JSONB
  profileCompletenessScore: number; // 0-100

  // Orientation tracking
  orientationCompletedAt: Date | null;

  // Reputation & mission stats
  totalMissionsCompleted: number;
  totalTokensEarned: number;
  streakDays: number;
  lastActiveAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// Token Transaction Types
// ============================================================

export type TransactionType =
  | "earn_orientation"
  | "earn_mission"
  | "earn_reward"
  | "earn_bonus"
  | "earn_referral"
  | "spend_vote"
  | "spend_circle"
  | "spend_analytics"
  | "spend_custom";

export interface TokenTransaction {
  id: string; // UUID
  humanId: string; // UUID

  // Double-entry accounting
  amount: number; // Positive for earn, negative for spend
  balanceBefore: number;
  balanceAfter: number;

  // Transaction metadata
  transactionType: TransactionType;
  referenceId: string | null; // UUID
  referenceType: "problem" | "solution" | "mission" | "circle" | null;
  description: string | null;

  // Idempotency
  idempotencyKey: string | null;

  // Audit trail
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// ============================================================
// Auth Types
// ============================================================

export interface Session {
  id: string; // UUID
  userId: string; // UUID
  sessionToken: string;
  expiresAt: Date;
  refreshToken: string | null;
  refreshTokenExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Account {
  id: string; // UUID
  userId: string; // UUID
  provider: "google" | "github";
  providerAccountId: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
  tokenType: string | null;
  scope: string | null;
  idToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VerificationToken {
  id: string; // UUID
  identifier: string; // Email
  token: string; // 6-digit code
  expiresAt: Date;
  verified: boolean;
  resendCount: number;
  createdAt: Date;
}

// ============================================================
// Profile Completeness Types
// ============================================================

export interface ProfileCompletenessResult {
  score: number; // 0-100
  breakdown: {
    skills: { complete: boolean; points: number };
    location: { complete: boolean; points: number };
    languages: { complete: boolean; points: number };
    availability: { complete: boolean; points: number };
    bio: { complete: boolean; points: number };
    avatar: { complete: boolean; points: number };
    wallet: { complete: boolean; points: number };
    certifications: { complete: boolean; points: number };
  };
  suggestions: string[];
}

// ============================================================
// Dashboard Types
// ============================================================

export interface DashboardData {
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
    emailVerified: boolean;
  };
  tokens: {
    balance: number;
    totalEarned: number;
    totalSpent: number;
  };
  reputation: {
    score: number;
    rank: string | null;
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
    type: "token_earned" | "token_spent" | "mission_completed";
    description: string;
    amount: number | null;
    timestamp: Date;
  }>;
}
