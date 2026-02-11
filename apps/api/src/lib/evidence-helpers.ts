/**
 * Evidence helper utilities (Sprint 8: Evidence Verification)
 *
 * EXIF extraction, file validation, GPS distance calculation,
 * file type mapping, and EXIF PII stripping.
 */

import pino from "pino";

const logger = pino({ name: "evidence-helpers" });

/** Allowed MIME types for evidence uploads */
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "application/pdf",
  "video/mp4",
  "video/quicktime",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Maximum file size: 10MB */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Maximum files per submission */
export const MAX_FILES_PER_SUBMISSION = 5;

/** Evidence type mapping from MIME type */
export function getEvidenceType(
  mimeType: string,
): "photo" | "video" | "document" | "text_report" {
  if (mimeType.startsWith("image/")) return "photo";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "document";
  return "text_report";
}

/** Validate file MIME type */
export function isAllowedMimeType(mimeType: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

/** Validate file size */
export function isValidFileSize(size: number): boolean {
  return size > 0 && size <= MAX_FILE_SIZE;
}

/** EXIF data extracted from evidence files */
export interface ExtractedExif {
  latitude?: number;
  longitude?: number;
  dateTime?: Date;
  make?: string;
  model?: string;
}

/**
 * Extract EXIF data from an image buffer using exifr.
 * Returns sanitized data (PII stripped).
 */
export async function extractExif(
  buffer: Buffer,
): Promise<ExtractedExif> {
  try {
    // Dynamic import to avoid issues in test environments
    const exifr = await import("exifr");
    const parsed = await exifr.default.parse(buffer, {
      pick: ["latitude", "longitude", "DateTimeOriginal", "Make", "Model"],
    });

    if (!parsed) return {};

    return {
      latitude: parsed.latitude ?? undefined,
      longitude: parsed.longitude ?? undefined,
      dateTime: parsed.DateTimeOriginal
        ? new Date(parsed.DateTimeOriginal)
        : undefined,
      make: parsed.Make ?? undefined,
      model: parsed.Model ?? undefined,
    };
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : "Unknown" },
      "EXIF extraction failed",
    );
    return {};
  }
}

/**
 * Strip PII from EXIF data (remove serial numbers, owner name, etc.).
 * Returns only the fields we need for verification.
 */
export function stripExifPii(exif: ExtractedExif): Record<string, unknown> {
  return {
    gpsLat: exif.latitude ?? null,
    gpsLng: exif.longitude ?? null,
    dateTime: exif.dateTime?.toISOString() ?? null,
    make: exif.make ?? null,
    model: exif.model ?? null,
  };
}

/**
 * Calculate Haversine distance between two GPS coordinates in meters.
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
