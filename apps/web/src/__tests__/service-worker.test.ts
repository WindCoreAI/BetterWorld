/**
 * Service worker fetch policy.
 *
 * Runs public/sw.js against a minimal fake of the service-worker environment.
 * The policy it pins down exists because the previous one (answer API reads
 * from the cache first, keyed by URL only) made every screen one step stale and
 * could show one person's cached data to the next person on a shared device.
 */
import fs from "fs";
import path from "path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const SW_SOURCE = fs.readFileSync(path.resolve(__dirname, "../../public/sw.js"), "utf-8");

type Listener = (event: FakeFetchEvent) => void;

interface FakeFetchEvent {
  request: Request & { mode?: string };
  respondWith: (response: Promise<Response>) => void;
  response?: Promise<Response>;
}

function loadServiceWorker(fetchImpl: (req: Request) => Promise<Response>) {
  const listeners: Record<string, Listener> = {};
  const store = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (req: Request) => store.get(req.url)?.clone()),
    put: vi.fn(async (req: Request, res: Response) => {
      store.set(req.url, res);
    }),
  };
  const fakeSelf = {
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listener;
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  };
  const fakeCaches = {
    open: vi.fn(async () => cache),
    match: vi.fn(async () => undefined),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
  };

  new Function("self", "caches", "fetch", "Response", "BroadcastChannel", SW_SOURCE)(
    fakeSelf,
    fakeCaches,
    vi.fn(fetchImpl),
    Response,
    class {},
  );

  const dispatch = (request: Request, mode?: string): FakeFetchEvent => {
    const event: FakeFetchEvent = {
      request: Object.assign(request, mode ? { mode } : {}),
      respondWith(response) {
        this.response = response;
      },
    };
    listeners.fetch!(event);
    return event;
  };

  return { dispatch, cache, store };
}

const API = "https://api.example.org/api/v1";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("service worker fetch policy", () => {
  let online: boolean;
  let body: unknown;

  beforeEach(() => {
    online = true;
    body = { version: 1 };
  });

  const network = async () => {
    if (!online) throw new TypeError("Failed to fetch");
    return json(body);
  };

  it("does not intercept or cache a signed-in API read", async () => {
    const sw = loadServiceWorker(network);

    const event = sw.dispatch(new Request(`${API}/profile`, { headers: { Authorization: "Bearer token-a" } }));

    expect(event.response).toBeUndefined(); // the browser handles it: always live, never stored
    expect(sw.cache.put).not.toHaveBeenCalled();
  });

  it("answers an anonymous API read from the network, not from an older cached copy", async () => {
    const sw = loadServiceWorker(network);

    const first = await sw.dispatch(new Request(`${API}/missions/m1`)).response!;
    expect(await first.json()).toEqual({ version: 1 });

    body = { version: 2 }; // the mission changed (e.g. it was claimed)
    const second = await sw.dispatch(new Request(`${API}/missions/m1`)).response!;
    expect(await second.json()).toEqual({ version: 2 });
  });

  it("falls back to the cached copy only when the network is unavailable", async () => {
    const sw = loadServiceWorker(network);

    await sw.dispatch(new Request(`${API}/problems`)).response!;
    online = false;

    const offline = await sw.dispatch(new Request(`${API}/problems`)).response!;
    expect(await offline.json()).toEqual({ version: 1 });
  });

  it("reports a network error when offline with nothing cached", async () => {
    online = false;
    const sw = loadServiceWorker(network);

    const response = await sw.dispatch(new Request(`${API}/problems`)).response!;
    expect(response.type).toBe("error");
  });

  it("does not cache failed responses", async () => {
    const sw = loadServiceWorker(async () => json({ ok: false }, 500));

    await sw.dispatch(new Request(`${API}/problems`)).response!;
    expect(sw.cache.put).not.toHaveBeenCalled();
  });

  it("never serves a signed-in person an anonymous cached copy, or the reverse", async () => {
    const sw = loadServiceWorker(network);

    // Anonymous visit caches the public view of the mission…
    await sw.dispatch(new Request(`${API}/missions/m1`)).response!;
    expect(sw.store.has(`${API}/missions/m1`)).toBe(true);

    // …and the signed-in request for the same URL bypasses the worker entirely.
    const signedIn = sw.dispatch(new Request(`${API}/missions/m1`, { headers: { Authorization: "Bearer token-a" } }));
    expect(signedIn.response).toBeUndefined();
  });

  it("never answers a health probe from the cache", async () => {
    const sw = loadServiceWorker(network);

    const event = sw.dispatch(new Request(`${API}/health`));

    expect(event.response).toBeUndefined(); // offline must look offline
    expect(sw.cache.put).not.toHaveBeenCalled();
  });

  it("leaves writes alone", () => {
    const sw = loadServiceWorker(network);

    const event = sw.dispatch(new Request(`${API}/missions/m1/claim`, { method: "POST" }));
    expect(event.response).toBeUndefined();
  });

  it("leaves non-API requests alone", () => {
    const sw = loadServiceWorker(network);

    const event = sw.dispatch(new Request("https://app.example.org/_next/static/chunk.js"));
    expect(event.response).toBeUndefined();
  });
});
