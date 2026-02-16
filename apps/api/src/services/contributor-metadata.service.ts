/**
 * Contributor Metadata Service (Sprint 17: Community Identity & Visible Growth)
 *
 * Batch-fetches contributor identity for content cards. No N+1 queries.
 * Supports both human and agent contributors.
 */
import {
  humans,
  humanProfiles,
  agents,
  reputationScores,
  validatorPool,
} from "@betterworld/db";
import { eq, sql, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

interface ContributorMetadata {
  id: string;
  displayName: string;
  type: "human" | "agent";
  tier: string;
  specializations: string[];
  streakDays: number;
  isSpecialist: boolean;
}

export class ContributorMetadataService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Batch fetch contributor metadata for a list of IDs.
   * Determines human vs agent from provided mapping.
   */
  async batchFetch(
    contributorIds: Array<{ id: string; type: "human" | "agent" }>,
  ): Promise<Map<string, ContributorMetadata>> {
    const result = new Map<string, ContributorMetadata>();

    if (contributorIds.length === 0) return result;

    const humanIds = contributorIds.filter((c) => c.type === "human").map((c) => c.id);
    const agentIds = contributorIds.filter((c) => c.type === "agent").map((c) => c.id);

    // Batch fetch humans
    if (humanIds.length > 0) {
      const humanRows = await this.db
        .select({
          id: humans.id,
          displayName: humans.displayName,
          tier: reputationScores.currentTier,
          skills: humanProfiles.skills,
          streakDays: humanProfiles.streakDays,
        })
        .from(humans)
        .leftJoin(humanProfiles, eq(humans.id, humanProfiles.humanId))
        .leftJoin(reputationScores, eq(humans.id, reputationScores.humanId))
        .where(inArray(humans.id, humanIds));

      for (const row of humanRows) {
        result.set(row.id, {
          id: row.id,
          displayName: row.displayName,
          type: "human",
          tier: row.tier ?? "newcomer",
          specializations: (row.skills ?? []).slice(0, 3),
          streakDays: row.streakDays ?? 0,
          isSpecialist: false,
        });
      }
    }

    // Batch fetch agents
    if (agentIds.length > 0) {
      const agentRows = await this.db
        .select({
          id: agents.id,
          displayName: sql<string>`COALESCE(${agents.displayName}, ${agents.username})`,
          specializations: agents.specializations,
        })
        .from(agents)
        .where(inArray(agents.id, agentIds));

      // Fetch validator pool data for agents
      const validatorRows = await this.db
        .select({
          agentId: validatorPool.agentId,
          tier: validatorPool.tier,
          capabilities: validatorPool.capabilities,
        })
        .from(validatorPool)
        .where(inArray(validatorPool.agentId, agentIds));

      const validatorMap = new Map(validatorRows.map((v) => [v.agentId, v]));

      for (const row of agentRows) {
        const validator = validatorMap.get(row.id);
        const caps = validator?.capabilities as string[] | null;

        result.set(row.id, {
          id: row.id,
          displayName: row.displayName,
          type: "agent",
          tier: validator?.tier ?? "apprentice",
          specializations: (caps ?? row.specializations ?? []).slice(0, 3),
          streakDays: 0,
          isSpecialist: (caps?.length ?? 0) > 0,
        });
      }
    }

    return result;
  }

  /**
   * Enrich a list of content items with contributor metadata.
   * Returns a map of contributor ID to metadata.
   */
  async enrichForDomain(
    contributorIds: Array<{ id: string; type: "human" | "agent" }>,
    domain?: string,
  ): Promise<Map<string, ContributorMetadata>> {
    const metadataMap = await this.batchFetch(contributorIds);

    // If domain is specified, mark specialists
    if (domain) {
      for (const [, meta] of metadataMap) {
        if (meta.type === "agent" && meta.specializations.includes(domain)) {
          meta.isSpecialist = true;
        }
      }
    }

    return metadataMap;
  }
}
