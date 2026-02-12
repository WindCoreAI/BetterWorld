/**
 * Profile Routes (Sprint 6 - Phase 4: User Story 2)
 */

import { humanProfiles } from "@betterworld/db";
import { ProfileCreateSchema, ProfileUpdateSchema } from "@betterworld/shared/schemas/human";
import { geocodeLocation, parsePostGISPoint } from "@betterworld/shared/utils/geocode";
import { calculateProfileCompleteness, type ProfileInput } from "@betterworld/shared/utils/profileCompleteness";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb, getRedis } from "../../lib/container.js";
import { humanAuth } from "../../middleware/humanAuth";
import { logger } from "../../middleware/logger.js";

const app = new Hono<AppEnv>();

type GeoResult = { lat: number; lng: number; location: string };
type RedisLike = { get: (k: string) => Promise<string | null>; setex: (k: string, t: number, v: string) => Promise<unknown> };

/** Geocode city/country via Redis-cached Nominatim lookup */
async function resolveGeocode(
  city: string | undefined,
  country: string | undefined,
  redis: RedisLike | null,
): Promise<GeoResult | null> {
  if (!city || !country || !redis) return null;
  const geocoded = await geocodeLocation(city, country, redis.get.bind(redis), redis.setex.bind(redis));
  if (!geocoded) return null;
  return { lat: geocoded.lat, lng: geocoded.lng, location: `POINT(${geocoded.lng} ${geocoded.lat})` };
}

/** Build ProfileInput for completeness calculation from form data + geocode result */
function buildCompletenessInput(
  data: { skills: string[]; city?: string; country?: string; languages: string[]; availability?: unknown; bio?: string; walletAddress?: string; certifications?: string[] },
  geo: GeoResult | null,
) {
  return {
    skills: data.skills,
    city: data.city || null,
    country: data.country || null,
    latitude: geo?.lat ?? null,
    longitude: geo?.lng ?? null,
    languages: data.languages,
    availability: (data.availability || null) as ProfileInput["availability"],
    bio: data.bio || null,
    avatarUrl: null,
    walletAddress: data.walletAddress || null,
    certifications: data.certifications || null,
  };
}

/** Build insert values for humanProfiles from form data + geocode + completeness */
function buildInsertValues(
  humanId: string,
  data: { skills: string[]; city?: string; country?: string; serviceRadius?: number; languages: string[]; availability?: unknown; bio?: string; walletAddress?: string; certifications?: string[] },
  geo: GeoResult | null,
  completenessScore: number,
) {
  return {
    humanId,
    skills: data.skills,
    city: data.city,
    country: data.country,
    location: geo?.location ?? null,
    serviceRadius: data.serviceRadius || 10,
    languages: data.languages,
    availability: data.availability || null,
    bio: data.bio || null,
    walletAddress: data.walletAddress || null,
    certifications: data.certifications || null,
    profileCompletenessScore: completenessScore,
  };
}

// POST /profile - Create Profile (T047)
app.post("/", humanAuth(), zValidator("json", ProfileCreateSchema), async (c) => {
  const human = c.get("human");
  const data = c.req.valid("json");

  try {
    const db = getDb();
    const redis = getRedis();
    if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE" as const, message: "Database not available" }, requestId: c.get("requestId") }, 503);

    const [existing] = await db
      .select({ humanId: humanProfiles.humanId })
      .from(humanProfiles)
      .where(eq(humanProfiles.humanId, human.id))
      .limit(1);

    if (existing) {
      return c.json(
        { ok: false, error: { code: "PROFILE_EXISTS" as const, message: "Profile already exists" }, requestId: c.get("requestId") },
        400,
      );
    }

    const geo = await resolveGeocode(data.city, data.country, redis);
    const completeness = calculateProfileCompleteness(buildCompletenessInput(data, geo));

    const [profile] = await db
      .insert(humanProfiles)
      .values(buildInsertValues(human.id, data, geo, completeness.score))
      .returning();

    return c.json(
      {
        ok: true,
        data: {
          ...profile,
          location: geo ? { lat: geo.lat, lng: geo.lng } : null,
          completeness,
        },
        requestId: c.get("requestId"),
      },
      201,
    );
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : "Unknown" }, "Profile create failed");
    return c.json(
      { ok: false, error: { code: "INTERNAL_ERROR" as const, message: "Failed to create profile" }, requestId: c.get("requestId") },
      500,
    );
  }
});

