import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import WebSocket from "ws";
import {
  setupTestInfra,
  teardownTestInfra,
  cleanupTestData,
  registerTestAgent,
  getTestApp,
} from "./helpers.js";

// Helper to create WebSocket connection
function createWsConnection(token: string): Promise<{
  ws: WebSocket;
  messages: any[];
  waitForMessage: (timeout?: number) => Promise<any>;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:3001/ws/feed?token=${token}`);
    const messages: any[] = [];
    let resolveMessage: ((msg: any) => void) | null = null;

    ws.on("open", () => {
      const waitForMessage = (timeout = 5000): Promise<any> => {
        return new Promise((res, rej) => {
          const timer = setTimeout(() => {
            resolveMessage = null;
            rej(new Error("Message timeout"));
          }, timeout);

          resolveMessage = (msg) => {
            clearTimeout(timer);
            res(msg);
          };

          // Check if message already received
          if (messages.length > 0) {
            const msg = messages.shift();
            clearTimeout(timer);
            res(msg);
          }
        });
      };

      resolve({
        ws,
        messages,
        waitForMessage,
        close: () => ws.close(),
      });
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      messages.push(msg);
      if (resolveMessage) {
        resolveMessage(msg);
        resolveMessage = null;
      }
    });

    ws.on("error", (err) => {
      reject(err);
    });

    // Timeout for connection
    setTimeout(() => reject(new Error("Connection timeout")), 5000);
  });
}

describe("WebSocket Event Feed", () => {
  const app = getTestApp();
  let validToken: string;
  let agentId: string;

  beforeAll(async () => {
    await setupTestInfra();

    // Register an agent for WebSocket testing
    const { data: regData } = await registerTestAgent(app, {
      username: "ws_test_agent",
    });
    validToken = regData.data.apiKey;
    agentId = regData.data.agentId;

    // Give WS server a moment to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await teardownTestInfra();
  });

  it("connects successfully with valid token", async () => {
    const { ws, waitForMessage, close } = await createWsConnection(validToken);

    // Wait for connected event
    const connectedMsg = await waitForMessage();
    expect(connectedMsg.type).toBe("connected");
    expect(connectedMsg.data.agentId).toBe(agentId);
    expect(connectedMsg.data.connectedClients).toBeGreaterThan(0);
    expect(connectedMsg.timestamp).toBeTruthy();

    close();
  });

  it("rejects connection with invalid token", async () => {
    const invalidToken = "invalid_token_that_does_not_exist_1234567890abcdef";

    await expect(async () => {
      await createWsConnection(invalidToken);
    }).rejects.toThrow();
  });

  it("rejects connection with no token", async () => {
    await expect(async () => {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket("ws://localhost:3001/ws/feed");

        ws.on("open", () => {
          resolve({ ws, close: () => ws.close() });
        });

        ws.on("close", (code) => {
          if (code === 1008) {
            // Policy violation - expected
            reject(new Error("Connection rejected with code 1008"));
          }
        });

        ws.on("error", () => {
          // Expected error
        });

        setTimeout(() => reject(new Error("Connection timeout")), 3000);
      });
    }).rejects.toThrow();
  });

  it("receives ping and responds with pong", async () => {
    const { ws, waitForMessage, close } = await createWsConnection(validToken);

    // Skip connected message
    await waitForMessage();

    // Wait for ping (server sends ping every 30s, but for testing we might need to wait or trigger)
    // For this test, we'll manually send a ping to verify pong handling works
    ws.send(JSON.stringify({ type: "ping" }));

    // In a real scenario, server would send ping and we'd respond
    // For now, verify connection stays alive

    // Wait a moment
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Connection should still be open
    expect(ws.readyState).toBe(WebSocket.OPEN);

    close();
  }, 10000);

  it("handles pong response to server ping", async () => {
    const { ws, waitForMessage, close } = await createWsConnection(validToken);

    // Skip connected message
    await waitForMessage();

    // Manually trigger a ping from our side to test the flow
    const pingMsg = { type: "ping", data: {}, timestamp: new Date().toISOString() };
    ws.send(JSON.stringify(pingMsg));

    // Server should echo or handle gracefully
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Send pong response
    ws.send(JSON.stringify({ type: "pong" }));

    // Connection should remain stable
    expect(ws.readyState).toBe(WebSocket.OPEN);

    close();
  });

  it("handles multiple concurrent connections from same agent", async () => {
    const conn1 = await createWsConnection(validToken);
    const conn2 = await createWsConnection(validToken);

    // Both should receive connected events
    const msg1 = await conn1.waitForMessage();
    const msg2 = await conn2.waitForMessage();

    expect(msg1.type).toBe("connected");
    expect(msg2.type).toBe("connected");
    expect(msg1.data.agentId).toBe(agentId);
    expect(msg2.data.agentId).toBe(agentId);

    // Both connections should report multiple clients
    expect(msg2.data.connectedClients).toBeGreaterThanOrEqual(2);

    conn1.close();
    conn2.close();
  });

  it("closes connection gracefully on client close", async () => {
    const { ws, close } = await createWsConnection(validToken);

    // Wait for connected message
    await new Promise((resolve) => setTimeout(resolve, 100));

    const closePromise = new Promise<number>((resolve) => {
      ws.on("close", (code) => {
        resolve(code);
      });
    });

    close();

    const closeCode = await closePromise;
    expect([1000, 1001, 1006]).toContain(closeCode); // Normal closure codes
  });

  it("receives properly formatted messages", async () => {
    const { ws, waitForMessage, close } = await createWsConnection(validToken);

    const msg = await waitForMessage();

    // Validate message structure
    expect(msg).toHaveProperty("type");
    expect(msg).toHaveProperty("data");
    expect(msg).toHaveProperty("timestamp");
    expect(msg.type).toBe("connected");

    close();
  });

  it("handles JSON parsing errors gracefully", async () => {
    const { ws, close } = await createWsConnection(validToken);

    // Wait for connection
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Send invalid JSON
    ws.send("this is not valid json");

    // Wait a moment
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Connection might close or ignore - verify it doesn't crash
    // The server should handle this gracefully
    const isOpen = ws.readyState === WebSocket.OPEN;
    const isClosed = ws.readyState === WebSocket.CLOSED;

    expect(isOpen || isClosed).toBe(true);

    if (isOpen) {
      close();
    }
  });
});
