/**
 * Network Health Service (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * Computes network health metrics with Redis 10-min cache:
 * - Connection density
 * - Cross-domain bridge count
 * - City connectivity
 * - New connection rate (7-day rolling)
 * - Reciprocity rate
 */
import { connections, follows, humanProfiles } from "@betterworld/db";
import { count, sql, gte, eq, and } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type Redis from "ioredis";

const CACHE_KEY = "network-health:latest";
const CACHE_TTL_SECONDS = 600; // 10 minutes

interface NetworkHealthMetrics {
  connectionDensity: number;
  totalConnections: number;
  totalParticipants: number;
  totalFollows: number;
  citiesConnected: number;
  reciprocityRate: number;
  newConnectionsLast7Days: number;
  crossDomainBridges: number;
}

export class NetworkHealthService {
  constructor(
    private readonly db: PostgresJsDatabase,
    private readonly redis?: Redis,
  ) {}

  /**
   * Get network health metrics (with Redis cache).
   */
  async getMetrics(): Promise<NetworkHealthMetrics> {
    // Try cache first
    if (this.redis) {
      try {
        const cached = await this.redis.get(CACHE_KEY);
        if (cached) {
          return JSON.parse(cached) as NetworkHealthMetrics;
        }
      } catch {
        // Cache miss, continue to compute
      }
    }

    const metrics = await this.computeMetrics();

    // Cache result
    if (this.redis) {
      try {
        await this.redis.setex(CACHE_KEY, CACHE_TTL_SECONDS, JSON.stringify(metrics));
      } catch {
        // Non-fatal cache write failure
      }
    }

    return metrics;
  }

  /**
   * Compute all network health metrics from database.
   */
  private async computeMetrics(): Promise<NetworkHealthMetrics> {
    // Connection density
    const [connectionCount] = await this.db
      .select({ count: count() })
      .from(connections)
      .where(eq(connections.status, "accepted"));

    const [participantCount] = await this.db
      .select({ count: count() })
      .from(humanProfiles);

    const totalConnections = connectionCount?.count ?? 0;
    const totalParticipants = participantCount?.count ?? 1;
    const possibleConnections = (totalParticipants * (totalParticipants - 1)) / 2;
    const connectionDensity = possibleConnections > 0
      ? Math.round((totalConnections / possibleConnections) * 10000) / 10000
      : 0;

    // Follow count
    const [followCount] = await this.db
      .select({ count: count() })
      .from(follows);
    const totalFollows = followCount?.count ?? 0;

    // Reciprocity rate
    const reciprocityRate = totalFollows > 0
      ? Math.round((totalConnections * 2 / totalFollows) * 10000) / 10000
      : 0;

    // Unique cities
    const [cityResult] = await this.db
      .select({ cityCount: sql<number>`COUNT(DISTINCT ${humanProfiles.city})` })
      .from(humanProfiles)
      .where(sql`${humanProfiles.city} IS NOT NULL`);
    const citiesConnected = Number(cityResult?.cityCount) || 0;

    // New connections in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [recentConnections] = await this.db
      .select({ count: count() })
      .from(connections)
      .where(
        and(
          eq(connections.status, "accepted"),
          gte(connections.updatedAt, sevenDaysAgo),
        ),
      );
    const newConnectionsLast7Days = recentConnections?.count ?? 0;

    // Cross-domain bridges: connections between users of different primary domains
    const crossDomainResult = await this.db.execute(sql`
      SELECT COUNT(*) as bridge_count
      FROM connections c
      INNER JOIN human_profiles hp1 ON c.requester_human_id = hp1.human_id
      INNER JOIN human_profiles hp2 ON c.recipient_human_id = hp2.human_id
      WHERE c.status = 'accepted'
        AND hp1.primary_domain IS NOT NULL
        AND hp2.primary_domain IS NOT NULL
        AND hp1.primary_domain != hp2.primary_domain
    `);
    const crossDomainBridges = Number((crossDomainResult as unknown as Array<{ bridge_count: string }>)?.[0]?.bridge_count) || 0;

    return {
      connectionDensity,
      totalConnections,
      totalParticipants,
      totalFollows,
      citiesConnected,
      reciprocityRate,
      newConnectionsLast7Days,
      crossDomainBridges,
    };
  }
}
