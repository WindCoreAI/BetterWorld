export type MissionStatus =
  | "open"
  | "claimed"
  | "in_progress"
  | "submitted"
  | "verified"
  | "expired"
  | "archived";

export type DifficultyLevel = "beginner" | "intermediate" | "advanced" | "expert";

export type MissionClaimStatus =
  | "active"
  | "submitted"
  | "verified"
  | "abandoned"
  | "released";

export interface InstructionStep {
  step: number;
  text: string;
  optional: boolean;
}

export interface EvidenceRequirement {
  type: "photo" | "document" | "video";
  description: string;
  required: boolean;
}

export interface Mission {
  id: string;
  solutionId: string;
  createdByAgentId: string;
  title: string;
  description: string;
  instructions: InstructionStep[];
  evidenceRequired: EvidenceRequirement[];
  requiredSkills: string[];
  domain: string;
  requiredLocationName: string | null;
  requiredLatitude: string | null;
  requiredLongitude: string | null;
  locationRadiusKm: number;
  estimatedDurationMinutes: number;
  difficulty: DifficultyLevel;
  missionType: string | null;
  tokenReward: number;
  bonusForQuality: number;
  maxClaims: number;
  currentClaimCount: number;
  guardrailStatus: string;
  guardrailEvaluationId: string | null;
  status: MissionStatus;
  expiresAt: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MissionClaim {
  id: string;
  missionId: string;
  humanId: string;
  status: MissionClaimStatus;
  claimedAt: Date;
  deadlineAt: Date;
  progressPercent: number;
  completedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MissionListItem {
  id: string;
  title: string;
  description: string;
  domain: string;
  requiredSkills: string[];
  requiredLocationName: string | null;
  approximateLatitude: number | null;
  approximateLongitude: number | null;
  estimatedDurationMinutes: number;
  difficulty: DifficultyLevel;
  tokenReward: number;
  bonusForQuality: number;
  maxClaims: number;
  currentClaimCount: number;
  slotsAvailable: number;
  status: MissionStatus;
  expiresAt: string;
  createdAt: string;
  distance?: number;
}

export interface MissionDetail
  extends Omit<Mission, "requiredLatitude" | "requiredLongitude"> {
  location: {
    latitude: number | null;
    longitude: number | null;
    radiusKm: number;
    isExact: boolean;
  };
  createdByAgent: {
    id: string;
    name: string;
  };
  solution: {
    id: string;
    title: string;
  };
  slotsAvailable: number;
  myClaim: {
    id: string;
    status: MissionClaimStatus;
    claimedAt: string;
    deadlineAt: string;
    progressPercent: number;
  } | null;
}

export interface DecomposedMission {
  title: string;
  description: string;
  instructions: InstructionStep[];
  evidenceRequired: EvidenceRequirement[];
  requiredSkills: string[];
  estimatedDurationMinutes: number;
  difficulty: DifficultyLevel;
  suggestedTokenReward: number;
  suggestedLocationName?: string;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  threadId: string | null;
  content: string;
  isRead: boolean;
  createdAt: Date;
}

export interface MessageThread {
  threadId: string;
  messages: Message[];
  participants: { id: string; name: string }[];
}
