import { describe, it, expect } from "vitest";

import { shouldRouteToPerConsensus } from "../../lib/traffic-hash.js";

describe("shouldRouteToPerConsensus", () => {
  it("returns false when trafficPct is 0", () => {
    expect(shouldRouteToPerConsensus("test-uuid-1", 0)).toBe(false);
    expect(shouldRouteToPerConsensus("test-uuid-2", 0)).toBe(false);
  });

  it("returns true when trafficPct is 100", () => {
    expect(shouldRouteToPerConsensus("test-uuid-1", 100)).toBe(true);
    expect(shouldRouteToPerConsensus("test-uuid-2", 100)).toBe(true);
  });

  it("is deterministic — same input always produces same output", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const result1 = shouldRouteToPerConsensus(id, 50);
    const result2 = shouldRouteToPerConsensus(id, 50);
    const result3 = shouldRouteToPerConsensus(id, 50);
    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });

  it("produces roughly uniform distribution", () => {
    // Generate 1000 UUIDs and check that ~50% route to peer at 50%
    let peerCount = 0;
    const total = 1000;

    for (let i = 0; i < total; i++) {
      const id = `test-uuid-${i}-${Math.random().toString(36).substring(2)}`;
      if (shouldRouteToPerConsensus(id, 50)) {
        peerCount++;
      }
    }

    // With 1000 samples at 50%, expect 400-600 (allowing 10% margin)
    expect(peerCount).toBeGreaterThan(350);
    expect(peerCount).toBeLessThan(650);
  });

  it("routes more submissions at higher percentages", () => {
    const ids = Array.from({ length: 500 }, (_, i) => `dist-test-${i}`);

    const count10 = ids.filter((id) => shouldRouteToPerConsensus(id, 10)).length;
    const count50 = ids.filter((id) => shouldRouteToPerConsensus(id, 50)).length;
    const count90 = ids.filter((id) => shouldRouteToPerConsensus(id, 90)).length;

    expect(count10).toBeLessThan(count50);
    expect(count50).toBeLessThan(count90);
  });

  it("handles boundary values correctly", () => {
    // At 1%, very few should route
    const ids = Array.from({ length: 200 }, (_, i) => `boundary-${i}`);
    const count1 = ids.filter((id) => shouldRouteToPerConsensus(id, 1)).length;
    expect(count1).toBeLessThan(20); // Expect roughly 2 at 1%

    // At 99%, almost all should route
    const count99 = ids.filter((id) => shouldRouteToPerConsensus(id, 99)).length;
    expect(count99).toBeGreaterThan(180);
  });

  it("returns false for negative trafficPct", () => {
    expect(shouldRouteToPerConsensus("any-id", -1)).toBe(false);
    expect(shouldRouteToPerConsensus("any-id", -100)).toBe(false);
  });

  it("returns true for trafficPct over 100", () => {
    expect(shouldRouteToPerConsensus("any-id", 101)).toBe(true);
    expect(shouldRouteToPerConsensus("any-id", 200)).toBe(true);
  });
});
