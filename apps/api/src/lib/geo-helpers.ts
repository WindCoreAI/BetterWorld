/**
 * Geo-helpers for mission marketplace (Sprint 7)
 *
 * - snapToGrid: Privacy-preserving coordinate rounding (1km grid)
 * - getDynamicRadius: Population-density-aware radius via Nominatim + Redis cache
 * - buildGeoQuery: Raw SQL for PostGIS ST_DWithin queries
 */

import { sql } from "drizzle-orm";
import type Redis from "ioredis";

import { logger } from "../middleware/logger.js";

/**
 * Snap coordinates to a grid for privacy (default ~1km precision).
 * Rounds to 2 decimal places (~1.1km at equator).
 */
export function snapToGrid(
  lat: number,
  lng: number,
  precision = 2,
): { latitude: number; longitude: number } {
  const factor = Math.pow(10, precision);
  return {
    latitude: Math.round(lat * factor) / factor,
    longitude: Math.round(lng * factor) / factor,
  };
}

/**
 * Determine dynamic search radius based on population density.
 * Uses Nominatim reverse geocoding with Redis cache (30-day TTL).
 *
 * place_rank thresholds:
 * - <= 16 (city/town): Urban → 10km
 * - 17-19 (suburb/village): Suburban → 25km
 * - >= 20 (hamlet/isolated): Rural → 50km
 */
export async function getDynamicRadius(
  lat: number,
  lng: number,
  redis: Redis | null,
): Promise<number> {
  // Round to 0.01° (~1.1km) for cache key
  const gridLat = Math.round(lat * 100) / 100;
  const gridLng = Math.round(lng * 100) / 100;
  const cacheKey = `geo:radius:${gridLat}:${gridLng}`;

  // Check cache
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return parseInt(cached, 10);
      }
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : "Unknown" },
        "Redis cache read failed for dynamic radius",
      );
    }
  }

  // Query Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${gridLat}&lon=${gridLng}&zoom=10`;
    const response = await fetch(url, {
      headers: { "User-Agent": "BetterWorld/1.0 (social-good-platform)" },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return 25; // Default to suburban
    }

    const data = (await response.json()) as { place_rank?: number };
    const placeRank = data.place_rank ?? 20;

    let radius: number;
    if (placeRank <= 16) {
      radius = 10; // Urban
    } else if (placeRank <= 19) {
      radius = 25; // Suburban
    } else {
      radius = 50; // Rural
    }

    // Cache for 30 days
    if (redis) {
      try {
        await redis.setex(cacheKey, 30 * 24 * 60 * 60, radius.toString());
      } catch {
        // Non-fatal
      }
    }

    return radius;
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : "Unknown", lat: gridLat, lng: gridLng },
      "Nominatim reverse geocoding failed, using default radius",
    );
    return 25; // Default to suburban
  }
}

/**
 * Build raw SQL fragment for PostGIS ST_DWithin geo-filtering.
 * Requires the `location` geography column on missions table.
 *
 * @param lat Center latitude
 * @param lng Center longitude
 * @param radiusKm Radius in kilometers
 * @returns Drizzle SQL fragment for WHERE clause
 */
export function buildGeoQuery(lat: number, lng: number, radiusKm: number) {
  const radiusMeters = radiusKm * 1000;
  return sql`ST_DWithin(
    location,
    ST_MakePoint(${lng}, ${lat})::geography,
    ${radiusMeters}
  )`;
}

/**
 * Calculate distance in kilometers between a mission's location and a point.
 * Returns a Drizzle SQL fragment for SELECT.
 */
export function buildDistanceSelect(lat: number, lng: number) {
  return sql<number>`ROUND(
    ST_Distance(
      location,
      ST_MakePoint(${lng}, ${lat})::geography
    ) / 1000.0, 1
  )`;
}
