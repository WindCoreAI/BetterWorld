/**
 * Cooperative Depth & Governance shared types (Sprint 18)
 */

export interface MentorSuggestion {
  humanId: string;
  displayName: string;
  tier: string;
  primaryDomain: string | null;
  city: string | null;
  activeMenteeCount: number;
  sharedDomain: boolean;
  sameCity: boolean;
  score: number;
}

export interface BuddyInvitation {
  claimId: string;
  buddyHumanId: string;
  buddyDisplayName: string;
  buddyStatus: "pending" | "accepted" | "declined" | "expired";
  missionTitle: string;
}

export interface HelpOffer {
  id: string;
  helperHumanId: string;
  helperDisplayName: string;
  helperTier: string;
  message: string;
  status: "pending" | "accepted" | "declined";
  isContributing: boolean;
  createdAt: string;
}

export interface ModeratorQueueItem {
  id: string;
  contentId: string;
  contentType: string;
  content: string;
  authorHumanId: string;
  authorDisplayName: string;
  domain: string;
  layerBScore: number;
  layerBDecision: string;
  flaggedAt: string;
}

export interface PathwayProgress {
  id: string;
  domain: string;
  currentLevel: "observer" | "practitioner" | "specialist_candidate" | "specialist";
  progressPercent: number;
  missionsCompleted: number;
  peerReviewsCompleted: number;
  caseStudiesRead: number;
  enrolledAt: string;
  levelReachedAt: string | null;
}

export interface CaseStudySummary {
  id: string;
  missionId: string;
  domain: string;
  title: string;
  summary: string;
  contributorCount: number;
  readCount: number;
  publishedAt: string;
}

export interface ChallengeLeaderboard {
  groupType: string;
  groupValue: string;
  rawScore: number;
  activeParticipants: number;
  perCapitaScore: number;
  rank: number;
}

export interface CircleDetail {
  id: string;
  name: string;
  description: string | null;
  domain: string | null;
  memberCount: number;
  myRole: "founder" | "moderator" | "member" | null;
  metrics: {
    missionsCompleted: number;
    activeSince: string;
  };
}

export interface CooperativeAchievement {
  id: string;
  achievementType: string;
  title: string;
  description: string | null;
  earners: Array<{
    humanId: string;
    displayName: string;
    tier: string;
  }>;
  earnedAt: string;
}

export interface FeedItem {
  id: string;
  eventType: string;
  actorHumanId: string | null;
  actorDisplayName: string | null;
  actorTier: string | null;
  targetId: string;
  targetType: string;
  title: string | null;
  summary: string | null;
  domain: string | null;
  city: string | null;
  score: number;
  createdAt: string;
}

export interface DiscoverPerson {
  humanId: string;
  displayName: string;
  tier: string;
  primaryDomain: string | null;
  city: string | null;
  score: number;
  reasons: Array<{
    type: string;
    label: string;
  }>;
  isConnected: boolean;
  isFollowing: boolean;
}

export interface PowerAuditSnapshot {
  reviewGini: number;
  decisionConcentration: number;
  adminOverrideRate: number;
  tierDistribution: Record<string, number>;
  domainCoverage: number;
  geographicBalance: number;
  computedAt: string;
}

export interface AgentFingerprintProfile {
  agentId: string;
  domainFocus: Record<string, number>;
  approachPattern: Record<string, number>;
  geographicFocus: Record<string, number>;
  scalePreference: Record<string, number>;
  computedAt: string;
}
