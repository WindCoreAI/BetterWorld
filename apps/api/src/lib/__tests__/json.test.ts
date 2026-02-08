import { describe, it, expect } from "vitest";

import { safeJsonParse } from "../json";

describe("safeJsonParse", () => {
  it("should parse valid JSON string", () => {
    expect(safeJsonParse('{"key":"value"}', {})).toEqual({ key: "value" });
  });

  it("should parse valid JSON array", () => {
    expect(safeJsonParse("[1,2,3]", [])).toEqual([1, 2, 3]);
  });

  it("should parse valid JSON number", () => {
    expect(safeJsonParse("42", 0)).toBe(42);
  });

  it("should parse valid JSON boolean", () => {
    expect(safeJsonParse("true", false)).toBe(true);
  });

  it("should parse valid JSON null", () => {
    expect(safeJsonParse("null", "fallback")).toBeNull();
  });

  it("should return fallback for invalid JSON", () => {
    expect(safeJsonParse("not-json", "fallback")).toBe("fallback");
  });

  it("should return fallback for empty string", () => {
    expect(safeJsonParse("", {})).toEqual({});
  });

  it("should return fallback for truncated JSON", () => {
    const fallback = { passed: false, forbiddenPatterns: [] };
    expect(safeJsonParse('{"passed": true, "forbid', fallback)).toEqual(fallback);
  });

  it("should return fallback for undefined-like string", () => {
    expect(safeJsonParse("undefined", null)).toBeNull();
  });

  it("should handle nested objects", () => {
    const json = '{"a":{"b":{"c":1}}}';
    expect(safeJsonParse(json, {})).toEqual({ a: { b: { c: 1 } } });
  });

  it("should handle Layer A result shape (real usage)", () => {
    const stored = '{"passed":true,"forbiddenPatterns":[],"executionTimeMs":2}';
    const fallback = { passed: false, forbiddenPatterns: [], executionTimeMs: 0 };
    const result = safeJsonParse(stored, fallback);
    expect(result).toEqual({ passed: true, forbiddenPatterns: [], executionTimeMs: 2 });
  });

  it("should handle Layer B result shape (real usage)", () => {
    const stored = '{"score":0.85,"decision":"approved","reasoning":"Safe content"}';
    const fallback = { score: 0, decision: "unknown", reasoning: "" };
    const result = safeJsonParse(stored, fallback);
    expect(result.score).toBe(0.85);
    expect(result.decision).toBe("approved");
  });

  it("should return object fallback for corrupted stored data", () => {
    const fallback = { passed: false, forbiddenPatterns: [], executionTimeMs: 0 };
    expect(safeJsonParse("corrupted-db-data", fallback)).toEqual(fallback);
  });

  it("should handle JSON with unicode characters", () => {
    expect(safeJsonParse('{"name":"测试"}', {})).toEqual({ name: "测试" });
  });

  it("should handle JSON with escaped characters", () => {
    expect(safeJsonParse('{"msg":"line1\\nline2"}', {})).toEqual({ msg: "line1\nline2" });
  });
});
