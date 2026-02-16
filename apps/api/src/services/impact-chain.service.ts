/**
 * Impact Chain Service (Sprint 16: Social Fabric Foundation)
 *
 * Visualizes the full impact chain from problem -> solutions -> missions -> evidence,
 * and aggregates a participant's total downstream impact across all contributions.
 */
import {
  problems,
  solutions,
  missions,
  missionClaims,
  evidence,
  attestations,
  observations,
  humans,
  agents,
  peerReviews,
} from "@betterworld/db";
import { and, eq, sql, count, desc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export class ImpactChainService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Get the full impact chain for a problem.
   * Joins problems -> solutions -> missions -> mission_claims -> evidence -> attestations.
   */
  async getChain(problemId: string): Promise<{
    problem: {
      id: string;
      title: string;
      domain: string;
      city: string | null;
      reportedBy: { type: string; id: string; name: string };
      createdAt: string;
    };
    solutions: Array<{
      id: string;
      title: string;
      proposedBy: { type: string; id: string; name: string };
      missionCount: number;
    }>;
    missions: Array<{
      id: string;
      title: string;
      solutionId: string;
      status: string;
      claimedBy: { humanId: string; displayName: string } | null;
      completedAt: string | null;
    }>;
    evidence: Array<{
      id: string;
      missionId: string;
      status: string;
      verifiedAt: string | null;
      reviewerCount: number;
    }>;
    attestations: {
      count: number;
      urgencyBoostApplied: boolean;
    };
    summary: {
      totalParticipants: number;
      totalCities: number;
      totalMissionsCompleted: number;
      totalEvidenceVerified: number;
    };
  }> {
    // Get the problem
    const [problem] = await this.db
      .select({
        id: problems.id,
        title: problems.title,
        domain: problems.domain,
        city: problems.locationName,
        agentId: problems.reportedByAgentId,
        createdAt: problems.createdAt,
      })
      .from(problems)
      .where(eq(problems.id, problemId))
      .limit(1);

    if (!problem) {
      throw new Error("Problem not found");
    }

    // Get reporting agent info
    const [reportingAgent] = await this.db
      .select({ name: agents.displayName })
      .from(agents)
      .where(eq(agents.id, problem.agentId))
      .limit(1);

    // Get solutions linked to this problem
    const solutionRows = await this.db
      .select({
        id: solutions.id,
        title: solutions.title,
        agentId: solutions.proposedByAgentId,
      })
      .from(solutions)
      .where(eq(solutions.problemId, problemId));

    const solutionIds = solutionRows.map((s) => s.id);

    // Get agent info for each solution
    const solutionsWithAgent = await Promise.all(
      solutionRows.map(async (sol) => {
        const [agent] = await this.db
          .select({ name: agents.displayName })
          .from(agents)
          .where(eq(agents.id, sol.agentId))
          .limit(1);

        // Count missions for this solution
        const [missionCountResult] = await this.db
          .select({ count: count() })
          .from(missions)
          .where(eq(missions.solutionId, sol.id));

        return {
          id: sol.id,
          title: sol.title,
          proposedBy: { type: "agent" as const, id: sol.agentId, name: agent?.name ?? "Unknown" },
          missionCount: missionCountResult?.count ?? 0,
        };
      }),
    );

    // Get missions linked to these solutions
    let missionRows: Array<{
      id: string;
      title: string;
      solutionId: string;
      status: string;
    }> = [];

    if (solutionIds.length > 0) {
      missionRows = await this.db
        .select({
          id: missions.id,
          title: missions.title,
          solutionId: missions.solutionId,
          status: missions.status,
        })
        .from(missions)
        .where(sql`${missions.solutionId} IN ${solutionIds}`);
    }

    const missionIds = missionRows.map((m) => m.id);

    // Get claims for these missions (to find who claimed/completed)
    const missionsWithClaims = await Promise.all(
      missionRows.map(async (mission) => {
        const [claim] = await this.db
          .select({
            humanId: missionClaims.humanId,
            completedAt: missionClaims.completedAt,
          })
          .from(missionClaims)
          .where(
            and(
              eq(missionClaims.missionId, mission.id),
              eq(missionClaims.status, "verified"),
            ),
          )
          .limit(1);

        let claimedBy: { humanId: string; displayName: string } | null = null;
        if (claim) {
          const [human] = await this.db
            .select({ displayName: humans.displayName })
            .from(humans)
            .where(eq(humans.id, claim.humanId))
            .limit(1);

          claimedBy = {
            humanId: claim.humanId,
            displayName: human?.displayName ?? "Unknown",
          };
        }

        return {
          id: mission.id,
          title: mission.title,
          solutionId: mission.solutionId,
          status: mission.status,
          claimedBy,
          completedAt: claim?.completedAt?.toISOString() ?? null,
        };
      }),
    );

    // Get evidence linked to these missions
    let evidenceRows: Array<{
      id: string;
      missionId: string;
      status: string;
      verifiedAt: Date | null;
    }> = [];

    if (missionIds.length > 0) {
      evidenceRows = await this.db
        .select({
          id: evidence.id,
          missionId: evidence.missionId,
          status: evidence.verificationStage,
          verifiedAt: evidence.updatedAt,
        })
        .from(evidence)
        .where(sql`${evidence.missionId} IN ${missionIds}`);
    }

    // Get reviewer counts for each evidence
    const evidenceWithReviewers = await Promise.all(
      evidenceRows.map(async (ev) => {
        const [reviewCount] = await this.db
          .select({ count: count() })
          .from(peerReviews)
          .where(eq(peerReviews.evidenceId, ev.id));

        return {
          id: ev.id,
          missionId: ev.missionId,
          status: ev.status,
          verifiedAt: ev.verifiedAt?.toISOString() ?? null,
          reviewerCount: reviewCount?.count ?? 0,
        };
      }),
    );

    // Get attestations count for this problem
    const [attestationResult] = await this.db
      .select({ count: count() })
      .from(attestations)
      .where(eq(attestations.problemId, problemId));

    const attestationCount = attestationResult?.count ?? 0;

    // Compute summary
    const completedMissions = missionsWithClaims.filter((m) => m.status === "completed");
    const verifiedEvidence = evidenceWithReviewers.filter((e) => e.status === "approved");

    // Unique participants: problem reporter + solution agents + mission claimers + reviewers
    const participantSet = new Set<string>();
    participantSet.add(problem.agentId); // problem reporter
    solutionRows.forEach((s) => participantSet.add(s.agentId));
    missionsWithClaims.forEach((m) => {
      if (m.claimedBy) participantSet.add(m.claimedBy.humanId);
    });

    // Count cities
    const citySet = new Set<string>();
    if (problem.city) citySet.add(problem.city);

    return {
      problem: {
        id: problem.id,
        title: problem.title,
        domain: problem.domain,
        city: problem.city,
        reportedBy: {
          type: "agent",
          id: problem.agentId,
          name: reportingAgent?.name ?? "Unknown",
        },
        createdAt: problem.createdAt.toISOString(),
      },
      solutions: solutionsWithAgent,
      missions: missionsWithClaims,
      evidence: evidenceWithReviewers,
      attestations: {
        count: attestationCount,
        urgencyBoostApplied: attestationCount >= 3,
      },
      summary: {
        totalParticipants: participantSet.size,
        totalCities: Math.max(1, citySet.size),
        totalMissionsCompleted: completedMissions.length,
        totalEvidenceVerified: verifiedEvidence.length,
      },
    };
  }

  /**
   * Get aggregated ripple effect for the authenticated user's contributions.
   */
  async getMyRipple(humanId: string): Promise<{
    contributionsCount: number;
    contributionTypes: {
      observationsSubmitted: number;
      missionsCompleted: number;
      evidenceVerified: number;
    };
    downstreamMissions: number;
    peopleInvolved: number;
    citiesReached: number;
    domainsImpacted: string[];
    topChain: {
      problemId: string;
      problemTitle: string;
      totalParticipants: number;
      totalMissionsCompleted: number;
    } | null;
    recentChains: Array<{
      problemId: string;
      problemTitle: string;
      myRole: string;
      downstreamCount: number;
      date: string;
    }>;
  }> {
    // Count observations submitted
    const [obsCount] = await this.db
      .select({ count: count() })
      .from(observations)
      .where(eq(observations.submittedByHumanId, humanId));

    // Count missions completed
    const [missionCount] = await this.db
      .select({ count: count() })
      .from(missionClaims)
      .where(
        and(
          eq(missionClaims.humanId, humanId),
          eq(missionClaims.status, "verified"),
        ),
      );

    // Count evidence verified (reviews given)
    const [reviewCount] = await this.db
      .select({ count: count() })
      .from(peerReviews)
      .where(eq(peerReviews.reviewerHumanId, humanId));

    const observationsSubmitted = obsCount?.count ?? 0;
    const missionsCompleted = missionCount?.count ?? 0;
    const evidenceVerified = reviewCount?.count ?? 0;
    const contributionsCount = observationsSubmitted + missionsCompleted + evidenceVerified;

    // Get the problems linked to the user's missions
    const completedClaims = await this.db
      .select({
        missionId: missionClaims.missionId,
        completedAt: missionClaims.completedAt,
      })
      .from(missionClaims)
      .where(
        and(
          eq(missionClaims.humanId, humanId),
          eq(missionClaims.status, "verified"),
        ),
      )
      .orderBy(desc(missionClaims.completedAt))
      .limit(20);

    // Collect domains, cities, and chain data
    const domainSet = new Set<string>();
    const citySet = new Set<string>();
    const problemChains: Map<string, { title: string; participants: number; missions: number; date: Date }> = new Map();

    for (const claim of completedClaims) {
      await this.traceClaimChain(claim, domainSet, citySet, problemChains);
    }

    // Find the top chain (most missions)
    let topChain: {
      problemId: string;
      problemTitle: string;
      totalParticipants: number;
      totalMissionsCompleted: number;
    } | null = null;

    let maxMissions = 0;
    for (const [problemId, chain] of problemChains) {
      if (chain.missions > maxMissions) {
        maxMissions = chain.missions;
        topChain = {
          problemId,
          problemTitle: chain.title,
          totalParticipants: chain.participants,
          totalMissionsCompleted: chain.missions,
        };
      }
    }

    // Build recent chains
    const recentChains: Array<{
      problemId: string;
      problemTitle: string;
      myRole: string;
      downstreamCount: number;
      date: string;
    }> = [];

    for (const [problemId, chain] of problemChains) {
      recentChains.push({
        problemId,
        problemTitle: chain.title,
        myRole: "mission_completer",
        downstreamCount: chain.missions,
        date: chain.date.toISOString(),
      });
    }

    // Sort recent chains by date
    recentChains.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      contributionsCount,
      contributionTypes: {
        observationsSubmitted,
        missionsCompleted,
        evidenceVerified,
      },
      downstreamMissions: Array.from(problemChains.values()).reduce((sum, c) => sum + c.missions, 0),
      peopleInvolved: 0, // Would require deeper aggregation
      citiesReached: citySet.size,
      domainsImpacted: Array.from(domainSet),
      topChain,
      recentChains: recentChains.slice(0, 10),
    };
  }

  /**
   * Trace a single completed claim back through mission -> solution -> problem
   * and populate domain/city/chain aggregation data.
   */
  private async traceClaimChain(
    claim: { missionId: string; completedAt: Date | null },
    domainSet: Set<string>,
    citySet: Set<string>,
    problemChains: Map<string, { title: string; participants: number; missions: number; date: Date }>,
  ): Promise<void> {
    const [mission] = await this.db
      .select({ solutionId: missions.solutionId, domain: missions.domain })
      .from(missions)
      .where(eq(missions.id, claim.missionId))
      .limit(1);

    if (!mission) return;
    if (mission.domain) domainSet.add(mission.domain);
    if (!mission.solutionId) return;

    const [solution] = await this.db
      .select({ problemId: solutions.problemId })
      .from(solutions)
      .where(eq(solutions.id, mission.solutionId))
      .limit(1);

    if (!solution?.problemId) return;

    const [problem] = await this.db
      .select({ title: problems.title, city: problems.locationName, domain: problems.domain })
      .from(problems)
      .where(eq(problems.id, solution.problemId))
      .limit(1);

    if (!problem) return;
    if (problem.city) citySet.add(problem.city);
    if (problem.domain) domainSet.add(problem.domain);

    if (!problemChains.has(solution.problemId)) {
      const [totalMissions] = await this.db
        .select({ count: count() })
        .from(missions)
        .innerJoin(solutions, eq(missions.solutionId, solutions.id))
        .where(eq(solutions.problemId, solution.problemId));

      problemChains.set(solution.problemId, {
        title: problem.title,
        participants: 0,
        missions: totalMissions?.count ?? 0,
        date: claim.completedAt ?? new Date(),
      });
    }
  }
}
