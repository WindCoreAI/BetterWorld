import { describe, expect, it } from "vitest";

import {
  calculateProfileCompleteness,
  type ProfileInput,
} from "../profileCompleteness.js";

function makeProfile(overrides: Partial<ProfileInput> = {}): ProfileInput {
  return {
    skills: [],
    city: null,
    country: null,
    latitude: null,
    longitude: null,
    languages: [],
    availability: null,
    bio: null,
    avatarUrl: null,
    walletAddress: null,
    certifications: null,
    ...overrides,
  };
}

describe("calculateProfileCompleteness", () => {
  describe("empty profile", () => {
    it("returns 0 for a completely empty profile", () => {
      const result = calculateProfileCompleteness(makeProfile());
      expect(result.score).toBe(0);
    });

    it("returns 8 suggestions (capped to 3)", () => {
      const result = calculateProfileCompleteness(makeProfile());
      expect(result.suggestions).toHaveLength(3);
    });
  });

  describe("full profile", () => {
    it("returns 100 for a fully complete profile", () => {
      const result = calculateProfileCompleteness(
        makeProfile({
          skills: ["typescript"],
          city: "Jakarta",
          country: "Indonesia",
          latitude: -6.21,
          longitude: 106.85,
          languages: ["en"],
          availability: { weekdays: ["9-17"] },
          bio: "I build things",
          avatarUrl: "https://example.com/avatar.png",
          walletAddress: "0xabc",
          certifications: ["AWS"],
        }),
      );
      expect(result.score).toBe(100);
      expect(result.suggestions).toHaveLength(0);
    });
  });

  describe("skills (20 points)", () => {
    it("awards 20 points for non-empty skills", () => {
      const result = calculateProfileCompleteness(makeProfile({ skills: ["ts"] }));
      expect(result.breakdown.skills).toEqual({ complete: true, points: 20 });
    });

    it("awards 0 points for empty skills array", () => {
      const result = calculateProfileCompleteness(makeProfile({ skills: [] }));
      expect(result.breakdown.skills).toEqual({ complete: false, points: 0 });
    });
  });

  describe("location (20 points)", () => {
    it("awards 20 points for complete location", () => {
      const result = calculateProfileCompleteness(
        makeProfile({ city: "Jakarta", latitude: -6.21, longitude: 106.85 }),
      );
      expect(result.breakdown.location).toEqual({ complete: true, points: 20 });
    });

    it("awards 0 when city is missing", () => {
      const result = calculateProfileCompleteness(
        makeProfile({ latitude: -6.21, longitude: 106.85 }),
      );
      expect(result.breakdown.location).toEqual({ complete: false, points: 0 });
    });

    it("awards 0 when coordinates are missing", () => {
      const result = calculateProfileCompleteness(makeProfile({ city: "Jakarta" }));
      expect(result.breakdown.location).toEqual({ complete: false, points: 0 });
    });

    it("rejects null island (0,0) coordinates", () => {
      const result = calculateProfileCompleteness(
        makeProfile({ city: "Nowhere", latitude: 0, longitude: 0 }),
      );
      expect(result.breakdown.location).toEqual({ complete: false, points: 0 });
    });

    it("awards 0 when city is whitespace-only", () => {
      const result = calculateProfileCompleteness(
        makeProfile({ city: "   ", latitude: -6.21, longitude: 106.85 }),
      );
      expect(result.breakdown.location).toEqual({ complete: false, points: 0 });
    });
  });

  describe("languages (10 points)", () => {
    it("awards 10 points for non-empty languages", () => {
      const result = calculateProfileCompleteness(makeProfile({ languages: ["en"] }));
      expect(result.breakdown.languages).toEqual({ complete: true, points: 10 });
    });

    it("awards 0 for empty languages", () => {
      const result = calculateProfileCompleteness(makeProfile({ languages: [] }));
      expect(result.breakdown.languages).toEqual({ complete: false, points: 0 });
    });
  });

  describe("availability (20 points)", () => {
    it("awards 20 points for availability with weekdays", () => {
      const result = calculateProfileCompleteness(
        makeProfile({ availability: { weekdays: ["9-17"] } }),
      );
      expect(result.breakdown.availability).toEqual({ complete: true, points: 20 });
    });

    it("awards 20 points for availability with timezone only", () => {
      const result = calculateProfileCompleteness(
        makeProfile({ availability: { timezone: "Asia/Jakarta" } }),
      );
      expect(result.breakdown.availability).toEqual({ complete: true, points: 20 });
    });

    it("awards 0 for null availability", () => {
      const result = calculateProfileCompleteness(makeProfile({ availability: null }));
      expect(result.breakdown.availability).toEqual({ complete: false, points: 0 });
    });

    it("awards 0 for empty availability object", () => {
      const result = calculateProfileCompleteness(makeProfile({ availability: {} }));
      expect(result.breakdown.availability).toEqual({ complete: false, points: 0 });
    });
  });

  describe("bio (10 points)", () => {
    it("awards 10 points for non-empty bio", () => {
      const result = calculateProfileCompleteness(makeProfile({ bio: "Hello" }));
      expect(result.breakdown.bio).toEqual({ complete: true, points: 10 });
    });

    it("awards 0 for whitespace-only bio", () => {
      const result = calculateProfileCompleteness(makeProfile({ bio: "   " }));
      expect(result.breakdown.bio).toEqual({ complete: false, points: 0 });
    });
  });

  describe("avatar (5 points)", () => {
    it("awards 5 points for avatar URL", () => {
      const result = calculateProfileCompleteness(
        makeProfile({ avatarUrl: "https://example.com/img.png" }),
      );
      expect(result.breakdown.avatar).toEqual({ complete: true, points: 5 });
    });
  });

  describe("wallet (10 points)", () => {
    it("awards 10 points for wallet address", () => {
      const result = calculateProfileCompleteness(
        makeProfile({ walletAddress: "0xabc" }),
      );
      expect(result.breakdown.wallet).toEqual({ complete: true, points: 10 });
    });
  });

  describe("certifications (5 points)", () => {
    it("awards 5 points for non-empty certifications", () => {
      const result = calculateProfileCompleteness(
        makeProfile({ certifications: ["AWS"] }),
      );
      expect(result.breakdown.certifications).toEqual({ complete: true, points: 5 });
    });

    it("awards 0 for empty certifications", () => {
      const result = calculateProfileCompleteness(
        makeProfile({ certifications: [] }),
      );
      expect(result.breakdown.certifications).toEqual({ complete: false, points: 0 });
    });
  });

  describe("scoring arithmetic", () => {
    it("sums points correctly for partial profile", () => {
      // skills (20) + languages (10) + bio (10) = 40
      const result = calculateProfileCompleteness(
        makeProfile({
          skills: ["ts"],
          languages: ["en"],
          bio: "Hello",
        }),
      );
      expect(result.score).toBe(40);
    });

    it("suggestions are prioritized by weight (location > skills > availability first)", () => {
      const result = calculateProfileCompleteness(makeProfile());
      // First 3 suggestions should cover the 3 highest-weight missing items
      expect(result.suggestions[0]).toContain("location");
      expect(result.suggestions[1]).toContain("skills");
      expect(result.suggestions[2]).toContain("availability");
    });
  });
});
