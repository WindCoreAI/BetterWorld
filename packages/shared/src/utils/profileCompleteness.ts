/**
 * Profile Completeness Calculation (Sprint 6)
 *
 * Weighted scoring algorithm:
 * - Core Matching (50%): skills (20%), location (20%), languages (10%)
 * - Availability (20%): availability hours
 * - Identity (15%): bio (10%), avatar (5%)
 * - Optional (15%): wallet (10%), certifications (5%)
 *
 * Based on research in specs/007-human-onboarding/research.md
 */

export interface ProfileInput {
  skills: string[];
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  languages: string[];
  availability: { weekdays?: string[]; weekends?: string[]; timezone?: string } | null;
  bio: string | null;
  avatarUrl: string | null;
  walletAddress: string | null;
  certifications: string[] | null;
}

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

function hasNonEmptyString(value: string | null): boolean {
  return value !== null && value.trim() !== "";
}

function hasNonEmptyArray(value: unknown[] | null): boolean {
  return value !== null && value.length > 0;
}

function hasCompleteLocation(profile: ProfileInput): boolean {
  return !!(
    profile.city &&
    profile.city.trim() !== "" &&
    profile.latitude !== null &&
    profile.longitude !== null &&
    !(profile.latitude === 0 && profile.longitude === 0)
  );
}

function hasValidAvailability(
  availability: ProfileInput["availability"],
): boolean {
  return !!(
    availability &&
    typeof availability === "object" &&
    Object.keys(availability).length > 0
  );
}

interface FieldDef {
  key: keyof ProfileCompletenessResult["breakdown"];
  points: number;
  check: (p: ProfileInput) => boolean;
  suggestion: string;
}

const FIELD_DEFS: FieldDef[] = [
  { key: "location", points: 20, check: hasCompleteLocation, suggestion: "Add your location for better mission matching" },
  { key: "skills", points: 20, check: (p) => hasNonEmptyArray(p.skills), suggestion: "Add skills to find relevant missions" },
  { key: "availability", points: 20, check: (p) => hasValidAvailability(p.availability), suggestion: "Set your availability hours" },
  { key: "languages", points: 10, check: (p) => hasNonEmptyArray(p.languages), suggestion: "Add languages you speak" },
  { key: "bio", points: 10, check: (p) => hasNonEmptyString(p.bio), suggestion: "Write a short bio about yourself" },
  { key: "wallet", points: 10, check: (p) => hasNonEmptyString(p.walletAddress), suggestion: "Add wallet address for future features" },
  { key: "avatar", points: 5, check: (p) => hasNonEmptyString(p.avatarUrl), suggestion: "Upload a profile picture" },
  { key: "certifications", points: 5, check: (p) => hasNonEmptyArray(p.certifications), suggestion: "Add certifications if applicable" },
];

export function calculateProfileCompleteness(
  profile: ProfileInput,
): ProfileCompletenessResult {
  let score = 0;
  const suggestions: string[] = [];
  const breakdown = {} as ProfileCompletenessResult["breakdown"];

  for (const def of FIELD_DEFS) {
    const complete = def.check(profile);
    const points = complete ? def.points : 0;
    score += points;
    breakdown[def.key] = { complete, points };
    if (!complete) suggestions.push(def.suggestion);
  }

  return {
    score: Math.floor(score),
    breakdown,
    suggestions: suggestions.slice(0, 3),
  };
}
