/**
 * Human WebSocket Endpoint Tests
 *
 * Validates the /ws/human endpoint accepts JWT-authenticated connections,
 * rejects invalid/missing tokens, and handles graceful disconnect.
 * Guards against regressions where WebSocket server fails to start.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import {
  setupTestInfra,
  teardownTestInfra,
  cleanupTestData,
  createTestHuman,
  getWsPort,
} from "./helpers.js";

function connectHumanWs(token: string): Promise<{
  ws: WebSocket;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `ws://localhost:${getWsPort()}/ws/human?token=${token}`,
    );
    let settled = false;

    ws.on("open", () => {
      setTimeout(() => {
        if (!settled && ws.readyState === WebSocket.OPEN) {
          settled = true;
          resolve({ ws, close: () => ws.close() });
        }
      }, 50);
    });

    ws.on("close", (code, reason) => {
      if (!settled) {
        settled = true;
        reject(
          new Error(
            `Connection closed before established: ${code} - ${reason.toString()}`,
          ),
        );
      }
    });

    ws.on("error", (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("Connection timeout"));
      }
    }, 5000);
  });
}

describe("Human WebSocket Endpoint", () => {
  let humanToken: string;

  beforeAll(async () => {
    await setupTestInfra();
    const { token } = await createTestHuman({ emailVerified: true });
    humanToken = token;
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  afterAll(async () => {
    await teardownTestInfra();
  });

  it("connects successfully with valid JWT token", async () => {
    const { ws, close } = await connectHumanWs(humanToken);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    close();
  });

  it("rejects connection with invalid JWT token", async () => {
    await expect(connectHumanWs("invalid.jwt.token")).rejects.toThrow();
  });

  it("rejects connection with no token", async () => {
    await expect(async () => {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(
          `ws://localhost:${getWsPort()}/ws/human`,
        );
        let settled = false;

        ws.on("open", () => {
          setTimeout(() => {
            if (!settled && ws.readyState === WebSocket.OPEN) {
              settled = true;
              resolve({ ws });
            }
          }, 50);
        });

        ws.on("close", (code) => {
          if (!settled) {
            settled = true;
            reject(new Error(`Rejected: ${code}`));
          }
        });

        ws.on("error", (err) => {
          if (!settled) {
            settled = true;
            reject(err);
          }
        });

        setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error("Timeout"));
          }
        }, 3000);
      });
    }).rejects.toThrow();
  });

  it("WebSocket server health endpoint responds", async () => {
    const res = await fetch(
      `http://localhost:${getWsPort()}/healthz`,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.service).toBe("ws-feed");
  });
});
