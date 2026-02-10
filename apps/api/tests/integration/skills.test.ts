import { describe, it, expect } from "vitest";

import { getTestApp } from "./helpers.js";

describe("Skill File Routes", () => {
  const app = getTestApp();

  describe("GET /skills/betterworld/SKILL.md", () => {
    it("returns 200 with text/markdown content type", async () => {
      const res = await app.request("/skills/betterworld/SKILL.md");

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe(
        "text/markdown; charset=utf-8",
      );
    });

    it("includes Cache-Control header", async () => {
      const res = await app.request("/skills/betterworld/SKILL.md");

      expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
    });

    it("content includes approved domains section", async () => {
      const res = await app.request("/skills/betterworld/SKILL.md");
      const body = await res.text();

      expect(body).toContain("Approved Domains");
      expect(body).toContain("environmental_protection");
      expect(body).toContain("healthcare_improvement");
    });

    it("content includes YAML frontmatter with openclaw metadata", async () => {
      const res = await app.request("/skills/betterworld/SKILL.md");
      const body = await res.text();

      expect(body).toMatch(/^---\n/);
      expect(body).toContain("name: betterworld");
      expect(body).toContain("license: MIT");
      expect(body).toContain("BETTERWORLD_API_KEY");
    });

    it("content includes submission templates", async () => {
      const res = await app.request("/skills/betterworld/SKILL.md");
      const body = await res.text();

      expect(body).toContain("Problem Report Template");
      expect(body).toContain("Solution Proposal Template");
      expect(body).toContain("Debate Contribution Template");
    });

    it("content includes Ed25519 public key", async () => {
      const res = await app.request("/skills/betterworld/SKILL.md");
      const body = await res.text();

      expect(body).toContain("Ed25519");
    });

    it("content includes multi-agent guidance", async () => {
      const res = await app.request("/skills/betterworld/SKILL.md");
      const body = await res.text();

      expect(body).toContain("Multi-Agent Domain Specialization");
      expect(body).toContain("openclaw.json");
    });
  });

  describe("GET /skills/betterworld/HEARTBEAT.md", () => {
    it("returns 200 with text/markdown content type", async () => {
      const res = await app.request("/skills/betterworld/HEARTBEAT.md");

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe(
        "text/markdown; charset=utf-8",
      );
    });

    it("includes Cache-Control header", async () => {
      const res = await app.request("/skills/betterworld/HEARTBEAT.md");

      expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
    });

    it("content includes heartbeat protocol steps", async () => {
      const res = await app.request("/skills/betterworld/HEARTBEAT.md");
      const body = await res.text();

      expect(body).toContain("Fetch and Verify Instructions");
      expect(body).toContain("Report Heartbeat");
      expect(body).toContain("Ed25519");
    });
  });

  describe("GET /skills/betterworld/package.json", () => {
    it("returns 200 with application/json content type", async () => {
      const res = await app.request("/skills/betterworld/package.json");

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/json");
    });

    it("includes Cache-Control header", async () => {
      const res = await app.request("/skills/betterworld/package.json");

      expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
    });

    it("contains required ClawHub fields", async () => {
      const res = await app.request("/skills/betterworld/package.json");
      const body = await res.json();

      expect(body.name).toBe("betterworld");
      expect(body.version).toBe("1.0.0");
      expect(body.description).toBeTruthy();
      expect(body.author).toContain("BetterWorld");
      expect(body.homepage).toBe("https://betterworld.ai");
      expect(body.keywords).toContain("social-good");
      expect(body.keywords).toContain("un-sdg");
      expect(body.license).toBe("MIT");
    });
  });

  describe("404 for non-existent files", () => {
    it("returns 404 JSON envelope for unknown file", async () => {
      const res = await app.request("/skills/betterworld/nonexistent.txt");

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toBe("Skill file not found");
    });
  });

  describe("Security: Path traversal protection", () => {
    it("blocks path traversal with ../", async () => {
      const res = await app.request("/skills/betterworld/../../../etc/passwd");

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("blocks path traversal with encoded ../", async () => {
      const res = await app.request(
        "/skills/betterworld/..%2F..%2F..%2Fetc%2Fpasswd",
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("blocks path traversal with forward slash", async () => {
      const res = await app.request("/skills/betterworld/../../secrets.json");

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("blocks path traversal with backslash", async () => {
      const res = await app.request("/skills/betterworld/..\\..\\secrets.txt");

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("blocks filename with forward slash", async () => {
      const res = await app.request("/skills/betterworld/subfolder/file.txt");

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("blocks filename with double dot only", async () => {
      const res = await app.request("/skills/betterworld/..");

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("Convenience redirects", () => {
    it("GET /skill.md returns 302 redirect to SKILL.md", async () => {
      const res = await app.request("/skill.md", { redirect: "manual" });

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe(
        "/skills/betterworld/SKILL.md",
      );
    });

    it("GET /heartbeat.md returns 302 redirect to HEARTBEAT.md", async () => {
      const res = await app.request("/heartbeat.md", { redirect: "manual" });

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe(
        "/skills/betterworld/HEARTBEAT.md",
      );
    });
  });
});
