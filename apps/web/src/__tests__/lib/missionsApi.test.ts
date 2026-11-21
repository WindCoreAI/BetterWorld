/**
 * Mission API client: credentials, multipart uploads, session freshness.
 *
 * Regressions these guard against, all of which made the human loop impossible
 * in the browser:
 *  - the mission page and claim button sent no Authorization header;
 *  - the evidence upload sent FormData with "Content-Type: application/json",
 *    which the server cannot parse (500);
 *  - a click after 15 quiet minutes failed with "please try again".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { missionsApi } from "../../lib/humanApi";
import { consumeReturnTo, consumeReturnToUnder, rememberReturnTo } from "../../lib/returnTo";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function token(secondsFromNow: number, label = "t"): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "");
  return `${encode({ alg: "HS256" })}.${encode({ userId: "u1", exp: Math.floor(Date.now() / 1000) + secondsFromNow })}.${label}`;
}

const ok = (data: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, data }) });

function lastCall(): { url: string; init: RequestInit; headers: Record<string, string> } {
  const [url, init] = mockFetch.mock.calls.at(-1) as [string, RequestInit];
  return { url, init, headers: (init.headers ?? {}) as Record<string, string> };
}

describe("missionsApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("sends the session with the mission detail request, so the server can return myClaim", async () => {
    const access = token(3600);
    localStorage.setItem("bw_human_access_token", access);
    mockFetch.mockResolvedValue(ok({ id: "m1", myClaim: { id: "c1", status: "active" } }));

    const res = await missionsApi.get<{ myClaim: { status: string } }>("m1");

    expect(res.data?.myClaim.status).toBe("active");
    expect(lastCall().url).toMatch(/\/api\/v1\/missions\/m1$/);
    expect(lastCall().headers.Authorization).toBe(`Bearer ${access}`);
  });

  it("still loads a mission for a signed-out visitor (no Authorization header at all)", async () => {
    mockFetch.mockResolvedValue(ok({ id: "m1", myClaim: null }));

    await missionsApi.get("m1");

    expect(lastCall().headers.Authorization).toBeUndefined();
  });

  it("uploads evidence as multipart: Authorization only, no JSON content type", async () => {
    const access = token(3600);
    localStorage.setItem("bw_human_access_token", access);
    mockFetch.mockResolvedValue(ok({ evidenceId: "e1" }));

    const form = new FormData();
    form.append("files", new File(["x"], "photo.jpg", { type: "image/jpeg" }));
    await missionsApi.submitEvidence("m1", form);

    const { url, init, headers } = lastCall();
    expect(url).toMatch(/\/api\/v1\/missions\/m1\/evidence$/);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(form);
    expect(headers.Authorization).toBe(`Bearer ${access}`);
    // The browser must set the multipart boundary itself
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain("content-type");
  });

  it("refreshes an expiring session before a write instead of failing it", async () => {
    localStorage.setItem("bw_human_access_token", token(-30, "old")); // expired half a minute ago
    localStorage.setItem("bw_human_refresh_token", "refresh-1");
    const fresh = token(900, "new");

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true, data: { accessToken: fresh, refreshToken: "refresh-2", expiresIn: 900 } }),
      })
      .mockResolvedValueOnce(ok({ claimId: "c1" }));

    const res = await missionsApi.claim("m1");

    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect((mockFetch.mock.calls[0] as [string])[0]).toMatch(/\/human-auth\/refresh$/);
    // The claim itself went out once, with the new token
    expect(lastCall().url).toMatch(/\/missions\/m1\/claim$/);
    expect(lastCall().headers.Authorization).toBe(`Bearer ${fresh}`);
    expect(localStorage.getItem("bw_human_refresh_token")).toBe("refresh-2");
  });

  it("does not refresh a session that is still comfortably valid", async () => {
    localStorage.setItem("bw_human_access_token", token(600));
    localStorage.setItem("bw_human_refresh_token", "refresh-1");
    mockFetch.mockResolvedValue(ok({ claimId: "c1" }));

    await missionsApi.claim("m1");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(lastCall().url).toMatch(/\/missions\/m1\/claim$/);
  });
});

describe("returnTo", () => {
  beforeEach(() => sessionStorage.clear());

  it("hands back the remembered path exactly once", () => {
    rememberReturnTo("/missions/m1");
    expect(consumeReturnTo()).toBe("/missions/m1");
    expect(consumeReturnTo()).toBeNull();
  });

  it("returns nothing when nothing was remembered", () => {
    expect(consumeReturnTo()).toBeNull();
  });

  it.each(["https://evil.example/phish", "//evil.example", "missions/m1", "/\\evil.example", "javascript:alert(1)"])(
    "never stores or returns an off-site destination (%s)",
    (target) => {
      rememberReturnTo(target);
      expect(sessionStorage.getItem("bw_return_to")).toBeNull();

      // …even if something else put it there
      sessionStorage.setItem("bw_return_to", target);
      expect(consumeReturnTo()).toBeNull();
      expect(consumeReturnToUnder("/admin")).toBeNull();
    },
  );

  describe("consumeReturnToUnder (operators skip the participant funnel)", () => {
    it.each(["/admin", "/admin/evidence", "/admin/flagged/abc"])("takes %s straight after sign-in", (path) => {
      rememberReturnTo(path);
      expect(consumeReturnToUnder("/admin")).toBe(path);
      expect(consumeReturnTo()).toBeNull(); // taken once
    });

    it.each(["/missions/m1", "/administrator", "/dashboard?next=/admin"])(
      "leaves %s for the dashboard to handle",
      (path) => {
        rememberReturnTo(path);
        expect(consumeReturnToUnder("/admin")).toBeNull();
        expect(consumeReturnTo()).toBe(path);
      },
    );
  });
});
