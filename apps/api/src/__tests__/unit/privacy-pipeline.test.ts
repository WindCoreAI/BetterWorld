import sharp from "sharp";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { processPhoto } from "../../services/privacy-pipeline.js";

describe("Privacy Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper: create a minimal valid JPEG-like buffer with metadata
  async function createTestImage(
    width = 100,
    height = 100,
    withExif = false,
  ): Promise<Buffer> {
    let pipeline = sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
      },
    });

    if (withExif) {
      // Add EXIF-like metadata
      pipeline = pipeline.withMetadata({
        exif: {
          IFD0: {
            Software: "TestCamera",
          },
        },
      });
    }

    return pipeline.jpeg().toBuffer();
  }

  describe("Stage 1: EXIF PII stripping (always)", () => {
    it("strips EXIF metadata from images", async () => {
      const imageWithExif = await createTestImage(200, 200, true);

      // Verify source has metadata
      const srcMeta = await sharp(imageWithExif).metadata();
      expect(srcMeta.width).toBe(200);

      const result = await processPhoto(imageWithExif, false);

      expect(result.status).toBe("completed");
      expect(result.metadata.exifStripped).toBe(true);

      // Result should still be a valid image
      const processedMeta = await sharp(result.buffer).metadata();
      expect(processedMeta.width).toBeDefined();
    });

    it("processes image without EXIF data successfully", async () => {
      const plainImage = await createTestImage(100, 100, false);

      const result = await processPhoto(plainImage, false);

      expect(result.status).toBe("completed");
      expect(result.metadata.exifStripped).toBe(true);
    });

    it("returns completed status with correct metadata", async () => {
      const image = await createTestImage(100, 100);

      const result = await processPhoto(image, false);

      expect(result.status).toBe("completed");
      expect(result.metadata).toEqual({
        exifStripped: true,
        facesDetected: 0,
        facesBlurred: 0,
        platesDetected: 0,
        platesBlurred: 0,
      });
    });
  });

  describe("Stage 2: Face detection (when blur enabled)", () => {
    it("returns 0 faces detected in MVP (stub implementation)", async () => {
      const image = await createTestImage(320, 240);

      const result = await processPhoto(image, true);

      expect(result.status).toBe("completed");
      // MVP stub returns 0 faces — will be populated with face-api.js (T066)
      expect(result.metadata.facesDetected).toBe(0);
      expect(result.metadata.facesBlurred).toBe(0);
    });
  });

  describe("Stage 3: License plate detection (when blur enabled)", () => {
    it("returns 0 plates detected in MVP (stub implementation)", async () => {
      const image = await createTestImage(320, 240);

      const result = await processPhoto(image, true);

      expect(result.status).toBe("completed");
      expect(result.metadata.platesDetected).toBe(0);
      expect(result.metadata.platesBlurred).toBe(0);
    });
  });

  describe("Error handling", () => {
    it("quarantines on processing failure", async () => {
      // Pass an invalid buffer that sharp can't process
      const invalidBuffer = Buffer.from("not an image at all");

      const result = await processPhoto(invalidBuffer, false);

      expect(result.status).toBe("quarantined");
      expect(result.quarantineReason).toBeDefined();
      // Original buffer returned on failure
      expect(result.buffer).toBe(invalidBuffer);
    });

    it("returns metadata showing what was completed before failure", async () => {
      const invalidBuffer = Buffer.from("invalid");

      const result = await processPhoto(invalidBuffer, true);

      expect(result.status).toBe("quarantined");
      expect(result.metadata.exifStripped).toBe(false);
    });
  });

  describe("blur disabled path", () => {
    it("skips face and plate detection when blur disabled", async () => {
      const image = await createTestImage(200, 200);

      const result = await processPhoto(image, false);

      expect(result.status).toBe("completed");
      expect(result.metadata.exifStripped).toBe(true);
      expect(result.metadata.facesDetected).toBe(0);
      expect(result.metadata.platesDetected).toBe(0);
    });
  });
});
