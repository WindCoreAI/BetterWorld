import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { LayerBResult } from "@betterworld/shared/types/guardrails";

// Use vi.hoisted so mock fns are available when vi.mock factory runs (hoisted above imports)
const { mockGet, mockSetex } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSetex: vi.fn(),
}));

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({
    get: mockGet,
    setex: mockSetex,
  })),
}));

import { generateCacheKey, getCachedEvaluation, setCachedEvaluation } from "../../src/cache/cache-manager";

describe("Cache Manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateCacheKey", () => {
    it("should generate consistent SHA-256 hash for same content", () => {
      const content = "Community food bank needs volunteers";
      const key1 = generateCacheKey(content);
      const key2 = generateCacheKey(content);

      expect(key1).toBe(key2);
      expect(key1).toHaveLength(64); // SHA-256 hex length
    });

    it("should normalize case differences", () => {
      const key1 = generateCacheKey("Community Food Bank");
      const key2 = generateCacheKey("community food bank");
      const key3 = generateCacheKey("COMMUNITY FOOD BANK");

      expect(key1).toBe(key2);
      expect(key2).toBe(key3);
    });

    it("should collapse whitespace", () => {
      const key1 = generateCacheKey("Community  food   bank");
      const key2 = generateCacheKey("Community food bank");

      expect(key1).toBe(key2);
    });

    it("should trim leading/trailing whitespace", () => {
      const key1 = generateCacheKey("  Community food bank  ");
      const key2 = generateCacheKey("Community food bank");

      expect(key1).toBe(key2);
    });

    it("should remove markdown formatting", () => {
      const key1 = generateCacheKey("**Community** food _bank_");
      const key2 = generateCacheKey("Community food bank");

      expect(key1).toBe(key2);
    });

    it("should generate different keys for different content", () => {
      const key1 = generateCacheKey("Community food bank");
      const key2 = generateCacheKey("Beach cleanup event");

      expect(key1).not.toBe(key2);
    });

    it("should handle empty content", () => {
      const key = generateCacheKey("");
      expect(key).toHaveLength(64);
    });
  });

  describe("getCachedEvaluation", () => {
    it("should return cached result on cache hit", async () => {
      const cachedResult: LayerBResult = {
        alignedDomain: "food_security",
        alignmentScore: 0.85,
        harmRisk: "low",
        feasibility: "high",
        quality: "good",
        decision: "approve",
        reasoning: "Test",
      };

      mockGet.mockResolvedValue(JSON.stringify(cachedResult));

      const result = await getCachedEvaluation("Test content");

      expect(result).toEqual(cachedResult);
      expect(mockGet).toHaveBeenCalledOnce();
    });

    it("should return null on cache miss", async () => {
      mockGet.mockResolvedValue(null);

      const result = await getCachedEvaluation("Test content");

      expect(result).toBeNull();
    });

    it("should handle Redis errors gracefully", async () => {
      mockGet.mockRejectedValue(new Error("Redis connection failed"));

      const result = await getCachedEvaluation("Test content");

      expect(result).toBeNull(); // Fail gracefully
    });

    it("should use correct cache key format", async () => {
      mockGet.mockResolvedValue(null);

      await getCachedEvaluation("Test content");

      const callArg = mockGet.mock.calls[0]?.[0] as string;
      expect(callArg).toMatch(/^guardrail:[a-f0-9]{64}$/);
    });
  });

  describe("setCachedEvaluation", () => {
    it("should cache evaluation result with TTL", async () => {
      const result: LayerBResult = {
        alignedDomain: "education_access",
        alignmentScore: 0.92,
        harmRisk: "low",
        feasibility: "high",
        quality: "excellent",
        decision: "approve",
        reasoning: "Test",
      };

      mockSetex.mockResolvedValue("OK");

      await setCachedEvaluation("Test content", result);

      expect(mockSetex).toHaveBeenCalledOnce();
      const [key, ttl, value] = mockSetex.mock.calls[0] as [string, number, string];

      expect(key).toMatch(/^guardrail:[a-f0-9]{64}$/);
      expect(ttl).toBe(3600); // Default TTL
      expect(JSON.parse(value)).toEqual(result);
    });

    it("should handle Redis errors gracefully", async () => {
      const result: LayerBResult = {
        alignedDomain: "food_security",
        alignmentScore: 0.80,
        harmRisk: "low",
        feasibility: "high",
        quality: "good",
        decision: "approve",
        reasoning: "Test",
      };

      mockSetex.mockRejectedValue(new Error("Redis write failed"));

      // Should not throw - fails gracefully
      await expect(setCachedEvaluation("Test", result)).resolves.toBeUndefined();
    });
  });

  describe("Cache Hit/Miss Scenarios", () => {
    it("should demonstrate cache hit scenario", async () => {
      const content = "Community food bank needs volunteers";
      const result: LayerBResult = {
        alignedDomain: "food_security",
        alignmentScore: 0.85,
        harmRisk: "low",
        feasibility: "high",
        quality: "good",
        decision: "approve",
        reasoning: "Cached result",
      };

      // Set cache
      mockSetex.mockResolvedValue("OK");
      await setCachedEvaluation(content, result);

      // Get cache (simulate hit)
      mockGet.mockResolvedValue(JSON.stringify(result));
      const cached = await getCachedEvaluation(content);

      expect(cached).toEqual(result);
    });

    it("should demonstrate cache miss scenario", async () => {
      mockGet.mockResolvedValue(null);

      const cached = await getCachedEvaluation("New content never seen before");

      expect(cached).toBeNull();
    });
  });

  describe("Content Normalization Impact", () => {
    it("should cache identical normalized content only once", async () => {
      const variations = [
        "Community Food Bank",
        "community food bank",
        "  Community  food   bank  ",
        "**Community** _food_ bank",
      ];

      const result: LayerBResult = {
        alignedDomain: "food_security",
        alignmentScore: 0.85,
        harmRisk: "low",
        feasibility: "high",
        quality: "good",
        decision: "approve",
        reasoning: "Test",
      };

      // All variations should generate the same cache key
      const keys = variations.map((v) => generateCacheKey(v));
      expect(new Set(keys).size).toBe(1); // Only 1 unique key

      // Setting cache for any variation should work
      mockSetex.mockResolvedValue("OK");
      await setCachedEvaluation(variations[0]!, result);

      mockGet.mockResolvedValue(JSON.stringify(result));

      // Getting cache with any variation should hit
      for (const variation of variations) {
        const cached = await getCachedEvaluation(variation);
        expect(cached).toEqual(result);
      }
    });
  });
});
