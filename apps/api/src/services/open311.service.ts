/**
 * Open311 GeoReport v2 client service (Sprint 10)
 *
 * Generic client for Open311 API + per-city transform logic.
 */
import {
  SYSTEM_MUNICIPAL_AGENT_ID,
  open311ServiceRequestSchema,
} from "@betterworld/shared";
import type { Open311ServiceRequest, CityConfig } from "@betterworld/shared";
import type Redis from "ioredis";

import { logger } from "../middleware/logger.js";

export class Open311Client {
  /**
   * Fetch service requests from an Open311 endpoint.
   */
  async fetchRequests(
    endpoint: string,
    params: {
      start_date?: string;
      end_date?: string;
      status?: string;
      service_code?: string;
    } = {},
    apiKey?: string,
  ): Promise<Open311ServiceRequest[]> {
    const url = new URL(`${endpoint}/requests.json`);

    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
    }
    if (apiKey) url.searchParams.set("api_key", apiKey);

    try {
      const response = await fetch(url.toString(), {
        headers: { "User-Agent": "BetterWorld/1.0 (social-good-platform)" },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        logger.warn(
          { status: response.status, endpoint },
          "Open311 API request failed",
        );
        return [];
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        logger.warn({ endpoint }, "Open311 API returned non-array response");
        return [];
      }

      // Validate each record, skip malformed
      const valid: Open311ServiceRequest[] = [];
      for (const item of data) {
        const result = open311ServiceRequestSchema.safeParse(item);
        if (result.success) {
          valid.push(result.data);
        } else {
          logger.warn(
            { errors: result.error.flatten(), item },
            "Skipping malformed Open311 record",
          );
        }
      }

      return valid;
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : "Unknown", endpoint },
        "Open311 API fetch error",
      );
      throw err;
    }
  }

  /**
   * Fetch available services from an Open311 endpoint.
   */
  async fetchServices(endpoint: string, apiKey?: string) {
    const url = new URL(`${endpoint}/services.json`);
    if (apiKey) url.searchParams.set("api_key", apiKey);

    const response = await fetch(url.toString(), {
      headers: { "User-Agent": "BetterWorld/1.0 (social-good-platform)" },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Open311 services fetch failed: ${response.status}`);
    }

    return response.json();
  }
}

/**
 * Transform an Open311 service request into a platform problem shape.
 */
export function transformRequestToProblem(
  request: Open311ServiceRequest,
  cityConfig: CityConfig,
): {
  title: string;
  description: string;
  domain: string;
  severity: string;
  latitude: string | null;
  longitude: string | null;
  address: string | null;
  municipalSourceId: string;
  municipalSourceType: string;
  reportedByAgentId: string;
  geographicScope: string;
} | null {
  // Map service code to domain
  const mapping = cityConfig.serviceCodeMapping[request.service_code];
  if (!mapping) {
    logger.debug(
      { serviceCode: request.service_code, cityId: cityConfig.id },
      "No domain mapping for service code, skipping",
    );
    return null;
  }

  const title = [request.service_name, request.description?.slice(0, 200)]
    .filter(Boolean)
    .join(" — ") || `Municipal report: ${request.service_request_id}`;

  return {
    title: title.slice(0, 500),
    description: request.description || `Municipal report from ${cityConfig.displayName}: ${request.service_name || request.service_code}`,
    domain: mapping.domain,
    severity: mapping.severity,
    latitude: request.lat != null ? String(request.lat) : null,
    longitude: request.long != null ? String(request.long) : null,
    address: request.address ?? null,
    municipalSourceId: request.service_request_id,
    municipalSourceType: cityConfig.id,
    reportedByAgentId: SYSTEM_MUNICIPAL_AGENT_ID,
    geographicScope: "neighborhood",
  };
}

/**
 * Get the last sync timestamp for a city from Redis.
 */
export async function getLastSyncTimestamp(
  redis: Redis,
  cityId: string,
): Promise<string | null> {
  try {
    return await redis.get(`open311:last-sync:${cityId}`);
  } catch {
    return null;
  }
}

/**
 * Set the last sync timestamp for a city in Redis.
 */
export async function setLastSyncTimestamp(
  redis: Redis,
  cityId: string,
  timestamp: string,
): Promise<void> {
  try {
    await redis.set(`open311:last-sync:${cityId}`, timestamp);
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : "Unknown", cityId },
      "Failed to set last sync timestamp",
    );
  }
}

/**
 * Track ingestion stats in Redis.
 */
export async function trackIngestionStats(
  redis: Redis,
  cityId: string,
  stats: { ingested: number; skipped: number; errors: number },
): Promise<void> {
  try {
    await redis.incrby(`open311:ingested:${cityId}`, stats.ingested);
    await redis.incrby(`open311:skipped:${cityId}`, stats.skipped);
  } catch {
    // Non-fatal
  }
}
