import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPostGISPoint,
  geocodeLocation,
  parsePostGISPoint,
  type GeocodeLogger,
} from "../geocode.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function nominatimResponse(lat: string, lon: string, name: string) {
  return [{ lat, lon, display_name: name }];
}

function makeMockLogger(): GeocodeLogger & { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  return {
    errors,
    warnings,
    error(msg: string) { errors.push(msg); },
    warn(msg: string) { warnings.push(msg); },
  };
}

describe("geocodeLocation", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns geocoded result with grid-snapped coordinates", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => nominatimResponse("-6.2088", "106.8456", "Jakarta, Indonesia"),
    });

    const result = await geocodeLocation("Jakarta", "Indonesia");

    expect(result).not.toBeNull();
    // Grid-snapped to 2 decimal places (1km precision)
    expect(result!.lat).toBe(-6.21);
    expect(result!.lng).toBe(106.85);
    expect(result!.displayName).toBe("Jakarta, Indonesia");
  });

  it("uses cache when available", async () => {
    const cachedResult = { lat: -6.21, lng: 106.85, displayName: "Jakarta, Indonesia" };
    const redisGet = vi.fn().mockResolvedValue(JSON.stringify(cachedResult));
    const redisSetEx = vi.fn();

    const result = await geocodeLocation("Jakarta", "Indonesia", redisGet, redisSetEx);

    expect(result).toEqual(cachedResult);
    expect(redisGet).toHaveBeenCalledOnce();
    expect(mockFetch).not.toHaveBeenCalled(); // Cache hit — no API call
  });

  it("fetches from API and caches on cache miss", async () => {
    const redisGet = vi.fn().mockResolvedValue(null); // Cache miss
    const redisSetEx = vi.fn();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => nominatimResponse("-6.2088", "106.8456", "Jakarta, Indonesia"),
    });

    const result = await geocodeLocation("Jakarta", "Indonesia", redisGet, redisSetEx);

    expect(result).not.toBeNull();
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(redisSetEx).toHaveBeenCalledOnce();
    // Default TTL is 30 days (2592000 seconds)
    expect(redisSetEx.mock.calls[0]![1]).toBe(2592000);
  });

  it("returns null on API error", async () => {
    const logger = makeMockLogger();
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error" });

    const result = await geocodeLocation("Invalid", "Place", undefined, undefined, logger);

    expect(result).toBeNull();
    expect(logger.errors).toHaveLength(1);
    expect(logger.errors[0]).toContain("500");
  });

  it("returns null when API returns empty results", async () => {
    const logger = makeMockLogger();
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });

    const result = await geocodeLocation("Nonexistent", "Place", undefined, undefined, logger);

    expect(result).toBeNull();
    expect(logger.warnings).toHaveLength(1);
    expect(logger.warnings[0]).toContain("no results");
  });

  it("returns null on invalid API response shape", async () => {
    const logger = makeMockLogger();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ invalid: "shape" }],
    });

    const result = await geocodeLocation("Jakarta", "Indonesia", undefined, undefined, logger);

    expect(result).toBeNull();
    expect(logger.warnings).toHaveLength(1);
    expect(logger.warnings[0]).toContain("invalid response");
  });

  it("returns null on network error", async () => {
    const logger = makeMockLogger();
    mockFetch.mockRejectedValue(new Error("Network failure"));

    const result = await geocodeLocation("Jakarta", "Indonesia", undefined, undefined, logger);

    expect(result).toBeNull();
    expect(logger.errors).toHaveLength(1);
  });

  it("encodes city and country in the query URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => nominatimResponse("48.8566", "2.3522", "Paris, France"),
    });

    await geocodeLocation("São Paulo", "Brazil");

    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain(encodeURIComponent("São Paulo, Brazil"));
  });
});

describe("createPostGISPoint", () => {
  it("creates POINT(lng lat) string", () => {
    expect(createPostGISPoint(-6.21, 106.85)).toBe("POINT(106.85 -6.21)");
  });

  it("handles negative coordinates", () => {
    expect(createPostGISPoint(-33.87, -151.21)).toBe("POINT(-151.21 -33.87)");
  });
});

describe("parsePostGISPoint", () => {
  it("parses POINT(lng lat) into { lat, lng }", () => {
    expect(parsePostGISPoint("POINT(106.85 -6.21)")).toEqual({
      lat: -6.21,
      lng: 106.85,
    });
  });

  it("returns null for invalid WKT", () => {
    expect(parsePostGISPoint("INVALID")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parsePostGISPoint("")).toBeNull();
  });

  it("roundtrips with createPostGISPoint", () => {
    const point = createPostGISPoint(-6.21, 106.85);
    const parsed = parsePostGISPoint(point);
    expect(parsed).toEqual({ lat: -6.21, lng: 106.85 });
  });
});
