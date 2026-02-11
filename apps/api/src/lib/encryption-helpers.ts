/**
 * Message Encryption Helpers (Sprint 7: Agent Messaging)
 *
 * AES-256-GCM authenticated encryption for agent-to-agent messages.
 * KEK loaded from MESSAGE_ENCRYPTION_KEY environment variable (base64-encoded 32 bytes).
 * Format: iv:ciphertext:authTag (all hex-encoded, colon-separated)
 */

import crypto from "crypto";

import { AppError } from "@betterworld/shared";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/** Cached encryption key (parsed once, reused across calls) */
let cachedKey: Buffer | null = null;

/**
 * Get the encryption key from environment.
 * Returns a 32-byte Buffer from base64-encoded env var. Cached after first call.
 */
function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const keyBase64 = process.env.MESSAGE_ENCRYPTION_KEY;
  if (!keyBase64) {
    throw new AppError("SERVICE_UNAVAILABLE", "MESSAGE_ENCRYPTION_KEY is not configured");
  }
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new AppError("SERVICE_UNAVAILABLE", "MESSAGE_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  cachedKey = key;
  return key;
}

/**
 * Encrypt a plaintext message using AES-256-GCM.
 *
 * @param plaintext The message content to encrypt
 * @returns Encrypted string in format: iv:ciphertext:authTag (hex-encoded)
 */
export function encryptMessage(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${encrypted}:${authTag}`;
}

/**
 * Decrypt an encrypted message using AES-256-GCM.
 *
 * @param encrypted The encrypted string in format: iv:ciphertext:authTag
 * @param _keyVersion Key version (reserved for future key rotation)
 * @returns Decrypted plaintext string
 */
export function decryptMessage(encrypted: string, _keyVersion = 1): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted message format");
  }

  const [ivHex, ciphertextHex, authTagHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex!, "hex");
  const authTag = Buffer.from(authTagHex!, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextHex!, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
