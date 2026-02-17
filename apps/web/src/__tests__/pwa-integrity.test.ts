/**
 * PWA Asset Integrity Tests
 *
 * Validates that all assets referenced in manifest.json and layout.tsx
 * actually exist in the public/ directory. Prevents 404 errors for
 * PWA icons, service worker, and other static assets.
 */
import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

const PUBLIC_DIR = path.resolve(__dirname, "../../public");
const MANIFEST_PATH = path.join(PUBLIC_DIR, "manifest.json");

describe("PWA Asset Integrity", () => {
  it("manifest.json exists and is valid JSON", () => {
    expect(fs.existsSync(MANIFEST_PATH)).toBe(true);
    const content = fs.readFileSync(MANIFEST_PATH, "utf-8");
    const manifest = JSON.parse(content);
    expect(manifest.name).toBeTruthy();
  });

  it("all manifest icons exist as files in public/", () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
    const icons = manifest.icons ?? [];
    expect(icons.length).toBeGreaterThan(0);

    for (const icon of icons) {
      // icon.src is like "/icons/icon-192.png" — resolve relative to public/
      const iconPath = path.join(PUBLIC_DIR, icon.src);
      expect(
        fs.existsSync(iconPath),
        `Missing icon: ${icon.src} (expected at ${iconPath})`,
      ).toBe(true);

      // Verify file is non-empty
      const stats = fs.statSync(iconPath);
      expect(stats.size).toBeGreaterThan(0);
    }
  });

  it("manifest icons have valid sizes declared", () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
    const icons = manifest.icons ?? [];

    for (const icon of icons) {
      expect(icon.sizes).toMatch(/^\d+x\d+$/);
      expect(icon.type).toBe("image/png");
    }
  });

  it("service worker file exists", () => {
    const swPath = path.join(PUBLIC_DIR, "sw.js");
    expect(fs.existsSync(swPath)).toBe(true);
    const content = fs.readFileSync(swPath, "utf-8");
    expect(content.length).toBeGreaterThan(0);
  });

  it("manifest has required PWA fields", () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toBeTruthy();
    expect(manifest.theme_color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(manifest.background_color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(manifest.icons).toBeInstanceOf(Array);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  });
});
