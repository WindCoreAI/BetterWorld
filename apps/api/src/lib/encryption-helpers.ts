/**
 * Message Encryption Helpers (Sprint 7: Agent Messaging)
 *
 * AES-256-GCM authenticated encryption for agent-to-agent messages.
 * Supports two-key rotation:
 *   - MESSAGE_ENCRYPTION_KEY: current key (version 2 when rotating, else 1)
 *   - MESSAGE_ENCRYPTION_KEY_PREV: previous key (optional, for decrypting old messages)
 *
 * Format: version:iv:ciphertext:authTag (all hex-encoded, colon-separated)
 * Legacy format (3 parts, no version prefix) treated as version 1.
 */

import crypto from "crypto";

import { AppError } from "@betterworld/shared";
import pino from "pino";

const log = pino({ name: "encryption" });

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/** Cached encryption keys (parsed once, reused across calls) */
let cachedCurrentKey: Buffer | null = null;
let cachedPrevKey: Buffer | null = null;
let cachedKeyVersion: number = 1;
let keysInitialized = false;

/**
 * Parse and validate a base64-encoded 32-byte key, or return null.
 */
function parseKey(base64: string | undefined): Buffer | null {
  if (!base64) return null;
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) return null;
  return key;
}

/**
 * Initialize both keys from environment. Called once, results cached.
 * Current key is required; previous key is optional (only needed during rotation).
 * Key version is 2 if a previous key exists, else 1.
 */
function initKeys(): void {
  if (keysInitialized) return;

  cachedCurrentKey = parseKey(process.env.MESSAGE_ENCRYPTION_KEY);
  if (!cachedCurrentKey) {
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      "MESSAGE_ENCRYPTION_KEY is not configured or not exactly 32 bytes",
    );
  }

  cachedPrevKey = parseKey(process.env.MESSAGE_ENCRYPTION_KEY_PREV);
  cachedKeyVersion = cachedPrevKey ? 2 : 1;
  keysInitialized = true;
}

/** Get the current encryption key. */
function getCurrentKey(): Buffer {
  initKeys();
  return cachedCurrentKey!;
}

/** Get the previous encryption key, or null if not configured. */
function getPrevKey(): Buffer | null {
  initKeys();
  return cachedPrevKey;
}

/** Get the current key version number. */
export function getCurrentKeyVersion(): number {
  initKeys();
  return cachedKeyVersion;
}

/**
 * Decrypt with a specific key. Returns plaintext or throws on auth failure.
 */
function decryptWithKey(
  key: Buffer,
  ivHex: string,
  ciphertextHex: string,
  authTagHex: string,
): string {
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Encrypt a plaintext message using AES-256-GCM.
 *
 * @param plaintext The message content to encrypt
 * @returns Encrypted string in format: version:iv:ciphertext:authTag (hex-encoded)
 */
export function encryptMessage(plaintext: string): string {
  const key = getCurrentKey();
  const version = getCurrentKeyVersion();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${version}:${iv.toString("hex")}:${encrypted}:${authTag}`;
}

/**
 * Decrypt an encrypted message using AES-256-GCM.
 * Supports both new format (version:iv:ciphertext:authTag) and
 * legacy format (iv:ciphertext:authTag, treated as version 1).
 *
 * During key rotation, tries the current key first, then falls back
 * to the previous key if decryption fails (authTag mismatch).
 *
 * @param encrypted The encrypted string
 * @param _keyVersion Stored key version (kept for signature compat, version now embedded in format)
 * @returns Decrypted plaintext string
 */
export function decryptMessage(encrypted: string, _keyVersion = 1): string {
  const parts = encrypted.split(":");

  let ivHex: string;
  let ciphertextHex: string;
  let authTagHex: string;

  if (parts.length === 4) {
    // New format: version:iv:ciphertext:authTag
    ivHex = parts[1]!;
    ciphertextHex = parts[2]!;
    authTagHex = parts[3]!;
  } else if (parts.length === 3) {
    // Legacy format: iv:ciphertext:authTag (pre-rotation, treat as version 1)
    ivHex = parts[0]!;
    ciphertextHex = parts[1]!;
    authTagHex = parts[2]!;
  } else {
    throw new Error("Invalid encrypted message format");
  }

  // Try current key first
  const currentKey = getCurrentKey();
  try {
    return decryptWithKey(currentKey, ivHex, ciphertextHex, authTagHex);
  } catch {
    // Current key failed — try previous key if available
    const prevKey = getPrevKey();
    if (!prevKey) {
      throw new Error("Decryption failed and no previous key configured");
    }

    log.warn("Decrypting message with previous key — rotation in progress");
    return decryptWithKey(prevKey, ivHex, ciphertextHex, authTagHex);
  }
}

/**
 * Reset cached keys (for testing only).
 */
export function _resetKeyCache(): void {
  cachedCurrentKey = null;
  cachedPrevKey = null;
  cachedKeyVersion = 1;
  keysInitialized = false;
}
