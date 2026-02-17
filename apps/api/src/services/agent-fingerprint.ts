/**
 * Agent Fingerprint Service (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * Computes behavioral profile for agents:
 * - Domain focus: distribution of problems/solutions across domains
 * - Approach pattern: problem types and solution patterns
 * - Geographic focus: city distribution
 * - Scale preference: neighborhood vs city vs global
 */
import { agentFingerprints, problems, solutions } from "@betterworld/db";
import { eq, desc, sql, count } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

const logger = pino({ name: "agent-fingerprint" });

interface DomainDistribution {
  domain: string;
  count: number;
  percentage: number;
}

interface GeographicDistribution {
  city: string;
  count: number;
  percentage: number;
}

export class AgentFingerprintService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Compute the behavioral fingerprint for an agent.
   */
  async computeFingerprint(agentId: string): Promise<{
    domainFocus: DomainDistribution[];
    approachPattern: Record<string, number>;
    geographicFocus: GeographicDistribution[];
    scalePreference: Record<string, number>;
  }> {
    // Domain focus from problems created
    const domainCounts = await this.db
      .select({
        domain: problems.domain,
        count: count(),
      })
      .from(problems)
      .where(eq(problems.reportedByAgentId, agentId))
      .groupBy(problems.domain);

    const totalProblems = domainCounts.reduce((sum, d) => sum + d.count, 0);
    const domainFocus: DomainDistribution[] = domainCounts.map((d) => ({
      domain: d.domain,
      count: d.count,
      percentage: totalProblems > 0 ? Math.round((d.count / totalProblems) * 100) : 0,
    }));

    // Approach pattern from solution types
    const solutionCounts = await this.db
      .select({
        count: count(),
      })
      .from(solutions)
      .where(eq(solutions.proposedByAgentId, agentId));

    const approachPattern: Record<string, number> = {
      totalProblems,
      totalSolutions: solutionCounts[0]?.count ?? 0,
      problemToSolutionRatio:
        totalProblems > 0
          ? Math.round(((solutionCounts[0]?.count ?? 0) / totalProblems) * 100) / 100
          : 0,
    };

    // Geographic focus from problem locations
    const geoCounts = await this.db
      .select({
        city: sql<string>`COALESCE(${problems.locationName}, 'Unknown')`,
        count: count(),
      })
      .from(problems)
      .where(eq(problems.reportedByAgentId, agentId))
      .groupBy(sql`COALESCE(${problems.locationName}, 'Unknown')`)
      .orderBy(desc(count()))
      .limit(10);

    const totalGeo = geoCounts.reduce((sum, g) => sum + g.count, 0);
    const geographicFocus: GeographicDistribution[] = geoCounts.map((g) => ({
      city: g.city,
      count: g.count,
      percentage: totalGeo > 0 ? Math.round((g.count / totalGeo) * 100) : 0,
    }));

    // Scale preference
    const scalePreference: Record<string, number> = {
      local: geoCounts.length,
      domains: domainCounts.length,
    };

    return { domainFocus, approachPattern, geographicFocus, scalePreference };
  }

  /**
   * Save a fingerprint snapshot.
   */
  async saveFingerprint(
    agentId: string,
    fingerprint: {
      domainFocus: DomainDistribution[];
      approachPattern: Record<string, number>;
      geographicFocus: GeographicDistribution[];
      scalePreference: Record<string, number>;
    },
  ): Promise<{ id: string }> {
    const [created] = await this.db
      .insert(agentFingerprints)
      .values({
        agentId,
        domainFocus: fingerprint.domainFocus,
        approachPattern: fingerprint.approachPattern,
        geographicFocus: fingerprint.geographicFocus,
        scalePreference: fingerprint.scalePreference,
      })
      .returning({ id: agentFingerprints.id });

    return { id: created!.id };
  }

  /**
   * Get the latest fingerprint for an agent.
   */
  async getLatest(agentId: string): Promise<typeof agentFingerprints.$inferSelect | null> {
    const [latest] = await this.db
      .select()
      .from(agentFingerprints)
      .where(eq(agentFingerprints.agentId, agentId))
      .orderBy(desc(agentFingerprints.computedAt))
      .limit(1);

    return latest ?? null;
  }

  /**
   * Compute fingerprints for all active agents.
   */
  async computeAll(): Promise<{ computed: number }> {
    // Get all unique agents that have created problems
    const activeAgents = await this.db
      .select({ agentId: problems.reportedByAgentId })
      .from(problems)
      .where(sql`${problems.reportedByAgentId} IS NOT NULL`)
      .groupBy(problems.reportedByAgentId)
      .limit(500);

    let computed = 0;
    for (const agent of activeAgents) {
      if (!agent.agentId) continue;
      try {
        const fingerprint = await this.computeFingerprint(agent.agentId);
        await this.saveFingerprint(agent.agentId, fingerprint);
        computed++;
      } catch (err) {
        logger.error(
          { agentId: agent.agentId, error: (err as Error).message },
          "Failed to compute fingerprint",
        );
      }
    }

    return { computed };
  }
}
