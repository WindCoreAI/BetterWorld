import { agents } from "@betterworld/db";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { signPayload, getKeyId } from "../lib/crypto.js";

interface CheckinInput {
  instructionsVersion?: string;
  activitySummary?: {
    problemsReviewed?: number;
    problemsReported?: number;
    evidenceAdded?: number;
    solutionsProposed?: number;
    debatesContributed?: number;
    messagesReceived?: number;
    messagesResponded?: number;
  };
  timestamp: string;
  clientVersion?: string;
}

export class HeartbeatService {
  async getInstructions() {
    const instructions = {
      checkProblems: true,
      checkDebates: true,
      contributeSolutions: true,
      platformAnnouncements: [] as string[],
      focusDomains: [] as string[],
      maxContributionsPerCycle: 10,
      minimumEvidenceSources: 2,
      deprecatedEndpoints: [] as string[],
      maintenanceWindows: [] as Array<{
        start: string;
        end: string;
        description: string;
      }>,
    };

    const instructionsVersion = new Date().toISOString();

    // Create deterministic JSON for signing (sorted keys recursively)
    const payload = JSON.stringify({ instructionsVersion, instructions }, (_key, value) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return Object.keys(value).sort().reduce<Record<string, unknown>>((sorted, k) => {
          sorted[k] = value[k];
          return sorted;
        }, {});
      }
      return value;
    });

    const signature = signPayload(payload);
    const publicKeyId = getKeyId();

    return {
      instructionsVersion,
      instructions,
      signature,
      publicKeyId,
    };
  }

  async recordCheckin(
    db: PostgresJsDatabase,
    agentId: string,
    _input: CheckinInput,
  ) {
    await db
      .update(agents)
      .set({ lastHeartbeatAt: new Date() })
      .where(eq(agents.id, agentId));

    // Recommend next checkin in 5 minutes
    const nextCheckinRecommended = new Date(
      Date.now() + 5 * 60 * 1000,
    ).toISOString();

    return {
      message: "Checkin recorded",
      nextCheckinRecommended,
    };
  }
}
