import { readFile } from "fs/promises";
import { basename, dirname, join } from "path";
import { fileURLToPath } from "url";

import { Hono } from "hono";

import { logger } from "../middleware/logger.js";
import type { AppEnv } from "../app.js";

export const skillsRoutes = new Hono<AppEnv>();

// Resolve path relative to this file for robust path resolution regardless of cwd
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILLS_DIR = join(__dirname, "..", "..", "public", "skills", "betterworld");

const ALLOWED_FILES: Record<string, string> = {
  "SKILL.md": "text/markdown; charset=utf-8",
  "HEARTBEAT.md": "text/markdown; charset=utf-8",
  "package.json": "application/json",
};

// GET /skills/betterworld/:filename — Serve skill files
skillsRoutes.get("/skills/betterworld/:filename", async (c) => {
  const { filename } = c.req.param();

  // Prevent path traversal: reject any filename containing path separators
  if (
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("..")
  ) {
    return c.json(
      {
        ok: false,
        error: { code: "NOT_FOUND" as const, message: "Skill file not found" },
        requestId: c.get("requestId"),
      },
      404,
    );
  }

  const contentType = ALLOWED_FILES[filename];

  if (!contentType) {
    return c.json(
      {
        ok: false,
        error: { code: "NOT_FOUND" as const, message: "Skill file not found" },
        requestId: c.get("requestId"),
      },
      404,
    );
  }

  try {
    // Defense-in-depth: use basename to ensure no path traversal
    const content = await readFile(
      join(SKILLS_DIR, basename(filename)),
      "utf-8",
    );
    return c.text(content, 200, {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    });
  } catch (error) {
    // Log unexpected errors (not ENOENT) for monitoring
    if (
      error instanceof Error &&
      "code" in error &&
      error.code !== "ENOENT"
    ) {
      logger.error(
        { error, filename, requestId: c.get("requestId") },
        "Failed to read skill file",
      );
    }

    return c.json(
      {
        ok: false,
        error: { code: "NOT_FOUND" as const, message: "Skill file not found" },
        requestId: c.get("requestId"),
      },
      404,
    );
  }
});

// GET /skill.md — Convenience redirect
skillsRoutes.get("/skill.md", (c) => {
  return c.redirect("/skills/betterworld/SKILL.md", 302);
});

// GET /heartbeat.md — Convenience redirect
skillsRoutes.get("/heartbeat.md", (c) => {
  return c.redirect("/skills/betterworld/HEARTBEAT.md", 302);
});
