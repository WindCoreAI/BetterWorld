/**
 * Storage helper tests: keys vs URLs, local signed links, path safety.
 *
 * The bug these guard against: the database used to hold a URL
 * ("/storage/<key>" locally, the public object URL on Supabase) that was then
 * passed back in as if it were a key, so no stored file could ever be read.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  buildStoragePath,
  contentTypeForKey,
  getSignedUrl,
  isLocalStorage,
  readLocalSignedFile,
  readStoredFile,
  toStorageKey,
  uploadFile,
} from "../../lib/storage.js";

let storageDir: string;

beforeAll(async () => {
  storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "bw-storage-test-"));
});

afterAll(async () => {
  await fs.rm(storageDir, { recursive: true, force: true });
});

beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.LOCAL_STORAGE_DIR = storageDir;
  process.env.API_URL = "http://api.test";
});

function parseSigned(url: string) {
  const parsed = new URL(url);
  const marker = "/api/v1/storage/";
  const key = decodeURIComponent(parsed.pathname.slice(parsed.pathname.indexOf(marker) + marker.length));
  return { key, exp: parsed.searchParams.get("exp") ?? undefined, sig: parsed.searchParams.get("sig") ?? undefined };
}

describe("toStorageKey", () => {
  const KEY = "evidence/m1/c1/original/photo.jpg";

  it("returns a key unchanged", () => {
    expect(toStorageKey(KEY)).toBe(KEY);
  });

  it("accepts the legacy local URL form", () => {
    expect(toStorageKey(`/storage/${KEY}`)).toBe(KEY);
  });

  it("accepts a link previously produced by getSignedUrl", () => {
    expect(toStorageKey(`http://api.test/api/v1/storage/${KEY}?exp=1&sig=ab`)).toBe(KEY);
  });

  it("accepts legacy Supabase public, signed and authenticated object URLs", () => {
    const base = "https://proj.supabase.co/storage/v1/object";
    expect(toStorageKey(`${base}/public/evidence/${KEY}`)).toBe(KEY);
    expect(toStorageKey(`${base}/sign/evidence/${KEY}?token=abc`)).toBe(KEY);
    expect(toStorageKey(`${base}/authenticated/evidence/${KEY}`)).toBe(KEY);
  });
});

describe("buildStoragePath", () => {
  it("cannot be steered outside the claim's folder by the file name", () => {
    expect(buildStoragePath("m1", "c1", "original", "../../../etc/passwd")).toBe("evidence/m1/c1/original/passwd");
    expect(buildStoragePath("m1", "c1", "original", "..")).toBe("evidence/m1/c1/original/_");
  });
});

describe("local storage", () => {
  it("is the mode when no object storage is configured", () => {
    expect(isLocalStorage()).toBe(true);
    process.env.SUPABASE_URL = "https://proj.supabase.co";
    process.env.SUPABASE_SERVICE_KEY = "service-key";
    expect(isLocalStorage()).toBe(false);
  });

  it("stores a file and returns its key (not a URL) to persist", async () => {
    const result = await uploadFile("evidence/m1/c1/original/a.png", Buffer.from("png-bytes"), "image/png");
    expect(result.key).toBe("evidence/m1/c1/original/a.png");
    expect(result.url).toBe(result.key);
  });

  it("reads back what was stored, by key or by legacy URL", async () => {
    await uploadFile("evidence/m1/c1/original/b.png", Buffer.from("hello"), "image/png");

    const byKey = await readStoredFile("evidence/m1/c1/original/b.png");
    expect(byKey?.buffer.toString()).toBe("hello");
    expect(byKey?.contentType).toBe("image/png");

    const byLegacyUrl = await readStoredFile("/storage/evidence/m1/c1/original/b.png");
    expect(byLegacyUrl?.buffer.toString()).toBe("hello");
  });

  it("returns null for a file that does not exist", async () => {
    expect(await readStoredFile("evidence/m1/c1/original/missing.png")).toBeNull();
  });

  it("refuses to write or read outside the storage root", async () => {
    await expect(uploadFile("evidence/../../outside.txt", Buffer.from("x"), "text/plain")).rejects.toThrow();
    expect(await readStoredFile("../../../etc/hosts")).toBeNull();
  });
});

describe("local signed links", () => {
  const KEY = "evidence/m1/c1/original/signed photo.png";

  beforeEach(async () => {
    await uploadFile(KEY, Buffer.from("image-data"), "image/png");
  });

  it("produces an absolute link on the API that serves the file", async () => {
    const url = await getSignedUrl(KEY, 600);
    expect(url.startsWith("http://api.test/api/v1/storage/evidence/m1/c1/original/")).toBe(true);

    const { key, exp, sig } = parseSigned(url);
    expect(key).toBe(KEY);
    const file = await readLocalSignedFile(key, exp, sig);
    expect(file?.buffer.toString()).toBe("image-data");
    expect(file?.contentType).toBe("image/png");
  });

  it("rejects a tampered signature", async () => {
    const { key, exp, sig } = parseSigned(await getSignedUrl(KEY, 600));
    const flipped = (sig!.startsWith("0") ? "1" : "0") + sig!.slice(1);
    expect(await readLocalSignedFile(key, exp, flipped)).toBeNull();
    expect(await readLocalSignedFile(key, exp, "zz")).toBeNull();
    expect(await readLocalSignedFile(key, exp, "")).toBeNull();
  });

  it("rejects a signature issued for a different file", async () => {
    await uploadFile("evidence/m2/c2/original/other.png", Buffer.from("other"), "image/png");
    const mine = parseSigned(await getSignedUrl(KEY, 600));
    expect(await readLocalSignedFile("evidence/m2/c2/original/other.png", mine.exp, mine.sig)).toBeNull();
  });

  it("rejects an expired link and a link whose expiry was pushed out", async () => {
    const expired = parseSigned(await getSignedUrl(KEY, -10));
    expect(await readLocalSignedFile(expired.key, expired.exp, expired.sig)).toBeNull();

    const valid = parseSigned(await getSignedUrl(KEY, 600));
    const later = String(Number(valid.exp) + 86_400);
    expect(await readLocalSignedFile(valid.key, later, valid.sig)).toBeNull();
  });

  it("rejects missing parameters and path traversal", async () => {
    const { exp, sig } = parseSigned(await getSignedUrl(KEY, 600));
    expect(await readLocalSignedFile(KEY, undefined, sig)).toBeNull();
    expect(await readLocalSignedFile(KEY, exp, undefined)).toBeNull();
    expect(await readLocalSignedFile("../../../etc/hosts", exp, sig)).toBeNull();
  });

  it("serves nothing once object storage is configured", async () => {
    const { key, exp, sig } = parseSigned(await getSignedUrl(KEY, 600));
    process.env.SUPABASE_URL = "https://proj.supabase.co";
    process.env.SUPABASE_SERVICE_KEY = "service-key";
    expect(await readLocalSignedFile(key, exp, sig)).toBeNull();
  });

  it("does not throw for an unusable key — a list endpoint must not fail on one bad row", async () => {
    expect(await getSignedUrl("../../etc/passwd")).toBe("");
  });
});

describe("contentTypeForKey", () => {
  it("maps the evidence formats and falls back safely", () => {
    expect(contentTypeForKey("a/b/photo.JPG")).toBe("image/jpeg");
    expect(contentTypeForKey("a/b/thumb.webp")).toBe("image/webp");
    expect(contentTypeForKey("a/b/doc.pdf")).toBe("application/pdf");
    expect(contentTypeForKey("a/b/clip.mov")).toBe("video/quicktime");
    expect(contentTypeForKey("a/b/unknown.bin")).toBe("application/octet-stream");
  });
});
