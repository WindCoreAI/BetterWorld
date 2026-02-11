/**
 * Perceptual Hashing (Sprint 9: Reputation & Impact)
 *
 * Uses sharp for image processing and simple average hash algorithm.
 * Generates 64-bit perceptual hashes for duplicate detection.
 */
import sharp from "sharp";

/**
 * Calculate a 64-bit perceptual hash for an image buffer.
 * Uses average hash (aHash) algorithm:
 * 1. Resize to 8x8 grayscale
 * 2. Calculate mean pixel value
 * 3. Set bit 1 if pixel >= mean, 0 otherwise
 * Returns 16-char hex string.
 */
export async function calculatePhash(imageBuffer: Buffer): Promise<string> {
  // Resize to 8x8 grayscale
  const pixels = await sharp(imageBuffer)
    .resize(8, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer();

  // Calculate mean
  let sum = 0;
  for (let i = 0; i < 64; i++) {
    sum += pixels[i]!;
  }
  const mean = sum / 64;

  // Build hash: 64 bits → 16 hex chars
  let hash = "";
  for (let i = 0; i < 64; i += 4) {
    let nibble = 0;
    for (let j = 0; j < 4; j++) {
      if (pixels[i + j]! >= mean) {
        nibble |= 1 << (3 - j);
      }
    }
    hash += nibble.toString(16);
  }

  return hash;
}

/**
 * Calculate Hamming distance between two hex hash strings.
 * Returns number of differing bits (0 = identical, 64 = completely different).
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    throw new Error("Hash strings must be same length");
  }

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const xor = parseInt(hash1[i]!, 16) ^ parseInt(hash2[i]!, 16);
    // Count set bits in xor (Brian Kernighan's algorithm adapted for nibble)
    let bits = xor;
    while (bits) {
      distance++;
      bits &= bits - 1;
    }
  }
  return distance;
}

/**
 * Check if two hashes represent duplicate images (distance <= 6).
 */
export function isDuplicate(hash1: string, hash2: string): boolean {
  return hammingDistance(hash1, hash2) <= 6;
}

/**
 * Check if two hashes represent suspicious similarity (distance <= 10).
 */
export function isSuspicious(hash1: string, hash2: string): boolean {
  return hammingDistance(hash1, hash2) <= 10;
}
