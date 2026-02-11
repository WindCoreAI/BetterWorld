/**
 * Storage abstraction (Sprint 8: Evidence Verification)
 *
 * Supabase Storage for production, filesystem fallback for local dev.
 * Path convention: evidence/{missionId}/{claimId}/{variant}/{filename}
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import pino from "pino";

const logger = pino({ name: "storage" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_STORAGE_DIR = path.resolve(__dirname, "../../storage/evidence");

export interface UploadResult {
  url: string;
  key: string;
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
 * Upload a file to storage.
 * Uses Supabase Storage if configured, otherwise falls back to local filesystem.
 */
export async function uploadFile(
  storagePath: string,
  buffer: Buffer,
  contentType: string,
): Promise<UploadResult> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "evidence";

  if (supabaseUrl && supabaseKey) {
    return uploadToSupabase(supabaseUrl, supabaseKey, bucket, storagePath, buffer, contentType);
  }

  return uploadToLocal(storagePath, buffer);
}

/**
 * Generate a signed URL for reading a file.
 */
export async function getSignedUrl(
  storagePath: string,
  expiresInSeconds: number = 3600,
): Promise<string> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "evidence";

  if (supabaseUrl && supabaseKey) {
    return getSupabaseSignedUrl(supabaseUrl, supabaseKey, bucket, storagePath, expiresInSeconds);
  }

  // Local dev: just return the local path
  return `/storage/${storagePath}`;
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(storagePath: string): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "evidence";

  if (supabaseUrl && supabaseKey) {
    await deleteFromSupabase(supabaseUrl, supabaseKey, bucket, storagePath);
    return;
  }

  await deleteFromLocal(storagePath);
}

// --- Supabase Storage implementation ---

async function uploadToSupabase(
  supabaseUrl: string,
  serviceKey: string,
  bucket: string,
  storagePath: string,
  buffer: Buffer,
  contentType: string,
): Promise<UploadResult> {
  const url = `${supabaseUrl}/storage/v1/object/${bucket}/${storagePath}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
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

  return {
    url: `${supabaseUrl}/storage/v1/object/public/${bucket}/${storagePath}`,
    key: storagePath,
  };
}

async function getSupabaseSignedUrl(
  supabaseUrl: string,
  serviceKey: string,
  bucket: string,
  storagePath: string,
  expiresInSeconds: number,
): Promise<string> {
  const url = `${supabaseUrl}/storage/v1/object/sign/${bucket}/${storagePath}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });

  if (!response.ok) {
    logger.warn({ status: response.status, path: storagePath }, "Supabase signed URL failed");
    return storagePath; // Fallback
  }

  const data = (await response.json()) as { signedURL?: string };
  return data.signedURL ? `${supabaseUrl}${data.signedURL}` : storagePath;
}

async function deleteFromSupabase(
  supabaseUrl: string,
  serviceKey: string,
  bucket: string,
  storagePath: string,
): Promise<void> {
  const url = `${supabaseUrl}/storage/v1/object/${bucket}/${storagePath}`;
  await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${serviceKey}` },
  });
}

// --- Local filesystem implementation ---

async function uploadToLocal(
  storagePath: string,
  buffer: Buffer,
): Promise<UploadResult> {
  const fullPath = path.join(LOCAL_STORAGE_DIR, storagePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, buffer);

  return {
    url: `/storage/${storagePath}`,
    key: storagePath,
  };
}

async function deleteFromLocal(storagePath: string): Promise<void> {
  const fullPath = path.join(LOCAL_STORAGE_DIR, storagePath);
  try {
    await fs.unlink(fullPath);
  } catch {
    // File may not exist
  }
}
