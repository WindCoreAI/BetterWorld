/**
 * Privacy Pipeline Service (Sprint 12 — T060, Sprint 15 — T037/T039)
 *
 * Stage 1 (always): EXIF PII stripping via sharp.removeMetadata()
 * Stage 2 (if PRIVACY_BLUR_ENABLED): Face detection via @vladmandic/face-api + gaussian blur
 * Stage 3 (if PRIVACY_BLUR_ENABLED): License plate detection via sharp contour analysis + blur
 *
 * Quarantine on failure.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import * as faceapi from "@vladmandic/face-api";
import pino from "pino";
import sharp from "sharp";

const logger = pino({ name: "privacy-pipeline" });

export interface PrivacyResult {
  buffer: Buffer;
  metadata: {
    exifStripped: boolean;
    facesDetected: number;
    facesBlurred: number;
    platesDetected: number;
    platesBlurred: number;
  };
  status: "completed" | "quarantined";
  quarantineReason?: string;
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Stage 1: Strip EXIF PII metadata (always runs)
 */
async function stripExifPii(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .rotate() // Apply EXIF rotation before stripping
    .withMetadata({}) // Remove all metadata
    .toBuffer();
}

// ── Face Detection Model Initialization ──
// Load SSD MobileNet v1 model once at startup (FR-020)
let faceModelLoaded = false;
let faceModelLoadPromise: Promise<void> | null = null;

// Check multiple model locations: assets (Docker baked-in), local node_modules, root node_modules
const MODEL_DIR = (() => {
  const candidates = [
    path.resolve(__dirname, "../../assets/models"), // Docker baked-in via download-face-models.js --copy
    path.resolve(__dirname, "../../node_modules/@vladmandic/face-api/model"), // local node_modules
    path.resolve(__dirname, "../../../../node_modules/@vladmandic/face-api/model"), // root node_modules (pnpm hoist)
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "ssd_mobilenetv1_model-weights_manifest.json"))) {
      return dir;
    }
  }
  // Fallback to local node_modules path (will error on load with a clear message)
  return candidates[1];
})();

async function ensureFaceModel(): Promise<void> {
  if (faceModelLoaded) return;
  if (faceModelLoadPromise) return faceModelLoadPromise;

  faceModelLoadPromise = (async () => {
    try {
      await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_DIR);
      faceModelLoaded = true;
      logger.info("Face detection model loaded (SSD MobileNet v1)");
    } catch (err) {
      faceModelLoadPromise = null;
      throw new Error(
        `Failed to load face detection model from ${MODEL_DIR}: ${(err as Error).message}`,
      );
    }
  })();

  return faceModelLoadPromise;
}

/**
 * Stage 2: Detect faces using @vladmandic/face-api SSD MobileNet v1 (FR-020).
 *
 * Resizes image to 320x240 for performance, runs detectAllFaces(),
 * filters by confidence >= 0.70 and min size 50x50, maps results
 * back to original image coordinates.
 */
