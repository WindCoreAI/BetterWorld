/**
 * Review queue list: the one-line description of each flagged submission.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/container.js", () => ({ getDb: vi.fn(), getRedis: vi.fn() }));

import { previewTitle } from "../../routes/admin/flagged.routes.js";

describe("previewTitle", () => {
  it("uses the title of a problem, solution or mission", () => {
    expect(previewTitle(JSON.stringify({ title: "Storm drains blocked on Maple Street", description: "Long text" }))).toBe(
      "Storm drains blocked on Maple Street",
    );
  });

  it("falls back to the body for content without a title (debates, discussion posts)", () => {
    expect(previewTitle(JSON.stringify({ content: "I disagree with the cost estimate\nbecause…" }))).toBe(
      "I disagree with the cost estimate because…",
    );
  });

  it("shortens long text to one line", () => {
    const preview = previewTitle(JSON.stringify({ title: "word ".repeat(100) }))!;

    expect(preview.length).toBe(120);
    expect(preview.endsWith("…")).toBe(true);
    expect(preview).not.toContain("\n");
  });

  it.each([
    ["no evaluation row", null],
    ["text that is not JSON", "not json at all"],
    ["JSON that is not an object", '"just a string"'],
    ["JSON null", "null"],
    ["an object without usable text", JSON.stringify({ title: "   ", content: 42 })],
  ])("returns null for %s", (_label, input) => {
    expect(previewTitle(input)).toBeNull();
  });
});
