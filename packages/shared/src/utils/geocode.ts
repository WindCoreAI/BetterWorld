/**
 * Geocoding Utility (Sprint 6)
 *
 * Uses Nominatim (OpenStreetMap) for geocoding with Redis caching and privacy-preserving grid snapping.
 * Based on research in specs/007-human-onboarding/research.md
 */

import crypto from "crypto";

import { z } from "zod";

export interface GeocodeResult {
  lat: number; // Snapped to 1km grid for privacy
  lng: number; // Snapped to 1km grid for privacy
  displayName: string;
}

/** Logger interface for geocoding operations */
export interface GeocodeLogger {
  error(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
}

const noopLogger: GeocodeLogger = {
  error() {},
  warn() {},
};

/** Zod schema for Nominatim API response validation */
const NominatimResultSchema = z.array(
  z.object({
    lat: z.string(),
    lon: z.string(),
    display_name: z.string(),
  }),
);

/**
 * Geocode a location string (city, country) into lat/lng coordinates
 *
 * @param city - City name (e.g., "Jakarta")
 * @param country - Country name (e.g., "Indonesia")
 * @param redisGet - Redis GET function (optional, for caching)
 * @param redisSetEx - Redis SETEX function (optional, for caching)
 * @param logger - Logger instance (optional, defaults to no-op)
 * @returns GeocodeResult or null if geocoding fails
 */
export async function geocodeLocation(
  city: string,
  country: string,
  redisGet?: (key: string) => Promise<string | null>,
  redisSetEx?: (key: string, ttl: number, value: string) => Promise<unknown>,
  logger: GeocodeLogger = noopLogger,
): Promise<GeocodeResult | null> {
  const cacheKey = `geocode:${crypto
    .createHash("sha256")
    .update(`${city},${country}`)
    .digest("hex")}`;

  // Check Redis cache if available
  if (redisGet) {
    const cached = await redisGet(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  }

  // Call Nominatim API
  const query = encodeURIComponent(`${city}, ${country}`);
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          process.env.GEOCODING_USER_AGENT || "BetterWorld/1.0 Dev",
      },
    });

    if (!response.ok) {
      logger.error(`Geocoding API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const json = await response.json();
    const parsed = NominatimResultSchema.safeParse(json);
    if (!parsed.success) {
      logger.warn(`Geocoding returned invalid response for: ${city}, ${country}`);
      return null;
    }

    const results = parsed.data;
    if (results.length === 0) {
      logger.warn(`Geocoding returned no results for: ${city}, ${country}`);
      return null;
    }

    const { lat, lon, display_name } = results[0]!;

    // Grid snapping for privacy (1km precision)
    const snappedLat = Math.round(parseFloat(lat) * 100) / 100;
    const snappedLng = Math.round(parseFloat(lon) * 100) / 100;

    const result: GeocodeResult = {
      lat: snappedLat,
      lng: snappedLng,
      displayName: display_name,
    };

    // Cache for 30 days if Redis is available
    if (redisSetEx) {
      const ttl = parseInt(process.env.GEOCODING_CACHE_TTL || "2592000", 10); // 30 days
      await redisSetEx(cacheKey, ttl, JSON.stringify(result));
    }

    return result;
  } catch (error) {
    logger.error("Geocoding failed:", error);
    return null;
  }
}

/**
 * Create PostGIS POINT from lat/lng for database storage
 *
 * @param lat - Latitude
 * @param lng - Longitude
 * @returns PostGIS POINT string (e.g., "POINT(106.85 -6.21)")
 */
export function createPostGISPoint(lat: number, lng: number): string {
  return `POINT(${lng} ${lat})`; // PostGIS uses (lng, lat) order
}

/**
 * Parse a PostGIS POINT WKT string into lat/lng coordinates
 *
 * @param wkt - PostGIS POINT string (e.g., "POINT(106.85 -6.21)")
 * @returns { lat, lng } or null if parsing fails
 */
export function parsePostGISPoint(wkt: string): { lat: number; lng: number } | null {
  const match = wkt.match(/POINT\(([^ ]+) ([^ ]+)\)/);
  if (!match?.[1] || !match[2]) return null;
  return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
}
