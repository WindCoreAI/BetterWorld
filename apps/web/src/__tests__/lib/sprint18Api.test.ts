/**
 * Sprint 18 API Client Tests
 *
 * Verifies the cooperative-depth API client groups added for the
 * circles, challenges, achievements, feed, moderator, ambassador,
 * teaching, learning pathways, discover, governance, and case study
 * features: correct paths, HTTP methods, query params, and JSON bodies.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock localStorage (humanFetch reads auth tokens from it)
const localStorageMock: Record<string, string> = {};
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: vi.fn((key: string) => localStorageMock[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      localStorageMock[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete localStorageMock[key];
    }),
  },
  writable: true,
});

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function okResponse(data: unknown = {}) {
  return {
    status: 200,
    ok: true,
    json: vi.fn().mockResolvedValue({ ok: true, data }),
  };
}

/** Returns [url, init] of the last fetch call. */
function lastCall(): [string, RequestInit] {
  const call = mockFetch.mock.calls.at(-1);
  return [call?.[0] as string, (call?.[1] ?? {}) as RequestInit];
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(localStorageMock).forEach((k) => delete localStorageMock[k]);
  localStorageMock["bw_human_access_token"] = "test-token";
  mockFetch.mockResolvedValue(okResponse());
});

describe("circlesApi", () => {
  it("lists circles with domain filter", async () => {
    const { circlesApi } = await import("../../lib/humanApi");
    await circlesApi.list("education_access");
    const [url] = lastCall();
    expect(url).toContain("/api/v1/circles?");
    expect(url).toContain("domain=education_access");
  });

  it("creates a circle with JSON body", async () => {
    const { circlesApi } = await import("../../lib/humanApi");
    await circlesApi.create({ name: "Test Circle", domain: "elder_care" });
    const [url, init] = lastCall();
    expect(url).toContain("/api/v1/circles");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Test Circle", domain: "elder_care" });
  });

  it("joins and leaves a circle via POST", async () => {
    const { circlesApi } = await import("../../lib/humanApi");
    await circlesApi.join("circle-1");
    expect(lastCall()[0]).toContain("/api/v1/circles/circle-1/join");
    expect(lastCall()[1].method).toBe("POST");

    await circlesApi.leave("circle-1");
    expect(lastCall()[0]).toContain("/api/v1/circles/circle-1/leave");
    expect(lastCall()[1].method).toBe("POST");
  });

  it("creates a post in a circle", async () => {
    const { circlesApi } = await import("../../lib/humanApi");
    await circlesApi.createPost("circle-1", { content: "Hello circle" });
    const [url, init] = lastCall();
    expect(url).toContain("/api/v1/circles/circle-1/posts");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string).content).toBe("Hello circle");
  });

  it("shares a mission into a circle", async () => {
    const { circlesApi } = await import("../../lib/humanApi");
    await circlesApi.shareMission("circle-1", "mission-9");
    const [url, init] = lastCall();
    expect(url).toContain("/api/v1/circles/circle-1/missions");
    expect(JSON.parse(init.body as string)).toEqual({ missionId: "mission-9" });
  });
});

describe("challengesApi", () => {
  it("lists, fetches detail, joins, and reads my progress", async () => {
    const { challengesApi } = await import("../../lib/humanApi");

    await challengesApi.list();
    expect(lastCall()[0]).toContain("/api/v1/challenges");

    await challengesApi.get("ch-1");
    expect(lastCall()[0]).toContain("/api/v1/challenges/ch-1");

    await challengesApi.join("ch-1");
    expect(lastCall()[0]).toContain("/api/v1/challenges/ch-1/join");
    expect(lastCall()[1].method).toBe("POST");

    await challengesApi.getMyProgress("ch-1");
    expect(lastCall()[0]).toContain("/api/v1/challenges/ch-1/my-progress");
  });
});

describe("achievementsApi", () => {
  it("fetches public and personal achievements", async () => {
    const { achievementsApi } = await import("../../lib/humanApi");

    await achievementsApi.list();
    expect(lastCall()[0]).toContain("/api/v1/achievements/cooperative?limit=20");

    await achievementsApi.listMine();
    expect(lastCall()[0]).toContain("/api/v1/achievements/cooperative/me");
  });
});

