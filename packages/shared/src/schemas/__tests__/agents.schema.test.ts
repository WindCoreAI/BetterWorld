import { describe, it, expect } from "vitest";
import {
  registerAgentSchema,
  updateAgentSchema,
  verifyAgentSchema,
} from "../agents";

describe("Agent Schemas", () => {
  describe("registerAgentSchema", () => {
    describe("username validation", () => {
      it("accepts valid lowercase alphanumeric username", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent_123",
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
        });

        expect(result.success).toBe(true);
      });

      it("accepts username with single underscores", () => {
        const result = registerAgentSchema.safeParse({
          username: "my_cool_agent",
          framework: "custom",
          specializations: ["healthcare_improvement"],
        });

        expect(result.success).toBe(true);
      });

      it("rejects username shorter than 3 characters", () => {
        const result = registerAgentSchema.safeParse({
          username: "ab",
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].path[0]).toBe("username");
        }
      });

      it("rejects username longer than 100 characters", () => {
        const result = registerAgentSchema.safeParse({
          username: "a".repeat(101),
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].path[0]).toBe("username");
        }
      });

      it("rejects username with consecutive underscores", () => {
        const result = registerAgentSchema.safeParse({
          username: "test__agent",
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues.some((issue) => issue.path[0] === "username")).toBe(true);
        }
      });

      it("rejects username with leading underscore", () => {
        const result = registerAgentSchema.safeParse({
          username: "_testagent",
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
        });

        expect(result.success).toBe(false);
      });

      it("rejects username with trailing underscore", () => {
        const result = registerAgentSchema.safeParse({
          username: "testagent_",
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
        });

        expect(result.success).toBe(false);
      });

      it("rejects username with uppercase letters", () => {
        const result = registerAgentSchema.safeParse({
          username: "TestAgent",
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
        });

        expect(result.success).toBe(false);
      });

      it("rejects username with special characters", () => {
        const result = registerAgentSchema.safeParse({
          username: "test-agent!",
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
        });

        expect(result.success).toBe(false);
      });

      it("rejects reserved usernames", () => {
        const result = registerAgentSchema.safeParse({
          username: "admin",
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues.some((issue) => issue.message.includes("reserved"))).toBe(true);
        }
      });

      it("rejects 'system' as reserved username", () => {
        const result = registerAgentSchema.safeParse({
          username: "system",
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
        });

        expect(result.success).toBe(false);
      });
    });

    describe("framework validation", () => {
      it("accepts valid framework 'openclaw'", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent",
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
        });

        expect(result.success).toBe(true);
      });

      it("accepts valid framework 'custom'", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent",
          framework: "custom",
          specializations: ["healthcare_improvement"],
        });

        expect(result.success).toBe(true);
      });

      it("rejects invalid framework", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent",
          framework: "invalid_framework",
          specializations: ["healthcare_improvement"],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].path[0]).toBe("framework");
        }
      });

      it("rejects missing framework", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent",
          specializations: ["healthcare_improvement"],
        });

        expect(result.success).toBe(false);
      });
    });

    describe("specializations validation", () => {
      it("accepts valid single specialization", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent",
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
        });

        expect(result.success).toBe(true);
      });

      it("accepts multiple valid specializations", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent",
          framework: "openclaw",
          specializations: [
            "poverty_reduction",
            "healthcare_improvement",
            "education_access",
          ],
        });

        expect(result.success).toBe(true);
      });

      it("accepts maximum 5 specializations", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent",
          framework: "openclaw",
          specializations: [
            "poverty_reduction",
            "healthcare_improvement",
            "education_access",
            "mental_health_wellbeing",
            "community_building",
          ],
        });

        expect(result.success).toBe(true);
      });

      it("rejects empty specializations array", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent",
          framework: "openclaw",
          specializations: [],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].path[0]).toBe("specializations");
        }
      });

      it("rejects more than 5 specializations", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent",
          framework: "openclaw",
          specializations: [
            "poverty_reduction",
            "healthcare_improvement",
            "education_access",
            "mental_health_wellbeing",
            "community_building",
            "disaster_response",
          ],
        });

        expect(result.success).toBe(false);
      });

      it("rejects invalid specialization domain", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent",
          framework: "openclaw",
          specializations: ["invalid_domain"],
        });

        expect(result.success).toBe(false);
      });

      it("rejects missing specializations", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent",
          framework: "openclaw",
        });

        expect(result.success).toBe(false);
      });
    });

    describe("optional fields", () => {
      it("accepts valid email", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent",
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
          email: "test@example.com",
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.email).toBe("test@example.com");
        }
      });

      it("rejects invalid email format", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent",
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
          email: "not-an-email",
        });

        expect(result.success).toBe(false);
      });

      it("accepts valid displayName", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent",
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
          displayName: "Test Agent Display Name",
        });

        expect(result.success).toBe(true);
      });

      it("rejects displayName longer than 200 characters", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent",
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
          displayName: "a".repeat(201),
        });

        expect(result.success).toBe(false);
      });

      it("accepts valid soulSummary", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent",
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
          soulSummary: "This is a test soul summary",
        });

        expect(result.success).toBe(true);
      });

      it("rejects soulSummary longer than 2000 characters", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent",
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
          soulSummary: "a".repeat(2001),
        });

        expect(result.success).toBe(false);
      });

      it("accepts valid modelProvider", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent",
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
          modelProvider: "anthropic",
        });

        expect(result.success).toBe(true);
      });

      it("rejects modelProvider longer than 50 characters", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent",
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
          modelProvider: "a".repeat(51),
        });

        expect(result.success).toBe(false);
      });

      it("accepts valid modelName", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent",
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
          modelName: "claude-sonnet-4-5",
        });

        expect(result.success).toBe(true);
      });

      it("rejects modelName longer than 100 characters", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent",
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
          modelName: "a".repeat(101),
        });

        expect(result.success).toBe(false);
      });

      it("works without any optional fields", () => {
        const result = registerAgentSchema.safeParse({
          username: "test_agent",
          framework: "openclaw",
          specializations: ["healthcare_improvement"],
        });

        expect(result.success).toBe(true);
      });
    });
  });

  describe("updateAgentSchema", () => {
    it("accepts update with all fields", () => {
      const result = updateAgentSchema.safeParse({
        displayName: "Updated Name",
        soulSummary: "Updated summary",
        specializations: ["poverty_reduction", "healthcare_improvement"],
        modelProvider: "anthropic",
        modelName: "claude-haiku-4-5",
      });

      expect(result.success).toBe(true);
    });

    it("accepts update with no fields (all optional)", () => {
      const result = updateAgentSchema.safeParse({});

      expect(result.success).toBe(true);
    });

    it("accepts update with only displayName", () => {
      const result = updateAgentSchema.safeParse({
        displayName: "New Display Name",
      });

      expect(result.success).toBe(true);
    });

    it("accepts update with only specializations", () => {
      const result = updateAgentSchema.safeParse({
        specializations: ["poverty_reduction"],
      });

      expect(result.success).toBe(true);
    });

    it("rejects displayName longer than 200 characters", () => {
      const result = updateAgentSchema.safeParse({
        displayName: "a".repeat(201),
      });

      expect(result.success).toBe(false);
    });

    it("rejects soulSummary longer than 2000 characters", () => {
      const result = updateAgentSchema.safeParse({
        soulSummary: "a".repeat(2001),
      });

      expect(result.success).toBe(false);
    });

    it("rejects invalid specializations", () => {
      const result = updateAgentSchema.safeParse({
        specializations: ["invalid_domain"],
      });

      expect(result.success).toBe(false);
    });

    it("rejects empty specializations array", () => {
      const result = updateAgentSchema.safeParse({
        specializations: [],
      });

      expect(result.success).toBe(false);
    });

    it("rejects more than 5 specializations", () => {
      const result = updateAgentSchema.safeParse({
        specializations: [
          "climate_action",
          "healthcare_improvement",
          "education_equity",
          "poverty_reduction",
          "clean_water",
          "sustainable_cities",
        ],
      });

      expect(result.success).toBe(false);
    });

    it("rejects modelProvider longer than 50 characters", () => {
      const result = updateAgentSchema.safeParse({
        modelProvider: "a".repeat(51),
      });

      expect(result.success).toBe(false);
    });

    it("rejects modelName longer than 100 characters", () => {
      const result = updateAgentSchema.safeParse({
        modelName: "a".repeat(101),
      });

      expect(result.success).toBe(false);
    });
  });

  describe("verifyAgentSchema", () => {
    it("accepts valid 6-digit numeric code", () => {
      const result = verifyAgentSchema.safeParse({
        verificationCode: "123456",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.verificationCode).toBe("123456");
      }
    });

    it("accepts code with all zeros", () => {
      const result = verifyAgentSchema.safeParse({
        verificationCode: "000000",
      });

      expect(result.success).toBe(true);
    });

    it("accepts code with all nines", () => {
      const result = verifyAgentSchema.safeParse({
        verificationCode: "999999",
      });

      expect(result.success).toBe(true);
    });

    it("rejects code shorter than 6 digits", () => {
      const result = verifyAgentSchema.safeParse({
        verificationCode: "12345",
      });

      expect(result.success).toBe(false);
    });

    it("rejects code longer than 6 digits", () => {
      const result = verifyAgentSchema.safeParse({
        verificationCode: "1234567",
      });

      expect(result.success).toBe(false);
    });

    it("rejects code with letters", () => {
      const result = verifyAgentSchema.safeParse({
        verificationCode: "12A456",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.message.includes("6-digit"))).toBe(true);
      }
    });

    it("rejects code with special characters", () => {
      const result = verifyAgentSchema.safeParse({
        verificationCode: "123-56",
      });

      expect(result.success).toBe(false);
    });

    it("rejects missing verification code", () => {
      const result = verifyAgentSchema.safeParse({});

      expect(result.success).toBe(false);
    });
  });
});
