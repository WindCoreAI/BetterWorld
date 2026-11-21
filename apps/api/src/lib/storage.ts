/**
 * Storage abstraction (Sprint 8: Evidence Verification)
 *
 * Supabase Storage when SUPABASE_URL + SUPABASE_SERVICE_KEY are set, local
 * filesystem otherwise.
 *
 * What gets stored in the database is the storage KEY
 * (`evidence/{missionId}/{claimId}/{variant}/{filename}`), never a URL. URLs
 * are derived on read:
 *   - Supabase: a short-lived signed URL
 *   - local:    a short-lived signed URL served by GET /api/v1/storage/*
 *
 * Earlier versions stored a URL (`/storage/<key>` locally, the public object
 * URL on Supabase) and then passed that URL back in as if it were a key, so
 * nothing could ever read a stored file — not the browser, and not the vision
 * verifier. toStorageKey() accepts those legacy values too.
 */

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import pino from "pino";

const logger = pino({ name: "storage" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function localStorageDir(): string {
  return process.env.LOCAL_STORAGE_DIR
    ? path.resolve(process.env.LOCAL_STORAGE_DIR)
    : path.resolve(__dirname, "../../storage/evidence");
}

/** Route prefix under which locally stored files are served (see storage.routes.ts). */
export const LOCAL_STORAGE_ROUTE = "/api/v1/storage";

export interface UploadResult {
  /** @deprecated Kept for callers that still read it; equal to `key`. Store `key`. */
  url: string;
  /** The value to persist. */
  key: string;
}

export interface StoredFile {
  buffer: Buffer;
  contentType: string;
}

function supabaseConfig(): { url: string; key: string; bucket: string } | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key, bucket: process.env.SUPABASE_STORAGE_BUCKET || "evidence" };
}

/** True when files live on this machine's disk rather than in object storage. */
export function isLocalStorage(): boolean {
  return supabaseConfig() === null;
}

/**
 * Build storage path for evidence files.
 */
export function buildStoragePath(
  missionId: string,
  claimId: string,
  variant: "original" | "medium" | "thumbnail",
  filename: string,
): string {
  // Sanitize filename: strip path separators and ".." to prevent path traversal
  const sanitized = path.basename(filename).replace(/\.\./g, "_");
  return `evidence/${missionId}/${claimId}/${variant}/${sanitized}`;
}

/**
 * Normalise whatever is stored in the database to a storage key.
 * Accepts a key, a legacy local URL (`/storage/<key>`), or a legacy Supabase
 * object URL (`…/storage/v1/object/[public|sign]/<bucket>/<key>`).
 */
export function toStorageKey(stored: string): string {
  let value = stored.trim();

  const objectUrl = value.match(/\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?[^/]+\/(.+)$/);
  const localRouteAt = value.indexOf(`${LOCAL_STORAGE_ROUTE}/`);
  if (objectUrl?.[1]) {
    value = objectUrl[1];
  } else if (localRouteAt >= 0) {
    value = value.slice(localRouteAt + LOCAL_STORAGE_ROUTE.length + 1);
  } else if (value.startsWith("/storage/")) {
    value = value.slice("/storage/".length);
  }

  // Drop any query string and leading slashes
  value = value.split("?")[0]!.replace(/^\/+/, "");
  return value;
}

/** Reject keys that could escape the storage root. */
function assertSafeKey(key: string): void {
  if (!key || key.includes("\0") || key.split("/").some((part) => part === ".." || part === ".")) {
    throw new Error("Invalid storage key");
  }
}

/**
 * Upload a file to storage.
 * Uses Supabase Storage if configured, otherwise falls back to local filesystem.
 */
export async function uploadFile(
  storagePath: string,
  buffer: Buffer,
  contentType: string,
): Promise<UploadResult> {
  const key = toStorageKey(storagePath);
  assertSafeKey(key);

  const supabase = supabaseConfig();
  if (supabase) {
    await uploadToSupabase(supabase, key, buffer, contentType);
  } else {
    await uploadToLocal(key, buffer);
  }
  return { url: key, key };
}

/**
 * Short-lived URL a browser can load the stored file from.
 */
export async function getSignedUrl(
  stored: string,
  expiresInSeconds: number = 3600,
): Promise<string> {
  const key = toStorageKey(stored);

  try {
    assertSafeKey(key);
    const supabase = supabaseConfig();
    if (supabase) {
      return await getSupabaseSignedUrl(supabase, key, expiresInSeconds);
    }
    return localSignedUrl(key, expiresInSeconds);
  } catch (err) {
    // A list endpoint must not fail because one file could not be signed.
    logger.warn({ key, error: err instanceof Error ? err.message : "Unknown" }, "Could not create signed URL");
    return "";
  }
}