describe("feedApi", () => {
  it("fetches the feed with cursor pagination", async () => {
    const { feedApi } = await import("../../lib/humanApi");

    await feedApi.get();
    expect(lastCall()[0]).toContain("/api/v1/feed?limit=20");

    await feedApi.get("cursor-abc", 10);
    const [url] = lastCall();
    expect(url).toContain("limit=10");
    expect(url).toContain("cursor=cursor-abc");
  });
});

describe("moderatorApi", () => {
  it("fetches the queue and stats", async () => {
    const { moderatorApi } = await import("../../lib/humanApi");

    await moderatorApi.getQueue();
    expect(lastCall()[0]).toContain("/api/v1/moderator/queue?limit=20");

    await moderatorApi.getStats();
    expect(lastCall()[0]).toContain("/api/v1/moderator/stats");
  });

  it("submits a decision with reason", async () => {
    const { moderatorApi } = await import("../../lib/humanApi");
    await moderatorApi.decide("item-1", { decision: "approved", reason: "Looks fine" });
    const [url, init] = lastCall();
    expect(url).toContain("/api/v1/moderator/queue/item-1/decide");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ decision: "approved", reason: "Looks fine" });
  });
});

describe("ambassadorApi and teachingApi", () => {
  it("fetches ambassador stats and sends a welcome", async () => {
    const { ambassadorApi } = await import("../../lib/humanApi");

    await ambassadorApi.getMe();
    expect(lastCall()[0]).toContain("/api/v1/ambassador/me");

    await ambassadorApi.welcome("newcomer-1");
    expect(lastCall()[0]).toContain("/api/v1/ambassador/welcome/newcomer-1");
    expect(lastCall()[1].method).toBe("POST");
  });

  it("fetches teaching points and leaderboard", async () => {
    const { teachingApi } = await import("../../lib/humanApi");

    await teachingApi.getMe();
    expect(lastCall()[0]).toContain("/api/v1/teaching/me");

    await teachingApi.getLeaderboard();
    expect(lastCall()[0]).toContain("/api/v1/teaching/leaderboard");
  });
});

describe("learningPathwaysApi", () => {
  it("enrolls, lists, reads progress, and marks case studies read", async () => {
    const { learningPathwaysApi } = await import("../../lib/humanApi");

    await learningPathwaysApi.enroll("elder_care");
    expect(lastCall()[0]).toContain("/api/v1/learning-pathways/elder_care/enroll");
    expect(lastCall()[1].method).toBe("POST");

    await learningPathwaysApi.listMine();
    expect(lastCall()[0]).toContain("/api/v1/learning-pathways/me");

    await learningPathwaysApi.getProgress("elder_care");
    expect(lastCall()[0]).toContain("/api/v1/learning-pathways/elder_care/progress");

    await learningPathwaysApi.markCaseStudyRead("elder_care", "cs-1");
    expect(lastCall()[0]).toContain("/api/v1/learning-pathways/elder_care/case-studies/cs-1/mark-read");
    expect(lastCall()[1].method).toBe("POST");
  });
});

describe("discoverApi, governanceApi, caseStudiesApi", () => {
  it("fetches people with filters", async () => {
    const { discoverApi } = await import("../../lib/humanApi");
    await discoverApi.getPeople({ domain: "human_rights", city: "Seattle" });
    const [url] = lastCall();
    expect(url).toContain("/api/v1/discover/people?");
    expect(url).toContain("domain=human_rights");
    expect(url).toContain("city=Seattle");
  });

  it("fetches governance metrics", async () => {
    const { governanceApi } = await import("../../lib/humanApi");

    await governanceApi.getPowerAudit();
    expect(lastCall()[0]).toContain("/api/v1/governance/power-audit");

    await governanceApi.getNetworkHealth();
    expect(lastCall()[0]).toContain("/api/v1/governance/network-health");
  });

  it("fetches case studies list and detail", async () => {
    const { caseStudiesApi } = await import("../../lib/humanApi");

    await caseStudiesApi.list("food_security");
    const [url] = lastCall();
    expect(url).toContain("/api/v1/case-studies?");
    expect(url).toContain("domain=food_security");

    await caseStudiesApi.get("cs-2");
    expect(lastCall()[0]).toContain("/api/v1/case-studies/cs-2");
  });
});
