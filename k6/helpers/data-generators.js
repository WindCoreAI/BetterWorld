/**
 * k6 Phase 2 Load Test - Data Generators
 *
 * Helper functions for generating randomized test data
 * used across Phase 2 load test scenarios.
 */

const SDG_DOMAINS = [
  "environmental_protection",
  "clean_energy",
  "water_sanitation",
  "sustainable_agriculture",
  "poverty_reduction",
  "healthcare_access",
  "education_quality",
  "gender_equality",
  "economic_development",
  "infrastructure",
  "inequality_reduction",
  "sustainable_cities",
  "responsible_consumption",
  "climate_action",
  "peace_justice",
];

const LEADERBOARD_TYPES = ["reputation", "impact", "tokens", "missions"];

const PERIODS = ["alltime", "month", "week"];

const EVIDENCE_TYPES = ["photo", "document", "text_report"];

/**
 * Generate a random UUID v4 string.
 * k6 does not have crypto.randomUUID, so we build one manually.
 */
function randomUUID() {
  const hex = "0123456789abcdef";
  let uuid = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += "-";
    } else if (i === 14) {
      uuid += "4"; // version 4
    } else if (i === 19) {
      uuid += hex[(Math.random() * 4) | 8]; // variant bits
    } else {
      uuid += hex[(Math.random() * 16) | 0];
    }
  }
  return uuid;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Returns a random UUID representing a human user.
 * @returns {string}
 */
export function randomHumanId() {
  return randomUUID();
}

/**
 * Returns a random UUID representing a mission.
 * @returns {string}
 */
export function randomMissionId() {
  return randomUUID();
}

/**
 * Returns a random leaderboard type.
 * @returns {string} One of: reputation, impact, tokens, missions
 */
export function randomLeaderboardType() {
  return pickRandom(LEADERBOARD_TYPES);
}

/**
 * Returns a random SDG-aligned domain.
 * @returns {string} One of the 15 SDG domains
 */
export function randomDomain() {
  return pickRandom(SDG_DOMAINS);
}

/**
 * Returns a random time period for leaderboard/heatmap queries.
 * @returns {string} One of: alltime, month, week
 */
export function randomPeriod() {
  return pickRandom(PERIODS);
}

/**
 * Returns a placeholder Bearer token string for authenticated endpoints.
 * In a real load test, replace this with valid JWT tokens
 * generated during a setup phase or from environment variables.
 * @returns {string}
 */
export function generateAuthToken() {
  return `Bearer k6-load-test-token-${randomUUID()}`;
}

/**
 * Generates a mock evidence submission payload.
 * @returns {object} JSON-serializable evidence body
 */
export function generateEvidencePayload() {
  const type = pickRandom(EVIDENCE_TYPES);
  const now = new Date().toISOString();

  return {
    type: type,
    description: `Load test evidence submission for ${randomDomain()} impact verification. `
      + `This evidence demonstrates measurable progress toward sustainable development goals `
      + `with documented before-and-after outcomes observed on ${now}.`,
    mediaUrl: type === "text_report"
      ? undefined
      : `https://storage.example.com/evidence/${randomUUID()}.jpg`,
    location: {
      latitude: -90 + Math.random() * 180,
      longitude: -180 + Math.random() * 360,
    },
    metadata: {
      capturedAt: now,
      source: "k6-load-test",
      vuId: `vu-${__VU || 0}`,
    },
  };
}
