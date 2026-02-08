import { AppError, RESERVED_USERNAMES } from "@betterworld/shared";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type Redis from "ioredis";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { AgentService } from "../agent.service.js";

// Mock bcrypt to avoid slow hashing in unit tests
vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn(async (password: string) => `hashed_${password}`),
    compare: vi.fn(async (password: string, hash: string) => hash === `hashed_${password}`),
  },
}));

describe("AgentService", () => {
  let service: AgentService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDb: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRedis: any;

  beforeEach(() => {
    // Create mock database
    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
    };

    // Create mock Redis
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      setex: vi.fn(),
      del: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
    };

    service = new AgentService(
      mockDb as unknown as PostgresJsDatabase,
      mockRedis as unknown as Redis
    );
  });

  describe("register", () => {
    it("should throw error for reserved username", async () => {
      const input = {
        username: RESERVED_USERNAMES[0] as string,
        framework: "openclaw",
        specializations: ["healthcare_improvement"],
      };

      await expect(service.register(input)).rejects.toThrow(AppError);
      await expect(service.register(input)).rejects.toThrow("This username is reserved");
    });

    it("should throw error for duplicate username", async () => {
      // Mock existing user found
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "existing-id" }]),
          }),
        }),
      });

      const input = {
        username: "existing_user",
        framework: "openclaw",
        specializations: ["healthcare_improvement"],
      };

      await expect(service.register(input)).rejects.toThrow(AppError);
      await expect(service.register(input)).rejects.toThrow("Username is already taken");
    });

    it("should throw error for invalid specialization", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // No existing user
          }),
        }),
      });

      const input = {
        username: "test_user",
        framework: "openclaw",
        specializations: ["invalid_domain"],
      };

      await expect(service.register(input)).rejects.toThrow(AppError);
      await expect(service.register(input)).rejects.toThrow("Invalid specialization");
    });

    it("should successfully register agent with minimal fields", async () => {
      // Mock no existing user
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      // Mock successful insert
      const mockInserted = {
        id: "test-agent-id",
        username: "test_agent",
      };
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockInserted]),
        }),
      });

      const input = {
        username: "test_agent",
        framework: "openclaw",
        specializations: ["healthcare_improvement"],
      };

      const result = await service.register(input);

      expect(result).toMatchObject({
        agentId: "test-agent-id",
        username: "test_agent",
      });
      expect(result.apiKey).toBeDefined();
      expect(result.apiKey).toHaveLength(64); // 32 bytes * 2 (hex)
      expect(result.verificationCode).toBeNull();
    });

    it("should generate verification code when email provided", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const mockInserted = {
        id: "test-agent-id",
        username: "test_agent",
      };
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockInserted]),
        }),
      });

      const input = {
        username: "test_agent",
        framework: "openclaw",
        specializations: ["healthcare_improvement"],
        email: "test@example.com",
      };

      const result = await service.register(input);

      expect(result.verificationCode).toBeDefined();
      expect(result.verificationCode).toMatch(/^\d{6}$/); // 6-digit code
    });

    it("should handle database unique constraint violation", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      // Mock unique constraint error (code 23505)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dbError = new Error("Unique constraint violation") as any;
      dbError.code = "23505";
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(dbError),
        }),
      });

      const input = {
        username: "test_agent",
        framework: "openclaw",
        specializations: ["healthcare_improvement"],
      };

      await expect(service.register(input)).rejects.toThrow(AppError);
      await expect(service.register(input)).rejects.toThrow("Username is already taken");
    });
  });

  describe("getById", () => {
    it("should throw error when agent not found", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(service.getById("non-existent-id")).rejects.toThrow(AppError);
      await expect(service.getById("non-existent-id")).rejects.toThrow("Agent not found");
    });

    it("should return public profile when agent exists", async () => {
      const mockAgent = {
        id: "test-id",
        username: "test_agent",
        displayName: "Test Agent",
        framework: "openclaw",
        specializations: ["healthcare_improvement"],
        reputationScore: 100,
        totalProblemsReported: 5,
        totalSolutionsProposed: 3,
        claimStatus: "pending",
        lastHeartbeatAt: null,
        createdAt: new Date(),
        isActive: true,
        // Private fields (should not be in public profile)
        email: "private@example.com",
        apiKeyHash: "secret-hash",
        rateLimitOverride: null,
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockAgent]),
          }),
        }),
      });

      const result = await service.getById("test-id");

      // Public fields present
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("username");
      expect(result).toHaveProperty("displayName");

      // Private fields absent
      expect(result).not.toHaveProperty("email");
      expect(result).not.toHaveProperty("apiKeyHash");
      expect(result).not.toHaveProperty("rateLimitOverride");
    });
  });

  describe("getSelf", () => {
    it("should return self profile with private fields", async () => {
      const mockAgent = {
        id: "test-id",
        username: "test_agent",
        displayName: "Test Agent",
        framework: "openclaw",
        specializations: ["healthcare_improvement"],
        email: "private@example.com",
        modelProvider: "anthropic",
        modelName: "claude-sonnet-4-5",
        soulSummary: "I help with climate action",
        reputationScore: 100,
        totalProblemsReported: 5,
        totalSolutionsProposed: 3,
        claimStatus: "verified",
        rateLimitOverride: 100,
        lastHeartbeatAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
        // Internal fields (should still not be included)
        apiKeyHash: "secret-hash",
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockAgent]),
          }),
        }),
      });

      const result = await service.getSelf("test-id");

      // Public fields
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("username");

      // Private fields (own profile)
      expect(result).toHaveProperty("email");
      expect(result).toHaveProperty("modelProvider");
      expect(result).toHaveProperty("soulSummary");
      expect(result).toHaveProperty("rateLimitOverride");

      // Internal fields still excluded
      expect(result).not.toHaveProperty("apiKeyHash");
    });
  });

  describe("updateProfile", () => {
    it("should throw error for invalid specializations", async () => {
      const input = {
        specializations: ["invalid_domain"],
      };

      await expect(service.updateProfile("test-id", input)).rejects.toThrow(AppError);
      await expect(service.updateProfile("test-id", input)).rejects.toThrow(
        "Invalid specialization"
      );
    });

    it("should successfully update profile fields", async () => {
      const mockUpdated = {
        id: "test-id",
        username: "test_agent",
        displayName: "Updated Name",
        framework: "openclaw",
        specializations: ["sustainable_energy", "healthcare_improvement"],
        soulSummary: "Updated summary",
        email: null,
        modelProvider: "anthropic",
        modelName: "claude-sonnet-4-5",
        reputationScore: 100,
        totalProblemsReported: 5,
        totalSolutionsProposed: 3,
        claimStatus: "pending",
        rateLimitOverride: null,
        lastHeartbeatAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
      };

      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockUpdated]),
          }),
        }),
      });

      const input = {
        displayName: "Updated Name",
        soulSummary: "Updated summary",
        specializations: ["sustainable_energy", "healthcare_improvement"],
      };

      const result = await service.updateProfile("test-id", input);

      expect(result.displayName).toBe("Updated Name");
      expect(result.soulSummary).toBe("Updated summary");
      expect(result.specializations).toEqual(["sustainable_energy", "healthcare_improvement"]);
    });

    it("should throw error when agent not found", async () => {
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]), // No agent returned
          }),
        }),
      });

      const input = { displayName: "New Name" };

      await expect(service.updateProfile("non-existent", input)).rejects.toThrow(AppError);
      await expect(service.updateProfile("non-existent", input)).rejects.toThrow(
        "Agent not found"
      );
    });
  });

  describe("verifyEmail", () => {
    it("should throw error when agent not found", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(service.verifyEmail("non-existent", "123456")).rejects.toThrow(AppError);
    });

    it("should throw error when no verification code pending", async () => {
      const mockAgent = {
        id: "test-id",
        claimVerificationCode: null,
        claimVerificationCodeExpiresAt: null,
        claimStatus: "pending",
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockAgent]),
          }),
        }),
      });

      await expect(service.verifyEmail("test-id", "123456")).rejects.toThrow(AppError);
      await expect(service.verifyEmail("test-id", "123456")).rejects.toThrow(
        "No verification code pending"
      );
    });

    it("should throw error when code is expired", async () => {
      const mockAgent = {
        id: "test-id",
        claimVerificationCode: "123456",
        claimVerificationCodeExpiresAt: new Date(Date.now() - 1000), // Expired
        claimStatus: "pending",
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockAgent]),
          }),
        }),
      });

      await expect(service.verifyEmail("test-id", "123456")).rejects.toThrow(AppError);
      await expect(service.verifyEmail("test-id", "123456")).rejects.toThrow(
        "Verification code has expired"
      );
    });

    it("should throw error when code is incorrect", async () => {
      const mockAgent = {
        id: "test-id",
        claimVerificationCode: "123456",
        claimVerificationCodeExpiresAt: new Date(Date.now() + 10000), // Not expired
        claimStatus: "pending",
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockAgent]),
          }),
        }),
      });

      await expect(service.verifyEmail("test-id", "wrong-code")).rejects.toThrow(AppError);
      await expect(service.verifyEmail("test-id", "wrong-code")).rejects.toThrow(
        "Invalid verification code"
      );
    });

    it("should successfully verify email with correct code", async () => {
      const mockAgent = {
        id: "test-id",
        claimVerificationCode: "123456",
        claimVerificationCodeExpiresAt: new Date(Date.now() + 10000),
        claimStatus: "pending",
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockAgent]),
          }),
        }),
      });

      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      mockRedis.get.mockResolvedValue(null);

      const result = await service.verifyEmail("test-id", "123456");

      expect(result.claimStatus).toBe("verified");
      expect(result.message).toBe("Email verified successfully");
    });
  });

  describe("resendVerificationCode", () => {
    it("should throw error when agent not found", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(service.resendVerificationCode("non-existent")).rejects.toThrow(AppError);
    });

    it("should throw error when no email on file", async () => {
      const mockAgent = {
        id: "test-id",
        email: null,
        claimStatus: "pending",
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockAgent]),
          }),
        }),
      });

      await expect(service.resendVerificationCode("test-id")).rejects.toThrow(AppError);
      await expect(service.resendVerificationCode("test-id")).rejects.toThrow(
        "No email address on file"
      );
    });

    it("should throw error when agent already verified", async () => {
      const mockAgent = {
        id: "test-id",
        email: "test@example.com",
        claimStatus: "verified",
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockAgent]),
          }),
        }),
      });

      await expect(service.resendVerificationCode("test-id")).rejects.toThrow(AppError);
      await expect(service.resendVerificationCode("test-id")).rejects.toThrow(
        "Agent is already verified"
      );
    });

    it("should enforce resend throttle", async () => {
      const mockAgent = {
        id: "test-id",
        email: "test@example.com",
        claimStatus: "pending",
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockAgent]),
          }),
        }),
      });

      // Mock Redis throttle exceeded
      mockRedis.incr.mockResolvedValue(4); // 4th attempt

      await expect(service.resendVerificationCode("test-id")).rejects.toThrow(AppError);
      await expect(service.resendVerificationCode("test-id")).rejects.toThrow(
        "Maximum 3 verification code resends per hour"
      );
    });

    it("should successfully resend verification code", async () => {
      const mockAgent = {
        id: "test-id",
        email: "test@example.com",
        claimStatus: "pending",
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockAgent]),
          }),
        }),
      });

      mockRedis.incr.mockResolvedValue(2); // 2nd attempt
      mockRedis.expire.mockResolvedValue(1);

      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const result = await service.resendVerificationCode("test-id");

      expect(result.email).toBe("test@example.com");
      expect(result.verificationCode).toMatch(/^\d{6}$/);
      expect(result.expiresIn).toBe(900); // 15 minutes in seconds
    });
  });

  describe("getTierLimit (private method via setRateLimitOverride)", () => {
    it("should return correct limits for each tier", async () => {
      const mockAgent = {
        id: "test-id",
        claimStatus: "pending",
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockAgent]),
          }),
        }),
      });

      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      mockRedis.get.mockResolvedValue(null);
      mockRedis.del.mockResolvedValue(1);

      const result = await service.setRateLimitOverride("test-id", null);

      // Pending tier = 30 req/min
      expect(result.effectiveLimit).toBe(30);
    });
  });
});
