/**
 * Local storage file server.
 *
 * GET /api/v1/storage/<key>?exp=<unix seconds>&sig=<hmac>
 *
 * Only active when files are stored on local disk (no Supabase Storage
 * configured). Links are minted by getSignedUrl() and are valid for a short
 * time; there is no way to list or guess files. With Supabase configured the
 * browser is sent to Supabase's own signed URLs instead and this route 404s.
 */
import { Hono } from "hono";

import type { AppEnv } from "../app.js";
import { LOCAL_STORAGE_ROUTE, readLocalSignedFile } from "../lib/storage.js";

export const storageRoutes = new Hono<AppEnv>();

storageRoutes.get("/*", async (c) => {
  const marker = `${LOCAL_STORAGE_ROUTE}/`;
  const at = c.req.path.indexOf(marker);
  let key = "";
  if (at >= 0) {
    try {
      key = decodeURIComponent(c.req.path.slice(at + marker.length));
    } catch {
      key = "";
    }
  }

  const file = key ? await readLocalSignedFile(key, c.req.query("exp"), c.req.query("sig")) : null;

  if (!file) {
    return c.json(
      {
        ok: false,
        error: { code: "NOT_FOUND" as const, message: "File not found or link expired" },
        requestId: c.get("requestId"),
      },
      404,
    );
  }

  return new Response(new Uint8Array(file.buffer), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.buffer.length),
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=300",
    },
  });
});
