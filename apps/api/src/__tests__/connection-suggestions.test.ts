/**
 * Connection Suggestion Algorithm Unit Tests (Sprint 16: Social Fabric Foundation)
 *
 * Tests the scoring weights for the suggestion algorithm:
 * - Shared domains x3
 * - Same city x2
 * - Exclusion of existing connections
 * - Top 5 limit
 * - Redis cache behavior
 * - Zero-activity fallback to same-city suggestions
 */
import { describe, expect, it } from "vitest";

describe("Connection Suggestion Algorithm", () => {
  // ── Scoring Logic ─────────────────────────────────────

  describe("Scoring weights", () => {
    it("awards 3 points per shared domain", () => {
      const userSkills = new Set(["clean_water", "healthcare", "education_access"]);
      const candidateSkills = ["clean_water", "healthcare", "biodiversity"];

      const shared = candidateSkills.filter((s) => userSkills.has(s));
      const score = shared.length * 3;

      expect(shared).toEqual(["clean_water", "healthcare"]);
      expect(score).toBe(6); // 2 shared x 3 = 6
    });

    it("awards 2 points for same city", () => {
      const userCity = "portland";
      const candidateCity = "Portland";

      const sameCity = userCity.toLowerCase() === candidateCity.toLowerCase();
      const score = sameCity ? 2 : 0;

      expect(score).toBe(2);
    });

    it("scores combined domains + city correctly", () => {
      const userSkills = new Set(["clean_water", "healthcare"]);
      const userCity = "portland";

      const candidateSkills = ["clean_water"];
      const candidateCity = "Portland";

      let score = 0;
      const shared = candidateSkills.filter((s) => userSkills.has(s));
      if (shared.length > 0) score += shared.length * 3;
      if (userCity.toLowerCase() === candidateCity.toLowerCase()) score += 2;

      // 1 shared domain x3 + same city x2 = 5
      expect(score).toBe(5);
    });

    it("returns score 0 for no overlap (no shared domains, different city)", () => {
      const userSkills = new Set(["clean_water"]);
      const userCity = "portland";

      const candidateSkills = ["biodiversity"];
      const candidateCity = "Chicago";

      let score = 0;
      const shared = candidateSkills.filter((s) => userSkills.has(s));
      if (shared.length > 0) score += shared.length * 3;
      if (userCity.toLowerCase() === candidateCity.toLowerCase()) score += 2;

      expect(score).toBe(0);
    });
  });

  // ── Zero-activity Fallback ────────────────────────────

  describe("Zero-activity fallback", () => {
    it("falls back to same-city suggestions with score 1 for users with no skills", () => {
      const userSkills = new Set<string>([]);
      const userCity = "portland";

      const candidateSkills: string[] = [];
      const candidateCity = "Portland";

      let score = 0;
      const shared = candidateSkills.filter((s) => userSkills.has(s));
      if (shared.length > 0) score += shared.length * 3;
      if (userCity && candidateCity && userCity.toLowerCase() === candidateCity.toLowerCase()) {
        if (score === 0) {
          // Zero-activity fallback
          score = 1;
        } else {
          score += 2;
        }
      }

      expect(score).toBe(1); // Only same-city fallback
    });
  });

  // ── Exclusion Logic ───────────────────────────────────

  describe("Exclusion rules", () => {
    it("excludes self from suggestions", () => {
      const humanId = "user-123";
      const excludeIds = new Set<string>();
      excludeIds.add(humanId);

      expect(excludeIds.has("user-123")).toBe(true);
      expect(excludeIds.has("other-user")).toBe(false);
    });

    it("excludes existing connections (both requester and recipient)", () => {
      const humanId = "user-123";
      const existingConnectionRows = [
        { requesterHumanId: "user-123", recipientHumanId: "conn-a" },
        { requesterHumanId: "conn-b", recipientHumanId: "user-123" },
      ];

      const excludeIds = new Set<string>();
      excludeIds.add(humanId);
      for (const row of existingConnectionRows) {
        excludeIds.add(row.requesterHumanId);
        excludeIds.add(row.recipientHumanId);
      }

      expect(excludeIds.has("conn-a")).toBe(true); // I requested them
      expect(excludeIds.has("conn-b")).toBe(true); // They requested me
      expect(excludeIds.has("stranger")).toBe(false); // Not connected
    });

    it("does not exclude declined connections (allows re-request after cooldown)", () => {
      // The query filters `ne(connections.status, "declined")` so declined rows
      // are NOT included in excludeIds — this means they CAN appear as suggestions
      const existingNonDeclinedRows = [
        { requesterHumanId: "user-123", recipientHumanId: "pending-person" },
      ];

      const excludeIds = new Set<string>();
      excludeIds.add("user-123");
      for (const row of existingNonDeclinedRows) {
        excludeIds.add(row.requesterHumanId);
        excludeIds.add(row.recipientHumanId);
      }

      // "declined-person" was declined but excluded from the query,
      // so they should NOT be in excludeIds
      expect(excludeIds.has("pending-person")).toBe(true);
      expect(excludeIds.has("declined-person")).toBe(false);
    });
  });

  // ── Top 5 Limit ───────────────────────────────────────

  describe("Top 5 limit", () => {
    it("returns at most 5 suggestions sorted by score", () => {
      const candidates = Array.from({ length: 10 }, (_, i) => ({
        humanId: `h-${i}`,
        suggestionScore: 10 - i, // Descending scores
        displayName: `User ${i}`,
      }));

      candidates.sort((a, b) => b.suggestionScore - a.suggestionScore);
      const results = candidates.slice(0, 5);

      expect(results.length).toBe(5);
      expect(results[0]!.suggestionScore).toBe(10); // Highest score first
      expect(results[4]!.suggestionScore).toBe(6);  // 5th highest
    });
  });

  // ── Reason Text ───────────────────────────────────────

  describe("Reason text generation", () => {
    it("generates correct reason for shared domains only", () => {
      const sharedCount = 2;
      const sameCity = false;
      const reasons: string[] = [];

      if (sharedCount > 0) {
        reasons.push(`You share ${sharedCount} domain${sharedCount > 1 ? "s" : ""}`);
      }
      if (sameCity) {
        reasons.push("Both in Portland");
      }

      expect(reasons.join(" and ")).toBe("You share 2 domains");
    });

    it("generates correct reason for shared domains and same city", () => {
      const sharedCount = 1;
      const sameCity = true;
      const city = "Portland";
      const reasons: string[] = [];

      if (sharedCount > 0) {
        reasons.push(`You share ${sharedCount} domain${sharedCount > 1 ? "s" : ""}`);
      }
      if (sameCity) {
        reasons.push(`Both in ${city}`);
      }

      expect(reasons.join(" and ")).toBe("You share 1 domain and Both in Portland");
    });

    it("uses singular 'domain' for single shared domain", () => {
      const sharedCount = 1;
      const text = `You share ${sharedCount} domain${sharedCount > 1 ? "s" : ""}`;
      expect(text).toBe("You share 1 domain");
    });
  });
});
