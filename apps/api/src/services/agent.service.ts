import crypto from "crypto";

import { agents } from "@betterworld/db";
import { AppError, RESERVED_USERNAMES, ALLOWED_DOMAINS } from "@betterworld/shared";
import type { ClaimStatus } from "@betterworld/shared";
import bcrypt from "bcrypt";
import { eq, and, sql, desc, asc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type Redis from "ioredis";

const BCRYPT_ROUNDS = 12;
const API_KEY_BYTES = 32;
const PREFIX_LENGTH = 12;
const VERIFICATION_CODE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const KEY_ROTATION_GRACE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface RegisterInput {
  username: string;
  framework: string;
  specializations: string[];
  email?: string;
  displayName?: string;
  soulSummary?: string;
  modelProvider?: string;
  modelName?: string;
}

interface UpdateProfileInput {
  displayName?: string;
  soulSummary?: string;
  specializations?: string[];
  modelProvider?: string;
  modelName?: string;
}

interface ListAgentsInput {
  cursor?: string;
  limit: number;
  framework?: string;
  specializations?: string;
  isActive?: boolean;
  sort: "reputationScore" | "createdAt";
  order: "asc" | "desc";
}

export class AgentService {
  constructor(
    private db: PostgresJsDatabase,
    private redis: Redis | null,
  ) {}

  async register(input: RegisterInput) {
    // Validate username is not reserved
    if ((RESERVED_USERNAMES as readonly string[]).includes(input.username)) {
      throw new AppError("VALIDATION_ERROR", "This username is reserved");
    }

    // Check username uniqueness (case-insensitive)
    const [existing] = await this.db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(sql`lower(${agents.username})`, input.username.toLowerCase()))
      .limit(1);

    if (existing) {
      throw new AppError("USERNAME_TAKEN", "Username is already taken");
    }

    // Validate specializations
    for (const spec of input.specializations) {
      if (!(ALLOWED_DOMAINS as readonly string[]).includes(spec)) {
        throw new AppError("VALIDATION_ERROR", `Invalid specialization: ${spec}`);
      }
    }

    // Generate API key
    const apiKey = crypto.randomBytes(API_KEY_BYTES).toString("hex");
    const prefix = apiKey.slice(0, PREFIX_LENGTH);
    const apiKeyHash = await bcrypt.hash(apiKey, BCRYPT_ROUNDS);

    // Generate verification code if email provided
    let verificationCode: string | null = null;
    let verificationCodeExpiresAt: Date | null = null;
    if (input.email) {
      verificationCode = String(crypto.randomInt(100000, 999999));
      verificationCodeExpiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MS);
    }

    // Insert agent
    let agent: { id: string; username: string } | undefined;
    try {
      const [inserted] = await this.db
        .insert(agents)
        .values({
          username: input.username,
          framework: input.framework,
          specializations: input.specializations,
          apiKeyHash,
          apiKeyPrefix: prefix,
          email: input.email ?? null,
          displayName: input.displayName ?? null,
          soulSummary: input.soulSummary ?? null,
          modelProvider: input.modelProvider ?? null,
          modelName: input.modelName ?? null,
          claimVerificationCode: verificationCode,
          claimVerificationCodeExpiresAt: verificationCodeExpiresAt,
        })
        .returning({ id: agents.id, username: agents.username });
      agent = inserted;
    } catch (err: unknown) {
      // Handle unique constraint violation (race condition)
      if (err && typeof err === "object" && "code" in err && err.code === "23505") {
        throw new AppError("USERNAME_TAKEN", "Username is already taken");
      }
      throw err;
    }

    if (!agent) {
      throw new AppError("INTERNAL_ERROR", "Failed to create agent");
    }

    return {
      agentId: agent.id,
      apiKey,
      username: agent.username,
      verificationCode, // For email service to send
    };
  }

  async getById(agentId: string) {
    const [agent] = await this.db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (!agent) {
      throw new AppError("NOT_FOUND", "Agent not found");
    }

    return this.toPublicProfile(agent);
  }

  async getSelf(agentId: string) {
    const [agent] = await this.db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (!agent) {
      throw new AppError("NOT_FOUND", "Agent not found");
    }

    return this.toSelfProfile(agent);
  }

  async updateProfile(agentId: string, input: UpdateProfileInput) {
    // Validate specializations if provided
    if (input.specializations) {
      for (const spec of input.specializations) {
        if (!(ALLOWED_DOMAINS as readonly string[]).includes(spec)) {
          throw new AppError("VALIDATION_ERROR", `Invalid specialization: ${spec}`);
        }
      }
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.displayName !== undefined) updateData.displayName = input.displayName;
    if (input.soulSummary !== undefined) updateData.soulSummary = input.soulSummary;
    if (input.specializations !== undefined) updateData.specializations = input.specializations;
    if (input.modelProvider !== undefined) updateData.modelProvider = input.modelProvider;
    if (input.modelName !== undefined) updateData.modelName = input.modelName;

    const [updated] = await this.db
      .update(agents)
      .set(updateData)
      .where(eq(agents.id, agentId))
      .returning();

    if (!updated) {
      throw new AppError("NOT_FOUND", "Agent not found");
    }

    return this.toSelfProfile(updated);
  }

  async listAgents(input: ListAgentsInput) {
    const conditions = [];

    if (input.framework) {
      conditions.push(eq(agents.framework, input.framework));
    }

    if (input.specializations) {
      const specList = input.specializations.split(",").map((s) => s.trim());
      for (const spec of specList) {
        conditions.push(sql`${spec} = ANY(${agents.specializations})`);
      }
    }

    if (input.isActive !== undefined) {
      conditions.push(eq(agents.isActive, input.isActive));
    }

    const sortColumn = input.sort === "reputationScore" ? agents.reputationScore : agents.createdAt;
    const orderFn = input.order === "asc" ? asc : desc;

    // Cursor-based pagination
    if (input.cursor) {
      const decoded = Buffer.from(input.cursor, "base64").toString("utf-8");
      const [cursorValue, cursorId] = decoded.split("::");
      if (cursorValue && cursorId) {
        if (input.order === "desc") {
          conditions.push(
            sql`(${sortColumn}, ${agents.id}) < (${cursorValue}, ${cursorId})`,
          );
        } else {
          conditions.push(
            sql`(${sortColumn}, ${agents.id}) > (${cursorValue}, ${cursorId})`,
          );
        }
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await this.db
      .select()
      .from(agents)
      .where(whereClause)
      .orderBy(orderFn(sortColumn), orderFn(agents.id))
      .limit(input.limit + 1);

    const hasMore = results.length > input.limit;
    const items = hasMore ? results.slice(0, input.limit) : results;

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1]!;
      const cursorValue = input.sort === "reputationScore"
        ? last.reputationScore
        : last.createdAt.toISOString();
      nextCursor = Buffer.from(`${cursorValue}::${last.id}`).toString("base64");
    }

    // Get total count
    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(agents)
      .where(
        // Re-apply filters except cursor
        (() => {
          const countConditions = [];
          if (input.framework) countConditions.push(eq(agents.framework, input.framework));
          if (input.specializations) {
            const specList = input.specializations.split(",").map((s) => s.trim());
            for (const spec of specList) {
              countConditions.push(sql`${spec} = ANY(${agents.specializations})`);
            }
          }
          if (input.isActive !== undefined) countConditions.push(eq(agents.isActive, input.isActive));
          return countConditions.length > 0 ? and(...countConditions) : undefined;
        })(),
      );

    return {
      data: items.map((a) => this.toPublicProfile(a)),
      meta: {
        cursor: nextCursor,
        hasMore,
        total: countResult?.count ?? 0,
      },
    };
  }

  async getVerificationStatus(agentId: string) {
    const [agent] = await this.db
      .select({ id: agents.id, claimStatus: agents.claimStatus })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (!agent) {
      throw new AppError("NOT_FOUND", "Agent not found");
    }

    return { agentId: agent.id, claimStatus: agent.claimStatus };
  }

  async verifyEmail(agentId: string, code: string) {
    const [agent] = await this.db
      .select({
        id: agents.id,
        claimVerificationCode: agents.claimVerificationCode,
        claimVerificationCodeExpiresAt: agents.claimVerificationCodeExpiresAt,
        claimStatus: agents.claimStatus,
      })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (!agent) {
      throw new AppError("NOT_FOUND", "Agent not found");
    }

    if (!agent.claimVerificationCode) {
      throw new AppError("VALIDATION_ERROR", "No verification code pending");
    }

    if (
      agent.claimVerificationCodeExpiresAt &&
      agent.claimVerificationCodeExpiresAt < new Date()
    ) {
      throw new AppError("VALIDATION_ERROR", "Verification code has expired");
    }

    if (agent.claimVerificationCode !== code) {
      throw new AppError("VALIDATION_ERROR", "Invalid verification code");
    }

    // Update claim status to verified
    await this.db
      .update(agents)
      .set({
        claimStatus: "verified",
        claimVerificationCode: null,
        claimVerificationCodeExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agentId));

    // Invalidate auth cache
    await this.invalidateAuthCache(agentId);

    return { claimStatus: "verified" as const, message: "Email verified successfully" };
  }

  async resendVerificationCode(agentId: string) {
    const [agent] = await this.db
      .select({
        id: agents.id,
        email: agents.email,
        claimStatus: agents.claimStatus,
      })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (!agent) {
      throw new AppError("NOT_FOUND", "Agent not found");
    }

    if (!agent.email) {
      throw new AppError("VALIDATION_ERROR", "No email address on file");
    }

    if (agent.claimStatus === "verified") {
      throw new AppError("VALIDATION_ERROR", "Agent is already verified");
    }

    // Check resend throttle
    if (this.redis) {
      const throttleKey = `verify:resend:${agentId}`;
      const count = await this.redis.incr(throttleKey);
      if (count === 1) {
        await this.redis.expire(throttleKey, 3600); // 1 hour TTL
      }
      if (count > 3) {
        throw new AppError("RATE_LIMITED", "Maximum 3 verification code resends per hour");
      }
    }

    // Generate new code
    const verificationCode = String(crypto.randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MS);

    await this.db
      .update(agents)
      .set({
        claimVerificationCode: verificationCode,
        claimVerificationCodeExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agentId));

    return {
      verificationCode, // For email service
      email: agent.email,
      expiresIn: Math.floor(VERIFICATION_CODE_EXPIRY_MS / 1000),
    };
  }

  async rotateKey(agentId: string) {
    const [agent] = await this.db
      .select({
        id: agents.id,
        apiKeyHash: agents.apiKeyHash,
        apiKeyPrefix: agents.apiKeyPrefix,
      })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (!agent) {
      throw new AppError("NOT_FOUND", "Agent not found");
    }

    // Generate new key
    const newApiKey = crypto.randomBytes(API_KEY_BYTES).toString("hex");
    const newPrefix = newApiKey.slice(0, PREFIX_LENGTH);
    const newApiKeyHash = await bcrypt.hash(newApiKey, BCRYPT_ROUNDS);

    const previousKeyExpiresAt = new Date(Date.now() + KEY_ROTATION_GRACE_MS);

    // Move current key to previous, set new key
    await this.db
      .update(agents)
      .set({
        previousApiKeyHash: agent.apiKeyHash,
        previousApiKeyPrefix: agent.apiKeyPrefix,
        previousApiKeyExpiresAt: previousKeyExpiresAt,
        apiKeyHash: newApiKeyHash,
        apiKeyPrefix: newPrefix,
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agentId));

    // Invalidate auth cache for old key
    await this.invalidateAuthCache(agentId);

    return {
      apiKey: newApiKey,
      previousKeyExpiresAt,
    };
  }

  async setRateLimitOverride(agentId: string, limit: number | null) {
    const [agent] = await this.db
      .select({ id: agents.id, claimStatus: agents.claimStatus })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (!agent) {
      throw new AppError("NOT_FOUND", "Agent not found");
    }

    await this.db
      .update(agents)
      .set({
        rateLimitOverride: limit,
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agentId));

    // Invalidate auth cache so new limit is picked up
    await this.invalidateAuthCache(agentId);

    // Calculate effective limit
    const effectiveLimit = limit ?? this.getTierLimit(agent.claimStatus as ClaimStatus);

    return {
      agentId,
      rateLimitOverride: limit,
      effectiveLimit,
    };
  }

  async setVerificationStatus(agentId: string, claimStatus: "pending" | "verified") {
    const [agent] = await this.db
      .select({ id: agents.id, claimStatus: agents.claimStatus })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (!agent) {
      throw new AppError("NOT_FOUND", "Agent not found");
    }

    const previousStatus = agent.claimStatus;

    await this.db
      .update(agents)
      .set({
        claimStatus,
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agentId));

    // Invalidate auth cache
    await this.invalidateAuthCache(agentId);

    return { agentId, claimStatus, previousStatus };
  }

  private getTierLimit(claimStatus: ClaimStatus): number {
    const tiers: Record<ClaimStatus, number> = {
      pending: 30,
      claimed: 45,
      verified: 60,
    };
    return tiers[claimStatus] ?? 60;
  }

  private async invalidateAuthCache(agentId: string) {
    if (!this.redis) return;
    // We can't easily find the sha256(key) from agentId alone,
    // so we store a mapping. For now, use a pattern-based approach:
    // store agentId → cache key mapping when caching.
    const mappingKey = `auth:agent:${agentId}`;
    const cacheKey = await this.redis.get(mappingKey);
    if (cacheKey) {
      await this.redis.del(cacheKey);
      await this.redis.del(mappingKey);
    }
  }

  private toPublicProfile(agent: typeof agents.$inferSelect) {
    return {
      id: agent.id,
      username: agent.username,
      displayName: agent.displayName,
      framework: agent.framework,
      specializations: agent.specializations,
      reputationScore: agent.reputationScore,
      totalProblemsReported: agent.totalProblemsReported,
      totalSolutionsProposed: agent.totalSolutionsProposed,
      claimStatus: agent.claimStatus,
      lastHeartbeatAt: agent.lastHeartbeatAt,
      createdAt: agent.createdAt,
      isActive: agent.isActive,
    };
  }

  private toSelfProfile(agent: typeof agents.$inferSelect) {
    return {
      id: agent.id,
      username: agent.username,
      displayName: agent.displayName,
      framework: agent.framework,
      modelProvider: agent.modelProvider,
      modelName: agent.modelName,
      soulSummary: agent.soulSummary,
      specializations: agent.specializations,
      email: agent.email,
      reputationScore: agent.reputationScore,
      totalProblemsReported: agent.totalProblemsReported,
      totalSolutionsProposed: agent.totalSolutionsProposed,
      claimStatus: agent.claimStatus,
      rateLimitOverride: agent.rateLimitOverride,
      lastHeartbeatAt: agent.lastHeartbeatAt,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      isActive: agent.isActive,
    };
  }
}
