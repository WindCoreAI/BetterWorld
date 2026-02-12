import { describe, it, expect, vi, beforeEach } from "vitest";

import { shouldRouteToPerConsensus } from "../../lib/traffic-hash.js";
import { routeSubmission } from "../../services/traffic-router.js";

// ── Mock feature flags ──────────────────────────────────────────

let mockTrafficPct = 0;

vi.mock("../../services/feature-flags.js", () => ({
  getFlag: vi.fn(async (_redis: unknown, name: string) => {
    if (name === "PEER_VALIDATION_TRAFFIC_PCT") return mockTrafficPct;
    return 0;
  }),
  getFeatureFlags: vi.fn(),
  setFlag: vi.fn(),
  resetFlag: vi.fn(),
  invalidateFlagCache: vi.fn(),
}));

// ── Tests ────────────────────────────────────────────────────────

describe("Traffic Routing Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTrafficPct = 0;
  });

  describe("routeSubmission", () => {
    it("routes all traffic to Layer B when traffic pct is 0", async () => {
      mockTrafficPct = 0;
      const results = await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          routeSubmission(`sub-${i}`, "verified", null),
        ),
      );

      expect(results.every((r) => r.route === "layer_b")).toBe(true);
      expect(results[0]!.trafficPct).toBe(0);
    });

    it("routes new-tier agents to Layer B regardless of traffic pct", async () => {
      mockTrafficPct = 100;
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          routeSubmission(`new-agent-sub-${i}`, "new", null),
        ),
      );

      expect(results.every((r) => r.route === "layer_b")).toBe(true);
      expect(results[0]!.reason).toContain("new-tier");
    });

    it("routes ~10% of verified submissions at 10% traffic", async () => {
      mockTrafficPct = 10;
      const total = 200;
      const results = await Promise.all(
        Array.from({ length: total }, (_, i) =>
          routeSubmission(`ten-pct-${i}`, "verified", null),
        ),
      );

      const peerCount = results.filter((r) => r.route === "peer_consensus").length;
      // 10% of 200 = 20, allow 5-40 (generous margin for hash distribution)
      expect(peerCount).toBeGreaterThan(5);
      expect(peerCount).toBeLessThan(50);
    });

    it("routes all verified submissions at 100% traffic", async () => {
      mockTrafficPct = 100;
      const results = await Promise.all(
        Array.from({ length: 30 }, (_, i) =>
          routeSubmission(`full-${i}`, "verified", null),
        ),
      );

      expect(results.every((r) => r.route === "peer_consensus")).toBe(true);
    });

    it("is deterministic — same submission always routes the same way", async () => {
      mockTrafficPct = 50;
      const subId = "determinism-test-uuid";
      const r1 = await routeSubmission(subId, "verified", null);
      const r2 = await routeSubmission(subId, "verified", null);
      const r3 = await routeSubmission(subId, "verified", null);

      expect(r1.route).toBe(r2.route);
      expect(r2.route).toBe(r3.route);
    });
  });

  describe("rollback to 0%", () => {
    it("instantly switches all traffic to Layer B when set to 0%", async () => {
      // First at 50%
      mockTrafficPct = 50;
      const beforeRollback = await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          routeSubmission(`rollback-${i}`, "verified", null),
        ),
      );
      const peerBefore = beforeRollback.filter((r) => r.route === "peer_consensus").length;
      expect(peerBefore).toBeGreaterThan(20); // Sanity: some were going to peer

      // Rollback to 0%
      mockTrafficPct = 0;
      const afterRollback = await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          routeSubmission(`rollback-${i}`, "verified", null),
        ),
      );

      expect(afterRollback.every((r) => r.route === "layer_b")).toBe(true);
    });
  });

  describe("hash function consistency", () => {
    it("shouldRouteToPerConsensus is consistent with routeSubmission", async () => {
      mockTrafficPct = 50;
      const subId = "hash-consistency-test";
      const routeResult = await routeSubmission(subId, "verified", null);
      const hashResult = shouldRouteToPerConsensus(subId, 50);

      if (routeResult.route === "peer_consensus") {
        expect(hashResult).toBe(true);
      } else {
        expect(hashResult).toBe(false);
      }
    });
  });
});