/**
 * Read a stored file's bytes (for server-side processing such as AI
 * verification). Returns null when the file cannot be read.
 */
export async function readStoredFile(stored: string): Promise<StoredFile | null> {
  const key = toStorageKey(stored);

  try {
    assertSafeKey(key);

    const supabase = supabaseConfig();
    if (supabase) {
      const signedUrl = await getSupabaseSignedUrl(supabase, key, 300);
      const response = await fetch(signedUrl);
      if (!response.ok) {
        logger.warn({ status: response.status, key }, "Stored file download failed");
        return null;
      }
      return {
        buffer: Buffer.from(await response.arrayBuffer()),
        contentType: response.headers.get("content-type") || contentTypeForKey(key),
      };
    }

    const buffer = await fs.readFile(path.join(localStorageDir(), key));
    return { buffer, contentType: contentTypeForKey(key) };
  } catch (err) {
    logger.warn({ key, error: err instanceof Error ? err.message : "Unknown" }, "Stored file read failed");
    return null;
  }
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(stored: string): Promise<void> {
  const key = toStorageKey(stored);
  assertSafeKey(key);

  const supabase = supabaseConfig();
  if (supabase) {
    await fetch(`${supabase.url}/storage/v1/object/${supabase.bucket}/${key}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${supabase.key}` },
    });
    return;
  }

  try {
    await fs.unlink(path.join(localStorageDir(), key));
  } catch {
    // File may not exist
  }
}

// --- Content types ---

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

export function contentTypeForKey(key: string): string {
  return CONTENT_TYPES[path.extname(key).toLowerCase()] ?? "application/octet-stream";
}

// --- Local signed URLs ---

function signingSecret(): string {
  const secret = process.env.STORAGE_SIGNING_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("STORAGE_SIGNING_SECRET or JWT_SECRET is required to sign storage URLs");
  return secret;
}

function signLocal(key: string, expiresAt: number): string {
  return crypto.createHmac("sha256", signingSecret()).update(`${key}\n${expiresAt}`).digest("hex");
}

function publicApiUrl(): string {
  return (process.env.API_URL || `http://localhost:${process.env.API_PORT || "4000"}`).replace(/\/$/, "");
}

function localSignedUrl(key: string, expiresInSeconds: number): string {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${publicApiUrl()}${LOCAL_STORAGE_ROUTE}/${encodedKey}?exp=${expiresAt}&sig=${signLocal(key, expiresAt)}`;
}

/**
 * Validate a local signed URL and return the file. Used by the storage route.
 * Returns null for a bad signature, an expired link, or a missing file — the
 * route answers 404 for all three so the difference is not observable.
 */
export async function readLocalSignedFile(
  key: string,
  exp: string | undefined,
  sig: string | undefined,
): Promise<StoredFile | null> {
  if (!isLocalStorage() || !exp || !sig) return null;

  const expiresAt = Number(exp);
  if (!Number.isInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return null;

  let expected: Buffer;
  let provided: Buffer;
  try {
    assertSafeKey(key);
    expected = Buffer.from(signLocal(key, expiresAt), "hex");
    provided = Buffer.from(sig, "hex");
  } catch {
    return null;
  }
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) return null;

  try {
    const root = localStorageDir();
    const fullPath = path.resolve(root, key);
    if (!fullPath.startsWith(root + path.sep)) return null;
    const buffer = await fs.readFile(fullPath);
    return { buffer, contentType: contentTypeForKey(key) };
  } catch {
    return null;
  }
}

// --- Supabase Storage implementation ---

async function uploadToSupabase(
  supabase: { url: string; key: string; bucket: string },
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const response = await fetch(`${supabase.url}/storage/v1/object/${supabase.bucket}/${key}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${supabase.key}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: buffer,
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error({ status: response.status, error: errorText }, "Supabase upload failed");
    throw new Error(`Storage upload failed: ${response.status}`);
  }
}

async function getSupabaseSignedUrl(
  supabase: { url: string; key: string; bucket: string },
  key: string,
  expiresInSeconds: number,
): Promise<string> {
  const response = await fetch(`${supabase.url}/storage/v1/object/sign/${supabase.bucket}/${key}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${supabase.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });

  if (!response.ok) {
    logger.warn({ status: response.status, path: key }, "Supabase signed URL failed");
    throw new Error(`Could not sign storage URL: ${response.status}`);
  }

  const data = (await response.json()) as { signedURL?: string };
  if (!data.signedURL) throw new Error("Storage did not return a signed URL");
  return `${supabase.url}/storage/v1${data.signedURL}`;
}

// --- Local filesystem implementation ---

async function uploadToLocal(key: string, buffer: Buffer): Promise<void> {
  const fullPath = path.join(localStorageDir(), key);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, buffer);
}
