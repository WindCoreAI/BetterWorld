/* eslint-disable no-console */
/**
 * Honeypot Seed Script (Sprint 8: Evidence Verification)
 *
 * Creates 5 impossible missions for fraud detection.
 * Submissions to these missions are auto-rejected and fraud score incremented.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { missions, solutions } from "../schema/index.js";

interface HoneypotDef {
  title: string;
  description: string;
  domain: string;
  difficulty: string;
  estimatedDurationMinutes: number;
  tokenReward: number;
  requiredLatitude: string;
  requiredLongitude: string;
  requiredLocationName: string;
  maxClaims: number;
  evidenceRequired: Array<{ type: string; description: string; required: boolean }>;
  instructions: Array<{ step: number; text: string; optional: boolean }>;
  requiredSkills: string[];
}

const HONEYPOT_MISSIONS: HoneypotDef[] = [
  {
    title: "Marine Life Census at Coordinates 0, -160",
    description: "Document underwater marine biodiversity at this Pacific Ocean location.",
    domain: "environmental_protection",
    difficulty: "intermediate",
    estimatedDurationMinutes: 120,
    tokenReward: 50,
    requiredLatitude: "0.0000",
    requiredLongitude: "-160.0000",
    requiredLocationName: "Central Pacific Ocean",
    maxClaims: 5,
    evidenceRequired: [{ type: "photo", description: "GPS-tagged photo of marine species", required: true }],
    instructions: [
      { step: 1, text: "Travel to the specified GPS coordinates", optional: false },
      { step: 2, text: "Photograph 3 different marine species", optional: false },
    ],
    requiredSkills: ["marine_biology", "photography"],
  },
  {
    title: "Ice Core Sample Documentation in Antarctica",
    description: "Visit the South Pole research station and document ice core samples.",
    domain: "environmental_protection",
    difficulty: "expert",
    estimatedDurationMinutes: 240,
    tokenReward: 100,
    requiredLatitude: "-89.9999",
    requiredLongitude: "0.0000",
    requiredLocationName: "South Pole, Antarctica",
    maxClaims: 3,
    evidenceRequired: [{ type: "photo", description: "GPS-tagged photo of ice core drilling site", required: true }],
    instructions: [
      { step: 1, text: "Navigate to the South Pole coordinates", optional: false },
      { step: 2, text: "Document the ice core drilling process", optional: false },
    ],
    requiredSkills: ["geological_survey", "cold_climate_operations"],
  },
  {
    title: "Future Climate Summit Coverage 2099",
    description: "Attend the 2099 Global Climate Summit and document the proceedings.",
    domain: "climate_action",
    difficulty: "beginner",
    estimatedDurationMinutes: 60,
    tokenReward: 30,
    requiredLatitude: "40.7128",
    requiredLongitude: "-74.0060",
    requiredLocationName: "New York City, NY",
    maxClaims: 10,
    evidenceRequired: [{ type: "photo", description: "Photo of summit venue with visible date", required: true }],
    instructions: [
      { step: 1, text: "Attend the 2099 Climate Summit", optional: false },
      { step: 2, text: "Photograph keynote sessions", optional: false },
    ],
    requiredSkills: ["journalism"],
  },
  {
    title: "Survey at 123 Nonexistent Boulevard, Nowhere City",
    description: "Conduct a community needs assessment at the specified address.",
    domain: "poverty_reduction",
    difficulty: "intermediate",
    estimatedDurationMinutes: 180,
    tokenReward: 40,
    requiredLatitude: "51.5074",
    requiredLongitude: "-0.1278",
    requiredLocationName: "123 Nonexistent Boulevard, Nowhere City",
    maxClaims: 5,
    evidenceRequired: [
      { type: "photo", description: "Photo of street sign at specified address", required: true },
      { type: "document", description: "Survey form with 5+ responses", required: true },
    ],
    instructions: [
      { step: 1, text: "Navigate to 123 Nonexistent Boulevard", optional: false },
      { step: 2, text: "Conduct interviews with 5 residents", optional: false },
    ],
    requiredSkills: ["community_outreach", "survey_design"],
  },
  {
    title: "Count All Stars Visible from Downtown Manhattan",
    description: "Stand at Broadway and Wall Street between 10 PM and 2 AM. Count every star visible to naked eye.",
    domain: "education_access",
    difficulty: "expert",
    estimatedDurationMinutes: 240,
    tokenReward: 200,
    requiredLatitude: "40.7069",
    requiredLongitude: "-74.0089",
    requiredLocationName: "Broadway & Wall Street, Manhattan, NY",
    maxClaims: 3,
    evidenceRequired: [
      { type: "photo", description: "Photo of each individual star with GPS tag", required: true },
      { type: "text_report", description: "Exact count of all visible stars", required: true },
    ],
    instructions: [
      { step: 1, text: "Go to Broadway & Wall Street between 10 PM and 2 AM", optional: false },
      { step: 2, text: "Photograph each individual star visible to naked eye", optional: false },
      { step: 3, text: "Submit exact count", optional: false },
    ],
    requiredSkills: ["astronomy", "photography"],
  },
];

async function seedHoneypots() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const sql = postgres(databaseUrl);
  const db = drizzle(sql);

  console.log("Seeding 5 honeypot missions...");

  const SYSTEM_AGENT_ID = "00000000-0000-0000-0000-000000000000";

  // Find first available solution to use as parent for honeypot missions
  const [firstSolution] = await db.select({ id: solutions.id }).from(solutions).limit(1);
  if (!firstSolution) {
    console.error("No solutions found in DB. Run main seed first.");
    process.exit(1);
  }
  const solutionId = firstSolution.id;

  for (const honeypot of HONEYPOT_MISSIONS) {
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    await db.insert(missions).values({
      title: honeypot.title,
      description: honeypot.description,
      domain: honeypot.domain as "environmental_protection",
      difficulty: honeypot.difficulty as "beginner",
      estimatedDurationMinutes: honeypot.estimatedDurationMinutes,
      tokenReward: honeypot.tokenReward,
      requiredLatitude: honeypot.requiredLatitude,
      requiredLongitude: honeypot.requiredLongitude,
      requiredLocationName: honeypot.requiredLocationName,
      maxClaims: honeypot.maxClaims,
      evidenceRequired: honeypot.evidenceRequired,
      instructions: honeypot.instructions,
      requiredSkills: honeypot.requiredSkills,
      isHoneypot: true,
      expiresAt,
      solutionId,
      createdByAgentId: SYSTEM_AGENT_ID,
      status: "open",
    });
  }

  console.log("Honeypot seeding complete.");
  await sql.end();
}

seedHoneypots().catch((err) => {
  console.error("Honeypot seeding failed:", err);
  process.exit(1);
});
