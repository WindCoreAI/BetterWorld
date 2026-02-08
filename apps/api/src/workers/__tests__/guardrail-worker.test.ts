import { describe, it, expect } from "vitest";

import { createMetrics } from "../guardrail-worker";

describe("Guardrail Worker", () => {
  describe("createMetrics", () => {
    it("should return a metrics object with all counters at zero", () => {
      const metrics = createMetrics();
      expect(metrics.jobsCompleted).toBe(0);
      expect(metrics.jobsFailed).toBe(0);
      expect(metrics.jobsDeadLettered).toBe(0);
      expect(metrics.totalProcessingTimeMs).toBe(0);
      expect(metrics.cacheHits).toBe(0);
      expect(metrics.layerARejections).toBe(0);
    });

    it("should set startedAt to approximately now", () => {
      const before = Date.now();
      const metrics = createMetrics();
      const after = Date.now();
      expect(metrics.startedAt).toBeGreaterThanOrEqual(before);
      expect(metrics.startedAt).toBeLessThanOrEqual(after);
    });

    it("should return a fresh object each call (no shared state)", () => {
      const m1 = createMetrics();
      const m2 = createMetrics();
      expect(m1).not.toBe(m2);
      m1.jobsCompleted = 10;
      expect(m2.jobsCompleted).toBe(0);
    });

    it("should have all expected keys", () => {
      const metrics = createMetrics();
      const keys = Object.keys(metrics).sort();
      expect(keys).toEqual([
        "cacheHits",
        "jobsCompleted",
        "jobsDeadLettered",
        "jobsFailed",
        "layerARejections",
        "startedAt",
        "totalProcessingTimeMs",
      ]);
    });
  });
});