// GET /profile - Get Profile (T048)
app.get("/", humanAuth(), async (c) => {
  const human = c.get("human");

  try {
    const db = getDb();
    if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE" as const, message: "Database not available" }, requestId: c.get("requestId") }, 503);

    const [profile] = await db
      .select()
      .from(humanProfiles)
      .where(eq(humanProfiles.humanId, human.id))
      .limit(1);

    if (!profile) {
      return c.json(
        { ok: false, error: { code: "PROFILE_NOT_FOUND" as const, message: "Profile not found" }, requestId: c.get("requestId") },
        404,
      );
    }

    const coords = profile.location ? parsePostGISPoint(profile.location) : null;
    const lat = coords?.lat ?? null;
    const lng = coords?.lng ?? null;

    const completeness = calculateProfileCompleteness({
      skills: profile.skills,
      city: profile.city,
      country: profile.country,
      latitude: lat,
      longitude: lng,
      languages: profile.languages,
      availability: profile.availability as ProfileInput["availability"],
      bio: profile.bio,
      avatarUrl: null,
      walletAddress: profile.walletAddress,
      certifications: profile.certifications,
    });

    return c.json({
      ok: true,
      data: {
        ...profile,
        location: lat && lng ? { lat, lng } : null,
        completeness,
      },
      requestId: c.get("requestId"),
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : "Unknown" }, "Profile fetch failed");
    return c.json(
      { ok: false, error: { code: "INTERNAL_ERROR" as const, message: "Failed to fetch profile" }, requestId: c.get("requestId") },
      500,
    );
  }
});

/** Build partial update set from profile update data */
function buildProfileUpdateSet(
  data: Record<string, unknown>,
  location: string | undefined,
): Record<string, unknown> {
  const fields: [string, unknown, boolean][] = [
    ["skills", data.skills, !!data.skills],
    ["city", data.city, !!data.city],
    ["country", data.country, !!data.country],
    ["location", location, !!location],
    ["serviceRadius", data.serviceRadius, !!data.serviceRadius],
    ["languages", data.languages, !!data.languages],
    ["availability", data.availability, data.availability !== undefined],
    ["bio", data.bio, data.bio !== undefined],
    ["walletAddress", data.walletAddress, data.walletAddress !== undefined],
    ["certifications", data.certifications, data.certifications !== undefined],
  ];

  const result: Record<string, unknown> = { updatedAt: new Date() };
  for (const [key, value, include] of fields) {
    if (include) result[key] = value;
  }
  return result;
}

// PATCH /profile - Update Profile (T049)
app.patch("/", humanAuth(), zValidator("json", ProfileUpdateSchema), async (c) => {
  const human = c.get("human");
  const data = c.req.valid("json");

  try {
    const db = getDb();
    const redis = getRedis();
    if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE" as const, message: "Database not available" }, requestId: c.get("requestId") }, 503);

    const geo = await resolveGeocode(data.city, data.country, redis);
    const updateSet = buildProfileUpdateSet(data, geo?.location);

    const [updated] = await db
      .update(humanProfiles)
      .set(updateSet)
      .where(eq(humanProfiles.humanId, human.id))
      .returning();

    if (!updated) {
      return c.json(
        { ok: false, error: { code: "PROFILE_NOT_FOUND" as const, message: "Profile not found" }, requestId: c.get("requestId") },
        404,
      );
    }

    return c.json({ ok: true, data: updated, requestId: c.get("requestId") });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : "Unknown" }, "Profile update failed");
    return c.json(
      { ok: false, error: { code: "INTERNAL_ERROR" as const, message: "Failed to update profile" }, requestId: c.get("requestId") },
      500,
    );
  }
});

export default app;
