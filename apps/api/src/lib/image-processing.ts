/**
 * Image processing utilities (Sprint 8: Evidence Verification)
 *
 * WebP conversion, thumbnail generation, medium-resolution copy,
 * and image dimension validation using sharp.
 */

import pino from "pino";

const _logger = pino({ name: "image-processing" });

/** Thumbnail dimensions */
const THUMBNAIL_SIZE = 200;

/** Medium max dimensions */
const MEDIUM_MAX_WIDTH = 1920;
const MEDIUM_MAX_HEIGHT = 1080;

export interface ProcessedImage {
  thumbnail: Buffer;
  medium: Buffer;
  width: number;
  height: number;
}

/**
 * Process an image: generate WebP thumbnail and medium-resolution copy.
 */
export async function processImage(
  buffer: Buffer,
): Promise<ProcessedImage> {
  const sharp = (await import("sharp")).default;

  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  // Generate thumbnail (200x200, cover fit, WebP)
  const thumbnail = await sharp(buffer)
    .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: "cover" })
    .webp({ quality: 80 })
    .toBuffer();

  // Generate medium-resolution (max 1920x1080, WebP)
  const medium = await sharp(buffer)
    .resize(MEDIUM_MAX_WIDTH, MEDIUM_MAX_HEIGHT, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer();

  return { thumbnail, medium, width, height };
}

/**
 * Validate image dimensions (must have reasonable dimensions).
 */
export function isValidImageDimensions(
  width: number,
  height: number,
): boolean {
  // Minimum 10x10, maximum 50000x50000
  return width >= 10 && height >= 10 && width <= 50000 && height <= 50000;
}