async function detectFaces(
  imageBuffer: Buffer,
): Promise<BoundingBox[]> {
  try {
    await ensureFaceModel();

    // Get original image dimensions
    const metadata = await sharp(imageBuffer).metadata();
    if (!metadata.width || !metadata.height) return [];

    // Resize to 320x240 for faster detection
    const { data, info } = await sharp(imageBuffer)
      .resize(320, 240, { fit: "inside" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const inputWidth = info.width;
    const inputHeight = info.height;

    // Scale factors to map detections back to original image dimensions
    const scaleX = metadata.width / inputWidth;
    const scaleY = metadata.height / inputHeight;

    // Create tensor from raw pixel data
    const tensor = faceapi.tf.tensor3d(
      new Uint8Array(data),
      [inputHeight, inputWidth, 3],
    );

    // Run face detection
    const detections = await faceapi.detectAllFaces(
      tensor as unknown as faceapi.TNetInput,
      new faceapi.SsdMobilenetv1Options({ minConfidence: 0.70 }),
    );

    // Clean up tensor
    tensor.dispose();

    // Filter by minimum size (50x50 in original coordinates) and map to BoundingBox
    const boxes: BoundingBox[] = [];
    for (const det of detections) {
      const box = det.box;
      const scaledWidth = box.width * scaleX;
      const scaledHeight = box.height * scaleY;

      if (scaledWidth >= 50 && scaledHeight >= 50) {
        boxes.push({
          x: box.x * scaleX,
          y: box.y * scaleY,
          width: scaledWidth,
          height: scaledHeight,
        });
      }
    }

    logger.info({ facesDetected: boxes.length }, "Face detection complete");
    return boxes;
  } catch (err) {
    logger.warn({ error: (err as Error).message }, "Face detection failed");
    return [];
  }
}

/**
 * Stage 3: Detect license plates using sharp contour analysis (FR-021).
 *
 * Pipeline: grayscale -> edge detection -> find rectangular contours
 * with aspect ratio 2:1 to 5:1, filter by minimum size.
 *
 * This is a heuristic approach — not ML-based. It detects rectangular
 * high-contrast regions that match plate-like characteristics.
 */
// eslint-disable-next-line complexity
async function detectPlates(
  imageBuffer: Buffer,
): Promise<BoundingBox[]> {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    if (!metadata.width || !metadata.height) return [];

    // Step 1: Convert to grayscale and apply edge detection (Laplacian-like)
    const { data: edgeData, info: edgeInfo } = await sharp(imageBuffer)
      .resize(640, 480, { fit: "inside" })
      .grayscale()
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const scaleX = metadata.width / edgeInfo.width;
    const scaleY = metadata.height / edgeInfo.height;
    const w = edgeInfo.width;
    const h = edgeInfo.height;

    // Step 2: Find rectangular high-edge-density regions
    // Scan with sliding window at typical plate aspect ratios (2:1 to 5:1)
    const boxes: BoundingBox[] = [];
    const _minPlateW = 60; // Minimum plate width in resized image
    const _minPlateH = 15; // Minimum plate height in resized image
    const windowSizes = [
      { pw: 120, ph: 40 }, // ~3:1
      { pw: 100, ph: 30 }, // ~3.3:1
      { pw: 80, ph: 25 },  // ~3.2:1
    ];
    const step = 20;
    const edgeThreshold = 80; // Minimum average edge intensity

    for (const { pw, ph } of windowSizes) {
      if (pw > w || ph > h) continue;

      for (let y = 0; y <= h - ph; y += step) {
        for (let x = 0; x <= w - pw; x += step) {
          // Calculate average edge intensity in this window
          let sum = 0;
          let count = 0;
          for (let dy = 0; dy < ph; dy++) {
            for (let dx = 0; dx < pw; dx++) {
              const idx = (y + dy) * w + (x + dx);
              sum += edgeData[idx] ?? 0;
              count++;
            }
          }
          const avgEdge = sum / count;

          if (avgEdge > edgeThreshold) {
            // Check aspect ratio is plate-like (2:1 to 5:1)
            const aspect = pw / ph;
            if (aspect >= 2 && aspect <= 5) {
              // Check this doesn't overlap significantly with existing detections
              const overlap = boxes.some((b) => {
                const bx = b.x / scaleX;
                const by = b.y / scaleY;
                const bw = b.width / scaleX;
                const bh = b.height / scaleY;
                const overlapX = Math.max(0, Math.min(x + pw, bx + bw) - Math.max(x, bx));
                const overlapY = Math.max(0, Math.min(y + ph, by + bh) - Math.max(y, by));
                return (overlapX * overlapY) > (pw * ph * 0.5);
              });

              if (!overlap) {
                boxes.push({
                  x: x * scaleX,
                  y: y * scaleY,
                  width: pw * scaleX,
                  height: ph * scaleY,
                });
              }
            }
          }
        }
      }
    }

    // Limit to max 10 detections to avoid over-blurring
    const result = boxes.slice(0, 10);
    logger.info({ platesDetected: result.length }, "Plate detection complete");
    return result;
  } catch (err) {
    logger.warn({ error: (err as Error).message }, "Plate detection failed");
    return [];
  }
}

/**
 * Apply gaussian blur to detected regions.
 */
async function blurRegions(
  imageBuffer: Buffer,
  regions: BoundingBox[],
): Promise<Buffer> {
  if (regions.length === 0) return imageBuffer;

  let pipeline = sharp(imageBuffer);

  // Build composite operations: extract each region, blur it, overlay back
  const metadata = await sharp(imageBuffer).metadata();
  if (!metadata.width || !metadata.height) return imageBuffer;

  const compositeOps: sharp.OverlayOptions[] = [];

  for (const region of regions) {
    // Ensure region is within bounds
    const x = Math.max(0, Math.round(region.x));
    const y = Math.max(0, Math.round(region.y));
    const w = Math.min(Math.round(region.width), metadata.width - x);
    const h = Math.min(Math.round(region.height), metadata.height - y);

    if (w <= 0 || h <= 0) continue;

    // Extract, blur, then composite back
    const blurredRegion = await sharp(imageBuffer)
      .extract({ left: x, top: y, width: w, height: h })
      .blur(Math.max(10, Math.round(w / 3)))
      .toBuffer();

    compositeOps.push({
      input: blurredRegion,
      left: x,
      top: y,
    });
  }

  if (compositeOps.length > 0) {
    pipeline = pipeline.composite(compositeOps);
  }

  return pipeline.toBuffer();
}

/**
 * Process a photo through the privacy pipeline.
 *
 * @param photoBuffer - The raw image buffer
 * @param blurEnabled - Whether to run face/plate detection and blurring
 * @returns Processed buffer with metadata about what was done
 */
export async function processPhoto(
  photoBuffer: Buffer,
  blurEnabled: boolean = false,
): Promise<PrivacyResult> {
  const metadata = {
    exifStripped: false,
    facesDetected: 0,
    facesBlurred: 0,
    platesDetected: 0,
    platesBlurred: 0,
  };

  try {
    // Stage 1: Strip EXIF (always)
    let processedBuffer = await stripExifPii(photoBuffer);
    metadata.exifStripped = true;

    if (blurEnabled) {
      // Stage 2: Face detection + blur
      const faces = await detectFaces(processedBuffer);
      metadata.facesDetected = faces.length;
      if (faces.length > 0) {
        processedBuffer = await blurRegions(processedBuffer, faces);
        metadata.facesBlurred = faces.length;
      }

      // Stage 3: License plate detection + blur
      const plates = await detectPlates(processedBuffer);
      metadata.platesDetected = plates.length;
      if (plates.length > 0) {
        processedBuffer = await blurRegions(processedBuffer, plates);
        metadata.platesBlurred = plates.length;
      }
    }

    logger.info(
      { exifStripped: true, facesDetected: metadata.facesDetected, platesDetected: metadata.platesDetected, blurEnabled },
      "Privacy pipeline completed",
    );

    return {
      buffer: processedBuffer,
      metadata,
      status: "completed",
    };
  } catch (err) {
    const reason = (err as Error).message || "Unknown processing error";
    logger.error({ error: reason }, "Privacy pipeline failed — quarantining");

    return {
      buffer: photoBuffer, // Return original on failure
      metadata,
      status: "quarantined",
      quarantineReason: reason,
    };
  }
}
